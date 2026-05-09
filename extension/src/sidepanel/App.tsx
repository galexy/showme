import { useCallback, useEffect, useState } from 'react';
import { CopilotKit, useCopilotAction, useCopilotReadable } from '@copilotkit/react-core';
import { CopilotChat } from '@copilotkit/react-ui';
import '@copilotkit/react-ui/styles.css';
import { createLogger } from '../shared/logger';
import { VizCard } from './components/VizCard';
import type { RenderVisualizationArgs, SelectionPayload, VizCard as VizCardType } from '../shared/types';

const log = createLogger('sidepanel');

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL ?? 'http://localhost:4111/copilotkit';
if (!import.meta.env.VITE_BACKEND_URL) {
  log.warn('VITE_BACKEND_URL not set; falling back to localhost', { fallback: BACKEND_URL });
}

function SelectionChip({ selection }: { selection: SelectionPayload }) {
  const { source, kind, parsed } = selection;
  const host = new URL(source.url).hostname;
  const label =
    parsed?.type === 'table'
      ? `table · ${parsed.headers.length} cols × ${parsed.rows.length} rows`
      : parsed?.type === 'list'
        ? `list · ${parsed.items.length} items`
        : kind === 'element'
          ? 'element'
          : 'text selection';

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        padding: '4px 10px',
        background: '#ede9fe',
        borderRadius: 20,
        fontSize: 11,
        color: '#5b21b6',
        marginBottom: 8,
        overflow: 'hidden',
      }}
    >
      <span style={{ fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {label}
      </span>
      <span style={{ opacity: 0.7, flexShrink: 0 }}>from {host}</span>
    </div>
  );
}

function Inner() {
  const [selection, setSelection] = useState<SelectionPayload | null>(null);
  const [vizCards, setVizCards] = useState<VizCardType[]>([]);
  const [pickerActive, setPickerActive] = useState(false);

  // useCopilotReadable publishes the selection via AG-UI's `context` field.
  // The backend's `setContext` callback (in backend/src/mastra/index.ts) pulls
  // it out and stashes it on the RequestContext so the agent's dynamic
  // `instructions` can append it — the @ag-ui/mastra adapter doesn't forward
  // `context` on its own as of 1.0.2.
  useCopilotReadable({
    description: 'Currently captured web content selection from the host page. Use this as the data source for visualizations.',
    value: selection,
  });

  // Frontend action: agent calls render_visualization → we mount an iframe
  useCopilotAction({
    name: 'render_visualization',
    description: 'Render a bespoke interactive visualization in the side panel.',
    parameters: [
      { name: 'title', type: 'string', description: 'Short title for the card', required: true },
      { name: 'html', type: 'string', description: 'Full self-contained HTML document', required: true },
      { name: 'notes', type: 'string', description: 'Optional explanation shown in chat', required: false },
    ],
    handler: ({ title, html, notes }: RenderVisualizationArgs) => {
      log.info('render_visualization invoked', {
        title,
        htmlLength: html?.length ?? 0,
        hasHead: html?.includes('<head>') ?? false,
        hasScript: html?.includes('<script') ?? false,
        htmlPreview: html?.slice(0, 200),
      });
      const card: VizCardType = {
        id: crypto.randomUUID(),
        title,
        html,
        notes,
        createdAt: new Date().toISOString(),
      };
      setVizCards((prev) => [...prev, card]);
      log.info('Visualization mounted', { id: card.id, title });
      return `Visualization "${title}" rendered in the panel.`;
    },
  });

  // Load selection from session storage on mount and listen for changes
  useEffect(() => {
    chrome.storage.session.get('currentSelection', (result) => {
      if (result.currentSelection) {
        setSelection(result.currentSelection as SelectionPayload);
        log.info('Selection loaded from session', { id: (result.currentSelection as SelectionPayload).id });
      }
    });

    const listener = (changes: { [key: string]: chrome.storage.StorageChange }) => {
      if (changes.currentSelection) {
        const payload = changes.currentSelection.newValue as SelectionPayload | null;
        setSelection(payload);
        if (payload) log.info('Selection updated', { id: payload.id, kind: payload.kind });
      }
    };
    chrome.storage.session.onChanged.addListener(listener);
    return () => chrome.storage.session.onChanged.removeListener(listener);
  }, []);

  const handleRemoveCard = useCallback((id: string) => {
    setVizCards((prev) => prev.filter((c) => c.id !== id));
    log.info('Viz card removed', { id });
  }, []);

  const handleCardError = useCallback((id: string, message: string) => {
    log.error('Viz card error reported', { id, message });
  }, []);

  const togglePicker = () => {
    const next = !pickerActive;
    setPickerActive(next);
    chrome.runtime.sendMessage({ type: next ? 'PICKER_START' : 'PICKER_STOP' });
    log.info(next ? 'Picker started' : 'Picker stopped');
  };

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100vh',
        fontFamily: 'system-ui, -apple-system, sans-serif',
        fontSize: 13,
        color: '#111',
        overflow: 'hidden',
      }}
    >
      {/* Header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '8px 12px',
          borderBottom: '1px solid #e5e7eb',
          background: '#fff',
          flexShrink: 0,
        }}
      >
        <span style={{ fontWeight: 700, fontSize: 14, letterSpacing: '-0.3px' }}>✦ showme</span>
        <button
          onClick={togglePicker}
          title="Pick element from page"
          style={{
            background: pickerActive ? '#6366f1' : '#f3f4f6',
            color: pickerActive ? '#fff' : '#374151',
            border: 'none',
            borderRadius: 6,
            padding: '3px 8px',
            fontSize: 11,
            cursor: 'pointer',
            fontWeight: 500,
          }}
        >
          {pickerActive ? '✕ Cancel pick' : '⊹ Pick element'}
        </button>
      </div>

      {/* Selection chip */}
      {selection && (
        <div style={{ padding: '8px 12px 0', flexShrink: 0 }}>
          <SelectionChip selection={selection} />
        </div>
      )}

      {/* Viz stack */}
      {vizCards.length > 0 && (
        <div
          style={{
            padding: '8px 12px 0',
            overflowY: 'auto',
            flexShrink: 0,
            maxHeight: '45vh',
          }}
        >
          {vizCards.map((card) => (
            <VizCard
              key={card.id}
              card={card}
              onRemove={handleRemoveCard}
              onError={handleCardError}
            />
          ))}
        </div>
      )}

      {/* Chat — flex:1 + min-height:0 lets the inner .copilotKitMessages scroll
          instead of pushing the panel as messages accumulate. */}
      <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
        <CopilotChat
          labels={{ title: '', placeholder: 'Ask me to visualize the selection…' }}
        />
      </div>
    </div>
  );
}

export default function App() {
  return (
    <CopilotKit runtimeUrl={BACKEND_URL}>
      <Inner />
    </CopilotKit>
  );
}
