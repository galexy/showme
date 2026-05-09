import { useEffect, useRef, useState } from 'react';
import type { IframeMessage, VizCard as VizCardType } from '../../shared/types';
import { createLogger } from '../../shared/logger';

const log = createLogger('sidepanel:VizCard');

// The viz frame is a sandboxed extension page (declared in dist/manifest.json
// under `sandbox.pages`, re-injected post-build by vite.config.ts because
// CRXJS strips that key). It lives in `public/viz-frame.html` so Vite copies
// it verbatim to dist root — its inline bootstrap must not be transformed.
// We load it as iframe `src` (NOT as `srcdoc`, which would inherit the side
// panel's strict extension CSP) and then post the agent's HTML in via
// postMessage. See viz-frame.html for the receiver.
const VIZ_FRAME_URL = chrome.runtime.getURL('viz-frame.html');

type Props = {
  card: VizCardType;
  onRemove: (id: string) => void;
  onError: (id: string, message: string) => void;
};

export function VizCard({ card, onRemove, onError }: Props) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const renderSentRef = useRef(false);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  log.info('VizCard render', {
    id: card.id,
    title: card.title,
    htmlLength: card.html.length,
    hasHead: card.html.includes('<head>'),
    hasScript: card.html.includes('<script'),
    htmlPreview: card.html.slice(0, 200),
    vizFrameUrl: VIZ_FRAME_URL,
  });

  // Send {type:'render', html} as soon as the sandbox iframe is ready. Two
  // possible signals — whichever fires first wins, repeats are no-ops because
  // the frame ignores them and renderSentRef guards on this side too:
  //   1) `frame-ready` postMessage from viz-frame.html's bootstrap
  //   2) the parent-side <iframe onLoad> event (belt-and-braces if the
  //      bootstrap message fires before our listener is attached).
  function trySendRender(reason: string) {
    if (renderSentRef.current) return;
    const win = iframeRef.current?.contentWindow;
    if (!win) {
      log.warn('trySendRender skipped: no contentWindow', { id: card.id, reason });
      return;
    }
    renderSentRef.current = true;
    log.info('Posting render to viz frame', {
      id: card.id, reason, htmlLength: card.html.length,
    });
    win.postMessage({ type: 'render', html: card.html }, '*');
  }

  useEffect(() => {
    function handleMessage(e: MessageEvent) {
      const data = e.data;
      if (!data || typeof data !== 'object' || typeof data.type !== 'string') return;
      const sourceMatches = e.source === iframeRef.current?.contentWindow;
      if (!sourceMatches) {
        // Don't drop silently — log so identity-mismatch bugs are visible.
        log.debug('postMessage with mismatched source', { id: card.id, type: data.type });
        return;
      }
      log.info('iframe → parent message', { id: card.id, type: data.type });

      const msg = data as IframeMessage | { type: 'frame-ready' };
      if (msg.type === 'frame-ready') {
        trySendRender('frame-ready');
      } else if (msg.type === 'ready') {
        setStatus('ready');
        log.info('Viz rendered', { id: card.id });
      } else if (msg.type === 'error') {
        setStatus('error');
        setErrorMsg(msg.message);
        onError(card.id, msg.message);
        log.error('Viz iframe error', { id: card.id, message: msg.message, stack: msg.stack });
      }
    }
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [card.id, card.html, onError]);

  // Safety net: surface a warning if neither signal arrives in 5s so we know
  // to look at the sandbox bootstrap instead of guessing.
  useEffect(() => {
    const t = window.setTimeout(() => {
      if (status === 'loading') {
        log.warn('Viz still loading after 5s', {
          id: card.id,
          renderSent: renderSentRef.current,
          contentWindowExists: Boolean(iframeRef.current?.contentWindow),
        });
      }
    }, 5000);
    return () => window.clearTimeout(t);
  }, [card.id, status]);

  return (
    <div
      style={{
        border: '1px solid #e5e7eb',
        borderRadius: 8,
        overflow: 'hidden',
        background: '#fff',
        marginBottom: 12,
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '6px 10px',
          background: '#f9fafb',
          borderBottom: '1px solid #e5e7eb',
        }}
      >
        <span style={{ fontSize: 12, fontWeight: 600, color: '#374151', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {card.title}
        </span>
        <button
          onClick={() => onRemove(card.id)}
          title="Remove"
          style={{
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            color: '#9ca3af',
            fontSize: 14,
            lineHeight: 1,
            padding: '0 2px',
            flexShrink: 0,
          }}
        >
          ✕
        </button>
      </div>

      {status === 'loading' && (
        <div style={{ padding: 12, fontSize: 12, color: '#6b7280' }}>Rendering…</div>
      )}

      {status === 'error' && (
        <div style={{ padding: 12, fontSize: 12, color: '#dc2626', background: '#fef2f2' }}>
          ⚠ {errorMsg ?? 'Visualization error'}
        </div>
      )}

      {/* Wrapper provides the drag handle: CSS `resize: vertical` on a block
          element with min/max constraints. The iframe fills the wrapper, so
          dragging the bottom edge resizes the viz without remounting. */}
      <div
        style={{
          display: status === 'loading' ? 'none' : 'block',
          resize: 'vertical',
          overflow: 'hidden',
          height: 420,
          minHeight: 160,
          maxHeight: '80vh',
          width: '100%',
          // Subtle visual affordance for the handle (browsers render their own
          // resize grip in the bottom-right; this border hints at draggability).
          borderBottom: '2px solid #e5e7eb',
        }}
      >
        <iframe
          ref={iframeRef}
          src={VIZ_FRAME_URL}
          // The frame is already sandboxed at the manifest level (opaque origin,
          // restricted CSP). The element-level sandbox attribute is defense-in-
          // depth: keep `allow-scripts` so JS runs, omit `allow-same-origin` so
          // the iframe can't reach extension storage or the side panel DOM.
          sandbox="allow-scripts"
          onLoad={() => {
            log.info('iframe DOM onLoad fired', { id: card.id });
            trySendRender('iframe-onload');
          }}
          onError={(err) => log.error('iframe DOM onError', { id: card.id, err })}
          style={{
            display: 'block',
            width: '100%',
            height: '100%',
            border: 'none',
          }}
          title={card.title}
        />
      </div>

      {card.notes && (
        <div style={{ padding: '6px 10px', fontSize: 11, color: '#6b7280', borderTop: '1px solid #f3f4f6' }}>
          {card.notes}
        </div>
      )}
    </div>
  );
}
