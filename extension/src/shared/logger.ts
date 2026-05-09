type Severity = 'DEBUG' | 'INFO' | 'WARN' | 'ERROR';

type LogRecord = {
  timestamp: string;
  severityText: Severity;
  body: string;
  attributes?: Record<string, unknown>;
  resource: { 'service.name': string; 'service.namespace': string };
};

function emit(scope: string, severity: Severity, body: string, attributes?: Record<string, unknown>): void {
  const record: LogRecord = {
    timestamp: new Date().toISOString(),
    severityText: severity,
    body,
    ...(attributes ? { attributes } : {}),
    resource: { 'service.name': `showme:${scope}`, 'service.namespace': 'showme' },
  };

  const prefix = `[${record.timestamp}] [showme:${scope}] [${severity}]`;
  const method = severity === 'ERROR' ? console.error : severity === 'WARN' ? console.warn : console.log;
  method(prefix, body, ...(attributes ? [attributes] : []));

  if (typeof window !== 'undefined' && (window as unknown as Record<string, unknown>).__showme_otel_export) {
    ((window as unknown as Record<string, unknown>).__showme_otel_export as (r: LogRecord) => void)(record);
  }
}

export function createLogger(scope: string) {
  return {
    debug: (body: string, attrs?: Record<string, unknown>) => emit(scope, 'DEBUG', body, attrs),
    info:  (body: string, attrs?: Record<string, unknown>) => emit(scope, 'INFO',  body, attrs),
    warn:  (body: string, attrs?: Record<string, unknown>) => emit(scope, 'WARN',  body, attrs),
    error: (body: string, attrs?: Record<string, unknown>) => emit(scope, 'ERROR', body, attrs),
  };
}
