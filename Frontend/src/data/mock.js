// Mock data shaped like docs/data-model.md and docs/api-spec.md.
// Every export here is replaced by an API response once the backend is ready (see src/api/client.js).

export const LANGS = [
  { id: 'en', label: 'English', short: 'EN' },
  { id: 'hi', label: 'Hindi', short: 'HI' },
  { id: 'kn', label: 'Kannada', short: 'KN' },
];

export const CHANNELS = [
  { id: 'instagram', label: 'Instagram' },
  { id: 'whatsapp', label: 'WhatsApp' },
  { id: 'poster', label: 'Poster' },
  { id: 'reel', label: 'Reel' },
];

export const DAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];

// Controlled vocabulary for offer terms (docs/data-model.md section 2).
export const TERMS = [
  { id: 'dine_in_only', label: 'Dine-in only' },
  { id: 'while_stocks_last', label: 'While stocks last' },
  { id: 'one_per_customer', label: 'One per customer' },
  { id: 'no_delivery', label: 'No delivery' },
];

export const CTAS = [
  { id: 'visit', label: 'Visit the café' },
  { id: 'reply', label: 'Reply to reserve' },
  { id: 'call', label: 'Call to order' },
];

export const owner = {
  name: 'Priya',
  email: 'priya@example.com',
  business: 'Priya’s Café',
  area: 'Indiranagar, Bengaluru',
  initials: 'PC',
};

export const menu = [
  { id: 'm12', name: 'Filter coffee', price_inr: 60 },
  { id: 'm13', name: 'Masala dosa', price_inr: 120 },
  { id: 'm14', name: 'Ginger chai', price_inr: 40 },
  { id: 'm15', name: 'Bun maska', price_inr: 50 },
  { id: 'm16', name: 'Rava idli', price_inr: 90 },
];

export const brand = {
  version: 3,
  voice: 'Warm, neighbourly, a little playful. Kannada first.',
  banned_phrases: ['cheap', 'best in Bengaluru'],
  taboo_claims: ['health claims', 'competitor names'],
  sample_posts: [
    'Rainy evening? Our ginger chai is waiting for you.',
    'ನಿಮ್ಮ ಬೆಳಗಿನ ಕಾಫಿ ನಮ್ಮ ಜವಾಬ್ದಾರಿ.',
  ],
  languages: ['en', 'hi', 'kn'],
};

export const decisionRules = [
  { id: 'r1', rule: 'Never say "cheap"', reason: 'Priya edited it out twice', status: 'confirmed' },
  { id: 'r2', rule: 'Use "Rs" before prices, not ₹', reason: 'Matches her menu board', status: 'confirmed' },
  { id: 'r3', rule: 'Avoid "weekend" without dates', reason: 'Validator V4 flags it', status: 'proposed' },
];

export const audiences = [
  {
    id: 'locals',
    name: 'Regular locals',
    description: 'Neighbours who visit 3+ times a week. Mostly Kannada speakers.',
    persona: ['Retired neighbour, prefers Kannada', 'Weekend family'],
  },
  {
    id: 'office',
    name: 'Office crowd',
    description: 'Nearby office workers, Hinglish, morning and lunch rush.',
    persona: ['Office worker, Hinglish, lunch rush', 'College student, price sensitive, English'],
  },
];

export const channelName = (id) => CHANNELS.find((c) => c.id === id)?.label ?? id;

// "Regular locals, KN, WhatsApp"
export const assetName = (a) => `${audiences.find((x) => x.id === a.audience_id)?.name}, ${a.lang.toUpperCase()}, ${channelName(a.channel)}`;

export const photos = [
  { id: 'p1', name: 'Filter coffee tumbler', use_for_posters: true, tint: 'from-amber-700 to-stone-900' },
  { id: 'p2', name: 'Counter at 8 am', use_for_posters: true, tint: 'from-orange-500 to-amber-900' },
  { id: 'p3', name: 'Masala dosa plate', use_for_posters: false, tint: 'from-yellow-600 to-orange-900' },
  { id: 'p4', name: 'Shop front', use_for_posters: false, tint: 'from-stone-500 to-stone-800' },
];

