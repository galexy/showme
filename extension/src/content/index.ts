import { createLogger } from '../shared/logger';
import type { ExtensionMessage, SelectionPayload } from '../shared/types';

const log = createLogger('content');

const MAX_OUTER_HTML = 200 * 1024;
const MAX_PLAINTEXT = 50 * 1024;

// ── Helpers ───────────────────────────────────────────────────────────────────

function randomId(): string {
  return crypto.randomUUID();
}

function truncate(s: string, maxBytes: number): string {
  const enc = new TextEncoder();
  const bytes = enc.encode(s);
  if (bytes.length <= maxBytes) return s;
  return new TextDecoder().decode(bytes.slice(0, maxBytes)) + '\n[TRUNCATED]';
}

function nearestHeading(node: Node | null): string | undefined {
  let el = node instanceof Element ? node : node?.parentElement;
  while (el && el !== document.body) {
    const prev = el.previousElementSibling;
    if (prev && /^H[1-3]$/i.test(prev.tagName)) return prev.textContent?.trim();
    el = el.parentElement;
  }
  const h = document.querySelector('h1, h2, h3');
  return h?.textContent?.trim();
}

function parseTable(table: HTMLTableElement): { headers: string[]; rows: (string | number)[][] } {
  const headers: string[] = [];
  const rows: (string | number)[][] = [];

  const headerRow = table.querySelector('thead tr, tr:first-child');
  if (headerRow) {
    headerRow.querySelectorAll('th, td').forEach((cell) => {
      headers.push(cell.textContent?.trim() ?? '');
    });
  }

  const bodyRows = table.querySelectorAll('tbody tr, tr:not(:first-child)');
  bodyRows.forEach((row) => {
    const cells: (string | number)[] = [];
    row.querySelectorAll('td, th').forEach((cell) => {
      const text = cell.textContent?.trim() ?? '';
      const num = Number(text.replace(/[$,%]/g, ''));
      cells.push(isNaN(num) || text === '' ? text : num);
    });
    if (cells.length) rows.push(cells);
  });

  return { headers, rows };
}

function buildPayload(html: string, text: string, el: Element | null, kind: SelectionPayload['kind']): SelectionPayload {
  const table = el?.closest('table') ?? (el?.tagName === 'TABLE' ? (el as HTMLTableElement) : null);
  const list = el?.closest('ul, ol') ?? (el?.tagName === 'UL' || el?.tagName === 'OL' ? el : null);

  let parsed: SelectionPayload['parsed'];
  if (table instanceof HTMLTableElement) {
    parsed = { type: 'table', ...parseTable(table) };
  } else if (list) {
    const items = Array.from(list.querySelectorAll('li')).map((li) => li.textContent?.trim() ?? '');
    parsed = { type: 'list', items };
  }

  return {
    id: randomId(),
    capturedAt: new Date().toISOString(),
    source: {
      url: location.href,
      title: document.title,
      nearestHeading: nearestHeading(el),
    },
    kind,
    outerHTML: truncate(html, MAX_OUTER_HTML),
    plaintext: truncate(text, MAX_PLAINTEXT),
    parsed,
  };
}

function sendPayload(payload: SelectionPayload) {
  const msg: ExtensionMessage = { type: 'SELECTION_CAPTURED', payload };
  chrome.runtime.sendMessage(msg).catch((err) =>
    log.error('Failed to send selection to background', { error: String(err) }),
  );
  log.info('Selection sent', { id: payload.id, kind: payload.kind, chars: payload.plaintext.length });
}

// ── Text-selection pill ───────────────────────────────────────────────────────

let pill: HTMLElement | null = null;
let lastRange: Range | null = null;

function removePill() {
  pill?.remove();
  pill = null;
}

