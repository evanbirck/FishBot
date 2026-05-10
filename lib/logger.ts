import { getErrorMessage } from "@/lib/errors";

type LogFields = Record<string, unknown>;

const SECRET_PATTERNS = [/api[_-]?key/i, /token/i, /secret/i, /authorization/i, /service[_-]?role/i];

function redact(value: unknown): unknown {
  if (typeof value === "string" && value.length > 8) return `${value.slice(0, 4)}...redacted`;
  return value;
}

function sanitize(fields: LogFields = {}): LogFields {
  return Object.fromEntries(
    Object.entries(fields).map(([key, value]) => [
      key,
      SECRET_PATTERNS.some((pattern) => pattern.test(key)) ? redact(value) : value
    ])
  );
}

export const logger = {
  info(message: string, fields?: LogFields) {
    console.info(JSON.stringify({ level: "info", message, ...sanitize(fields) }));
  },
  warn(message: string, fields?: LogFields) {
    console.warn(JSON.stringify({ level: "warn", message, ...sanitize(fields) }));
  },
  error(message: string, error: unknown, fields?: LogFields) {
    console.error(
      JSON.stringify({
        level: "error",
        message,
        error: getErrorMessage(error),
        ...sanitize(fields)
      })
    );
  }
};
