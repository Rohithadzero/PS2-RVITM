// Mock data for the Studio, Business Builder, Identity, Website, Video and Build-status screens.
// EVERYTHING here is placeholder content. The real generation comes from services (see readiness below); the
// shapes mirror the contracts in docs/api-spec.md "Planned services".

// Screens with no backend behind them yet. The sidebar greys these out (they stay clickable so the team can build
// against them). Remove a slug from this list when its backend is wired.
export const NO_BACKEND = ['brand', 'bakeoff', 'identity', 'website', 'video'];

// What the studio can make. `pipeline` says which flow produces it.
export const DELIVERABLES = [
  { id: 'post', label: 'Social posts', desc: 'Instagram captions in your languages, checked against your facts.', pipeline: 'campaign', channel: 'instagram', slug: 'voice' },
  { id: 'whatsapp', label: 'WhatsApp messages', desc: 'Short broadcast text per customer language.', pipeline: 'campaign', channel: 'whatsapp', slug: 'voice' },
  { id: 'poster', label: 'Posters', desc: 'Your photo or a generated background, text stamped by code.', pipeline: 'campaign', channel: 'poster', slug: 'voice' },
  { id: 'tagline', label: 'Names & taglines', desc: 'Business name ideas and taglines in each language, with a native review flag.', pipeline: 'identity', slug: 'identity' },
  { id: 'brandkit', label: 'Brand kit', desc: 'Colours (contrast checked), starter logo marks, voice and banned words.', pipeline: 'identity', slug: 'identity' },
  { id: 'website', label: 'Website', desc: 'One-page site with menu, offer, map and a WhatsApp button.', pipeline: 'website', slug: 'website' },
  { id: 'reel', label: 'Promo reel', desc: '4 to 12 second clips for Reels and Shorts.', pipeline: 'video', slug: 'video' },
  { id: 'plan', label: 'Business plan', desc: 'For people starting from zero: ideas, costs, first-month launch checklist.', pipeline: 'launch', slug: 'launch' },
];

// Pipelines that have a backend (the rest are greyed out in the UI).
export const PIPELINES = {
  campaign: { label: 'Campaign pipeline', backend: true },
  identity: { label: 'Names and brand look', backend: false },
  website: { label: 'Website', backend: false },
  video: { label: 'Reels and video', backend: false },
  launch: { label: 'Build my business', backend: true },
};

// ---- Business builder (no business yet) -----------------------------------------------------------------------
export const LAUNCH_STEPS = ['About you', 'Ideas', 'Name & tagline', 'Brand look', 'Offer & prices', 'Launch pack'];

export const SKILLS = [
  { id: 'cook', label: 'Cooking / baking' }, { id: 'craft', label: 'Crafts / art' }, { id: 'tech', label: 'Tech / design' },
  { id: 'teach', label: 'Teaching / coaching' }, { id: 'sell', label: 'Selling / people' }, { id: 'drive', label: 'Driving / delivery' },
  { id: 'fit', label: 'Fitness / wellness' }, { id: 'tailor', label: 'Tailoring / repair' },
];

export const BUDGETS = [
  { id: 'lt10k', label: 'Under Rs 10,000' }, { id: '10to50k', label: 'Rs 10,000 to 50,000' }, { id: '50kto2l', label: 'Rs 50,000 to 2 lakh' }, { id: 'gt2l', label: 'Over 2 lakh' },
];

// Example output only. The planner agent will generate these from the answers; figures are illustrative, not advice.
export const IDEAS = [
  {
    id: 'tiffin', title: 'Home-style tiffin and snack subscription', fit: ['cook', 'sell'],
    why: 'Low set-up cost, repeat customers, works from a home kitchen, sells well on WhatsApp.',
    startup: 'Rs 8,000 to 25,000 (containers, ingredients, basic licence)', firstMonth: 'Aim: 15 regular subscribers',
    risks: ['Food licence (FSSAI) needed', 'Consistent quality and timing'], channels: ['WhatsApp', 'Instagram'],
  },
  {
    id: 'kiosk', title: 'Filter coffee and snacks kiosk', fit: ['cook', 'sell'],
    why: 'Strong daily footfall near offices and colleges; easy to run offers on weekends.',
    startup: 'Rs 60,000 to 1.5 lakh (counter, equipment, deposit)', firstMonth: 'Aim: 80 cups a day by week 4',
    risks: ['Location and rent', 'Licences and permissions'], channels: ['Instagram', 'Poster', 'WhatsApp'],
  },
  {
    id: 'craft', title: 'Custom gifts and festival hampers (online)', fit: ['craft', 'tech', 'sell'],
    why: 'Sells on Instagram with photos, can start with no shop, seasonal peaks around festivals.',
    startup: 'Rs 5,000 to 20,000 (materials, packaging, photos)', firstMonth: 'Aim: 20 orders around the next festival',
    risks: ['Seasonal demand', 'Delivery and returns'], channels: ['Instagram', 'WhatsApp', 'Website'],
  },
];

