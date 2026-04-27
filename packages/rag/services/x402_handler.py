import os
import asyncio
import httpx
from eth_account import Account
from x402 import x402Client, parse_payment_required
from x402.mechanisms.evm.exact import ExactEvmScheme
from x402.mechanisms.svm.exact import ExactSvmScheme
from x402.mechanisms.evm.signers import EthAccountSigner
from x402.mechanisms.svm.signers import KeypairSigner

# Soporte para carga de llaves de Solana
try:
    from solders.keypair import Keypair
except ImportError:
    Keypair = None

class AutonomousX402Handler:
    def __init__(self):
        print("\n🛰️  SciGate: Inicializando Sistemas de Pago...")
        self.client = x402Client()

        # 2. Configuración World Chain (EVM)
        evm_key = os.getenv("RAG_AGENT_PRIVATE_KEY") or os.getenv("PRIVATE_KEY")
        if evm_key:
            try:
                account = Account.from_key(evm_key)
                self.client.register("eip155:480", ExactEvmScheme(signer=EthAccountSigner(account)))
                print(f"✅ World Chain ID: {account.address}")
            except Exception as e:
                print(f"❌ Error en Llave EVM: {str(e)}")

        # 3. Configuración Solana (SVM)
        sol_key = os.getenv("RAG_AGENT_SOLANA_KEY")
        if sol_key and Keypair:
            try:
                kp = Keypair.from_base58_string(sol_key)
                self.client.register("solana:5eykt4UsFv8P8NJdTREpY1vzqAQZSSfL", ExactSvmScheme(signer=KeypairSigner(kp)))
                print(f"✅ Solana Address: {kp.pubkey()}")
            except Exception as e:
                print(f"❌ Error en Llave Solana: {str(e)}")
        print("------------------------------------------\n")

    async def _request(self, method: str, url: str, **kwargs):
        # Aseguramos que kwargs['headers'] sea un dict
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
                    print(f"⚠️ x402: Recibí 402 sin header de pago. Headers: {list(resp.headers.keys())}")
                    return resp 
                
                print(f"🤝 x402: Negociando pago para {url}...")
                try:
                    import json
                    # Intentar parsear como JSON si el servidor lo mandó así
                    try:
                        req_data = json.loads(payment_req)
                    except:
                        req_data = payment_req # Si no es JSON, usar el texto original
                    
                    # Parsear y generar el pago
                    req_obj = parse_payment_required(req_data)
                    payment_proof = await self.client.create_payment_payload(req_obj)
                    
                    # Convertir el comprobante a string (algunas versiones devuelven un objeto)
                    proof_str = str(payment_proof)
                    
                    # 3. Re-intentar con el header de Autorización x402
                    new_headers = kwargs["headers"].copy()
                    new_headers["Authorization"] = f"x402 {proof_str}"
                    
                    print(f"🚀 x402: Re-intentando con comprobante...")
                    return await client.request(method, url, headers=new_headers, json=kwargs.get("json"), params=kwargs.get("params"))
                except Exception as e:
                    print(f"❌ x402: Error al generar pago: {e}")
                    import traceback
                    traceback.print_exc() # Esto nos dirá exactamente en qué línea falló
                    return resp
            
            return resp

    async def get(self, url: str, headers: dict = None):
        return await self._request("GET", url, headers=headers)

    async def post(self, url: str, json: dict = None, headers: dict = None):
        return await self._request("POST", url, json=json, headers=headers)

# Instancia única para usar en toda la aplicación (Singleton)
x402_handler = AutonomousX402Handler()