// Offer Facts versions. v2 is approved; v1 had a different time window.
export const factsVersions = [
  {
    version: 1,
    approved: true,
    approved_at: '2026-10-08T12:40:00+05:30',
    approval_method: 'readback_played',
    json: {
      item: { menu_item_id: 'm12', name: 'Filter coffee' },
      discount_pct: 20,
      price_inr: 48,
      original_price_inr: 60,
      days: ['sat', 'sun'],
      start_date: '2026-10-10',
      end_date: '2026-10-11',
      time_window: { from: '08:00', to: '12:00' },
      terms: ['dine_in_only'],
      exclusions: [],
      cta: 'visit',
    },
  },
  {
    version: 2,
    approved: true,
    approved_at: '2026-10-08T14:03:00+05:30',
    approval_method: 'readback_played',
    json: {
      item: { menu_item_id: 'm12', name: 'Filter coffee' },
      discount_pct: 20,
      price_inr: 48,
      original_price_inr: 60,
      days: ['sat', 'sun'],
      start_date: '2026-10-10',
      end_date: '2026-10-11',
      time_window: { from: '08:00', to: '11:00' },
      terms: ['dine_in_only'],
      exclusions: [],
      cta: 'visit',
    },
  },
];

// Where each fact came from (shown as a source chip on S4).
export const factSources = {
  item: 'you said',
  discount_pct: 'you said',
  price_inr: 'menu × 0.8',
  original_price_inr: 'menu',
  days: 'you said',
  dates: 'calendar',
  time_window: 'asked back',
  terms: 'you said',
  cta: 'brand default',
};

// Per-language words used by the slot renderer.
export const lexicon = {
  en: {
    item: { m12: 'filter coffee' },
    days: { mon: 'Monday', tue: 'Tuesday', wed: 'Wednesday', thu: 'Thursday', fri: 'Friday', sat: 'Saturday', sun: 'Sunday' },
    and: 'and',
    months: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
    dates: (a, b, m) => `${a}–${b} ${m}`,
    time: (from, to) => `${from}–${to} am`,
    terms: { dine_in_only: 'Dine-in only.', while_stocks_last: 'While stocks last.', one_per_customer: 'One per customer.', no_delivery: 'No delivery.' },
  },
  hi: {
    item: { m12: 'फ़िल्टर कॉफ़ी' },
    days: { mon: 'सोमवार', tue: 'मंगलवार', wed: 'बुधवार', thu: 'गुरुवार', fri: 'शुक्रवार', sat: 'शनिवार', sun: 'रविवार' },
    and: 'और',
    months: ['जनवरी', 'फ़रवरी', 'मार्च', 'अप्रैल', 'मई', 'जून', 'जुलाई', 'अगस्त', 'सितंबर', 'अक्टूबर', 'नवंबर', 'दिसंबर'],
    dates: (a, b, m) => `${a}–${b} ${m}`,
    time: (from, to) => `सुबह ${from}–${to} बजे`,
    terms: { dine_in_only: 'सिर्फ़ कैफ़े में बैठकर।', while_stocks_last: 'स्टॉक रहने तक।', one_per_customer: 'हर ग्राहक को एक।', no_delivery: 'डिलीवरी नहीं।' },
  },
  kn: {
    item: { m12: 'ಫಿಲ್ಟರ್ ಕಾಫಿ' },
    days: { mon: 'ಸೋಮವಾರ', tue: 'ಮಂಗಳವಾರ', wed: 'ಬುಧವಾರ', thu: 'ಗುರುವಾರ', fri: 'ಶುಕ್ರವಾರ', sat: 'ಶನಿವಾರ', sun: 'ಭಾನುವಾರ' },
    and: 'ಮತ್ತು',
    months: ['ಜನವರಿ', 'ಫೆಬ್ರವರಿ', 'ಮಾರ್ಚ್', 'ಏಪ್ರಿಲ್', 'ಮೇ', 'ಜೂನ್', 'ಜುಲೈ', 'ಆಗಸ್ಟ್', 'ಸೆಪ್ಟೆಂಬರ್', 'ಅಕ್ಟೋಬರ್', 'ನವೆಂಬರ್', 'ಡಿಸೆಂಬರ್'],
    dates: (a, b, m) => `${m} ${a}–${b}`,
    time: (from, to) => `ಬೆಳಿಗ್ಗೆ ${from}–${to}`,
    terms: { dine_in_only: 'ಕೆಫೆಯಲ್ಲೇ ಕುಳಿತು ಸವಿಯಲು ಮಾತ್ರ.', while_stocks_last: 'ದಾಸ್ತಾನು ಇರುವವರೆಗೆ.', one_per_customer: 'ಪ್ರತಿ ಗ್ರಾಹಕರಿಗೆ ಒಂದು.', no_delivery: 'ಡೆಲಿವರಿ ಇಲ್ಲ.' },
  },
};

