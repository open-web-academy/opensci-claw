import os
import asyncio
import httpx
from eth_account import Account
from x402 import x402Client, parse_payment_required
from x402.mechanisms.evm.exact import ExactEvmScheme
from x402.mechanisms.evm.signers import EthAccountSigner

# --- LA OPCIÓN NUCLEAR: MONKEY-PATCHING ---
# Forzamos a la librería a usar nuestros metadatos sin importar qué
original_sign = ExactEvmScheme._sign_authorization

def patched_sign(self, authorization, requirements):
    # Inyectamos el EIP-712 domain real de USDC en World Chain para que la firma sea válida
    if hasattr(requirements, "extra"):
        requirements.extra = requirements.extra or {}
        requirements.extra["name"] = "USD Coin"
        requirements.extra["version"] = "2"
    elif isinstance(requirements, dict):
        if "extra" not in requirements: requirements["extra"] = {}
        requirements["extra"]["name"] = "USD Coin"
        requirements["extra"]["version"] = "2"
    
    return original_sign(self, authorization, requirements)

# Aplicar el parche en memoria
ExactEvmScheme._sign_authorization = patched_sign
print("☢️ x402: Sistema de firma EIP-712 parcheado con éxito.")

class AutonomousX402Handler:
    def __init__(self):
        print("\n🛰️  SciGate: Inicializando Sistemas de Pago...")
        self.client = x402Client()

        # 1. Configuración World Chain (EVM)
        evm_key = os.getenv("RAG_AGENT_PRIVATE_KEY") or os.getenv("PRIVATE_KEY")
        if evm_key:
            try:
                account = Account.from_key(evm_key)
                self.client.register("eip155:480", ExactEvmScheme(signer=EthAccountSigner(account)))
                print(f"✅ World Chain ID: {account.address}")
            except Exception as e:
                print(f"❌ Error en Llave EVM: {str(e)}")

        print("------------------------------------------\n")

    async def _request(self, method: str, url: str, **kwargs):
        if "headers" not in kwargs or kwargs["headers"] is None:
            kwargs["headers"] = {}
        else:
            kwargs["headers"] = dict(kwargs["headers"])

        async with httpx.AsyncClient() as client:
            # 1. Intentar la petición original
            resp = await client.request(method, url, **kwargs)
            
            # 2. Si es 402, negociar el pago
            if resp.status_code == 402:
                payment_req = (
                    resp.headers.get("X-402-Payment-Required") or 
                    resp.headers.get("x-402-payment-required") or
                    resp.headers.get("payment-required")
                )
                
                if not payment_req:
                    print(f"⚠️ x402: Recibí 402 sin header.")
                    return resp 
                
                print(f"🤝 x402: Negociando pago para {url}...")
                try:
                    import json
                    try:
                        req_data = json.loads(payment_req)
                    except:
                        req_data = payment_req
                    
                    # Extraer requerimientos del JSON (usando x402 standard)
                    accepts = req_data.get("accepts", [])
                    if not accepts and "requirements" in req_data:
                        accepts = req_data["requirements"]
                        
                    if not accepts:
                        raise ValueError("No se encontraron requerimientos de pago")
                        
                    req = accepts[0]
                    amount = int(req.get("amount", 0))
                    pay_to = req.get("payTo", "")
                    
                    if not amount or not pay_to:
                        raise ValueError("Faltan datos de monto o destinatario")
                    
                    from web3 import Web3
                    # Usar Alchemy porque rpc.worldchain.dev está fallando DNS
                    w3 = Web3(Web3.HTTPProvider("https://worldchain-mainnet.g.alchemy.com/public"))
                    
                    evm_key = os.getenv("RAG_AGENT_PRIVATE_KEY") or os.getenv("PRIVATE_KEY")
                    if not evm_key:
                        raise ValueError("No hay llave privada configurada en RAG_AGENT_PRIVATE_KEY")
                        
                    account = w3.eth.account.from_key(evm_key)
                    
                    usdc_address = w3.to_checksum_address("0x79A02482A880bCE3F13e09Da970dC34db4CD24d1")
                    pay_to_address = w3.to_checksum_address(pay_to)
                    
                    print(f"🚀 Ejecutando transferencia autónoma (Web3) de {amount} USDC a {pay_to_address}...")
                    
                    erc20_abi = [
                        {
                            "constant": False,
                            "inputs": [
                                {"name": "_to", "type": "address"},
                                {"name": "_value", "type": "uint256"}
                            ],
                            "name": "transfer",
                            "outputs": [{"name": "", "type": "bool"}],
                            "type": "function"
                        }
                    ]
                    
                    usdc_contract = w3.eth.contract(address=usdc_address, abi=erc20_abi)
                    nonce = w3.eth.get_transaction_count(account.address)
                    
                    tx = usdc_contract.functions.transfer(pay_to_address, amount).build_transaction({
                        'chainId': 480,
                        'gas': 100000,
                        'maxFeePerGas': w3.to_wei('0.005', 'gwei'),
                        'maxPriorityFeePerGas': w3.to_wei('0.001', 'gwei'),
                        'nonce': nonce,
                    })
                    
                    signed_tx = w3.eth.account.sign_transaction(tx, private_key=evm_key)
                    # Compatible con eth_account v5 y v6
                    raw_tx = getattr(signed_tx, 'raw_transaction', getattr(signed_tx, 'rawTransaction', None))
                    
                    tx_hash_bytes = w3.eth.send_raw_transaction(raw_tx)
                    tx_hash = w3.to_hex(tx_hash_bytes)
                    print(f"✅ Transacción enviada a World Chain! Hash: {tx_hash}")
                    
                    print("⏳ Esperando confirmación en blockchain (esto puede tomar unos segundos)...")
                    w3.eth.wait_for_transaction_receipt(tx_hash_bytes, timeout=120)
                    print("✅ Transacción confirmada.")
                    
                    proof_str = tx_hash
                    
                    new_headers = kwargs["headers"].copy()
                    new_headers["Authorization"] = f"x402 {proof_str}"
                    new_headers["x-payment-proof"] = proof_str
                    new_headers["PAYMENT-SIGNATURE"] = proof_str
                
                    print(f"🚀 x402: Re-intentando con comprobante (headers duales)...")
                    retry_resp = await client.request(method, url, headers=new_headers, json=kwargs.get("json"), params=kwargs.get("params"))
                    
                    if retry_resp.status_code == 402:
                        print(f"❌ x402: El servidor rechazó el pago. Esto ocurre si la billetera no tiene fondos suficientes o el facilitador no aprobó la transacción.")
                    elif retry_resp.status_code == 200:
                        print(f"✅ x402: Pago aceptado y recurso liberado.")
                        
                    return retry_resp
                except Exception as e:
                    print(f"❌ x402: Error al procesar pago: {e}")
                    return resp
            
            return resp

    async def get(self, url: str, headers: dict = None):
        return await self._request("GET", url, headers=headers)

    async def post(self, url: str, json: dict = None, headers: dict = None):
        return await self._request("POST", url, json=json, headers=headers)

# Instancia única para usar en toda la aplicación (Singleton)
x402_handler = AutonomousX402Handler()
