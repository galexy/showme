# showme — progress

Last updated: 2026-05-09 — second pass. After the morning's M1–M4 wire-up, this session fixed two regressions that only showed in the actual side panel UI: (a) the chat container kept growing instead of scrolling internally, and (b) `render_visualization` cards stuck on "Rendering…" because the iframe inherited the strict extension CSP. Both fixed and CDP-verified.

## Milestones (vs. SPEC.md §8)

| ID | Status | Notes |
|----|--------|-------|
| M0 — Repo scaffolded | done | pnpm workspace; `extension` (Vite + CRXJS) and `backend` (Mastra) both build. |
| M1 — Side panel + CopilotKit | **done, live** | Chat round-trips end-to-end through the dockerized Chromium → CopilotKit Next runtime → Mastra → LiteLLM proxy → Claude. Verified by sending "say hi" via CDP-driven Playwright and getting a streamed reply. |
| M2 — Text selection capture | done | `content.ts` mouseup pill posts `SELECTION_CAPTURED` → background → `chrome.storage.session` → side panel chip. |
| M3 — Element picker | done | Hover-highlight + click capture; `<table>` parsed to `{ headers, rows }`, `<ul>/<ol>` parsed to items. Esc cancels. |
| M4 — `render_visualization` end-to-end | **done, live** | Selection-aware: seeded a parsed-table selection, sent "make a bar chart", agent emitted `render_visualization` tool call, frontend mounted the `VizCard` iframe with the title "Year vs Value Bar Chart". Follow-up "change the bars to red" produced a second tool call that re-mounted with red bars — so the multi-turn refinement path also works on the wire. **Update (this session):** the wire-level path was working, but in the actual side panel UI every card sat at "Rendering…" forever — the iframe was hitting `script-src 'self'` violations because CRXJS silently strips the manifest's `sandbox`/`content_security_policy` keys. Fixed by re-injecting both keys in a post-build Vite plugin and serving `viz-frame.html` from `public/`; CDP probe now sees `frame-ready` → `ready` → Chart.js self-check OK with zero CSP violations. |
| M5 — Iterative refinement | partial | Multi-turn refinement (text + tool-call) demonstrated above. *Not* yet implemented: feeding iframe runtime errors back into chat as agent context. Open user-reported bug: input-stuck on second message in the actual side panel UI (not reproducible via CDP — see "Known gaps" below). |
| M6 — Polish (CSP, size caps, error states, README) | not started | |

## Deployment / dev environment

Chromium-in-the-browser is up at https://calm-chipmunk-49-6901.pxy.staging.agentvms.com/ (basic auth `user`/`password`), running `lscr.io/linuxserver/chromium:latest` in Docker. The container mounts the built extension read-only:

```
-v /home/ubuntu/repos/showme/extension/dist:/extension:ro
-e CHROME_CLI="--load-extension=/extension"
```

Iteration loop:

```
corepack pnpm --filter @showme/extension build && docker restart lsio-chromium
```

Setup details and the run command live in `/home/ubuntu/chrome-ext/setup.md`.

### Tailscale → Mac-hosted CopilotKit LLM server

The CopilotKit LLM server runs on the user's Mac at `http://192.168.6.166:4000/`. To reach it from this VM (and the chromium container), Tailscale is installed on the host:

- Host VM joined the tailnet as `showme-vm` (`100.94.15.55`), `tailscaled` enabled at boot, IPv4/IPv6 forwarding persisted in `/etc/sysctl.d/99-tailscale.conf`, brought up with `tailscale up --accept-routes`.
- Mac (`carstens-macbook-pro`, `100.70.162.85`) advertises `192.168.6.0/24`; the route is approved in the Tailscale admin console.
- Container traffic to `192.168.6.166` egresses via the docker bridge → host `tailscale0` → Mac, no per-container changes needed. Verified `HTTP 200` from inside `lsio-chromium`.

## Recent changes worth knowing