// Model output: copy with {slots}. Code fills the slots (docs/validator-and-scoring.md).
export const templates = {
  en: {
    instagram: 'Mornings taste better with {item}. {discount} off this {days}, {time}: just {price} a cup (was {original_price}). {terms}',
    whatsapp: 'Hi! {item} is {discount} off this {days}, {time}. Only {price}. {terms} See you at the counter.',
    poster: '{item} {discount} off\n{dates}, {time}\nNow {price}\n{terms}',
  },
  hi: {
    instagram: 'इस {days} {time}, {item} पर {discount} छूट। सिर्फ़ {price} (पहले {original_price})। {terms}',
    whatsapp: 'नमस्ते! इस {days} {time}, {item} पर {discount} छूट, सिर्फ़ {price}। {terms}',
    poster: '{item} पर {discount} छूट\n{dates}, {time}\nअब {price}\n{terms}',
  },
  kn: {
    instagram: 'ಈ {days} {time}, {item} ಮೇಲೆ {discount} ರಿಯಾಯಿತಿ - ಬೆಲೆ {price} (ಮೊದಲು {original_price}). {terms}',
    whatsapp: 'ನಮಸ್ಕಾರ! ಈ {days} {time}, {item} ಮೇಲೆ {discount} ರಿಯಾಯಿತಿ, ಬೆಲೆ ಕೇವಲ {price}. {terms}',
    poster: '{item} ಮೇಲೆ {discount} ರಿಯಾಯಿತಿ\n{dates}, {time}\nಈಗ {price}\n{terms}',
  },
};

// Slots an asset contains; the blast radius of a fact change is computed from these.
export const slotsIn = (template) => [...new Set([...template.matchAll(/\{([a-z_]+)\}/g)].map((m) => m[1]))];

// Board seed: status, score and overrides per asset key `${audience}-${lang}-${channel}`.
const seed = {
  'locals-en-instagram': { status: 'approved', win: 0.78 },
  'locals-en-whatsapp': { status: 'approved', win: 0.74 },
  'locals-en-poster': { status: 'pending', win: 0.79 },
  'locals-hi-instagram': { status: 'approved', win: 0.71 },
  'locals-hi-whatsapp': { status: 'changed', win: null, facts_version: 1 },
  'locals-hi-poster': { status: 'pending', win: null },
  'locals-kn-instagram': { status: 'approved', win: 0.8, best: 'Kannada-first voice won 4 of 5 blind runs with locals' },
  'locals-kn-whatsapp': {
    status: 'blocked',
    win: 0.66,
    template: 'ನಮಸ್ಕಾರ! ಈ {days} {time}, {item} ಮೇಲೆ {discount} ರಿಯಾಯಿತಿ, ಬೆಲೆ ಕೇವಲ Rs 50. {terms}',
    block_reason: { token: '50', field: 'price_inr', rule: 'V1 Stray digits', expected: 'Rs 48' },
  },
  'locals-kn-poster': { status: 'approved', win: 0.76 },
  'office-en-instagram': { status: 'approved', win: 0.73 },
  'office-en-whatsapp': { status: 'approved', win: 0.69 },
  'office-en-poster': { status: 'changed', win: null, facts_version: 1 },
  'office-hi-instagram': { status: 'approved', win: 0.7 },
  'office-hi-whatsapp': { status: 'approved', win: 0.68 },
  'office-hi-poster': { status: 'approved', win: 0.72 },
  'office-kn-instagram': { status: 'changed', win: null, facts_version: 1 },
  'office-kn-whatsapp': { status: 'approved', win: 0.67 },
  'office-kn-poster': { status: 'approved', win: 0.74 },
};

