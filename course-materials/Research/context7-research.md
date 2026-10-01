# Context7: up-to-date documentation for AI coding agents

> What Context7 is, how it works, how to connect it in Claude Code, Codex CLI, Copilot CLI and Cursor, the CLI option, pricing and limits, and when it beats web search. All facts verified 2026-10-01 against context7.com and the [upstash/context7](https://github.com/upstash/context7) repo.

## What it is

- **Context7** is a documentation service by **Upstash** that serves current, version-specific library docs to LLMs and AI code editors. It solves the two classic failure modes: **hallucinated APIs** that do not exist and **outdated training data** (models trained on year-old library versions).
- How it works: Upstash's private **crawling and parsing engine** indexes public library documentation. Each library gets an ID such as `/vercel/next.js` or `/mongodb/docs`. The agent resolves a library name to this ID, then fetches focused, version-matched **doc snippets and code examples** for its exact task. Snippets come straight from the official sources, not from model memory.
- Distributed in two ways:
  - **MCP server** (remote `https://mcp.context7.com/mcp`, or locally via npm package `@upstash/context7-mcp`),
  - **CLI + skill**: the npm package `ctx7` installs a skill that teaches the agent to fetch docs through CLI commands, no MCP required.
- Two MCP tools: **`resolve-library-id`** (library name + query, returns ranked candidate IDs) and **`query-docs`** (library ID + task description, returns doc snippets). You can skip resolution by writing the ID directly in the prompt, e.g. "use library /vercel/next.js for docs".
- Very popular: ~62.6k stars on GitHub as of 2026-10-01.

## Connecting it to your tools

Quickest path for all tools: `npx ctx7 setup` (auto-detects the environment, handles OAuth, generates an API key). Requires Node.js 18+. Undo with `npx ctx7 remove`.

| Tool | Auto setup | Manual method (verified 2026-10-01) |
| :-- | :-- | :-- |
| **Claude Code** | `npx ctx7 setup --claude` | `claude mcp add --scope user --header "Authorization: Bearer YOUR_API_KEY" --transport http context7 https://mcp.context7.com/mcp` ([MCP docs](https://code.claude.com/docs/en/mcp)) |
| **Codex CLI** | `npx ctx7 setup --codex` | `codex mcp add context7 -- npx -y @upstash/context7-mcp`; or remote server in `config.toml` with `url = "https://mcp.context7.com/mcp"`; also available as a Codex plugin: `codex plugin marketplace add upstash/context7` |
| **GitHub Copilot CLI** | not covered by `ctx7 setup` | edit `~/.copilot/mcp-config.json` and add an `mcpServers.context7` entry with `"type": "http"`, the URL above and an `Authorization` header |
| **Cursor** | `npx ctx7 setup --cursor` | edit `~/.cursor/mcp.json` (or per-project `.cursor/mcp.json`), add `mcpServers.context7` with the URL above |

- **Anonymous access**: the remote MCP server works without any API key, at a **lower shared rate limit**; long agent sessions may hit 429 errors. Exact anonymous quota is not officially documented (community reports ~200 requests; UNCONFIRMED).
- **API key** (recommended, free): create one in the [Context7 dashboard](https://context7.com/dashboard) and pass it as `Authorization: Bearer YOUR_API_KEY`.
- The local npm variant for any MCP client: `npx -y @upstash/context7-mcp`.

## The ctx7 CLI

- `npx ctx7 setup` - one-command configuration for the supported agents (Claude, Cursor, Codex, OpenCode, Antigravity).
- `ctx7 library <name> <query>` - search, the CLI equivalent of `resolve-library-id`.
- `ctx7 docs <libraryId> <query>` - fetch docs, the equivalent of `query-docs`.
- Useful when a tool has no MCP support yet, or when you want docs fetched by a script instead of a live MCP connection.

## Pricing and limits

From [context7.com/plans](https://context7.com/plans), verified 2026-10-01:

| Plan | Price | Included API calls |
| :-- | :-- | :-- |
| **Free** | $0 | 1,000 per month |
| **Pro** | $10 per seat / month | 2,000 per seat / month |
| **Enterprise** | custom | 2,000 per seat / month |

- On Free you are **blocked at the monthly cap** (plus 20 bonus calls per day while blocked); Pro and Enterprise are never blocked and pay **$5 per 1,000 calls** overage.
- **Private repository parsing** (adding private docs to the index) costs $5 per 1M tokens.
- Quotas are per seat, not pooled; search API calls count the same as doc calls.

## When to use what

- **Context7 first** for any library/API docs, code generation, setup or configuration steps: it returns version-specific official snippets without leaving the editor, and works even when documentation sites block scrapers. The recommended agent rule from the README: always use Context7 for library docs without being asked.
- **Built-in docs tools** (editor hover docs, built-in `/docs`-style features) are fine for quick signature checks of already-installed packages, but they usually show only the locally installed version and lack worked examples.
- **Web search** still wins for release notes, blog posts, changelogs, GitHub issues and anything newer than Context7's latest crawl. Combine: Context7 for API usage, web search for "what changed in this release".

## Known limitations

- **Coverage gaps**: not every library is indexed; you can request or contribute one via [context7.com/add-library](https://context7.com/add-library).
- **Private and internal repos** are not in the public index; adding them requires paid private repo parsing or the self-hosted Enterprise deployment.
- **Community-contributed content**: Context7 states it cannot guarantee the accuracy, completeness or security of all indexed documentation; report wrong snippets from the site.
- **Quota walls**: anonymous use hits shared limits quickly; heavy agent sessions should run with a free API key.
- A **version mismatch** can still occur if you pin no library ID: let the agent resolve the ID, or write it explicitly in the prompt/`AGENTS.md`.

## Sources

- [Context7 GitHub repo (upstash/context7)](https://github.com/upstash/context7), README: tools, CLI commands, setup, server URL, checked 2026-10-01
- [Context7 plans and pricing](https://context7.com/plans), plan table and overage rules, checked 2026-10-01
- [Context7 install page](https://context7.com/install), `npx ctx7 setup` flags per agent, checked 2026-10-01
- [Context7 MCP clients reference](https://context7.com/docs/resources/all-clients), per-tool manual configs and anonymous access notes, checked 2026-10-01
- [skills.sh](https://skills.sh) and [vercel-labs/skills](https://github.com/vercel-labs/skills), separate skills-installer ecosystem (installs skills, not Context7 plugins), checked 2026-10-01
