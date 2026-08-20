type LogContext = Record<string, string | number | boolean | null | undefined>;

export function logError(event: string, error: unknown, context: LogContext = {}) {
  console.error(JSON.stringify({
    level: "error",
    event,
    message: error instanceof Error ? error.message : "Unbekannter Fehler",
    ...context,
    at: new Date().toISOString(),
  }));
}