export const initialAssets = audiences.flatMap((aud) =>
  LANGS.flatMap((lang) =>
    ['instagram', 'whatsapp', 'poster'].map((channel) => {
      const key = `${aud.id}-${lang.id}-${channel}`;
      const s = seed[key];
      return {
        id: key,
        audience_id: aud.id,
        lang: lang.id,
        channel,
        type: channel === 'poster' ? 'poster' : 'copy',
        template: s.template ?? templates[lang.id][channel],
        facts_used: slotsIn(s.template ?? templates[lang.id][channel]),
        facts_version: s.facts_version ?? 2,
        status: s.status,
        block_reason: s.block_reason,
        score: s.win ? { win_rate: s.win, ci: [Math.max(0, s.win - 0.12), Math.min(1, s.win + 0.1)], repeats: 5 } : null,
        best_reason: s.best,
        is_fallback: key === 'office-hi-poster',
        photo_id: channel === 'poster' ? 'p1' : null,
        updated_at: '2026-10-08T14:20:00+05:30',
      };
    })
  )
);

// Validator rules V1-V11 (docs/validator-and-scoring.md section 2).
export const validatorRules = [
  { id: 'V1', name: 'Stray digits', detail: 'No digit outside a filled slot' },
  { id: 'V2', name: 'Spelled-out numbers', detail: 'No number words outside slots' },
  { id: 'V3', name: 'Percentages', detail: 'Only from {discount}' },
  { id: 'V4', name: 'Day and date names', detail: 'Only from {days} or {dates}' },
  { id: 'V5', name: 'Times', detail: 'Only from {time}' },
  { id: 'V6', name: 'Conditions present', detail: 'Every locked term appears' },
  { id: 'V7', name: 'Implied promises', detail: 'No "free", "all drinks", "unlimited"' },
  { id: 'V8', name: 'Brand rules', detail: 'No banned phrases or taboo claims' },
  { id: 'V9', name: 'Channel limits', detail: 'Caption, WhatsApp and SMS length' },
  { id: 'V10', name: 'Stale facts', detail: 'Uses the approved facts version' },
  { id: 'V11', name: 'Arithmetic', detail: 'Price = original × (1 − discount)' },
];

export const backTranslations = {
  en: null,
  hi: 'This Saturday and Sunday 8–11 in the morning, 20% off on filter coffee. Only Rs 48 (earlier Rs 60). Only sitting in the café.',
  kn: 'This Saturday and Sunday morning 8–11, 20% discount on filter coffee - price Rs 48 (earlier Rs 60). Only to sit and enjoy in the café.',
};

export const campaigns = [
  { id: 'c1', name: 'Weekend filter coffee', status: 'live', counts: { approved: 12, pending: 2, changed: 3, blocked: 1 }, last_change: 'Facts v2 approved, 14:03' },
  { id: 'c2', name: 'Monsoon chai combo', status: 'planning', counts: { approved: 0, pending: 0, changed: 0, blocked: 0 }, last_change: 'Plan confirmed, yesterday' },
  { id: 'c3', name: 'New breakfast menu', status: 'draft', counts: { approved: 0, pending: 0, changed: 0, blocked: 0 }, last_change: 'Brief recorded, 2 days ago' },
];

