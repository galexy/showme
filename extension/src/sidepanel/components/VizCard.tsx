import { useEffect, useRef, useState } from 'react';
import type { IframeMessage, VizCard as VizCardType } from '../../shared/types';
import { createLogger } from '../../shared/logger';

const log = createLogger('sidepanel:VizCard');

const CSP =
  "default-src 'none'; " +
  "script-src 'unsafe-inline' https://cdn.jsdelivr.net; " +
  "style-src 'unsafe-inline'; " +
  "img-src data: blob:; " +
  "connect-src 'none'; " +
  "font-src 'none';";

function injectCsp(html: string): string {
  const cspTag = `<meta http-equiv="Content-Security-Policy" content="${CSP}">`;
  if (html.includes('<head>')) return html.replace('<head>', `<head>${cspTag}`);
  return cspTag + html;
}

function injectErrorBridge(html: string): string {
  const bridge = `<script>
window.onerror = function(msg, src, line, col, err) {
  parent.postMessage({ type: 'error', message: String(msg), stack: err ? err.stack : undefined }, '*');
};
window.addEventListener('unhandledrejection', function(e) {
  parent.postMessage({ type: 'error', message: String(e.reason), stack: e.reason?.stack }, '*');
});
window.addEventListener('load', function() {
  parent.postMessage({ type: 'ready' }, '*');
});
</script>`;
  if (html.includes('<head>')) return html.replace('<head>', `<head>${bridge}`);
  return bridge + html;
}

type Props = {
  card: VizCardType;
  onRemove: (id: string) => void;
  onError: (id: string, message: string) => void;
};

export function VizCard({ card, onRemove, onError }: Props) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const srcdoc = injectErrorBridge(injectCsp(card.html));

  useEffect(() => {
    function handleMessage(e: MessageEvent) {
      if (e.source !== iframeRef.current?.contentWindow) return;
      const msg = e.data as IframeMessage;
      if (msg.type === 'ready') {
        setStatus('ready');
        log.info('Viz iframe ready', { id: card.id });
      } else if (msg.type === 'error') {
        setStatus('error');
        setErrorMsg(msg.message);
        onError(card.id, msg.message);
        log.error('Viz iframe error', { id: card.id, message: msg.message, stack: msg.stack });
      }
    }
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [card.id, onError]);

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

      <iframe
        ref={iframeRef}
        srcDoc={srcdoc}
        sandbox="allow-scripts"
        style={{
          display: status === 'loading' ? 'none' : 'block',
          width: '100%',
          height: 280,
          border: 'none',
        }}
        title={card.title}
      />

      {card.notes && (
        <div style={{ padding: '6px 10px', fontSize: 11, color: '#6b7280', borderTop: '1px solid #f3f4f6' }}>
          {card.notes}
        </div>
      )}
    </div>
  );
}
