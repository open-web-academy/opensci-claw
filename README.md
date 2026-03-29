# SciGate — Academic Papers for AI Agents & Humans

> **World Build 3 Hackathon · April 2026**

SciGate is a decentralized academic publishing platform that bridges Web3 Identity and Agentic AI. Scientists publish their papers securely verified by **World ID**, and every time an AI agent or a human queries their intellectual property via RAG (Retrieval-Augmented Generation), the author instantly receives USDC micropayments powered by the **x402** protocol.

## 🚀 The Value Proposition
1. **Verification**: Papers are tied to real humans via **World App (MiniKit)**. No AI spam in the scientific catalog.
2. **Monetization**: Moving past the $37-Billion free-publishing model. Every RAG query triggers a `$0.01` payment instantly. First 3 queries? Free via **AgentKit**.

## 🏗️ Architecture (Hackathon MVP)

For this hackathon, we built a hybrid **Off-Chain / On-Chain** microservice architecture optimized for speed and resilience during live demos.

```
scigate/
├── app/               # Next.js 14 Frontend (App Router, MiniKit UI, API Proxies)
├── packages/
│   ├── contracts/     # Foundry / Solidarity — PaperRegistry.sol (Payment Channels)
│   ├── server/        # Node.js + Hono — x402 Gateway & Mock DB (Port 3001)
│   └── rag/           # Python + FastAPI — Agent QA, ChromaDB, Gemini (Port 8000)
```

1. **Frontend (Next.js)**: Integrates `MiniKit` to dynamically interact inside the World App. Includes Next.js API Routes (`/api/papers/...`) to securely proxy remote device requests (mobile phones) to the local backend without triggering CORS/Localhost errors.
2. **x402 Gateway (Hono/Node)**: Acts as the primary tollbooth. Contains a swift in-memory Mock Database to store demo session uploads off-chain (preventing live-demo blockchain congestion delays) whilst strictly enforcing `HTTP 402` payment verification for AI queries.
3. **RAG Engine (Python)**: Parses uploaded PDFs via `PyMuPDF`, embeds them into `ChromaDB`, and uses `Google Gemini` to answer semantic queries against the scholarly text.

## 🛠️ Running the Project Locally

You will need **three** terminal windows to run all microservices simultaneously.

### 1. Environment Variables
Copy the template and fill in your keys:
```bash
cp .env.example .env
# Required: NEXT_PUBLIC_WORLD_APP_ID, GEMINI_API_KEY
```

### 2. Startup the RAG Engine (Terminal 1)
```bash
cd packages/rag
python -m venv venv
source venv/Scripts/activate # OR venv/bin/activate on Mac/Linux
pip install -r requirements.txt
python main.py
```
*Runs on `http://127.0.0.1:8000`*

### 3. Startup the x402 Gateway & DB (Terminal 2)
```bash
cd packages/server
npm install
npm run dev
```
*Runs on `http://127.0.0.1:3001`*

### 4. Startup the Frontend (Terminal 3)
```bash
npm install
npm run dev
```
*Runs on `http://localhost:3000`. Use `ngrok http 3000` to tunnel this to your phone and test the MiniKit World App native integration!*

## 💡 Key Features of the MVP
* **Auto-Detect Wallets**: MiniKit detects your wallet natively; fallback fields auto-trigger for desktop testing.
* **Smart UI Layouts**: Adaptive CSS grids that beautifully stack whether you are browsing on a 4K Desktop or an iPhone SE within the World App iframe.
* **Micropayment Bounties**: Hit the `/api/papers/[id]/query` endpoint. The server will reject it with a `402 Payment Required` until cryptographic proof of USDC transfer is attached.

## 📜 License
MIT License. Created affectionately for the World Build 3 Hackathon.
