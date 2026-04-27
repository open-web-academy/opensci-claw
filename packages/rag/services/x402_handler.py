import os
import asyncio
import httpx
from eth_account import Account
from x402 import x402Client, parse_payment_required
from x402.mechanisms.evm.exact import ExactEvmScheme
from x402.mechanisms.evm.signers import EthAccountSigner

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
                    
                    # --- EL PLAN C: INYECCIÓN EN EL JSON ORIGINAL ---
                    print(f"🛠️ x402: Inyectando metadatos en el JSON original...")
                    try:
                        if not isinstance(req_data, dict):
                            req_data = json.loads(req_data) if isinstance(req_data, str) else {}
                        
                        # Asegurar versión de x402
                        if "x402Version" not in req_data:
                            req_data["x402Version"] = "2.0.0"
                            
                        if "requirements" in req_data:
                            for req in req_data["requirements"]:
                                # Inyectar en el 'extra' del requerimiento individual
                                if "extra" not in req or req["extra"] is None:
                                    req["extra"] = {}
                                req["extra"]["name"] = "SciGate"
                                req["extra"]["version"] = "1"
                                
                        # También inyectar en el nivel superior por si acaso
                        if "extra" not in req_data or req_data["extra"] is None:
                            req_data["extra"] = {}
                        req_data["extra"]["name"] = "SciGate"
                        req_data["extra"]["version"] = "1"
                        
                    except Exception as e:
                        print(f"⚠️ x402: Error preparando JSON: {e}")

                    # Ahora parseamos el objeto ya con los datos inyectados
                    req_obj = parse_payment_required(req_data)
                    
                    print(f"🚀 x402: Llamando a create_payment_payload...")
                    payment_proof = await self.client.create_payment_payload(req_obj)
                    proof_str = str(payment_proof)
                    
                    new_headers = kwargs["headers"].copy()
                    new_headers["Authorization"] = f"x402 {proof_str}"
                    
                    print(f"🚀 x402: Re-intentando con comprobante...")
                    return await client.request(method, url, headers=new_headers, json=kwargs.get("json"), params=kwargs.get("params"))
                except Exception as e:
                    print(f"❌ x402: Error al generar pago: {e}")
                    return resp
            
            return resp

    async def get(self, url: str, headers: dict = None):
        return await self._request("GET", url, headers=headers)

    async def post(self, url: str, json: dict = None, headers: dict = None):
        return await self._request("POST", url, json=json, headers=headers)

# Instancia única para usar en toda la aplicación (Singleton)
x402_handler = AutonomousX402Handler()