export const NAME_IDEAS = {
  tiffin: ['Ammanu Kitchen', 'Dabba Wali', 'Mane Ruchi', 'Daily Thali Co.'],
  kiosk: ['Kaapi Corner', 'Chai & Kaapi Stop', 'Filter Fix', 'Brew Bandi'],
  craft: ['Gift Gully', 'Hamper House', 'Made With Love Co.', 'Thoughtful Box'],
};

// Taglines per language. hi and kn are DRAFTS and must be reviewed by native speakers before use.
export const TAGLINES = [
  { id: 't1', en: 'Fresh, local, made for you.', hi: 'ताज़ा, अपना, आपके लिए।', kn: 'ತಾಜಾ, ನಮ್ಮದು, ನಿಮಗಾಗಿ.' },
  { id: 't2', en: 'The taste of home, every day.', hi: 'घर का स्वाद, हर दिन।', kn: 'ಮನೆಯ ರುಚಿ, ಪ್ರತಿದಿನ.' },
  { id: 't3', en: 'Small batches, big flavour.', hi: 'थोड़ा-थोड़ा बनाया, पूरा स्वाद।', kn: 'ಕಡಿಮೆ ಪ್ರಮಾಣ, ಹೆಚ್ಚು ರುಚಿ.' },
  { id: 't4', en: 'Your neighbourhood favourite.', hi: 'आपके मोहल्ले की पसंद।', kn: 'ನಿಮ್ಮ ಏರಿಯಾದ ಮೆಚ್ಚಿನದು.' },
];
export const MORE_TAGLINES = [
  { id: 't5', en: 'Warm cups, warm welcome.', hi: 'गरम चाय, गर्मजोशी भरा स्वागत।', kn: 'ಬಿಸಿ ಕಾಫಿ, ಆತ್ಮೀಯ ಸ್ವಾಗತ.' },
  { id: 't6', en: 'Good food, no fuss.', hi: 'अच्छा खाना, बिना झंझट।', kn: 'ಒಳ್ಳೆಯ ಊಟ, ಯಾವ ತೊಂದರೆಯೂ ಇಲ್ಲ.' },
];

export const PALETTES = [
  { id: 'p1', name: 'Warm coffee', bg: '#fff7ef', ink: '#2b1d14', accent: '#c4561a', soft: '#fde3cf' },
  { id: 'p2', name: 'Fresh leaf', bg: '#f4fbf2', ink: '#16301f', accent: '#1f7a3d', soft: '#d8f0dc' },
  { id: 'p3', name: 'Evening plum', bg: '#faf4fb', ink: '#2a1730', accent: '#8a2d8c', soft: '#efd9f1' },
  { id: 'p4', name: 'Sea blue', bg: '#f1f8fc', ink: '#10283a', accent: '#1565a8', soft: '#d6e9f6' },
];

export const FONT_PAIRS = [
  { id: 'f1', label: 'Friendly: Poppins + Noto Sans Kannada', heading: 'Poppins', body: 'Noto Sans Kannada' },
  { id: 'f2', label: 'Classic: Playfair Display + Noto Sans', heading: 'Playfair Display', body: 'Noto Sans' },
  { id: 'f3', label: 'Clean: Inter + Noto Sans Devanagari', heading: 'Inter', body: 'Noto Sans Devanagari' },
];

export const SITE_SECTIONS = [
  { id: 'hero', label: 'Hero with offer', on: true, note: 'Name, tagline and the current approved offer' },
  { id: 'menu', label: 'Menu and prices', on: true, note: 'From your price list; prices are always the locked values' },
  { id: 'about', label: 'About us', on: true, note: 'Short story in your languages' },
  { id: 'gallery', label: 'Photo gallery', on: true, note: 'Your uploaded photos' },
  { id: 'hours', label: 'Hours and location', on: true, note: 'Map link and opening hours' },
  { id: 'whatsapp', label: 'WhatsApp order button', on: true, note: 'Opens a chat with your number' },
  { id: 'reviews', label: 'Customer reviews', on: false, note: 'Only real reviews you add; never invented' },
];

export const SHOT_TEMPLATES = [
  { id: 's1', label: 'Hook: steaming cup close-up', seconds: 4 },
  { id: 's2', label: 'Product: pour and plate', seconds: 4 },
  { id: 's3', label: 'Offer card with approved price', seconds: 4 },
  { id: 's4', label: 'Call to action: visit and WhatsApp', seconds: 4 },
];

// Example job states for the video tracker (what the video service will report: queued / in_progress / completed / failed).
export const VIDEO_STATES = ['queued', 'in_progress', 'completed', 'failed'];

export const LAUNCH_PACK = [
  { id: 'name', label: 'Business name and taglines', deliverable: 'tagline', slug: 'identity' },
  { id: 'brand', label: 'Brand kit: colours, starter logo, voice', deliverable: 'brandkit', slug: 'identity' },
  { id: 'menu', label: 'Menu and price list', deliverable: null, slug: 'brand' },
  { id: 'posts', label: 'Opening-week posts (Instagram, WhatsApp)', deliverable: 'post', slug: 'voice' },
  { id: 'poster', label: 'Opening poster', deliverable: 'poster', slug: 'voice' },
  { id: 'site', label: 'One-page website', deliverable: 'website', slug: 'website' },
  { id: 'reel', label: 'Launch reel', deliverable: 'reel', slug: 'video' },
];
