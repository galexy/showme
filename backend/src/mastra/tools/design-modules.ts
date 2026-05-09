import { createTool } from '@mastra/core/tools';
import { z } from 'zod';

const ModuleType = z.enum([
  'diagram',
  'mockup',
  'interactive',
  'data_viz',
  'art',
  'chart',
]);
type ModuleType = z.infer<typeof ModuleType>;

interface ModuleSpec {
  type: ModuleType;
  guidance: string;
  css: string;
  libraries?: string[];
}

// Shared serif/mono palette for Tufte-influenced modules. Web fonts are
// blocked in the iframe CSP, so everything sticks to system-available stacks.
const SERIF_STACK =
  '"Iowan Old Style", "Charter", Georgia, "Apple Garamond", Baskerville, "Times New Roman", Times, serif';
const SANS_STACK =
  '-apple-system, BlinkMacSystemFont, "SF Pro Text", "Inter", "Helvetica Neue", Arial, system-ui, sans-serif';
const MONO_STACK = '"SF Mono", Menlo, Consolas, "Liberation Mono", monospace';

const MODULES: Record<ModuleType, ModuleSpec> = {
  data_viz: {
    type: 'data_viz',
    guidance: `Optimize for the data-ink ratio (Tufte). Strip everything that isn't data: no boxes around plots, no heavy gridlines, no 3D, no gradients, no drop shadows.

Direct-label series instead of using a legend whenever space allows. Reserve color for one accent series; render context series in muted gray. Axes should be thin (0.5px) and minimal — show scale through tick labels rather than gridlines. If you need gridlines, make them light dashed rules.

For comparisons across many categories, prefer small multiples (a grid of small charts sharing axes) over a single overlaid plot. Annotate notable points inline rather than in a caption.

Title each figure with the question it answers ("Quarterly revenue grew 40% YoY"), not the variable name. Use a one-line italic subtitle for the data source or units. The background is sepia (#fffff8) — this is part of the aesthetic, not a bug.

Recommended workflow: lay out the axes and gridlines first in pale gray, then draw the data on top in your accent color. Annotations layer on last.`,
    css: `:root {
  --bg: #fffff8;
  --ink: #111;
  --muted: #6b6b6b;
  --rule: #d0cfc7;
  --grid: #ece9dc;
  --accent: #8a3324;
  --serif: ${SERIF_STACK};
  --mono: ${MONO_STACK};
}
html, body {
  background: var(--bg);
  color: var(--ink);
  margin: 0;
  padding: 32px;
  font-family: var(--serif);
  font-size: 16px;
  line-height: 1.5;
}
h1, h2, h3 { font-weight: 500; line-height: 1.15; margin: 0; }
h1 { font-size: 1.5rem; margin-bottom: 0.25em; }
h2 { font-size: 1.05rem; color: var(--muted); font-style: italic; font-weight: 400; margin-bottom: 1.5em; }
.figure { margin: 24px 0; }
.axis line, .axis path { stroke: var(--ink); stroke-width: 0.5; shape-rendering: crispEdges; fill: none; }
.axis text { fill: var(--muted); font-family: var(--mono); font-size: 11px; }
.gridline { stroke: var(--grid); stroke-width: 0.5; stroke-dasharray: 2 2; }
.series { fill: none; stroke: var(--accent); stroke-width: 1.5; }
.series.muted { stroke: var(--muted); stroke-width: 1; }
.dot { fill: var(--accent); }
.dot.muted { fill: var(--muted); }
.label, .annotation { fill: var(--muted); font-family: var(--serif); font-size: 12px; font-style: italic; }
.caption { color: var(--muted); font-style: italic; font-size: 0.9em; margin-top: 0.5em; }
table { border-collapse: collapse; font-family: var(--serif); margin: 16px 0; }
th, td { padding: 4px 14px; text-align: left; }
th { border-bottom: 1px solid var(--ink); font-weight: 500; }
tr td { border-bottom: 1px solid var(--rule); }
tr:last-child td { border-bottom: 1px solid var(--ink); }
.numeric { font-variant-numeric: tabular-nums; text-align: right; }`,
    libraries: ['https://cdn.jsdelivr.net/npm/d3@7/dist/d3.min.js'],
  },

  chart: {
    type: 'chart',
    guidance: `Pick the chart type from the question, not the data shape:
- ranking → horizontal bar, sorted by value
- change over time → line (single series) or small-multiple lines (many series)
- distribution → histogram or strip plot
- relationship → scatter, optionally with regression line
- composition → stacked bar; avoid pie above 4 slices

For categorical axes, sort by value unless the categories are temporal. For temporal axes, never reorder.

Use a small qualitative palette (4 hues max) only when categories matter; otherwise stick to one accent and grays. Sequential or diverging palettes are reserved for value-encoded color (heatmaps, choropleths).

Direct-label small charts. Reserve a legend for ≥5 series or when the layout forces it. Round axis tick values to human-friendly steps; never show 7.0014.

Title with the takeaway. Subtitle with units and source. Caption with caveats.`,
    css: `:root {
  --bg: #fffff8;
  --ink: #111;
  --muted: #6b6b6b;
  --rule: #d0cfc7;
  --grid: #ece9dc;
  --accent: #8a3324;
  --c1: #1f4e79;
  --c2: #8a3324;
  --c3: #3f6b3f;
  --c4: #806000;
  --serif: ${SERIF_STACK};
  --mono: ${MONO_STACK};
}
html, body {
  background: var(--bg);
  color: var(--ink);
  margin: 0;
  padding: 24px;
  font-family: var(--serif);
  font-size: 15px;
  line-height: 1.45;
}
h1 { font-size: 1.4rem; font-weight: 500; margin: 0 0 0.25em; }
.subtitle { color: var(--muted); font-style: italic; margin: 0 0 1.25em; font-size: 0.95rem; }
.chart { margin: 16px 0; }
.bar { fill: var(--accent); }
.bar.muted { fill: var(--muted); }
.bar:hover { fill: color-mix(in srgb, var(--accent) 80%, black); }
.axis line, .axis path { stroke: var(--ink); stroke-width: 0.5; shape-rendering: crispEdges; fill: none; }
.axis text { fill: var(--muted); font-family: var(--mono); font-size: 11px; }
.gridline { stroke: var(--grid); stroke-width: 0.5; stroke-dasharray: 2 2; }
.legend { font-family: var(--serif); font-size: 12px; color: var(--muted); }
.value-label { fill: var(--ink); font-family: var(--mono); font-size: 11px; }
.caption { color: var(--muted); font-style: italic; font-size: 0.85em; margin-top: 0.5em; }`,
    libraries: [
      'https://cdn.jsdelivr.net/npm/d3@7/dist/d3.min.js',
      'https://cdn.jsdelivr.net/npm/chart.js@4.4.4/dist/chart.umd.min.js',
      'https://cdn.jsdelivr.net/npm/plotly.js-dist-min@2.35.2/plotly.min.js',
    ],
  },

  diagram: {
    type: 'diagram',
    guidance: `A diagram explains a relationship. Decide the relationship first: hierarchy (tree), flow (sequence), or network (graph). Layout follows from that:
- hierarchy / flow → directed top-to-bottom or left-to-right
- network → force layout or radial, with the highest-degree nodes most central

Limit to 7±2 visible nodes; cluster the rest behind a labeled boundary. Use a single shape vocabulary consistently:
- rectangle = process / system
- rounded rectangle = actor / external
- diamond = decision
- circle = data store / state

Stroke widths are uniform (1.5px). Reserve a single accent color for emphasis (the node or path the user is meant to focus on); everything else is the neutral ink color.

Label every edge in a decision diagram. For sequence flows, label only the non-obvious edges. Group related nodes inside a soft-tinted cluster rectangle with a small caption.

Snap to a 24px grid. Keep generous whitespace; a sparse diagram reads faster than a dense one.`,
    css: `:root {
  --bg: #fafaf7;
  --ink: #1f2328;
  --muted: #6b7280;
  --line: #2c3036;
  --accent: #1d4ed8;
  --soft: #e5e7eb;
  --sans: ${SANS_STACK};
}
html, body {
  margin: 0;
  padding: 32px;
  background: var(--bg);
  color: var(--ink);
  font-family: var(--sans);
  font-size: 14px;
  line-height: 1.4;
}
h1 { font-size: 1.25rem; font-weight: 600; margin: 0 0 1em; }
.node { fill: #fff; stroke: var(--line); stroke-width: 1.5; }
.node.actor { rx: 14; ry: 14; }
.node.decision { fill: #fff; }
.node.store { fill: #fff; }
.node.emphasis { stroke: var(--accent); stroke-width: 2.25; }
.node-label {
  font-family: var(--sans);
  font-size: 12px;
  fill: var(--ink);
  text-anchor: middle;
  dominant-baseline: middle;
}
.edge { stroke: var(--line); stroke-width: 1.25; fill: none; marker-end: url(#arrow); }
.edge.emphasis { stroke: var(--accent); stroke-width: 1.75; marker-end: url(#arrow-accent); }
.edge-label { font-family: var(--sans); font-size: 11px; fill: var(--muted); text-anchor: middle; }
.cluster { fill: var(--soft); fill-opacity: 0.45; stroke: var(--soft); stroke-width: 1; rx: 10; ry: 10; }
.cluster-label { font-family: var(--sans); font-size: 11px; font-weight: 600; fill: var(--muted); text-transform: uppercase; letter-spacing: 0.04em; }
.legend { font-family: var(--sans); font-size: 11px; fill: var(--muted); }
.arrow { fill: var(--line); }
.arrow-accent { fill: var(--accent); }
/* Include this <defs> block once per SVG:
<defs>
  <marker id="arrow" viewBox="0 0 10 10" refX="10" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
    <path d="M0,0 L10,5 L0,10 z" class="arrow"/>
  </marker>
  <marker id="arrow-accent" viewBox="0 0 10 10" refX="10" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
    <path d="M0,0 L10,5 L0,10 z" class="arrow-accent"/>
  </marker>
</defs>
*/`,
    libraries: [
      'https://cdn.jsdelivr.net/npm/d3@7/dist/d3.min.js',
      'https://cdn.jsdelivr.net/npm/mermaid@10.9.1/dist/mermaid.min.js',
    ],
  },

  mockup: {
    type: 'mockup',
    guidance: `A mockup communicates layout and information hierarchy, not pixel-perfect aesthetics. Default to grayscale; introduce color only where the screen needs to look real (a "Sign in" button, an alert).

Typography is the main signal. Show the hierarchy through font-size and weight contrast (e.g., 24/16/14/11 px scale, weights 600/500/400). Use the same sans-serif family throughout.

Snap to an 8px grid for spacing. Borders are 1px solid #e5e5e5 with a 6–8px radius. Reserve drop shadows for floating layers (modals, popovers) where they communicate elevation; everything else is flat.

For placeholder content, use neutral skeleton blocks (\`.skeleton\`) at the right size — never lorem ipsum unless the layout requires real text. Icons should be outlined and single-stroke; avoid filled or multicolor icons.

Show one screen well rather than many screens poorly.`,
    css: `:root {
  --bg: #ffffff;
  --ink: #0a0a0a;
  --muted: #525252;
  --skeleton: #ececec;
  --line: #e5e5e5;
  --soft: #f5f5f5;
  --accent: #2563eb;
  --danger: #dc2626;
  --sans: ${SANS_STACK};
  --radius: 6px;
}
html, body {
  margin: 0;
  padding: 24px;
  background: var(--soft);
  color: var(--ink);
  font-family: var(--sans);
  font-size: 14px;
  line-height: 1.5;
}
.frame {
  border: 1px solid var(--line);
  border-radius: 12px;
  background: var(--bg);
  padding: 16px;
  margin: 12px auto;
  max-width: 720px;
}
.skeleton { background: var(--skeleton); border-radius: 4px; height: 12px; margin: 6px 0; }
.skeleton.lg { height: 24px; }
.skeleton.title { height: 18px; width: 60%; }
.skeleton.avatar { width: 32px; height: 32px; border-radius: 50%; }
.btn {
  display: inline-block;
  padding: 6px 14px;
  border-radius: var(--radius);
  border: 1px solid var(--line);
  background: var(--bg);
  font-family: var(--sans);
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  color: var(--ink);
}
.btn.primary { background: var(--accent); color: #fff; border-color: var(--accent); }
.btn.danger { background: var(--danger); color: #fff; border-color: var(--danger); }
.btn.ghost { background: transparent; border-color: transparent; }
.input {
  display: block;
  width: 100%;
  padding: 8px 10px;
  border: 1px solid var(--line);
  border-radius: var(--radius);
  font: inherit;
  background: var(--bg);
  box-sizing: border-box;
}
.divider { height: 1px; background: var(--line); margin: 16px 0; }
.modal {
  box-shadow: 0 4px 24px rgba(0,0,0,0.08);
  border-radius: 12px;
  padding: 24px;
  background: var(--bg);
  max-width: 480px;
  margin: 32px auto;
}
.label {
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--muted);
  font-weight: 600;
}
.h1 { font-size: 1.5rem; font-weight: 600; margin: 0 0 0.25em; }
.h2 { font-size: 1.1rem; font-weight: 600; margin: 0 0 0.25em; }
.body { color: var(--ink); font-size: 14px; line-height: 1.5; }
.note { color: var(--muted); font-size: 12px; }`,
    libraries: [],
  },

  interactive: {
    type: 'interactive',
    guidance: `Make every interactive affordance discoverable: \`cursor: pointer\` on clickables, hover background tint, focus ring for keyboard. State changes animate with short ease-in-out transitions (150–250ms) — long animations break the feel.

Always communicate state explicitly:
- loading → spinner
- disabled → opacity 0.5, no pointer events
- selected → background tint with the accent color
- in progress → progress bar, never an indeterminate spinner if you can avoid it

For controls, prefer native \`<input type="range">\`, \`<select>\`, \`<input type="date">\` styled minimally over custom widgets. Native controls bring keyboard, screen-reader, and touch behavior for free.

If multiple views share a selection (brushing/linking), use the same accent color for the selected state across all of them.

All JavaScript must be inline; the iframe has no allow-same-origin and no allow-popups. Use vanilla JS (event listeners, DOM manipulation) for anything simple. Keep state in module-scoped variables, not on \`window\`.

Honor \`prefers-reduced-motion\` for any animation that isn't load-time decoration.`,
    css: `:root {
  --bg: #ffffff;
  --ink: #111111;
  --muted: #6b7280;
  --line: #e5e7eb;
  --accent: #2563eb;
  --hover: #eff6ff;
  --selected: rgba(37, 99, 235, 0.12);
  --sans: ${SANS_STACK};
}
html, body {
  margin: 0;
  padding: 24px;
  background: var(--bg);
  color: var(--ink);
  font-family: var(--sans);
  font-size: 14px;
  line-height: 1.5;
}
button, [role="button"] {
  padding: 6px 14px;
  border: 1px solid var(--line);
  border-radius: 6px;
  background: var(--bg);
  cursor: pointer;
  font: inherit;
  color: inherit;
  transition: background-color 150ms ease, border-color 150ms ease, transform 80ms ease;
}
button:hover, [role="button"]:hover { background: var(--hover); border-color: var(--accent); }
button:active { transform: translateY(1px); }
button:focus-visible, [role="button"]:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
}
button[disabled], [aria-disabled="true"] {
  opacity: 0.5;
  cursor: not-allowed;
  pointer-events: none;
}
input[type="range"] { accent-color: var(--accent); }
input[type="text"], input[type="number"], input[type="search"], select, textarea {
  padding: 6px 10px;
  border: 1px solid var(--line);
  border-radius: 6px;
  font: inherit;
  background: var(--bg);
  color: inherit;
}
input:focus, select:focus, textarea:focus {
  border-color: var(--accent);
  outline: 3px solid color-mix(in srgb, var(--accent) 25%, transparent);
  outline-offset: 0;
}
.brushable { cursor: crosshair; }
.selected { background: var(--selected); }
.spinner {
  width: 16px; height: 16px;
  border: 2px solid var(--line);
  border-top-color: var(--accent);
  border-radius: 50%;
  animation: showme-spin 600ms linear infinite;
  display: inline-block;
  vertical-align: middle;
}
.progress { height: 6px; background: var(--line); border-radius: 3px; overflow: hidden; }
.progress > div { height: 100%; background: var(--accent); transition: width 200ms ease; }
.tooltip {
  position: absolute;
  pointer-events: none;
  background: rgba(17, 17, 17, 0.92);
  color: #fff;
  padding: 4px 8px;
  border-radius: 4px;
  font-size: 12px;
  font-family: var(--sans);
}
@keyframes showme-spin { to { transform: rotate(360deg); } }
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
  }
}`,
    libraries: ['https://cdn.jsdelivr.net/npm/d3@7/dist/d3.min.js'],
  },

  art: {
    type: 'art',
    guidance: `This module is intentionally loose. Tufte rules don't apply; the goal is delight, surprise, or atmosphere — not data legibility.

Lean into:
- color (gradients, conic gradients, mix-blend-mode)
- motion (CSS keyframes, requestAnimationFrame on canvas)
- texture (SVG filters, noise, dither)
- generative form (algorithmic patterns, particle systems, flow fields)

Two anchors keep this from going off the rails:
1. The piece must be self-contained and degrade gracefully — provide a static fallback when \`prefers-reduced-motion\` is set.
2. Choose a single emotional tone (calm, energetic, contemplative, playful) and let the palette + motion + form all serve it.

For canvas work, size the canvas to \`window.innerWidth\` x \`window.innerHeight\` and listen for resize. Cap your animation loop at 60fps; for ambient pieces, 30fps is plenty and uses less battery.

Common moves: a slowly rotating conic gradient as a background, layered SVG with mix-blend-mode: multiply, particles drifting on a Perlin-like flow field, an oscillating Lissajous curve.`,
    css: `:root {
  --bg: #0b0b10;
  --ink: #f5f5f7;
  --accent: #f43f5e;
  --sans: ${SANS_STACK};
}
html, body {
  margin: 0;
  padding: 0;
  background: var(--bg);
  color: var(--ink);
  font-family: var(--sans);
  min-height: 100vh;
  overflow: hidden;
}
canvas { display: block; }
.full { position: fixed; inset: 0; }
.gradient-conic {
  background: conic-gradient(from 0deg at 50% 50%,
    #fb7185, #fbbf24, #34d399, #60a5fa, #c084fc, #fb7185);
}
.gradient-aurora {
  background:
    radial-gradient(circle at 20% 30%, rgba(96,165,250,0.45), transparent 40%),
    radial-gradient(circle at 80% 70%, rgba(244,114,182,0.45), transparent 40%),
    radial-gradient(circle at 50% 80%, rgba(52,211,153,0.4), transparent 40%),
    var(--bg);
}
.glow { filter: drop-shadow(0 0 14px currentColor); }
.blend-screen { mix-blend-mode: screen; }
.blend-multiply { mix-blend-mode: multiply; }
.fade-pulse { animation: showme-fade 4s ease-in-out infinite alternate; }
.spin-slow { animation: showme-spin-slow 60s linear infinite; }
@keyframes showme-fade { from { opacity: 0.35; } to { opacity: 1; } }
@keyframes showme-spin-slow { to { transform: rotate(360deg); } }
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation: none !important;
    transition: none !important;
  }
}`,
    libraries: [
      'https://cdn.jsdelivr.net/npm/p5@1.10.0/lib/p5.min.js',
      'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.min.js',
    ],
  },
};

export const designModulesTool = createTool({
  id: 'design_modules',
  description:
    'Returns design guidance, base CSS, and recommended libraries for a specific category of visualization. ' +
    'Call this BEFORE render_visualization with the type that best fits what you intend to render. ' +
    'Inline the returned CSS into a <style> block in your final HTML and follow the guidance for layout, ' +
    'typography, color, and interactivity decisions. ' +
    "Tufte-influenced for data_viz/chart, system-UI for diagram/mockup/interactive, generative for art.",
  inputSchema: z.object({
    type: ModuleType.describe(
      'The category of visualization. ' +
        'data_viz = analytical figures with strict Tufte-style restraint. ' +
        'chart = standard chart types (bar, line, scatter, etc.) with practical defaults. ' +
        'diagram = flowcharts, network or system diagrams. ' +
        'mockup = UI/wireframe screens showing layout and hierarchy. ' +
        'interactive = anything with hover/click/drag/brushing as the primary affordance. ' +
        'art = generative or atmospheric pieces where delight matters more than legibility.',
    ),
  }),
  outputSchema: z.object({
    type: z.string(),
    guidance: z.string(),
    css: z.string(),
    libraries: z.array(z.string()).optional(),
  }),
  execute: async ({ type }) => MODULES[type],
});