export const events = [
  { id: 'e9', ts: '14:21', actor: 'system', kind: 'facts', action: 'Blocked Kannada WhatsApp for locals', why: '"Rs 50" does not match locked price Rs 48', link: 'locals-kn-whatsapp' },
  { id: 'e8', ts: '14:12', actor: 'agent:optimizer', kind: 'edits', action: 'Rewrote English Instagram for locals', why: 'Round 1: won 4 of 5 blind runs', link: 'locals-en-instagram' },
  { id: 'e7', ts: '14:05', actor: 'system', kind: 'facts', action: 'Marked 3 assets Changed', why: 'Time window changed in facts v2', link: null },
  { id: 'e6', ts: '14:03', actor: 'Priya', kind: 'facts', action: 'Approved facts v2', why: 'Read-back played in Kannada', link: null },
  { id: 'e5', ts: '13:58', actor: 'Priya', kind: 'facts', action: 'Changed time to 8–11 am', why: 'Said "close the offer at eleven"', link: null },
  { id: 'e4', ts: '13:10', actor: 'Priya', kind: 'tone', action: 'Removed "cheap" from Hindi Instagram', why: 'Not our voice', link: 'locals-hi-instagram' },
  { id: 'e3', ts: '12:52', actor: 'system', kind: 'scope', action: 'Confirmed plan: 18 assets, no reels', why: 'Reel needs 5:30 of video queue, over time limit', link: null },
  { id: 'e2', ts: '12:40', actor: 'Priya', kind: 'facts', action: 'Approved facts v1', why: 'Read-back played in Kannada', link: null },
  { id: 'e1', ts: '12:31', actor: 'Priya', kind: 'scope', action: 'Recorded voice brief', why: 'New campaign', link: null },
];

export const customers = [
  { id: 'u1', phone: '+91 98xxx x4821', lang: 'kn', whatsapp: '2026-10-02', sms: null, opted_out: false },
  { id: 'u2', phone: '+91 98xxx x1934', lang: 'hi', whatsapp: '2026-09-28', sms: '2026-09-28', opted_out: false },
  { id: 'u3', phone: '+91 99xxx x7710', lang: 'en', whatsapp: null, sms: null, opted_out: true },
  { id: 'u4', phone: '+91 97xxx x3302', lang: 'kn', whatsapp: '2026-10-01', sms: '2026-10-01', opted_out: false },
  { id: 'u5', phone: '+91 96xxx x5518', lang: 'kn', whatsapp: '2026-09-30', sms: null, opted_out: false },
  { id: 'u6', phone: '+91 98xxx x6627', lang: 'hi', whatsapp: '2026-09-25', sms: null, opted_out: false },
  { id: 'u7', phone: '+91 90xxx x2209', lang: 'en', whatsapp: '2026-10-03', sms: '2026-10-03', opted_out: false },
  { id: 'u8', phone: '+91 91xxx x8840', lang: 'kn', whatsapp: null, sms: '2026-09-20', opted_out: false },
  { id: 'u9', phone: '+91 93xxx x4416', lang: 'hi', whatsapp: '2026-10-04', sms: null, opted_out: false },
  { id: 'u10', phone: '+91 94xxx x9051', lang: 'kn', whatsapp: '2026-10-05', sms: '2026-10-05', opted_out: false },
  { id: 'u11', phone: '+91 95xxx x3378', lang: 'hi', whatsapp: '2026-09-29', sms: null, opted_out: false },
  { id: 'u12', phone: '+91 98xxx x0092', lang: 'en', whatsapp: '2026-10-06', sms: null, opted_out: false },
];

export const customerImport = {
  accepted: 12,
  rejected: [
    { row: 7, reason: 'Phone number has 9 digits' },
    { row: 15, reason: 'No consent date for WhatsApp' },
  ],
};

// Text calls per minute for the last 15 minutes (shown on Home with the 10 RPM cap).
export const textCallsPerMinute = [3, 5, 8, 10, 10, 9, 6, 4, 7, 10, 10, 8, 5, 3, 2];

export const personas = [
  { name: 'Retired neighbour, prefers Kannada', winner: 'B', reason: 'Kannada line feels like Priya talking; price is clear.' },
  { name: 'Office worker, Hinglish, lunch rush', winner: 'B', reason: 'Time window comes first, so I know if I can make it.' },
  { name: 'College student, price sensitive', winner: 'A', reason: 'A shows the old price, so the saving is obvious.' },
  { name: 'Weekend family', winner: 'B', reason: '"See you at the counter" sounds friendly.' },
];

