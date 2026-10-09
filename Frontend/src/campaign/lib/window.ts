// The offer window from the plan (days, dates, clock times) turned into the poster's facts band in the poster's own language.
// Pure and import-free so it can be tested on its own. Digits stay Western (the same rule as the copy).

export type OfferWindow = {
  days: string[]; // "Mon".."Sun", in week order. All seven means every day.
  start_date: string | null;
  end_date: string | null;
  time_start: string | null; // "09:00"
  time_end: string | null;
};

const LOCALE: Record<string, string> = { en: "en-IN-u-nu-latn", kn: "kn-IN-u-nu-latn", hi: "hi-IN-u-nu-latn" };
const DAY_INDEX: Record<string, number> = { Mon: 0, Tue: 1, Wed: 2, Thu: 3, Fri: 4, Sat: 5, Sun: 6 };

/** "Sat", "Sun" -> "ಶನಿ, ಭಾನು" in Kannada. Every day (all seven) says nothing: it is implied. */
export function localizedDays(days: string[], lang: string): string {
  const known = days.filter((d) => d in DAY_INDEX);
  if (!known.length || known.length === 7) return "";
  const locale = LOCALE[lang] || LOCALE.en;
  return known
    .map((d) => new Date(Date.UTC(2024, 0, 1 + DAY_INDEX[d])).toLocaleDateString(locale, { weekday: "short", timeZone: "UTC" }))
    .join(", ");
}

/** "09:00" -> "9:00 AM" in every language (Kannada and Hindi locale data also use Latin AM and PM). "" for anything that is not HH:MM. */
export function localizedClock(hhmm: string | null, lang: string): string {
  const m = /^(\d{2}):(\d{2})$/.exec(hhmm || "");
  if (!m || +m[1] > 23 || +m[2] > 59) return "";
  const locale = LOCALE[lang] || LOCALE.en;
  const text = new Date(Date.UTC(2024, 0, 1, +m[1], +m[2])).toLocaleTimeString(locale, { hour: "numeric", minute: "2-digit", hour12: true, timeZone: "UTC" });
  // Browsers give "am" for English and Latin "AM" for Kannada and Hindi (that is what their locale data says). Keep one style.
  return text.replace(/\b(am|pm)\b/gi, (mark) => mark.toUpperCase());
}

/**
 * The timing row for the facts band. Built only from the parsed window. When the clock times could not be parsed it returns ""
 * so the caller keeps the owner's original wording instead of showing a half-translated row.
 */
export function timingLine(window: OfferWindow | null | undefined, lang: string): string {
  if (!window || !window.time_start || !window.time_end) return "";
  const a = localizedClock(window.time_start, lang);
  const b = localizedClock(window.time_end, lang);
  if (!a || !b) return "";
  const days = localizedDays(window.days, lang);
  return `${days ? `${days}, ` : ""}${a} - ${b}`;
}
