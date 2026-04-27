
import inspect
from x402 import x402Client

client = x402Client()
print("--- x402Client.create_payment_payload Signature ---")
print(inspect.signature(client.create_payment_payload))

try:
    from x402 import parse_payment_required
    # Simular un objeto de requerimiento para ver sus entrañas
    dummy_req = {"requirements": [{"type": "eip155:480/exact-evm", "asset": "eip155:480/erc20:0x...", "amount": "100"}]}
    req_obj = parse_payment_required(dummy_req)
    print("\n--- PaymentRequired Object Attributes ---")
    print(dir(req_obj))
    if hasattr(req_obj, "requirements"):
        print("\n--- Individual Requirement Attributes ---")
        print(dir(req_obj.requirements[0]))
except Exception as e:
    print(f"\nError checking objects: {e}")