export const optimizeRounds = [
  { round: 1, rewrites: 6, discarded: 1, validator: 'clean', before: 0.5, after: 0.68 },
  { round: 2, rewrites: 3, discarded: 0, validator: 'clean', before: 0.68, after: 0.72 },
];

export const providers = {
  text: { capability: 'Text / LLM', mode: 'default', provider: 'Agnes', model: 'agnes-3.0-flash', tier: 'Free (10 RPM)', p50: '2.1 s', p90: '3.4 s', json: '100%', tools: 'yes', status: 'ok', fallback: ['My Groq key'] },
  image: { capability: 'Image', mode: 'default', provider: 'Agnes', model: 'agnes-image-2.5-flash', tier: 'Free (1K: 10 RPM)', p50: '14 s', p90: '31 s', timeout: '120 s', status: 'ok', fallback: [] },
  video: { capability: 'Video (optional)', mode: 'default', provider: 'Agnes', model: 'agnes-video-2.5 (Flash, 720P)', tier: 'Free (1 RPM)', p50: null, status: 'not_calibrated', fallback: [] },
};

export const voiceProviders = [
  { lang: 'en', stt: 'Local: faster-whisper', tts: 'Browser speech' },
  { lang: 'hi', stt: 'Sarvam Saaras v4', tts: 'Sarvam Bulbul v3' },
  { lang: 'kn', stt: 'Sarvam Saaras v4', tts: 'Local: Indic Parler-TTS' },
];

export const voiceOptions = {
  stt: ['Local: faster-whisper', 'Local: AI4Bharat Indic', 'Sarvam Saaras v4', 'Groq whisper-large-v3', 'ElevenLabs Scribe (unverified)', 'Browser Web Speech'],
  tts: ['Local: Indic Parler-TTS', 'Local: Svara', 'Sarvam Bulbul v3', 'ElevenLabs v3 (unverified)', 'Browser speech'],
};

export const localModels = [
  { name: 'faster-whisper large-v3', size: '3.1 GB', status: 'loaded' },
  { name: 'Indic Parler-TTS', size: '2.4 GB', status: 'loading' },
  { name: 'AI4Bharat IndicConformer (kn)', size: '480 MB', status: 'missing' },
];

export const tiers = {
  Agnes: [
    { id: 'free', label: 'Free / default', text: 10, image: '10 / 5 / 1 / 1', video: 1 },
    { id: 'enterprise', label: 'Enterprise verified', text: 20, image: '40 / 20 / 1 / 1', video: 2 },
    { id: 'token_plan', label: 'Token Plan', text: 1000, image: '100 / 80 / 1 / 1', video: 5 },
  ],
};

export const priceTable = [
  { item: 'Agnes text input', price: '$0.05 / 1M tokens ($0.005 cached)', verified: '8 Oct 2026' },
  { item: 'Agnes text output', price: '$0.15 / 1M tokens', verified: '8 Oct 2026' },
  { item: 'Agnes image', price: '$0.010 (1K) to $0.024 (4K)', verified: '8 Oct 2026' },
  { item: 'Agnes video 2.5', price: '$0.025 / s at 720P', verified: '8 Oct 2026' },
  { item: 'Sarvam STT', price: 'Rs 30 / hour', verified: '8 Oct 2026' },
  { item: 'Sarvam TTS Bulbul v3', price: 'Rs 30 / 10K characters', verified: '8 Oct 2026' },
];

export const calibration = [
  { provider: 'Agnes', capability: 'Text', p50: '2.1 s', p90: '3.4 s', errors: '0%', limit: '10 RPM', tokens: '1.8K / call', ran: '14:02', ttl: '24 h', stale: false },
  { provider: 'Agnes', capability: 'Image 1K', p50: '14 s', p90: '31 s', errors: '4%', limit: '10 RPM', tokens: '—', ran: '14:02', ttl: '24 h', stale: false },
  { provider: 'Agnes', capability: 'Video', p50: '—', p90: '—', errors: '—', limit: '1 RPM', tokens: '—', ran: 'never', ttl: '—', stale: true },
  { provider: 'Sarvam', capability: 'STT (kn)', p50: '0.8 s', p90: '1.3 s', errors: '0%', limit: '60 RPM', tokens: '—', ran: '13:40', ttl: '24 h', stale: false },
];

