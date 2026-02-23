export type LogLevel = "debug" | "info" | "warn" | "error";

const LEVEL_ORDER: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

let currentLevel: LogLevel = "info";

export function setLogLevel(level: LogLevel): void {
  currentLevel = level;
}

function shouldLog(level: LogLevel): boolean {
  return LEVEL_ORDER[level] >= LEVEL_ORDER[currentLevel];
}

function formatMsg(level: LogLevel, msg: string, data?: Record<string, unknown>): string {
  const ts = new Date().toISOString();
  const base = `${ts} [${level.toUpperCase()}] ${msg}`;
  if (data && Object.keys(data).length > 0) {
    return `${base} ${JSON.stringify(data)}`;
  }
  return base;
}

export const log = {
  debug(msg: string, data?: Record<string, unknown>): void {
    if (shouldLog("debug")) console.debug(formatMsg("debug", msg, data));
  },
  info(msg: string, data?: Record<string, unknown>): void {
    if (shouldLog("info")) console.info(formatMsg("info", msg, data));
  },
  warn(msg: string, data?: Record<string, unknown>): void {
    if (shouldLog("warn")) console.warn(formatMsg("warn", msg, data));
  },
  error(msg: string, data?: Record<string, unknown>): void {
    if (shouldLog("error")) console.error(formatMsg("error", msg, data));
  },
};
