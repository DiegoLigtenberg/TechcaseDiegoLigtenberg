import os
from pathlib import Path

from dotenv import load_dotenv
from langchain_openai import ChatOpenAI
from pydantic import SecretStr

PROJECT_DIR = Path(__file__).resolve().parent
DATA_DIR = PROJECT_DIR / "data"
DB_DIR = PROJECT_DIR / "db"
RESULTS_DIR = PROJECT_DIR / "results"
AGENT_DB = DB_DIR / "agent.sqlite"

load_dotenv(PROJECT_DIR / ".env")


def get_llm(effort: str | None = None):
    """OpenAI chat model. Tool calls go through the Responses API."""
    api_key = os.getenv("OPENAI_API_KEY")
    return ChatOpenAI(
        api_key=SecretStr(api_key) if api_key else None,
        model=os.getenv("OPENAI_MODEL", "gpt-6.2-sol"),
        use_responses_api=True,
        streaming=True,
        reasoning={"effort": effort or os.getenv("OPENAI_REASONING_EFFORT", "low")},
        timeout=30,
        max_retries=0,
    )