export const usage = [
  { provider: 'Agnes', capability: 'Text', today: 214, unit: 'calls', detail: '386K tokens', listCost: 'Rs 4.10', actual: 'Rs 0', rateLimited: 3, cacheHits: 41 },
  { provider: 'Agnes', capability: 'Image', today: 12, unit: 'images', detail: '1K size', listCost: 'Rs 10.00', actual: 'Rs 0', rateLimited: 0, cacheHits: 4 },
  { provider: 'Sarvam', capability: 'STT', today: 38, unit: 'calls', detail: '11 min audio', listCost: 'Rs 5.50', actual: 'Rs 5.50', rateLimited: 0, cacheHits: 0 },
  { provider: 'Groq', capability: 'STT', today: 6000, unit: 'audio s this hour', detail: 'of 7,200', listCost: 'Rs 0', actual: 'Rs 0', rateLimited: 0, cacheHits: 0, warn: true },
];

export const bakeoffStt = [
  { provider: 'Local: faster-whisper', lang: 'kn', tokenAcc: '82%', wer: '24%', latency: '1.9 s' },
  { provider: 'Sarvam Saaras v4', lang: 'kn', tokenAcc: '96%', wer: '11%', latency: '0.8 s' },
  { provider: 'Groq whisper-large-v3', lang: 'kn', tokenAcc: '79%', wer: '27%', latency: '0.6 s' },
  { provider: 'Sarvam Saaras v4', lang: 'hi', tokenAcc: '97%', wer: '9%', latency: '0.7 s' },
  { provider: 'Local: faster-whisper', lang: 'en', tokenAcc: '98%', wer: '6%', latency: '1.2 s' },
];

export const bakeoffTts = [
  { provider: 'Local: Indic Parler-TTS', lang: 'kn', rating: 4.4, numbers: '20 / 20', latency: '2.6 s' },
  { provider: 'Sarvam Bulbul v3', lang: 'kn', rating: 4.1, numbers: '19 / 20', latency: '0.9 s' },
  { provider: 'Browser speech', lang: 'kn', rating: 2.3, numbers: '12 / 20', latency: '0.1 s' },
];

export const sampleSentences = [
  'Filter coffee twenty percent off, Saturday and Sunday.',
  'ಶನಿವಾರ ಭಾನುವಾರ ಬೆಳಿಗ್ಗೆ ಎಂಟರಿಂದ ಹನ್ನೊಂದು.',
  'Masala dosa one hundred and twenty rupees.',
];

export const sampleTranscript = {
  raw: 'Weekend filter coffee offer, ಇಪ್ಪತ್ತು ಪರ್ಸೆಂಟ್ off, Saturday Sunday, eight to eleven morning, dine-in only.',
  segments: [
    { text: 'Weekend filter coffee offer,', lang: 'en', conf: 0.94 },
    { text: 'ಇಪ್ಪತ್ತು ಪರ್ಸೆಂಟ್', lang: 'kn', conf: 0.81 },
    { text: 'off, Saturday Sunday, eight to eleven morning, dine-in only.', lang: 'en', conf: 0.92 },
  ],
  provider: 'Sarvam Saaras v4',
  latency_ms: 820,
};

export const changeExamples = {
  'make it sunday only': {
    say: 'Make it Sunday only',
    class: 'fact',
    field: 'days',
    from: 'Sat, Sun',
    to: 'Sun',
  },
  'make it more playful': {
    say: 'Make it more playful',
    class: 'tone',
    field: 'voice',
    from: 'Warm, neighbourly',
    to: 'Warm, playful',
  },
  'drop the posters': {
    say: 'Drop the posters',
    class: 'scope',
    field: 'channels',
    from: 'Instagram, WhatsApp, Poster',
    to: 'Instagram, WhatsApp',
  },
};
