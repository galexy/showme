# showme — Spec

A Chrome extension that lets you select content on any web page and ask an
agent to generate a custom, dynamic, interactive visualization for it. The
generated visualization is rendered next to a chat conversation inside the
browser side panel.

> **Status:** Draft v0. Decisions captured below are baseline; open questions
> at the bottom still need answers.

---

## 1. Goal & non-goals

### Goal
Turn arbitrary web content (tables, prose, lists, code, charts of images of
data, etc.) into a bespoke visualization on demand. The agent decides what
visualization best fits the content and the user's intent, and generates the
HTML/CSS/JS to render it.

### Concretely, v1 ships when…
- I can open any URL, hit the extension, pick a `<table>` of SEC financials,
  type "show me revenue trend by segment," and within ~10s see a working
  bar/line chart in the side panel — and continue the conversation to refine
  it ("make Q4 highlighted red", "switch to YoY %").
- I can pick a paragraph describing a company's business and ask for a
  diagram (e.g., a value-chain flow, a market-segment treemap, a timeline)
  and get something useful.

### Non-goals (v1)
- No persistence across sessions (no saved boards, no per-URL viz library).
- No multi-user / sharing / auth — local Mastra dev server only.
- No mobile, no Firefox/Safari builds.
- No PDF / non-HTML pages (Chrome side panel can't reliably target those yet).
- No fine-tuning, no RAG over the page's full corpus — just the selection plus
  light page context (URL, title, headings around the selection).

---

## 2. User flow

1. User opens the side panel (toolbar click or keyboard shortcut).
2. Side panel shows the CopilotKit chat on top and an empty "visualizations"
   stack below.
3. User triggers selection capture in one of two modes:
   - **Text-select mode** — drag-select text on the page; a small inline
     "Send to showme" pill appears near the selection. Clicking it pushes the
     selection into the side panel as conversation context.
   - **Element-pick mode** — user toggles a "pick element" button in the
     panel; cursor switches to a Chrome-inspector-style hover-highlight; click
     captures the full element (e.g., a whole `<table>`).
4. Captured selection appears in the chat as an attached context chip
   ("Selection from sec.gov/… — table, 6 rows × 5 cols").
5. User types a request ("visualize this", or anything specific). Message
   streams to the Mastra agent over AG-UI.
6. Agent reasons, then calls a `render_visualization` tool. The tool result
   is a self-contained HTML document. Frontend mounts that document in a new
   sandboxed iframe card in the visualizations stack.
7. User can chat further to refine. Agent emits a new viz (replaces or
   appends — see open question §10) or talks back in chat.

---

## 3. Architecture

```
┌──────────────────────── Browser ────────────────────────┐
│                                                          │
│  ┌─────────── Host page (any URL) ──────────┐           │
│  │  content-script.ts                       │           │
│  │  • selection pill + element picker       │           │
│  │  • DOM extraction (HTML + parsed table)  │           │
│  │  • postMessage → background              │           │
│  └─────────────────┬────────────────────────┘           │
│                    │ chrome.runtime                      │
│                    ▼                                     │
│  ┌─── background (service worker) ──────────┐           │
│  │  • routes selections to active panel     │           │
│  │  • opens side panel on toolbar click     │           │
│  └─────────────────┬────────────────────────┘           │
│                    │ chrome.runtime                      │
│                    ▼                                     │
│  ┌──────── Side panel (React app) ──────────┐           │
│  │                                          │           │
│  │  ┌─── CopilotKit chat ────────────────┐ │           │
│  │  │  <CopilotKit runtimeUrl=…>         │ │           │
│  │  │  uses AG-UI client                 │ │           │
│  │  └────────────────────────────────────┘ │           │
│  │                                          │           │
│  │  ┌─── Visualizations stack ───────────┐ │           │
│  │  │  [ <iframe sandbox="allow-scripts" │ │           │
│  │  │     srcdoc={agent-html} /> ]       │ │           │
│  │  │  [ … prior viz cards … ]           │ │           │
│  │  └────────────────────────────────────┘ │           │
│  └─────────────────┬────────────────────────┘           │
│                    │ AG-UI over HTTP/SSE (localhost)    │
└────────────────────┼────────────────────────────────────┘
                     ▼
┌──────────────── Mastra backend (local) ─────────────────┐
│  • mastra dev server, AG-UI endpoint                    │
│  • Agent: showmeAgent (Anthropic Claude)                │
│  • Tools:                                                │
│      - render_visualization(html, title, notes)          │
│      - parse_table(html) → structured rows               │
│      - extract_text(html) → cleaned plaintext            │
│      - (later) fetch_url, search                         │
└──────────────────────────────────────────────────────────┘
```

---

## 4. Components

### 4.1 Chrome extension (Manifest V3)

**Manifest highlights**
- `manifest_version: 3`
- `permissions`: `sidePanel`, `activeTab`, `scripting`, `storage`
- `host_permissions`: `<all_urls>` (needed so the content script can run on
  arbitrary sites the user is reading)
- `side_panel.default_path`: `sidepanel.html`
- `background.service_worker`: `background.ts`
- `content_scripts`: matches `<all_urls>`, injects `content-script.ts`
- `action`: toolbar icon → opens side panel for the active tab

**`content-script.ts`**
- Listens for `mouseup` to detect selections; floats a "Send to showme" pill
  near the bounding rect of `window.getSelection().getRangeAt(0)`.
- Element-picker mode: overlay div tracks `mousemove`, draws an outline
  around `document.elementFromPoint`, click captures.
- Builds a `SelectionPayload` (see §5) including:
  - `outerHTML` of the selected element/range
  - cleaned plaintext
  - if it's a `<table>`, a parsed `{ headers, rows }` structure
  - page context: `url`, `title`, the nearest preceding `h1/h2/h3` text
- Sends payload via `chrome.runtime.sendMessage`.

**`background.ts`**
- On toolbar click: `chrome.sidePanel.open({ tabId })`.
- Forwards `SelectionPayload` messages to the side panel for the active tab.

**Side panel (`sidepanel.html` + React app, Vite build)**
- Tech: React, TypeScript, Tailwind (or CSS modules — see open Q), Vite +
  `@crxjs/vite-plugin` (or equivalent) for MV3 bundling.
- Top half: CopilotKit chat (`<CopilotKit runtimeUrl="http://localhost:PORT/copilotkit">`,
  `<CopilotChat />`).
  - `useCopilotReadable` exposes the current `SelectionPayload` to the agent
    so it doesn't have to be re-pasted into every message.
  - `useCopilotAction` registers a frontend action for
    `render_visualization` so when the agent emits that tool call, the
    extension mounts an iframe instead of dumping HTML in chat.
- Bottom half: scrollable stack of viz cards. Each card is:
  - `<iframe srcdoc={html} sandbox="allow-scripts">` with no
    `allow-same-origin` — iframe runs with an opaque origin, can't touch host
    page or extension state.
  - Card chrome: title, "open in new tab", "remove", "regenerate"
    (re-issues the last user message), error indicator.
- Postmessage bridge from iframe → panel: iframe posts JS errors back so the
  panel can surface them in chat ("the viz threw `TypeError: …`") and the
  agent can self-correct on the next turn.

### 4.2 Backend — Mastra agent

**Stack:** Mastra + `@ai-sdk/anthropic` + AG-UI server adapter.

**Agent: `showmeAgent`**
- Model: `claude-sonnet-4-6` by default (fast, strong at HTML/SVG); allow
  override to `claude-opus-4-7` for harder cases via a runtime flag.
- System prompt (sketch):
  > You help users understand web content by generating bespoke
  > visualizations. You receive a selection (HTML + parsed structure) and a
  > user request. Decide the most useful visualization, then call
  > `render_visualization` with a single self-contained HTML document.
  > Constraints: must run in a sandboxed iframe with no network except an
  > approved CDN allowlist (D3, Chart.js, Plotly via cdn.jsdelivr.net).
  > No external fonts, no analytics, no `<form>` submissions. Prefer
  > interactivity (tooltips, brushing) when it adds value.

**Tools**
- `render_visualization({ title, html, notes? })` — the headline tool.
  Backend just passes the HTML through; frontend handler mounts the iframe.
- `parse_table({ html })` → `{ headers: string[], rows: (string|number)[][] }`
  for when the agent decides it needs cleaner numbers than what was
  pre-parsed.
- `extract_text({ html })` → plaintext with structure markers.
- (Stretch) `fetch_url`, `web_search` — gated behind v1.5.

**Transport: AG-UI**
- Mastra exposes the agent over the AG-UI protocol (HTTP + SSE for streaming
  events: text deltas, tool calls, tool results, run lifecycle).
- CopilotKit consumes AG-UI directly — `<CopilotKit runtimeUrl="…">` is
  pointed at the Mastra AG-UI endpoint. No CopilotKit runtime middleware is
  needed in v1; the browser talks to Mastra directly over localhost.
- This is the contract boundary: anything the frontend needs from the agent
  (chat tokens, viz HTML, status) flows as AG-UI events.

---

## 5. Data contracts

### `SelectionPayload` (extension → side panel → agent)
```ts
type SelectionPayload = {
  id: string;                    // uuid
  capturedAt: string;            // ISO
  source: { url: string; title: string; nearestHeading?: string };
  kind: 'text-range' | 'element';
  outerHTML: string;             // ≤ 200 KB; truncated with marker if larger
  plaintext: string;             // ≤ 50 KB
  parsed?:
    | { type: 'table'; headers: string[]; rows: (string | number)[][] }
    | { type: 'list'; items: string[] };
  bounds?: { x: number; y: number; w: number; h: number };
};
```

### `RenderVisualizationCall` (agent tool call)
```ts
type RenderVisualizationCall = {
  title: string;                 // shown on the viz card
  html: string;                  // full self-contained <!doctype html> doc
  notes?: string;                // surfaced in chat alongside the card
};
```

### Iframe → panel postMessage
```ts
type IframeMessage =
  | { type: 'ready' }
  | { type: 'error'; message: string; stack?: string }
  | { type: 'log'; level: 'log'|'warn'|'error'; args: unknown[] };
```

---

## 6. Security model

Generated HTML is untrusted code. Rules:

1. **Sandboxed iframe always.** `sandbox="allow-scripts"` only. No
   `allow-same-origin`, no `allow-top-navigation`, no `allow-forms`. The
   iframe gets an opaque origin and cannot read the side panel, the host
   page, cookies, `localStorage`, or extension storage.
2. **Strict CSP inside the iframe** via a `<meta http-equiv="Content-Security-Policy">`
   tag injected at the top of the document before render. Allowlist:
   `default-src 'none'; script-src 'unsafe-inline' https://cdn.jsdelivr.net;
   style-src 'unsafe-inline'; img-src data:; connect-src 'none';
   font-src 'none'`. Adjust as we add libraries.
3. **No network from the iframe** beyond the CDN allowlist. The agent should
   never need to fetch the user's data — the data is already in the
   selection it received.
4. **No secrets in the extension.** Anthropic API key lives in the Mastra
   server env (`.env`). The extension only knows the local backend URL.
5. **Selection size cap.** Truncate `outerHTML > 200 KB` and
   `plaintext > 50 KB` before sending — protects context budget and makes
   prompt-injection from huge pages less practical.
6. **Acknowledge prompt-injection risk.** Page content is untrusted input to
   the LLM. The agent should treat the selection as data, not instructions.
   Add a note in the system prompt; revisit hardening in v1.5.

---

## 7. Repo layout

Monorepo, pnpm workspaces.

```
showme/
├── extension/             # Chrome extension (Vite + React + CopilotKit)
│   ├── src/
│   │   ├── content/       # content-script.ts, picker, selection capture
│   │   ├── background/    # service worker
│   │   ├── sidepanel/     # React app: chat + viz stack
│   │   └── shared/        # SelectionPayload types, message protocol
│   ├── manifest.json
│   └── vite.config.ts
├── backend/               # Mastra agent
│   ├── src/
│   │   ├── agents/showme.ts
│   │   ├── tools/         # render_visualization, parse_table, extract_text
│   │   └── index.ts       # mastra.dev entry
│   └── .env.example       # ANTHROPIC_API_KEY=…
├── packages/
│   └── shared-types/      # SelectionPayload, AG-UI message shapes (if shared)
├── SPEC.md
├── README.md
└── pnpm-workspace.yaml
```

---

## 8. v1 milestones

| # | Milestone | Done when |
|---|---|---|
| M0 | Repo scaffolded | pnpm workspaces, both packages build, MV3 extension loads in Chrome |
| M1 | Side panel opens with CopilotKit chat | Click toolbar → side panel → chat round-trips through Mastra → Anthropic |
| M2 | Selection capture (text mode) | Drag-select on any page → pill → selection appears as a context chip in the panel |
| M3 | Element-picker mode | Hover-highlight + click captures `<table>` with parsed rows |
| M4 | `render_visualization` end-to-end | Agent emits HTML, frontend mounts a sandboxed iframe in the viz stack |
| M5 | Iterative refinement | Follow-up messages produce updated viz; iframe errors are reported back to the agent |
| M6 | Polish | CSP enforced, size caps applied, basic empty/error states, README with run instructions |

Stretch (not blocking v1): viz pinning, multiple selections per turn, "open
viz in new tab," dark mode, keyboard shortcut for picker.

---

## 9. Risks / things we'll learn the hard way

- **Selection capture on hostile pages.** Sites with heavy event handlers
  (Google Docs, Notion, dynamic SPAs) may swallow our `mouseup` listener or
  re-render the selection away. Element-picker is the more robust path; text
  mode is a nice-to-have.
- **Iframe library loading latency.** Loading Plotly from CDN inside every
  card is slow. May need to bundle a small charting lib (e.g., uPlot, or
  Chart.js) and inject it via `srcdoc` to avoid the network hop.
- **AG-UI / CopilotKit / Mastra version skew.** All three are moving fast;
  pin versions and write a smoke test that exercises the full chat→tool-call
  loop on each upgrade.
- **Prompt injection from page content.** A malicious page could embed
  hidden text instructing the agent to do something. v1 accepts this risk
  with a system-prompt mitigation; v1.5 should add stricter input scrubbing.
- **HTML output size.** Self-contained HTML with embedded data can blow past
  Anthropic's max output tokens. May need a streaming protocol where the
  agent streams the HTML in chunks and the iframe re-renders progressively.

---

## 10. Open questions

These need decisions before or during implementation. Defaults proposed.

1. **Multiple viz cards or single replacing card?**
   *Default: append.* Each new `render_visualization` call mounts a new card
   below the previous one; user can scroll back. "Regenerate" replaces the
   last card in place.
2. **Does the agent see prior viz HTML on follow-up turns?**
   *Default: yes, last viz only.* Pass the most recent viz HTML back as
   conversation context so "make Q4 red" works without a full re-derivation.
3. **Element picker UX.** Esc-to-cancel, click-to-pick, or click-to-pick
   plus a confirmation step? *Default: click-to-pick, Esc cancels, no
   confirmation.*
4. **Styling system in the side panel.** Tailwind vs. CSS modules vs.
   shadcn/ui. *Default: Tailwind + shadcn/ui — fastest to build a clean panel UI.*
5. **AG-UI client choice.** CopilotKit's bundled client, or `@ag-ui/client`
   directly with a thin CopilotKit shell? *Default: CopilotKit's, simpler.*
6. **Charting library bundled vs. CDN.** *Default: CDN (jsdelivr) for v1,
   revisit if latency hurts.*
7. **Telemetry.** Any local dev telemetry (token counts, latency) surfaced
   in the panel? *Default: yes, a small "debug" footer in the panel.*
8. **Where do API keys live for the user?**
   *Default for v1: only the developer runs this; key in `backend/.env`.* No
   per-user key UI yet.

---

## 11. Out of scope (explicitly)

- Auth, multi-tenant hosting, billing
- Saving / sharing visualizations
- Non-HTML content (PDFs, images of tables, screenshots-as-input)
- Browser support beyond Chrome
- Offline / on-device models
