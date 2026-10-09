import type { Lang } from "./types";

// draft: the words used to check this language have not been read by a native speaker yet (see apps/api/app/languages.py).
export const LANGS: { code: Lang; name: string; native: string; speech: string; draft?: boolean }[] = [
  { code: "en", name: "English", native: "English", speech: "en-IN" },
  { code: "kn", name: "Kannada", native: "ಕನ್ನಡ", speech: "kn-IN" },
  { code: "hi", name: "Hindi", native: "हिन्दी", speech: "hi-IN" },
  { code: "ta", name: "Tamil", native: "தமிழ்", speech: "ta-IN", draft: true },
  { code: "te", name: "Telugu", native: "తెలుగు", speech: "te-IN", draft: true },
  { code: "ml", name: "Malayalam", native: "മലയാളം", speech: "ml-IN", draft: true },
  { code: "mr", name: "Marathi", native: "मराठी", speech: "mr-IN", draft: true },
  { code: "bn", name: "Bengali", native: "বাংলা", speech: "bn-IN", draft: true },
  { code: "gu", name: "Gujarati", native: "ગુજરાતી", speech: "gu-IN", draft: true },
  { code: "pa", name: "Punjabi", native: "ਪੰਜਾਬੀ", speech: "pa-IN", draft: true },
];
export const MAIN_LANGS = LANGS.slice(0, 3);
export const MORE_LANGS = LANGS.slice(3);

export const speechLang = (lang: string) => LANGS.find((l) => l.code === lang)?.speech || "en-IN";
export const langName = (lang: string) => LANGS.find((l) => l.code === lang)?.name || lang;

export function humanize(value: string) {
  const text = value.replace(/_/g, " ");
  return text.charAt(0).toUpperCase() + text.slice(1);
}

export const CHANNEL_ORDER = [
  "cold_email", "instagram_post", "instagram_story", "whatsapp", "blog_post",
  "poster", "google_business_post", "reel",
] as const;

const CHANNEL_LABEL: Record<string, string> = {
  cold_email: "Cold email",
  instagram_post: "Instagram post",
  instagram_story: "Instagram story",
  story: "Instagram story",
  whatsapp: "WhatsApp update",
  blog_post: "Blog post",
  poster: "Poster",
  google_business_post: "Google Business post",
  reel: "Reel script",
};
export const channelLabel = (c: string) => CHANNEL_LABEL[c] || humanize(c);

export const CHANNEL_SHORT: Record<string, string> = {
  cold_email: "Email", instagram_post: "Post", instagram_story: "Story", story: "Story",
  whatsapp: "WhatsApp", blog_post: "Blog", poster: "Poster", google_business_post: "Google", reel: "Reel",
};

// Fields the interview collects, with the value domains from the PLAN.md script.
export const FIELD_LABEL: Record<string, string> = {
  business_name: "Business name",
  business_type: "Business type",
  area: "Area",
  goal: "Goal",
  offer_item: "Offer item",
  offer_type: "Offer type",
  discount_percent: "Discount",
  price_amount: "Price",
  start_date: "Starts",
  end_date: "Ends",
  days: "Days",
  time_window: "Time window",
  terms: "Terms",
  audiences: "Audience",
  languages: "Languages",
  channels: "Channels",
  cta: "Call to action",
  email_recipients: "Email recipients",
  tone: "Tone",
};

export const FIELD_OPTIONS: Record<string, string[]> = {
  business_type: ["cafe", "restaurant", "bakery", "salon", "boutique", "gym", "clinic", "coaching", "other"],
  goal: ["more_walkins", "promote_offer", "launch_product", "announce_opening", "grow_followers"],
  offer_type: ["percent_off", "fixed_price", "buy_one_get_one", "free_item", "no_offer"],
  days: ["mon", "tue", "wed", "thu", "fri", "sat", "sun", "weekend", "weekdays", "every_day"],
  audiences: ["students", "office_workers", "families", "regulars", "tourists", "nearby_residents"],
  languages: ["en", "kn", "hi"],
  channels: ["cold_email", "instagram_post", "instagram_story", "blog_post", "whatsapp", "poster", "google_business_post", "reel"],
  tone: ["friendly", "warm_local", "playful", "straightforward"],
};
const MULTI_FIELDS = new Set(["days", "audiences", "languages", "channels"]);
export const isMultiField = (f: string) => MULTI_FIELDS.has(f);

