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
        async with httpx.AsyncClient() as client:
            # 1. Intentar la petición original
            resp = await client.request(method, url, **kwargs)
            
            # 2. Si es 402, negociar el pago
            if resp.status_code == 402:
                # Intentamos obtener el header de varias formas (algunos proxies quitan el X- o cambian el nombre)
                payment_req = (
                    resp.headers.get("X-402-Payment-Required") or 
                    resp.headers.get("x-402-payment-required") or
                    resp.headers.get("payment-required")
                )
                
                if not payment_req:
                    print(f"⚠️ x402: Recibí 402 pero no encontré el header 'X-402-Payment-Required'. Headers: {list(resp.headers.keys())}")
                    return resp 
                
                print(f"🤝 x402: Negociando pago para {url}...")
                try:
                    # Parsear la cabecera en un objeto que x402 entienda
                    req_obj = parse_payment_required(payment_req)
                    
                    # Generar el payload de pago usando el cliente x402
                    payment_proof = await self.client.create_payment_payload(req_obj)
                    
                    # 3. Re-intentar con el header de Autorización x402
                    new_kwargs = kwargs.copy()
                    headers = new_kwargs.get("headers", {}).copy()
                    headers["Authorization"] = f"x402 {payment_proof}"
                    new_kwargs["headers"] = headers
                    
                    print(f"🚀 x402: Re-intentando con comprobante de pago...")
                    return await client.request(method, url, **new_kwargs)
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
