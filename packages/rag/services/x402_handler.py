import os
import asyncio
from eth_account import Account
from x402 import x402Client
from x402.mechanisms.evm.exact import ExactEvmScheme
from x402.mechanisms.svm.exact import ExactSvmScheme

# --- NUEVOS IMPORTS PARA LA VERSIÓN 2.8.0 ---
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

        # 1. Configuración del Cliente x402
        # En v2.8.0, el cliente descubre el facilitador desde los headers del servidor.
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
                sol_signer = KeypairSigner(kp)
                
                # Genesis Hash oficial de Solana Mainnet
                self.client.register(
                    "solana:5eykt4UsFv8P8NJdTREpY1vzqAQZSSfL",
                    ExactSvmScheme(signer=sol_signer)
                )
                print(f"✅ Solana Address: {kp.pubkey()}")
            except Exception as e:
                print(f"❌ Error en Llave Solana: {str(e)}")

        print("------------------------------------------\n")

    async def get(self, url: str, headers: dict = None):
        return await self.client.call("GET", url, headers=headers)

    async def post(self, url: str, json: dict = None, headers: dict = None):
        return await self.client.call("POST", url, json=json, headers=headers)

# Instancia única para usar en toda la aplicación (Singleton)
x402_handler = AutonomousX402Handler()