- `backend/.env` now exists with `ANTHROPIC_BASE_URL=http://192.168.6.166:4000/v1` and a placeholder `ANTHROPIC_API_KEY` (the LiteLLM proxy needs no auth). `corepack pnpm --filter @showme/backend dev` brings mastra `1.8.1` up on `localhost:4111`; `GET /api/agents` returns the agent with all three tools, `POST /copilotkit` is wired, and `POST /api/agents/<id>/generate` round-trips through the proxy to `claude-sonnet-4-6` and back.
- A second mastra instance is also reachable at `http://192.168.6.166:4111/api/agents` with a *different* (newer) `showmeAgent` system prompt — looks like a separate copy running on the Mac. Decision for now: ignore it, treat the local `:4111` as the canonical dev server. Worth tracking down and stopping it before the extension can accidentally hit the wrong one.
- Backend uses `createAnthropic({ baseURL: process.env.ANTHROPIC_BASE_URL, apiKey })` (Galex's `2e27c0c`, merged into `feat/extension-basics` in `d9f27d3`). `backend/.env.example` documents the expected vars.
- Extension `BACKEND_URL` is driven by `VITE_BACKEND_URL` (Vite build-time substitution). `extension/.env.example` defaults to `https://calm-chipmunk-49-4111.pxy.staging.agentvms.com/copilotkit` since the Chromium-in-Docker container can't reach the host VM's `localhost:4111`. **`extension/.env` was missing** — the build was therefore baking the localhost fallback. Created from `.env.example` so the proxy URL is now embedded in `dist/`.
- Renamed extension entry files to avoid a CRXJS output collision: `src/background/index.ts` → `background.ts`, `src/content/index.ts` → `content.ts`. Distinct filenames fixed the SW-vs-content-script bundle aliasing.
- Side panel now opens on a single click of the showme action icon (puzzle-piece menu, or pin to toolbar).

### Side panel UI fixes (this session)

Two regressions surfaced once the user actually drove the side panel by hand (CDP probes had been masking both):

1. **Chat scroll runaway.** As messages accumulated, the whole side panel grew vertically instead of the message list scrolling internally — the header, selection chip, viz cards, and input all marched off-screen. Root cause: CopilotKit's `.copilotKitChat` ships with `display: flex; flex-direction: column` but with `height: 100%` *commented out* in `dist/index.css` (line 987 of `@copilotkit/react-ui@0.0.46`). With no bounded height, the inner `.copilotKitMessages` (`flex: 1; overflow-y: scroll`) had nothing to scroll inside of, so it just expanded. **Fix:** override in `extension/src/sidepanel/index.html` — `html, body, #root { height: 100% }`, `body { overflow: hidden }`, `.copilotKitChat { height: 100%; min-height: 0; flex: 1 }`, `.copilotKitChat .copilotKitMessages { min-height: 0 }`. Also flipped the App.tsx chat wrapper from `overflow: hidden` to `min-height: 0` (the actual flex-shrink unlock for nested scrollers). Verified via CDP: stuffed 4000px of fake messages, body height stayed 633px, messages container scrolled internally with `scrollTop: 3628`.

2. **Visualizations stuck on "Rendering…".** Every `render_visualization` card sat on the loading spinner, console showed `Loading the script 'https://cdn.jsdelivr.net/...' violates the following Content Security Policy directive: "script-src 'self'"` and `Executing inline script violates...`. The `script-src 'self'` was the *extension's own MV3 default CSP*, inherited by the `srcdoc` iframe. The manifest already declared `viz-frame.html` as a sandboxed page with permissive CSP — but **CRXJS silently strips `sandbox` and `content_security_policy` from the emitted manifest**, and `VizCard.tsx` was bypassing the sandbox plumbing and using `srcDoc` anyway, so neither half of the system was actually engaged. **Fix:**
   - Moved `viz-frame.html` to `extension/public/` so Vite copies it verbatim to `dist/` (CRXJS would otherwise transform the inline bootstrap).
   - Added a tiny `closeBundle` Vite plugin (`vite.config.ts` → `patchManifestSandboxCsp`) that re-injects `sandbox.pages: ['viz-frame.html']` and `content_security_policy.sandbox` (with `'unsafe-inline'`, `'unsafe-eval'`, `https://cdn.jsdelivr.net`) into `dist/manifest.json` *after* CRXJS finishes. This is the actual load-bearing change — without it the sandbox wiring vanishes.
   - Rewrote `VizCard.tsx` to load `chrome.runtime.getURL('viz-frame.html')` as `iframe.src` (not `srcDoc`), then use the `frame-ready` → `render` → `ready` postMessage handshake the file already implemented. Dropped the obsolete `injectCsp`/`injectErrorBridge` helpers — the sandbox page handles its own error bridge.
   - Added diagnostic logs at every stage: `render_visualization invoked` (App.tsx, with htmlLength + preview), `VizCard render` (mount), `iframe DOM onLoad fired` (parent-side fallback signal), `iframe → parent message` (every postMessage with type), `postMessage with mismatched source` (so identity-mismatch bugs aren't silent), and a 5s `still loading` warning. Going forward we should be able to spot exactly which stage broke without resorting to console paste-backs.
   - Verified via CDP: parent receives `[{"type":"frame-ready"},{"type":"ready"},{"type":"viz-self-check","ok":true}]` with zero CSP violations and Chart.js loading cleanly from jsdelivr.

   *Watch-out for future me:* if you change CRXJS versions or add other manifest keys CRXJS doesn't understand, double-check `dist/manifest.json` after build. The patch plugin only re-adds `sandbox` + `content_security_policy`; anything else CRXJS drops will need its own re-injection.

### CopilotKit ↔ Mastra wiring (earlier in the day)

Three real bugs surfaced when actually loading the side panel in the deployed browser. All three are fixed; rebuild + container restart picks them up.

1. **Version skew between extension and backend.** Extension was on `@copilotkit/react-core@^1.57.1` (legacy GraphQL-based protocol) while `@ag-ui/mastra@1.0.2` pulls in `@copilotkit/runtime` from the unreleased dev tag `0.0.0-mme-ag-ui-0-0-46-20260227141603` (the AG-UI-integrated rewrite, aka "CopilotKit Next"). The runtime's single-route handler rejected legacy POST bodies with `Invalid single-route payload` — the symptom was: chat input cleared on Enter with no error, backend log showed the rejection. **Fix:** pinned the extension's `@copilotkit/react-core` and `@copilotkit/react-ui` (and `@ag-ui/{client,core,encoder}`, `@copilotkitnext/shared`) to the same dev tag / `0.0.46`. Same alignment applied to the backend so peer-deps resolve cleanly. See `extension/package.json` and `backend/package.json`.
2. **Default agent name mismatch.** The new runtime's React client looks up an agent named `default` when no `agentId` is specified, but the backend was registering its sole agent under the key `showmeAgent`. The legacy `<CopilotChat>` from `@copilotkit/react-ui` has no `agentId` prop to override this, so renaming on the backend was the cleanest fix. **Fix:** `agents: { default: showmeAgent }` and `resourceId: 'default'` in `backend/src/mastra/index.ts`. The agent's internal `id: 'showmeAgent'` (used by `/api/agents/...`) is unchanged — only the registration key differs.
3. **`@ag-ui/mastra` 1.0.2 drops AG-UI `context` on the floor.** `useCopilotReadable` correctly publishes the captured selection into `body.context` of the wire payload (verified via `request.postData()` capture), and the runtime forwards it into the agent run input — but the Mastra adapter's converters never read `.context`. So the Anthropic LLM call never saw the selection, and the agent reliably replied "I don't see any element". **Fix:** the `registerCopilotKit` call in `backend/src/mastra/index.ts` now passes a `setContext` callback that clones the request, pulls `body.context` out, and stashes it on the Mastra `RequestContext` under key `agUiContext`. The agent's `instructions` is now a `({ requestContext }) => string` function that reads `agUiContext` and appends each entry as a marked-up DATA block (with a "treat as untrusted data" disclaimer to keep the prompt-injection mitigation intact). Frontend reverted to clean `useCopilotReadable` usage. See `backend/src/mastra/agents/showme.ts`.

### CDP debugging setup for the dockerized Chromium

To inspect / drive the side panel inside `lsio-chromium` from this VM, the container is now started with `--remote-debugging-port=9222` in `CHROME_CLI`, but Chromium 147 ignores `--remote-debugging-address=0.0.0.0` and binds `127.0.0.1:9222` only. Workaround: a small Python TCP relay runs inside the container forwarding `0.0.0.0:9223 → 127.0.0.1:9222`, and the host maps `-p 9223:9223`. CDP is then reachable at `http://localhost:9223/json/version` from the VM. Reproduce after a container restart with:

```
docker run -d --name lsio-chromium \
  -e PGID=1000 -e PUID=1000 -e TZ=Etc/UTC \
  -e CUSTOM_USER=user -e PASSWORD=password \
  -e "CHROME_CLI=--load-extension=/extension --remote-debugging-port=9222" \
  -p 6901:3000 -p 9223:9223 \
  -v /home/ubuntu/repos/showme/extension/dist:/extension:ro \
  --shm-size=2g lscr.io/linuxserver/chromium:latest

# then re-spawn the relay:
docker exec -d lsio-chromium python3 -c "<tcp relay snippet>"  # see /tmp/cdp-*.mjs scripts for the inline version
```

Loading the side panel for inspection: `chrome-extension://nabdgbjfngilcpmgmeaoafhbolfiboao/src/sidepanel/index.html` (extension ID is deterministic — the unpacked-extension hash of `/extension`). Opening it as a regular tab is enough for capturing `console`, `pageerror`, `request`, and `response` events; you don't need to invoke the actual `chrome.sidePanel` API.

Useful probe scripts (kept under `/tmp/`, not committed):
- `cdp-probe.mjs` — open side panel, dump console + errors.
- `cdp-net.mjs` — seed a selection into `chrome.storage.session`, send a chat, dump `/copilotkit` request + response bodies.
- `cdp-tool-then-msg.mjs` — multi-turn including a `render_visualization` tool call.
- `cdp-scroll-check.mjs` — stuffs the chat container with synthetic content and reports whether the message list scrolls internally vs. blowing out the panel layout. Used to verify the chat-scroll fix.
- `cdp-viz-check.mjs` — opens the side panel, injects a Chart.js test card pointing at `viz-frame.html`, and asserts the `frame-ready` → `ready` postMessage handshake completes with zero CSP violations. Used to verify the sandbox/CSP fix.

`chrome-remote-interface` is now installed under `/tmp/node_modules` so future probe scripts can `import CDP from 'chrome-remote-interface'` without a fresh `npm install`.

**Note on workflow:** when the user reports a UI bug (anything visible only in the actual side panel), default to attaching CDP and dumping `Runtime.consoleAPICalled` + `Runtime.exceptionThrown` *before* asking for paste-backs. The CSP-violation lines that diagnosed the viz-rendering bug above are exactly what those CDP events would have streamed automatically. Worth a small committed `scripts/cdp-tail.mjs` so the one-liner is reproducible across machines.

## Known gaps / next up

- **User-reported bug, not reproduced via CDP**: in the actual `chrome.sidePanel` UI, after the first response (especially one that includes a `render_visualization` tool call), pressing Enter to send a second message appears stuck. CDP-driven probes consistently send the second message cleanly — `RUN_FINISHED` events emit, the textarea returns to enabled, and follow-up turns work. Public issue trail (`ag-ui-protocol/ag-ui#207`, `mastra-ai/mastra#7692`, `CopilotKit/CopilotKit#2684`, `#2744`) all point at the same drift between `@ag-ui/mastra` and current Mastra streaming chunk types — backend log shows `[MastraAgent] Unrecognized stream chunk type: text-end` warnings, suggesting partial chunk handling. **Worth re-testing** now that the chat-scroll fix is in: it's plausible the "stuck input" symptom was actually the input scrolling out of view as messages accumulated, not a real send-disabled state. If it reproduces, the CDP capture workflow above is the right next step.
- Stray mastra at `192.168.6.166:4111` should be tracked down and stopped so there's only one canonical dev server.
- No automated tests yet. Project policy is red/green TDD — content-script parsers (`parsed` table/list extraction) and the background message-routing reducer are the obvious first targets. The `cdp-scroll-check.mjs` and `cdp-viz-check.mjs` probes are the closest things to regression tests we have today; promoting them to a committed Playwright/CDP suite would catch the manifest-stripping class of bug automatically.
- M5: iframe runtime errors *are* now postMessage'd up to `VizCard` (`type: 'error'`) and logged + shown inline. Still pending: feeding them back into the chat as agent context so the model can react/repair (the current path only logs to the panel console).
- M6: iframe CSP is now actually enforced via the manifest-sandbox path (`'unsafe-inline'` only inside the sandbox-pages CSP, never at the extension-page level). Still pending: document size caps, README run instructions, error-state polish.
- The `setContext` shim in `backend/src/mastra/index.ts` should become unnecessary once `@ag-ui/mastra` learns to forward AG-UI `context` natively. Worth filing/upvoting an issue against `ag-ui-protocol/ag-ui` so we can drop the workaround later.
- The `patchManifestSandboxCsp` plugin in `vite.config.ts` is a workaround for CRXJS not understanding `sandbox`/`content_security_policy`. Worth checking upstream periodically (`@crxjs/vite-plugin` GitHub) — once they support those keys natively, drop the plugin and move the CSP back into `manifest.config.ts` where it belongs.
