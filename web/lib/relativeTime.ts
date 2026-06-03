/**
 * Rounded relative age for board threads/replies.
 */
const MS_PER_DAY = 86_400_000;
const MS_PER_MONTH = (365.25 / 12) * MS_PER_DAY;
const MS_PER_YEAR = 365.25 * MS_PER_DAY;

function unitLabel(n: number, singular: string, plural: string): string {
  return n === 1 ? `1 ${singular}` : `${n} ${plural}`;
}

export function formatRelativeTimeShort(iso: string, now: Date = new Date()): string {
  const then = new Date(iso);
  const ms = now.getTime() - then.getTime();
  if (!Number.isFinite(then.getTime()) || ms < 0) {
    return "just now";
  }

  const seconds = Math.round(ms / 1000);
  if (seconds < 60) {
    if (seconds < 1) return "just now";
    return unitLabel(seconds, "second", "seconds");
  }

  const minutes = Math.round(ms / 60_000);
  if (minutes < 60) {
    return unitLabel(minutes, "minute", "minutes");
  }

  const hours = Math.round(ms / 3_600_000);
  if (hours < 24) {
    return unitLabel(hours, "hour", "hours");
  }

  const days = Math.round(ms / MS_PER_DAY);
  if (days < 30) {
    return unitLabel(days, "day", "days");
  }

  const months = Math.round(ms / MS_PER_MONTH);
  if (days < 365) {
    return unitLabel(Math.max(1, months), "month", "months");
  }

  const years = Math.round(ms / MS_PER_YEAR);
  return unitLabel(Math.max(1, years), "year", "years");
}
