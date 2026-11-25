# Architecture

## 1. Design decisions

| Problem | Decision |
|---|---|
| No single answer. Sources disagree. | Agent looks more than once. |
| Data is two known tables plus PDFs. | Hardcode those files; filter with pandas / plain lines. |
| Agent has too much freedom. | Read-only agent. |
| Scans have no text. | Read the matching PDFs once; a short note with the page comes back. |
| Messy rows (accents, `;` in fields). | Keep raw lines; add a short eind/pct/sync summary in tool previews. |
| The model can search forever. | ~30s tool budget per chat turn, then answer with what it has. |

## 2. How it works

ReAct agent: think → tool → observe → repeat.

Tools run in a child process (`tools.py`) over stdio MCP. On start `load_data()` fills the two static tables. Source files are not modified.

- `find_tracks` — filter catalog by artist/title/ISRC; append matching rights lines
- `find_licenses` — filter rights by `licentie_eind` year / ISRC
- `read_document` — one PDF in, convert to png, llm call, short note with page numbers out

The first message has the system prompt, a short folder overview, and the question. Long result lists are written to `results/` as CSV.

## 3. Log

| | |
|---|---|
| Sources | Used the catalog dump, the rights CSV, and the PDFs. A PDF is opened only when the question needs it. Left unfinished: the partial dump and the shifted rights rows are not repaired, and the 2024 play counts stay inside `rapport_gebruik_2024.pdf` instead of a table. |
| Model | `gpt-6.2-sol`, reasoning effort `low`. One of the strongest models available, and it does tool calls and page images in one API. `gpt-4.1-mini` did worse on the same questions. Effort `high` added latency without a clear gain. |
| Choices | ReAct, so it can fetch data and still answer in a normal chat. MCP, so the tools are a separate server and other agents can reuse them. The filters in section 1 stay fixed. |
| Gaps | No real test suite, no stable API contract, no real frontend. The page is a demo chat; UI is not my trade. |
| Production | Eval the case questions, not only the three data checks. A small API: question in, answer plus cited sources out, with auth. Leave the UI to a frontend. Normalize the rights file once, index PDF pages, and host the MCP server so it is not a local child process. |
