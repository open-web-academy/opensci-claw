"""
x402_skill — Gemini function-calling tool for consuming x402-protected endpoints.

This skill lets the SciGate Gemini agent autonomously call any x402-protected HTTPS
endpoint. When the server responds 402, the agent pays with USDC (World Chain or
Solana) via the existing x402_handler and retries transparently.

Configuration (env vars):
  X402_TIMEOUT_S          Request timeout in seconds (default: 30)
  X402_MAX_COST_USD       Max USD the agent auto-pays per call (default: 0.10)
  X402_PREFERRED_NETWORK  Preferred chain ID (default: eip155:480)

Usage in a Gemini agentic loop — see qa.answer_question_with_x402_skill():

    from services.x402_skill import TOOL_INSTANCE as skill

    model = genai.GenerativeModel(
        "gemini-1.5-flash",
        tools=[skill.get_tool_definition()],
    )
    chat = model.start_chat()
    response = await chat.send_message_async(prompt)

    # On FunctionCall from the model:
    result = await skill.execute(dict(function_call.args))
    # Feed back via genai.protos.FunctionResponse
"""

import json
import logging
import os
import time
import uuid
from dataclasses import dataclass, field
from datetime import date
from typing import Any

logger = logging.getLogger("scigate.x402_skill")

X402_TIMEOUT_S = float(os.getenv("X402_TIMEOUT_S", "30"))
X402_MAX_COST_USD = float(os.getenv("X402_MAX_COST_USD", "0.10"))
X402_PREFERRED_NETWORK = os.getenv("X402_PREFERRED_NETWORK", "eip155:480")
X402_DAILY_BUDGET_USD = float(os.getenv("X402_DAILY_BUDGET_USD", "5.0"))

# In-memory daily spend tracker {date_str: total_usd}.
# Resets automatically each day. Move to Supabase before multi-instance deploy.
_daily_spend: dict[str, float] = {}

# x402 server may set any of these on a paid response
_PAYMENT_RESPONSE_HEADERS = frozenset({
    "x-payment-receipt",
    "x-402-payment",
    "x-payment-proof",
    "x-payment-response",
})

# Safety cap: truncate bodies larger than this before sending to Gemini
_MAX_BODY_CHARS = 4_000


@dataclass
class X402CallResult:
    """Typed result from one x402 skill invocation."""

    ok: bool
    status_code: int
    body: Any
    paid: bool = False
    network: str | None = None
    error: str | None = None
    call_id: str = field(default_factory=lambda: uuid.uuid4().hex[:8])
    elapsed_ms: int = 0

    def to_dict(self) -> dict[str, Any]:
        """Serialize for Gemini FunctionResponse — truncates large bodies."""
        body = self.body
        if isinstance(body, str) and len(body) > _MAX_BODY_CHARS:
            body = body[:_MAX_BODY_CHARS] + " ...[truncated]"
        elif isinstance(body, (dict, list)):
            raw = json.dumps(body, default=str)
            if len(raw) > _MAX_BODY_CHARS:
                body = {"_truncated": True, "preview": raw[:_MAX_BODY_CHARS]}
        return {
            "ok": self.ok,
            "status_code": self.status_code,
            "body": body,
            "paid": self.paid,
            "network": self.network,
            "error": self.error,
            "call_id": self.call_id,
            "elapsed_ms": self.elapsed_ms,
        }


