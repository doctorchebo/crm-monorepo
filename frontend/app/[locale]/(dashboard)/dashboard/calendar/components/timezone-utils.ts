/**
 * Timezone Utilities
 * Builds a sorted, labelled list of all IANA timezones with live GMT offset indicators.
 * Uses Intl.supportedValuesOf when available (Chrome 99+, Firefox 113+, Node 18+).
 */

// Fallback for very old environments that don't support Intl.supportedValuesOf
const FALLBACK_ZONES = [
  "UTC",
  "Pacific/Honolulu",
  "America/Anchorage",
  "America/Los_Angeles",
  "America/Vancouver",
  "America/Denver",
  "America/Phoenix",
  "America/Chicago",
  "America/Mexico_City",
  "America/New_York",
  "America/Toronto",
  "America/Bogota",
  "America/Lima",
  "America/Sao_Paulo",
  "America/Buenos_Aires",
  "America/Halifax",
  "America/St_Johns",
  "Atlantic/Azores",
  "Europe/London",
  "Europe/Dublin",
  "Europe/Lisbon",
  "Europe/Paris",
  "Europe/Berlin",
  "Europe/Rome",
  "Europe/Madrid",
  "Europe/Amsterdam",
  "Europe/Brussels",
  "Europe/Vienna",
  "Europe/Warsaw",
  "Europe/Prague",
  "Africa/Lagos",
  "Europe/Helsinki",
  "Europe/Athens",
  "Europe/Bucharest",
  "Europe/Kyiv",
  "Europe/Moscow",
  "Africa/Nairobi",
  "Asia/Riyadh",
  "Asia/Dubai",
  "Asia/Kabul",
  "Asia/Karachi",
  "Asia/Kolkata",
  "Asia/Kathmandu",
  "Asia/Dhaka",
  "Asia/Rangoon",
  "Asia/Bangkok",
  "Asia/Jakarta",
  "Asia/Singapore",
  "Asia/Kuala_Lumpur",
  "Asia/Shanghai",
  "Asia/Hong_Kong",
  "Asia/Taipei",
  "Asia/Tokyo",
  "Asia/Seoul",
  "Australia/Perth",
  "Australia/Darwin",
  "Australia/Adelaide",
  "Australia/Sydney",
  "Australia/Melbourne",
  "Pacific/Auckland",
  "Pacific/Fiji",
];

export interface TimezoneOption {
  value: string;
  label: string;
}

/**
 * Returns the browser's current timezone via the Intl API.
 * Safe to call on the server (returns 'UTC' when window is unavailable).
 */
export function getBrowserTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone ?? "UTC";
  } catch {
    return "UTC";
  }
}

/**
 * Returns a GMT offset string like "+5:30" or "-8:00" for a given IANA timezone at `date`.
 */
function getOffsetLabel(
  tz: string,
  date: Date,
): { display: string; minutes: number } {
  try {
    const parts = new Intl.DateTimeFormat("en", {
      timeZone: tz,
      timeZoneName: "shortOffset",
    }).formatToParts(date);

    const tzName = parts.find((p) => p.type === "timeZoneName")?.value ?? "GMT";

    // Parse offset to minutes for sorting: "GMT+5:30" → +330
    const match = tzName.match(/GMT([+-])(\d{1,2})(?::(\d{2}))?/);
    let minutes = 0;
    if (match) {
      const sign = match[1] === "+" ? 1 : -1;
      const hours = parseInt(match[2], 10);
      const mins = parseInt(match[3] ?? "0", 10);
      minutes = sign * (hours * 60 + mins);
    }

    return { display: tzName, minutes };
  } catch {
    return { display: "GMT", minutes: 0 };
  }
}

/**
 * Builds the full timezone options list sorted by UTC offset then alphabetically.
 * Computed once per call (memoize with useMemo in components if needed).
 */
export function buildTimezoneOptions(): TimezoneOption[] {
  let zones: string[];
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    zones = (Intl as any).supportedValuesOf?.("timeZone") ?? FALLBACK_ZONES;
  } catch {
    zones = FALLBACK_ZONES;
  }

  const now = new Date();

  const withOffsets = zones.map((tz) => {
    const { display, minutes } = getOffsetLabel(tz, now);
    const city =
      tz.replace(/_/g, " ").split("/").pop() ?? tz.replace(/_/g, " ");
    const region = tz.includes("/") ? tz.split("/")[0] + "/" : "";
    const displayName = tz.replace(/_/g, " ");
    return {
      value: tz,
      label: `(${display}) ${displayName}`,
      offsetMinutes: minutes,
      city,
      region,
    };
  });

  return withOffsets
    .sort(
      (a, b) =>
        a.offsetMinutes - b.offsetMinutes || a.value.localeCompare(b.value),
    )
    .map(({ value, label }) => ({ value, label }));
}
