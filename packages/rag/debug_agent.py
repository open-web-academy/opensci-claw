import os
from dotenv import load_dotenv
import sys

def debug_env():
    print("--- 🔍 SciGate Agent Diagnostic ---")
    print(f"Python Version: {sys.version}")
    print(f"Current Working Directory: {os.getcwd()}")
    
    env_path = os.path.join(os.getcwd(), '.env')
    print(f"Looking for .env at: {env_path}")
    
    if os.path.exists(env_path):
        print("✅ .env file FOUND")
        with open(env_path, 'r') as f:
            lines = f.readlines()
            print(f"Found {len(lines)} lines in .env")
            for line in lines:
                if 'RAG_AGENT_PRIVATE_KEY' in line:
                    print(f"Found RAG_AGENT_PRIVATE_KEY line: {line.split('=')[0]} = (hidden)")
    else:
        print("❌ .env file NOT FOUND in current directory")

    load_dotenv()
    
    key = os.getenv("RAG_AGENT_PRIVATE_KEY")
    if key:
        print(f"✅ RAG_AGENT_PRIVATE_KEY detected! (Length: {len(key)})")
        if key.startswith("0x"):
            print("Note: Key starts with 0x")
    else:
        print("❌ RAG_AGENT_PRIVATE_KEY NOT DETECTED in environment")

    google_key = os.getenv("GOOGLE_API_KEY")
    gemini_key = os.getenv("GEMINI_API_KEY")
    
    if google_key or gemini_key:
        print(f"✅ LLM Key detected: {'GOOGLE_API_KEY' if google_key else 'GEMINI_API_KEY'}")
    else:
        print("❌ NO LLM API KEY detected")

if __name__ == "__main__":
    debug_env()