export function optionLabel(field: string, value: string) {
  if (field === "languages") return langName(value);
  if (field === "channels") return channelLabel(value);
  const day: Record<string, string> = { mon: "Monday", tue: "Tuesday", wed: "Wednesday", thu: "Thursday", fri: "Friday", sat: "Saturday", sun: "Sunday" };
  if (field === "days" && day[value]) return day[value];
  return humanize(value);
}

export function formatIsoDate(iso: string, lang = "en", opts?: Intl.DateTimeFormatOptions) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!m) return iso;
  const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  try {
    return d.toLocaleDateString(speechLang(lang), { timeZone: "UTC", weekday: "short", day: "numeric", month: "short", year: "numeric", ...opts });
  } catch {
    return iso;
  }
}

export function formatValue(field: string, value: unknown): string {
  if (value === null || value === undefined || value === "") return "";
  if (Array.isArray(value)) {
    return value
      .map((v) => {
        if (v && typeof v === "object") {
          const o = v as { name?: string; email?: string };
          return o.name ? `${o.name} <${o.email ?? ""}>` : o.email ?? JSON.stringify(v);
        }
        return typeof v === "string" ? optionLabel(field, v) : String(v);
      })
      .join(", ");
  }
  if (typeof value === "number") return field === "discount_percent" ? `${value}%` : field === "price_amount" ? `Rs ${value}` : String(value);
  if (typeof value === "string") {
    if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return formatIsoDate(value);
    if (FIELD_OPTIONS[field]?.includes(value)) return optionLabel(field, value);
    return value;
  }
  if (typeof value === "object") {
    const o = value as Record<string, unknown>;
    if (typeof o.value === "string") return o.value;
    return Object.values(o).filter((v) => typeof v === "string" || typeof v === "number").join(", ");
  }
  return String(value);
}

export function when(value: string) {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleString(undefined, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}

export function money(amount: number, currency: string | null) {
  const sym = !currency || currency === "INR" ? "₹" : `${currency} `;
  return `${sym}${Number.isInteger(amount) ? amount : amount.toFixed(2)}`;
}

// The offer sentence, built from locked facts only (never typed by hand).
export function offerHeadline(f: { item: string; discount_percent: number | null; price_amount: number | null; currency: string | null }) {
  if (f.discount_percent !== null) return `${f.discount_percent}% off`;
  if (f.price_amount !== null) return money(f.price_amount, f.currency);
  return "";
}

export const MEANING_LABEL: Record<string, string> = {
  checking: "Meaning check running",
  ok: "Meaning matches the offer",
  flagged: "Meaning flagged",
  failed: "Meaning check failed, not verified",
  unavailable: "Meaning not checked, no Agnes key",
};

// Server detail strings can carry raw keys (lang codes, channel keys, field names). Show labels instead.
export function prettyText(text: string): string {
  let out = text.replace(new RegExp(`^(${LANGS.map((l) => l.code).join("|")})\\b`), (m) => langName(m));
  for (const key of Object.keys(CHANNEL_LABEL)) out = out.replace(new RegExp(`\\b${key}\\b`, "g"), channelLabel(key));
  for (const [key, label] of Object.entries(FIELD_LABEL)) out = out.replace(new RegExp(`\\b${key}\\b`, "g"), label.toLowerCase());
  return out;
}

export const PURPOSE_RULE: Record<string, string> = {
  teaser: "Teaser, the day before the offer starts",
  launch: "Launch, the day the offer starts",
  reminder: "Reminder, on each day the offer runs",
  last_day: "Last day, when the offer ends",
};

export function choiceLabels(field: string, choices: string[]) {
  return choices.map((c) => optionLabel(field, c)).join(", ");
}
