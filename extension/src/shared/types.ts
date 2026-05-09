export type SelectionPayload = {
  id: string;
  capturedAt: string;
  source: { url: string; title: string; nearestHeading?: string };
  kind: 'text-range' | 'element';
  outerHTML: string;
  plaintext: string;
  parsed?:
    | { type: 'table'; headers: string[]; rows: (string | number)[][] }
    | { type: 'list'; items: string[] };
  bounds?: { x: number; y: number; w: number; h: number };
};

export type RenderVisualizationArgs = {
  title: string;
  html: string;
  notes?: string;
};

export type VizCard = {
  id: string;
  title: string;
  html: string;
  notes?: string;
  createdAt: string;
};

export type IframeMessage =
  | { type: 'frame-ready' }
  | { type: 'ready' }
  | { type: 'error'; message: string; stack?: string }
  | { type: 'log'; level: 'log' | 'warn' | 'error'; args: unknown[] };

export type ExtensionMessage =
  | { type: 'SELECTION_CAPTURED'; payload: SelectionPayload }
  | { type: 'PICKER_START' }
  | { type: 'PICKER_STOP' };
