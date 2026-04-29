function normalizeIsoUtc(iso: string): string {
  // Backend emits naive UTC timestamps; append Z so browsers parse them as UTC.
  const hasTimezone = /([zZ]|[+-]\d{2}:?\d{2})$/.test(iso);
  return hasTimezone ? iso : `${iso}Z`;
}

function parseDate(iso: string): Date {
  return new Date(normalizeIsoUtc(iso));
}

export function formatAbsoluteDate(iso: string): string {
  const parsed = parseDate(iso);
  if (Number.isNaN(parsed.getTime())) return "-";
  return parsed.toLocaleString();
}

export function formatRelativeTime(iso: string): string {
  const parsed = parseDate(iso);
  if (Number.isNaN(parsed.getTime())) return "-";

  const diffMs = parsed.getTime() - Date.now();
  const absMs = Math.abs(diffMs);

  const minute = 60_000;
  const hour = 60 * minute;
  const day = 24 * hour;

  const rtf = new Intl.RelativeTimeFormat(undefined, { numeric: "auto" });

  if (absMs < hour) {
    return rtf.format(Math.round(diffMs / minute), "minute");
  }
  if (absMs < day) {
    return rtf.format(Math.round(diffMs / hour), "hour");
  }
  return rtf.format(Math.round(diffMs / day), "day");
}

