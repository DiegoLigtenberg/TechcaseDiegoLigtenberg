"""Stream one chat turn to the UI; write traces/chat_*.json."""

import json
import os
import time
import uuid
from pathlib import Path

from fastapi import Request
from fastapi.responses import StreamingResponse
from langchain_core.messages import AIMessage, HumanMessage, ToolMessage

from agent import initial_messages, start_tool_budget
from configuration import PROJECT_DIR, RESULTS_DIR

TRACE_LIMIT = 4000


async def stream_chat(request: Request, question: str, thread_id: str | None = None):
    """HTTP entry for one chat turn."""
    thread_id = thread_id or str(uuid.uuid4())
    return StreamingResponse(
        stream_turn(request.app.state.graph, question, thread_id),
        media_type="text/plain",
    )


async def stream_turn(graph, question: str, thread_id: str):
    """Stream tokens and tool markers; end with __FINAL__ and a JSON trace."""
    start_tool_budget(thread_id)
    config = {"configurable": {"thread_id": thread_id}, "recursion_limit": 50}
    payload = await _payload(graph, config, question)

    steps: list = []
    seen_calls: set[str] = set()
    seen_results: set[str] = set()
    started = previous = time.perf_counter()

    async for event in graph.astream_events(payload, config=config, version="v2"):
        kind = event["event"]

        if kind == "on_chat_model_stream":
            text = event["data"]["chunk"].text
            if text:
                yield text

        elif kind == "on_tool_start":
            run_id = event["run_id"]
            if run_id in seen_calls:
                continue
            seen_calls.add(run_id)
            name, args = event["name"], event["data"]["input"]
            previous = _note(steps, "tools_call", name, previous, args=args)
            yield f"\n__TOOL_CALL__:Calling tool '{name}' with args {args}\n"

        elif kind == "on_tool_end":
            run_id = event["run_id"]
            if run_id in seen_results:
                continue
            seen_results.add(run_id)
            name = event["name"]
            output = event["data"]["output"]
            if isinstance(output, ToolMessage):
                text = output.text
            else:
                text = str(output)
            previous = _note(
                steps, "tools_result", name, previous, text=text[:TRACE_LIMIT]
            )
            yield f"\n__TOOL_CALL_RESULT__:Tool '{name}' returned: {text}\n"

    answer = await _final_answer(graph, config)
    yield f"\n__FINAL__:{answer}"
    path = write_chat_trace(
        thread_id=thread_id,
        question=question,
        answer=answer,
        steps=steps,
        seconds=round(time.perf_counter() - started, 2),
    )
    print(f"chat trace: {path}", flush=True)


async def _payload(graph, config, question: str):
    """Follow-up message, or a fresh thread (clears results/)."""
    state = await graph.aget_state(config)
    if state.values.get("messages"):
        return {"messages": [HumanMessage(content=question)]}
    clear_results()
    return {"messages": initial_messages(question)}


def clear_results() -> int:
    """Delete files in results/. Returns how many were removed."""
    RESULTS_DIR.mkdir(exist_ok=True)
    removed = 0
    for path in RESULTS_DIR.iterdir():
        if path.is_file():
            path.unlink()
            removed += 1
    return removed


def _note(steps: list, node: str, name: str, previous: float, **extra) -> float:
    """Record one timed tool step; return the new clock."""
    now = time.perf_counter()
    steps.append(
        {"node": node, "seconds": round(now - previous, 3), "name": name, **extra}
    )
    return now


async def _final_answer(graph, config) -> str:
    """Last AI text without tool_calls, read from checkpoint after the stream."""
    state = await graph.aget_state(config)
    for msg in reversed(state.values.get("messages", [])):
        if isinstance(msg, AIMessage) and not msg.tool_calls and msg.text.strip():
            return msg.text.strip()
    return (
        "No final answer was produced — tools ran, but the model did not return "
        "a closing reply. Try again."
    )


def write_chat_trace(
    *, thread_id: str, question: str, answer: str, steps: list, seconds: float
) -> Path:
    """Write question, tool steps, answer and timing to traces/chat_*.json."""
    run_id = uuid.uuid4().hex[:12]
    folder = PROJECT_DIR / "traces"
    folder.mkdir(exist_ok=True)
    path = folder / f"chat_{run_id}.json"
    path.write_text(
        json.dumps(
            {
                "run_id": run_id,
                "source": "frontend",
                "thread_id": thread_id,
                "model": os.getenv("OPENAI_MODEL"),
                "effort": os.getenv("OPENAI_REASONING_EFFORT", "low"),
                "question": question,
                "seconds": seconds,
                "answer": answer,
                "steps": steps,
            },
            ensure_ascii=False,
            indent=2,
        ),
        encoding="utf-8",
    )
    return path
