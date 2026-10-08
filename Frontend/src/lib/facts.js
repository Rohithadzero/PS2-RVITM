import { lexicon, TERMS, CTAS } from '../data/mock';

const to12h = (hhmm) => String(Number(hhmm.split(':')[0]) % 12 || 12);

// "10–11 Oct" style; one day shows one number. Assumes start and end share a month.
const formatDates = (start, end, lx) => {
  const [, m, a] = start.split('-').map(Number);
  const b = Number(end.split('-')[2]);
  const month = lx.months[m - 1];
  return a === b ? lx.dates(a, a, month).replace(`${a}–${a}`, String(a)) : lx.dates(a, b, month);
};

// Slot values per language. Numbers always use Western digits (docs/validator-and-scoring.md).
export const slotValues = (facts, lang) => {
  const lx = lexicon[lang];
  const days = facts.days.map((d) => lx.days[d]);
  return {
    item: lx.item[facts.item.menu_item_id] ?? facts.item.name,
    discount: `${facts.discount_pct}%`,
    price: `Rs ${facts.price_inr}`,
    original_price: `Rs ${facts.original_price_inr}`,
    days: days.length > 1 ? `${days.slice(0, -1).join(', ')} ${lx.and} ${days.at(-1)}` : days[0] ?? '',
    dates: formatDates(facts.start_date, facts.end_date, lx),
    time: lx.time(to12h(facts.time_window.from), to12h(facts.time_window.to)),
    terms: facts.terms.map((t) => lx.terms[t]).join(' '),
  };
};

// Splits a template into text and slot parts so SlotText can highlight them.
export const renderParts = (template, facts, lang) => {
  const values = slotValues(facts, lang);
  let before = '';
  return template.split(/(\{[a-z_]+\})/g).filter(Boolean).map((part) => {
    const match = part.match(/^\{([a-z_]+)\}$/);
    if (!match) {
      before += part;
      return { text: part };
    }
    const slot = match[1];
    let value = values[slot];
    // English sentences start with a capital, even when a slot opens them.
    if (lang === 'en' && value && /(^|[.!?]\s+|\n)$/.test(before)) value = value[0].toUpperCase() + value.slice(1);
    before += value ?? part;
    return { slot, text: value ?? part, unknown: value === undefined };
  });
};

export const renderText = (template, facts, lang) =>
  renderParts(template, facts, lang).map((p) => p.text).join('');

// V11: price must equal original × (1 − pct/100), rounded to the nearest rupee.
export const expectedPrice = (original, pct) => Math.round(original * (1 - pct / 100));

export const arithmeticOk = (facts) =>
  facts.price_inr === expectedPrice(facts.original_price_inr, facts.discount_pct);

const DAY_NAMES = { mon: 'Monday', tue: 'Tuesday', wed: 'Wednesday', thu: 'Thursday', fri: 'Friday', sat: 'Saturday', sun: 'Sunday' };
const NUM_WORDS = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve'];

const numberWords = (n) => {
  if (n <= 12) return NUM_WORDS[n];
  const tens = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety'];
  const teens = ['ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen'];
  if (n < 20) return teens[n - 10];
  if (n < 100) return `${tens[Math.floor(n / 10)]}${n % 10 ? `-${NUM_WORDS[n % 10]}` : ''}`;
  return String(n);
};

// Template-based read-back script (docs/voice-stack.md section 5). English shown here;
// Kannada and Hindi templates come from the backend once native speakers verify them.
export const readBackScript = (facts) => {
  const terms = facts.terms.map((t) => TERMS.find((x) => x.id === t)?.label.toLowerCase()).join(', ');
  const days = facts.days.map((d) => DAY_NAMES[d]).join(' and ');
  return `${facts.item.name}, ${numberWords(facts.discount_pct)} percent off, price ${numberWords(facts.price_inr)} rupees, ${days}, ${numberWords(Number(to12h(facts.time_window.from)))} to ${numberWords(Number(to12h(facts.time_window.to)))} a.m.${terms ? `, ${terms}` : ''}.`;
};

export const ctaLabel = (id) => CTAS.find((c) => c.id === id)?.label ?? id;
export const termLabel = (id) => TERMS.find((t) => t.id === id)?.label ?? id;

// Field-level diff between two facts versions, used on S4 and S10.
export const diffFacts = (a, b) => {
  const show = {
    item: (f) => f.item.name,
    discount_pct: (f) => `${f.discount_pct}%`,
    price_inr: (f) => `Rs ${f.price_inr}`,
    original_price_inr: (f) => `Rs ${f.original_price_inr}`,
    days: (f) => f.days.join(', '),
    dates: (f) => `${f.start_date} – ${f.end_date}`,
    time_window: (f) => `${f.time_window.from}–${f.time_window.to}`,
    terms: (f) => f.terms.map(termLabel).join(', ') || 'none',
    cta: (f) => ctaLabel(f.cta),
  };
  return Object.entries(show)
    .map(([field, fmt]) => ({ field, from: fmt(a), to: fmt(b) }))
    .filter((d) => d.from !== d.to);
};

// Maps a changed facts field to the slot names assets declare in facts_used.
export const FIELD_TO_SLOT = {
  item: 'item',
  discount_pct: 'discount',
  price_inr: 'price',
  original_price_inr: 'original_price',
  days: 'days',
  dates: 'dates',
  time_window: 'time',
  terms: 'terms',
};
