"""FastAPI chat UI over the catalog agent."""

from contextlib import asynccontextmanager
from pathlib import Path

import uvicorn
from fastapi import FastAPI, Form, Request
from fastapi.responses import JSONResponse, RedirectResponse
from fastapi.staticfiles import StaticFiles
from langchain.mcp import MCPAdapter
from langgraph.checkpoint.sqlite.aio import AsyncSqliteSaver

from agent import build_graph, build_mcp_client
from configuration import AGENT_DB, DATA_DIR, DB_DIR, RESULTS_DIR
from streaming_utils import clear_results, stream_chat

STATIC_DIR = Path(__file__).parent / "static"
RESULTS_DIR.mkdir(exist_ok=True)


@asynccontextmanager
async def lifespan(app: FastAPI):
    async with MCPAdapter(build_mcp_client()) as adapter:
        tools = await adapter.list_tools()
        DB_DIR.mkdir(exist_ok=True)
        async with AsyncSqliteSaver.from_conn_string(str(AGENT_DB)) as checkpointer:
            app.state.graph = build_graph(tools, checkpointer)
            print(f"Loaded {len(tools)} tools: {[t.name for t in tools]}")
            yield


app = FastAPI(lifespan=lifespan)
app.mount("/static", StaticFiles(directory=str(STATIC_DIR)), name="static")
app.mount("/data", StaticFiles(directory=str(DATA_DIR)), name="data")
app.mount("/results", StaticFiles(directory=str(RESULTS_DIR)), name="results")


@app.get("/")
def root():
    return RedirectResponse(url="/static/chat.html")


@app.post("/chat")
async def chat(
    request: Request,
    user_input: str = Form(...),
    thread_id: str = Form(None),
):
    return await stream_chat(request, user_input, thread_id)


@app.post("/new-chat")
async def new_chat():
    """Clear result CSVs when the UI starts a fresh thread (sqlite threads stay)."""
    removed = clear_results()
    return JSONResponse({"ok": True, "removed": removed})


if __name__ == "__main__":
    uvicorn.run("app:app", host="127.0.0.1", port=8000, reload=False)