function showPill(range: Range) {
  removePill();

  const rect = range.getBoundingClientRect();
  if (!rect.width && !rect.height) return;

  pill = document.createElement('div');
  pill.setAttribute('data-showme-pill', '1');
  Object.assign(pill.style, {
    position: 'fixed',
    top: `${rect.bottom + window.scrollY + 6}px`,
    left: `${rect.left + window.scrollX}px`,
    zIndex: '2147483647',
    background: '#1a1a2e',
    color: '#fff',
    fontSize: '12px',
    fontFamily: 'system-ui, -apple-system, sans-serif',
    padding: '4px 10px',
    borderRadius: '20px',
    cursor: 'pointer',
    boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
    userSelect: 'none',
    whiteSpace: 'nowrap',
  });
  pill.textContent = '✦ Send to showme';

  pill.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (!lastRange) return;

    const fragment = lastRange.cloneContents();
    const tmp = document.createElement('div');
    tmp.appendChild(fragment);
    const html = tmp.innerHTML;
    const text = lastRange.toString();
    const startEl = lastRange.startContainer instanceof Element
      ? lastRange.startContainer
      : lastRange.startContainer.parentElement;

    sendPayload(buildPayload(html, text, startEl, 'text-range'));
    removePill();
    window.getSelection()?.removeAllRanges();
  });

  document.body.appendChild(pill);
}

document.addEventListener('mouseup', (e) => {
  if ((e.target as HTMLElement).getAttribute?.('data-showme-pill')) return;

  setTimeout(() => {
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0 || sel.isCollapsed) {
      removePill();
      return;
    }
    const range = sel.getRangeAt(0);
    if (range.toString().trim().length < 3) {
      removePill();
      return;
    }
    lastRange = range;
    showPill(range);
  }, 50);
});

document.addEventListener('mousedown', (e) => {
  if ((e.target as HTMLElement).getAttribute?.('data-showme-pill')) return;
  removePill();
});

// ── Element picker ────────────────────────────────────────────────────────────

let pickerActive = false;
let pickerOverlay: HTMLElement | null = null;
let pickerHighlight: HTMLElement | null = null;

function startPicker() {
  if (pickerActive) return;
  pickerActive = true;

  pickerOverlay = document.createElement('div');
  Object.assign(pickerOverlay.style, {
    position: 'fixed',
    top: '0', left: '0', width: '100vw', height: '100vh',
    zIndex: '2147483646',
    cursor: 'crosshair',
  });

  pickerHighlight = document.createElement('div');
  Object.assign(pickerHighlight.style, {
    position: 'fixed',
    zIndex: '2147483645',
    outline: '2px solid #6366f1',
    background: 'rgba(99,102,241,0.08)',
    pointerEvents: 'none',
    borderRadius: '2px',
    transition: 'all 0.05s ease',
  });
  document.body.appendChild(pickerHighlight);

  pickerOverlay.addEventListener('mousemove', (e) => {
    pickerOverlay!.style.pointerEvents = 'none';
    const el = document.elementFromPoint(e.clientX, e.clientY);
    pickerOverlay!.style.pointerEvents = '';
    if (!el || el === pickerOverlay || el === pickerHighlight) return;
    const r = el.getBoundingClientRect();
    Object.assign(pickerHighlight!.style, {
      top: `${r.top}px`, left: `${r.left}px`,
      width: `${r.width}px`, height: `${r.height}px`,
    });
  });

  pickerOverlay.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    pickerOverlay!.style.pointerEvents = 'none';
    const el = document.elementFromPoint(e.clientX, e.clientY) as HTMLElement | null;
    pickerOverlay!.style.pointerEvents = '';
    stopPicker();
    if (!el) return;

    const rect = el.getBoundingClientRect();
    const payload = buildPayload(el.outerHTML, el.innerText ?? el.textContent ?? '', el, 'element');
    payload.bounds = { x: rect.x, y: rect.y, w: rect.width, h: rect.height };
    sendPayload(payload);
    log.info('Element picked', { tag: el.tagName, id: payload.id });
  });

  document.addEventListener('keydown', handlePickerEscape);
  document.body.appendChild(pickerOverlay);
  log.info('Element picker started');
}

function stopPicker() {
  if (!pickerActive) return;
  pickerActive = false;
  pickerOverlay?.remove();
  pickerHighlight?.remove();
  pickerOverlay = null;
  pickerHighlight = null;
  document.removeEventListener('keydown', handlePickerEscape);
  log.info('Element picker stopped');
}

function handlePickerEscape(e: KeyboardEvent) {
  if (e.key === 'Escape') stopPicker();
}

// ── Listen for commands from background ──────────────────────────────────────

chrome.runtime.onMessage.addListener((message: ExtensionMessage) => {
  if (message.type === 'PICKER_START') startPicker();
  if (message.type === 'PICKER_STOP') stopPicker();
});

log.info('Content script loaded', { url: location.href });
