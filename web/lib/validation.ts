/**
 * Client-side input validation to reduce XSS and injection risk before data reaches the API.
 * React escapes text nodes by default; this adds defense in depth for stored JSON/metadata.
 */

export class ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ValidationError";
  }
}

export const LIMITS = {
  title: 512,
  name: 256,
  /** Profile URL handle (matches API). */
  username: 30,
  /** Profile full name and location (matches API). */
  profileField: 128,
  description: 4000,
  bio: 4000,
  shortText: 512,
  metadataString: 2048,
  extraJsonBytes: 65536,
  url: 2048,
  email: 254,
  passwordMax: 4096,
  searchQuery: 200,
  totpCode: 12,
  /** Postgres identifier–style fields (setup) */
  dbIdentifier: 128,
} as const;

/** Disallows C0 controls except tab/LF/CR (for multiline text). */
const CTRL_BAD_MULTILINE = /[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/;

/** Disallows C0 controls except common whitespace (stricter single-line). */
const CTRL_BAD_SINGLE_LINE = /[\x00-\x1f\x7f]/;

/** Patterns often used in DOM-based XSS payloads in stored strings. */
const SUSPICIOUS_PLAIN = /<\s*script|javascript\s*:|data\s*:\s*text\/html|vbscript\s*:/i;

const ON_HANDLER = /\bon[a-z]+\s*=/i;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/i;

function assertMaxLen(s: string, max: number, field: string): void {
  if (s.length > max) {
    throw new ValidationError(`${field} must be at most ${max} characters.`);
  }
}

/** Single-line text: no angle brackets, no control chars, no obvious script vectors. */
export function assertStrictPlainText(
  s: string,
  maxLen: number,
  field: string,
  { allowEmpty = false }: { allowEmpty?: boolean } = {}
): string {
  const t = s.trim();
  if (!t) {
    if (allowEmpty) return "";
    throw new ValidationError(`${field} is required.`);
  }
  assertMaxLen(t, maxLen, field);
  if (/\0/.test(t)) {
    throw new ValidationError(`${field} contains invalid characters.`);
  }
  if (CTRL_BAD_SINGLE_LINE.test(t)) {
    throw new ValidationError(`${field} contains invalid characters.`);
  }
  if (/[<>]/.test(t)) {
    throw new ValidationError(`${field} cannot contain < or >.`);
  }
  if (SUSPICIOUS_PLAIN.test(t) || ON_HANDLER.test(t)) {
    throw new ValidationError(`${field} contains disallowed content.`);
  }
  return t;
}

/** Multiline description / bio: allows newlines; still blocks script-like payloads and null bytes. */
export function assertLooseMultilineText(
  s: string,
  maxLen: number,
  field: string,
  { allowEmpty = true }: { allowEmpty?: boolean } = {}
): string {
  const t = s.trim();
  if (!t) {
    if (allowEmpty) return "";
    throw new ValidationError(`${field} is required.`);
  }
  assertMaxLen(t, maxLen, field);
  if (/\0/.test(t)) {
    throw new ValidationError(`${field} contains invalid characters.`);
  }
  if (CTRL_BAD_MULTILINE.test(t)) {
    throw new ValidationError(`${field} contains invalid characters.`);
  }
  if (/<\s*script/i.test(t) || SUSPICIOUS_PLAIN.test(t) || ON_HANDLER.test(t)) {
    throw new ValidationError(`${field} contains disallowed content.`);
  }
  return t;
}

export function assertHttpOrHttpsUrl(s: string, field: string): string {
  const t = s.trim();
  assertMaxLen(t, LIMITS.url, field);
  let u: URL;
  try {
    u = new URL(t);
  } catch {
    throw new ValidationError(`${field} must be a valid URL.`);
  }
  if (u.protocol !== "http:" && u.protocol !== "https:") {
    throw new ValidationError(`${field} must use http or https.`);
  }
  return t;
}

/** Empty string allowed (clears optional URL). */
export function assertOptionalHttpUrl(s: string, field: string): string {
  const t = s.trim();
  if (!t) return "";
  return assertHttpOrHttpsUrl(t, field);
}

export function assertEmail(s: string, field = "Email"): string {
  const t = s.trim();
  assertMaxLen(t, LIMITS.email, field);
  if (!EMAIL_RE.test(t)) {
    throw new ValidationError(`${field} must be a valid email address.`);
  }
  return t;
}

export function assertPasswordClient(s: string, field = "Password"): string {
  if (/\0/.test(s)) {
    throw new ValidationError(`${field} contains invalid characters.`);
  }
  if (s.length < 8) {
    throw new ValidationError(`${field} must be at least 8 characters.`);
  }
  assertMaxLen(s, LIMITS.passwordMax, field);
  return s;
}

export function assertTotpCode(s: string, field = "Code"): string {
  const digits = s.replace(/\s/g, "");
  if (!/^\d{6,10}$/.test(digits)) {
    throw new ValidationError(`${field} must be 6–10 digits.`);
  }
  assertMaxLen(digits, LIMITS.totpCode, field);
  return digits;
}

/** Exactly six digits (email recovery code). */
export function assertRecoveryCode6(s: string, field = "Code"): string {
  const digits = s.replace(/\s/g, "");
  if (!/^\d{6}$/.test(digits)) {
    throw new ValidationError(`${field} must be 6 digits.`);
  }
  return digits;
}

export type ThemePreference = "system" | "light" | "dark";

export function assertThemePreference(raw: string): ThemePreference {
  const s = raw.trim().toLowerCase();
  if (s === "system" || s === "light" || s === "dark") {
    return s;
  }
  throw new ValidationError("Theme must be system, light, or dark.");
}

export function assertItemTitle(s: string): string {
  return assertStrictPlainText(s, LIMITS.title, "Title");
}

export function assertCollectionOrWishlistName(s: string, field: string): string {
  return assertStrictPlainText(s, LIMITS.name, field);
}

export function assertSearchQuery(s: string, field = "Search"): string {
  const t = s.trim();
  if (!t) return "";
  return assertStrictPlainText(t, LIMITS.searchQuery, field);
}

const USERNAME_RE = /^[a-z][a-z0-9_-]{1,28}[a-z0-9]$/;
const RESERVED_USERNAMES = new Set(["search", "followers", "following", "follow"]);

/** Validates public profile username (URL path segment). */
export function assertUsername(s: string, field = "Username"): string {
  const t = s.trim().toLowerCase();
  if (t.length < 3 || t.length > LIMITS.username) {
    throw new ValidationError(`${field} must be 3–${LIMITS.username} characters.`);
  }
  if (!USERNAME_RE.test(t)) {
    throw new ValidationError(
      `${field} may only use lowercase letters, digits, underscores, and hyphens, and must start with a letter.`,
    );
  }
  if (/^\d+$/.test(t)) {
    throw new ValidationError(`${field} cannot be only digits.`);
  }
  if (RESERVED_USERNAMES.has(t)) {
    throw new ValidationError("That username is reserved.");
  }
  return t;
}

const LEGACY_PROFILE_ID = /^\d{1,15}$/;

/**
 * Normalizes a `/people/[segment]` URL param for API lookup (username or legacy numeric user id).
 * Returns null if the segment is not a valid profile reference.
 */
export function normalizeProfileUrlSegment(raw: string): string | null {
  let s = raw.trim();
  try {
    s = decodeURIComponent(s).trim();
  } catch {
    return null;
  }
  if (!s || s.length > 80) return null;
  if (LEGACY_PROFILE_ID.test(s)) return s;
  try {
    return assertUsername(s, "Profile URL");
  } catch {
    return null;
  }
}

export type SocialLinkInput = { label: string; url: string };

/** Normalizes and validates social link rows for PATCH /me (max 12, http(s) URLs). */
export function assertSocialLinksPayload(raw: unknown): SocialLinkInput[] {
  if (!Array.isArray(raw)) {
    throw new ValidationError("Social links must be a list.");
  }
  if (raw.length > 12) {
    throw new ValidationError("At most 12 social links.");
  }
  const out: SocialLinkInput[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const o = item as Record<string, unknown>;
    const label = typeof o.label === "string" ? o.label : "";
    const url = typeof o.url === "string" ? o.url.trim() : "";
    if (!url) continue;
    const u = assertHttpOrHttpsUrl(url, "Link URL");
    const t = label.trim();
    const lab = t
      ? assertStrictPlainText(t, 64, "Label", { allowEmpty: false })
      : "";
    out.push({ label: lab, url: u });
  }
  return out;
}

/** Optional single-line field: empty → undefined, else validated. */
export function optionalStrictPlain(
  s: string | undefined,
  maxLen: number,
  field: string
): string | undefined {
  const t = s?.trim();
  if (!t) return undefined;
  return assertStrictPlainText(t, maxLen, field);
}

/** postgres:// or postgresql:// URLs for setup / migrate forms. */
export function assertPostgresDatabaseUrl(s: string, field = "Database URL"): string {
  const t = s.trim();
  if (!t) {
    throw new ValidationError(`${field} is required.`);
  }
  assertMaxLen(t, 2000, field);
  let u: URL;
  try {
    u = new URL(t);
  } catch {
    throw new ValidationError(`${field} must be a valid URL.`);
  }
  if (u.protocol !== "postgres:" && u.protocol !== "postgresql:") {
    throw new ValidationError(`${field} must start with postgres:// or postgresql://`);
  }
  return t;
}

function isIPv4Host(s: string): boolean {
  const parts = s.split(".");
  if (parts.length !== 4) return false;
  return parts.every((p) => {
    if (!/^\d{1,3}$/.test(p)) return false;
    const n = parseInt(p, 10);
    return n >= 0 && n <= 255;
  });
}

/** Hostname or IPv4 for Postgres (setup form). */
export function assertDbHost(s: string, field = "Host"): string {
  const t = s.trim();
  if (!t) throw new ValidationError(`${field} is required.`);
  assertMaxLen(t, 253, field);
  if (/\0/.test(t) || /[<>]/.test(t) || /\s/.test(t)) {
    throw new ValidationError(`${field} contains invalid characters.`);
  }
  if (t === "localhost" || isIPv4Host(t)) {
    return t;
  }
  if (/^[a-zA-Z0-9]([a-zA-Z0-9.-]*[a-zA-Z0-9])?$/.test(t)) {
    return t;
  }
  throw new ValidationError(`${field} must be a valid hostname or IPv4 address.`);
}

export function assertDbUserOrName(s: string, field: string): string {
  const t = s.trim();
  if (!t) throw new ValidationError(`${field} is required.`);
  assertMaxLen(t, LIMITS.dbIdentifier, field);
  if (/\0/.test(t) || /[<>]/.test(t) || /[\s]/.test(t)) {
    throw new ValidationError(`${field} contains invalid characters.`);
  }
  if (!/^[a-zA-Z0-9_-]+$/.test(t)) {
    throw new ValidationError(`${field} may only contain letters, numbers, underscores, and hyphens.`);
  }
  return t;
}

export function assertDbPassword(s: string, field = "Password"): string {
  if (/\0/.test(s)) {
    throw new ValidationError(`${field} contains invalid characters.`);
  }
  assertMaxLen(s, LIMITS.passwordMax, field);
  return s;
}

/** Short-lived token from the server (2FA pending). */
const SSL_MODES = new Set(["disable", "allow", "prefer", "require", "verify-ca", "verify-full"]);

export function assertSslMode(s: string, field = "SSL mode"): string {
  const t = (s.trim() || "disable").toLowerCase();
  if (!SSL_MODES.has(t)) {
    throw new ValidationError(`${field} is invalid.`);
  }
  return t;
}

export function assertPort(n: number, field = "Port"): number {
  if (!Number.isFinite(n) || n < 1 || n > 65535) {
    throw new ValidationError(`${field} must be between 1 and 65535.`);
  }
  return Math.floor(n);
}

export function assertPendingToken(s: string, field = "Session"): string {
  const t = s.trim();
  if (!t) {
    throw new ValidationError(`${field} is invalid.`);
  }
  if (/\0/.test(t)) {
    throw new ValidationError(`${field} contains invalid characters.`);
  }
  assertMaxLen(t, 8192, field);
  return t;
}

/** Cloudflare Turnstile response token (client-validated before POST). */
export function assertTurnstileToken(s: string, field = "Verification"): string {
  const t = s.trim();
  if (!t) {
    throw new ValidationError(`Complete the ${field.toLowerCase()} challenge.`);
  }
  assertMaxLen(t, 4096, field);
  if (/[\x00-\x1f\x7f]/.test(t)) {
    throw new ValidationError(`${field} contains invalid characters.`);
  }
  return t;
}

const KEY_SAFE = /^[a-zA-Z_][a-zA-Z0-9_]*$/;

function sanitizeJsonValue(val: unknown, depth: number, path: string): unknown {
  if (depth > 12) {
    throw new ValidationError("Extra metadata is nested too deeply.");
  }
  if (val === null) return null;
  const t = typeof val;
  if (t === "boolean" || t === "number") {
    if (t === "number" && (!Number.isFinite(val as number) || Number.isNaN(val as number))) {
      throw new ValidationError(`Invalid number in extra metadata${path ? ` (${path})` : ""}.`);
    }
    return val;
  }
  if (t === "string") {
    return assertStrictPlainText(val as string, LIMITS.metadataString, path || "metadata", {
      allowEmpty: true,
    });
  }
  if (Array.isArray(val)) {
    if (val.length > 500) {
      throw new ValidationError("Extra metadata array is too large.");
    }
    return val.map((item, i) => sanitizeJsonValue(item, depth + 1, `${path}[${i}]`));
  }
  if (t === "object") {
    const o = val as Record<string, unknown>;
    const keys = Object.keys(o);
    if (keys.length > 300) {
      throw new ValidationError("Extra metadata has too many keys.");
    }
    const out: Record<string, unknown> = {};
    for (const k of keys) {
      if (!KEY_SAFE.test(k)) {
        throw new ValidationError(`Invalid extra metadata key: ${k}`);
      }
      if (k.length > 64) {
        throw new ValidationError(`Extra metadata key is too long: ${k}`);
      }
      out[k] = sanitizeJsonValue(o[k], depth + 1, path ? `${path}.${k}` : k);
    }
    return out;
  }
  throw new ValidationError(`Extra metadata has an unsupported value type${path ? ` (${path})` : ""}.`);
}

export function parseAndSanitizeExtraMetadataJson(raw: string): Record<string, unknown> {
  const trimmed = raw.trim();
  if (!trimmed) {
    return {};
  }
  if (trimmed.length > LIMITS.extraJsonBytes) {
    throw new ValidationError(`Extra metadata is too large (max ${LIMITS.extraJsonBytes} characters).`);
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    throw new ValidationError("Extra metadata must be valid JSON.");
  }
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new ValidationError("Extra metadata must be a JSON object.");
  }
  return sanitizeJsonValue(parsed, 0, "") as Record<string, unknown>;
}
