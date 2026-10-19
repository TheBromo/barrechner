type LogContext = Record<string, string | number | boolean | null | undefined>;

export function logError(event: string, error: unknown, context: LogContext = {}) {
  const record = error && typeof error === "object" ? (error as { message?: unknown; code?: unknown }) : null;
  console.error(JSON.stringify({
    level: "error",
    event,
    message: error instanceof Error ? error.message : typeof record?.message === "string" ? record.message : "Unbekannter Fehler",
    ...(typeof record?.code === "string" ? { errorCode: record.code } : {}),
    ...context,
    at: new Date().toISOString(),
  }));
}
