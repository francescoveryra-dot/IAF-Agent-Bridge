const SECRET_ASSIGNMENT =
  /\b(api[_-]?key|access[_-]?token|refresh[_-]?token|auth[_-]?token|password|secret|authorization|cursor_api_key)\b\s*[:=]\s*(?!\s*Bearer\b)("[^"]*"|'[^']*'|\S+)/gi;

const BEARER = /\bBearer\s+[A-Za-z0-9._\-+/=]{8,}/gi;
const SK_KEY = /\bsk-[A-Za-z0-9_\-]{8,}\b/g;
const LONG_TOKEN = /\b(cursor|eyJ)[A-Za-z0-9_\-.]{20,}\b/g;

export function redact(value: string): string {
  return value
    .replace(SECRET_ASSIGNMENT, "$1=[redacted]")
    .replace(BEARER, "Bearer [redacted]")
    .replace(SK_KEY, "[redacted]")
    .replace(LONG_TOKEN, "[redacted]");
}
