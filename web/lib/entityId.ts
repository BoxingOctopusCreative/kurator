/** Loose UUID check for URL segments (API uses RFC4122 UUIDs). */
export function isEntityUuid(raw: string): boolean {
  const s = raw.trim();
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);
}
