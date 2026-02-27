type LogLevel = "debug" | "info" | "warn" | "error";

const levelOrder: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40
};

const currentLevel = (process.env.LOG_LEVEL as LogLevel | undefined) ?? "info";

function canLog(level: LogLevel): boolean {
  return levelOrder[level] >= levelOrder[currentLevel];
}

export function log(level: LogLevel, message: string, context: Record<string, unknown> = {}): void {
  if (!canLog(level)) {
    return;
  }

  const payload = {
    timestamp: new Date().toISOString(),
    level,
    message,
    ...context
  };

  const serialized = JSON.stringify(payload);
  if (level === "error") {
    // eslint-disable-next-line no-console
    console.error(serialized);
    return;
  }
  // eslint-disable-next-line no-console
  console.log(serialized);
}