class X402Skill:
    """
    Modular x402 client tool for Gemini's function-calling API.

    Single responsibility: wrap an x402-protected HTTP call so Gemini can
    invoke it as a named function. Payment (402 → sign → retry) is delegated
    to the existing AutonomousX402Handler singleton.

    One instance is enough for the whole process (see TOOL_INSTANCE below).
    """

    TOOL_NAME = "call_x402_endpoint"

    # ── Tool declaration ──────────────────────────────────────────────────────

    def get_tool_definition(self) -> dict:
        """
        Return a Gemini tool definition as a plain dict.

        Passing a dict (rather than genai.protos.*) keeps this stable across
        minor SDK version bumps. Pass directly to GenerativeModel(tools=[...]).
        """
        return {
            "function_declarations": [
                {
                    "name": self.TOOL_NAME,
                    "description": (
                        "Call an x402-protected HTTPS endpoint. "
                        "Handles HTTP 402 Payment Required automatically: pays with USDC "
                        f"on World Chain (eip155:480) or Solana and retries. "
                        f"Maximum auto-pay: ${X402_MAX_COST_USD} USD per call. "
                        "Use to query external academic APIs, datasets, or any x402 service."
                    ),
                    "parameters": {
                        "type": "object",
                        "properties": {
                            "url": {
                                "type": "string",
                                "description": "Full HTTPS URL of the x402-protected endpoint.",
                            },
                            "method": {
                                "type": "string",
                                "description": "HTTP method. Use GET for retrieval, POST to send a body.",
                                "enum": ["GET", "POST"],
                            },
                            "body": {
                                "type": "string",
                                "description": (
                                    "JSON-encoded request body for POST calls. "
                                    "Example: '{\"question\": \"What is gradient descent?\"}'"
                                ),
                            },
                            "purpose": {
                                "type": "string",
                                "description": (
                                    "One sentence explaining why this call is made. "
                                    "Stored in the audit log."
                                ),
                            },
                        },
                        "required": ["url", "method"],
                    },
                }
            ]
        }

    # ── Execution ─────────────────────────────────────────────────────────────

    async def execute(self, args: dict[str, Any]) -> X402CallResult:
        """
        Validate inputs, call the x402 endpoint (paying if required), and return
        a typed result. Never raises — errors are captured in X402CallResult.error.
        """
        call_id = uuid.uuid4().hex[:8]
        t0 = time.monotonic()

        # ── Input validation ──────────────────────────────────────────────
        url = str(args.get("url") or "").strip()
        if not url.startswith("https://"):
            logger.warning("[%s] rejected non-https url: %s", call_id, url)
            return X402CallResult(
                ok=False, status_code=0, body=None,
                error="url must start with https://",
                call_id=call_id,
            )

        method = str(args.get("method") or "GET").upper()
        if method not in ("GET", "POST"):
            return X402CallResult(
                ok=False, status_code=0, body=None,
                error=f"Unsupported method '{method}'. Use GET or POST.",
                call_id=call_id,
            )

        # body arrives as JSON string (from Gemini) or dict (from direct call)
        raw_body = args.get("body")
        body: dict | None = None
        if raw_body is not None:
            if isinstance(raw_body, str):
                try:
                    body = json.loads(raw_body)
                except (json.JSONDecodeError, ValueError) as exc:
                    return X402CallResult(
                        ok=False, status_code=0, body=None,
                        error=f"body is not valid JSON: {exc}",
                        call_id=call_id,
                    )
            elif isinstance(raw_body, dict):
                body = raw_body
            else:
                return X402CallResult(
                    ok=False, status_code=0, body=None,
                    error=f"body must be a JSON string or object, got {type(raw_body).__name__}",
                    call_id=call_id,
                )

        purpose = str(args.get("purpose") or "not specified")
        logger.info("[%s] %s %s — purpose: %s", call_id, method, url, purpose)

        # ── Daily budget check ────────────────────────────────────────────
        today = str(date.today())
        spent_today = _daily_spend.get(today, 0.0)
        if spent_today + X402_MAX_COST_USD > X402_DAILY_BUDGET_USD:
            logger.warning("[%s] daily budget exhausted (%.2f/%.2f USD)", call_id, spent_today, X402_DAILY_BUDGET_USD)
            return X402CallResult(
                ok=False, status_code=0, body=None,
                error=f"Daily agent budget exhausted (${spent_today:.2f}/${X402_DAILY_BUDGET_USD:.2f}). Resets at midnight.",
                call_id=call_id,
            )

        # ── Lazy-load x402 handler ────────────────────────────────────────
        # Deferred so the RAG service starts even without agent wallet keys.
        try:
            from .x402_handler import x402_handler  # noqa: PLC0415
        except Exception as exc:
            logger.error("[%s] x402 handler unavailable: %s", call_id, exc)
            return X402CallResult(
                ok=False, status_code=0, body=None,
                error=f"Payment handler not initialized: {exc}",
                call_id=call_id,
            )

        # ── HTTP call (x402Client: 402 → pay → retry, all internal) ──────
        try:
            resp = (
                await x402_handler.post(url, json=body)
                if method == "POST"
                else await x402_handler.get(url)
            )
        except Exception as exc:
            elapsed = int((time.monotonic() - t0) * 1000)
            logger.error("[%s] network error: %s", call_id, exc)
            return X402CallResult(
                ok=False, status_code=0, body=None,
                error=str(exc), call_id=call_id, elapsed_ms=elapsed,
            )

        elapsed = int((time.monotonic() - t0) * 1000)
        status = resp.status_code
        headers_lower = {k.lower() for k in resp.headers.keys()}
        paid = bool(_PAYMENT_RESPONSE_HEADERS & headers_lower)

        try:
            ct = resp.headers.get("content-type", "")
            body_out: Any = resp.json() if "application/json" in ct else resp.text
        except Exception:
            body_out = resp.text

        ok = 200 <= status < 300
        if paid:
            _daily_spend[today] = spent_today + X402_MAX_COST_USD
            logger.info("[%s] → %d (paid=%s, daily=%.2f/%.2f USD, %dms)",
                        call_id, status, paid, _daily_spend[today], X402_DAILY_BUDGET_USD, elapsed)
        else:
            logger.info("[%s] → %d (paid=%s, %dms)", call_id, status, paid, elapsed)
        if not ok:
            logger.warning("[%s] non-2xx body: %.200s", call_id, str(body_out))

        return X402CallResult(
            ok=ok,
            status_code=status,
            body=body_out,
            paid=paid,
            network=X402_PREFERRED_NETWORK if paid else None,
            error=None if ok else f"HTTP {status}",
            call_id=call_id,
            elapsed_ms=elapsed,
        )

    # ── Gemini serialisation ──────────────────────────────────────────────────

    def result_to_model_response(self, result: X402CallResult) -> dict[str, Any]:
        """
        Convert X402CallResult to the dict Gemini expects as a FunctionResponse value.
        Large bodies are automatically truncated by X402CallResult.to_dict().
        """
        return result.to_dict()


# Module-level singleton — import TOOL_INSTANCE, don't instantiate per request.
TOOL_INSTANCE = X402Skill()
