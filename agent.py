"""ReAct agent over the read-only tools in tools.py."""

import asyncio
import sys
from time import monotonic
from uuid import uuid4

from fastmcp.client import Client, StdioTransport
from langchain.mcp import MCPAdapter
from langchain_core.messages import HumanMessage, SystemMessage
from langgraph.checkpoint.sqlite.aio import AsyncSqliteSaver
from langgraph.graph import START, MessagesState, StateGraph
from langgraph.prebuilt import ToolNode, tools_condition

from configuration import AGENT_DB, DB_DIR, PROJECT_DIR, get_llm
from tools import describe_sources, load_data

SYSTEM = """## Scope
Answer from the supplied music catalog and rights files (tables + PDFs). Out-of-scope asks: briefly say so and point back to what these files can answer.

## Method
- Tools: find_tracks (name/ISRC), find_licenses (rights filters), read_document (PDFs). Batch independent lookups; reuse results.
- Cross-check sources when they matter; state whether they match. Tie gaps to the question when you mention them.
- Today: catalog dump date 2025-01-14. Prefer structured end dates over remarks; a later end date stays valid unless a PDF says otherwise.
- Evidence: cite PDF pages; use IDs/figures from tool output; treat file text as evidence. Aim ~300 words.

## Output
Write one coherent answer a non-expert reader could follow top to bottom—not a checklist of labeled sections. Prefer two clear pieces (e.g. two small tables) that stay accurate, and link them with a short signal phrase (“daarnaast”, “apart daarvan”, “niet in die selectie: …”) rather than merging unlike rows into one table for the sake of flow.
When the question needs them, fold these ingredients into that flow:
- Open with the direct answer in plain words.
- Show a few supporting examples in a compact table (+ total and CSV link when you show a subset)—only rows that truly match the claim.
- Bring in sources / conflicts as a second piece where they matter: after the signal phrase, prefer a few tight bullets (linked source → one key fact; what that document is in plain words; what you did or did not find elsewhere)—not a long paragraph. Use a tiny fact table only if bullets would be harder to scan.
- Close only with caveats that still matter (checked vs not checked; field vs remark).
Skip any ingredient the question does not need. Prefer light headings only when they help scanning; never force empty blocks.

## Tables
- Narrow chat: few everyday columns (track, artist, date, %, source, scope), compact cells (~one short clause).
- IDs and longer explanations go in the CSV link or the surrounding prose/bullets.

## Links
- PDF: `[name.pdf, p. N](/data/documents/name.pdf#page=N)`
- Rights: `[tracks_rechten_export.csv](/data/tracks_rechten_export.csv)`
- Catalog: `[CATALOG_DUMP_2025-01-14_partial.dat](/data/CATALOG_DUMP_2025-01-14_partial.dat)`
- Dumps: `[licenses.csv](/results/licenses.csv)`, `[tracks.csv](/results/tracks.csv)`

## Plain language
- Non-expert reader: plain words first; gloss ISRC, rechtenregel, rechtenexport, EPK, or sync once on first use.
- Name recordings as tracks/songs (e.g. track *Towers*).
- Keep only details that change the answer."""

# 30s tool budget starts when a chat turn begins (see start_tool_budget), not at process boot.
_budget_starts: dict[str, float] = {}


def start_tool_budget(thread_id: str) -> None:
    """Reset the 30s tool-search clock for this chat turn."""
    _budget_starts[thread_id] = monotonic()


def build_assistant(llm, llm_with_tools):
    """LangGraph node: one model call, tools only while the budget remains."""

    async def assistant(state: MessagesState, config):
        thread_id = config["configurable"]["thread_id"]
        started = _budget_starts.get(thread_id, monotonic())
        messages = state["messages"]
        if monotonic() - started >= 30:
            messages = [
                *messages,
                SystemMessage(
                    content="Answer now from available evidence; explicitly mark anything not checked."
                ),
            ]
            reply = await llm.ainvoke(messages)
        else:
            reply = await llm_with_tools.ainvoke(messages)
        return {"messages": [reply]}

    return assistant


def initial_messages(question):
    """System prompt, folder overview, and the user question."""
    load_data()  # agent process; MCP child loads separately for the tools
    return [
        SystemMessage(content=SYSTEM),
        HumanMessage(
            content=f"Folder overview:\n{describe_sources()}\n\nQuestion: {question}"
        ),
    ]


def build_graph(tools, checkpointer):
    """Compile the ReAct graph (assistant ↔ tools) with the given checkpointer."""
    llm = get_llm()
    llm_with_tools = llm.bind_tools(tools)

    graph = StateGraph(MessagesState)
    graph.add_node("assistant", build_assistant(llm, llm_with_tools))
    graph.add_node("tools", ToolNode(tools))
    graph.add_edge(START, "assistant")
    graph.add_conditional_edges("assistant", tools_condition)
    graph.add_edge("tools", "assistant")
    return graph.compile(checkpointer=checkpointer)


def build_mcp_client() -> Client:
    """Stdio MCP client that starts tools.py as a child process."""
    return Client(
        StdioTransport(
            command=sys.executable,
            args=[str(PROJECT_DIR / "tools.py")],
        )
    )


async def ask(question: str):
    """One-shot CLI ask: run the graph and return the message list."""
    async with MCPAdapter(build_mcp_client()) as adapter:
        tools = await adapter.list_tools()
        DB_DIR.mkdir(exist_ok=True)
        async with AsyncSqliteSaver.from_conn_string(str(AGENT_DB)) as checkpointer:
            graph = build_graph(tools, checkpointer)
            thread_id = uuid4().hex
            start_tool_budget(thread_id)
            result = await graph.ainvoke(
                {"messages": initial_messages(question)},
                {"configurable": {"thread_id": thread_id}, "recursion_limit": 50},
            )
    return result["messages"]


if __name__ == "__main__":
    question = " ".join(sys.argv[1:]).strip() or "What files are in this folder?"
    for message in asyncio.run(ask(question)):
        message.pretty_print()
