import {
  House,
  Mic,
  ShieldCheck,
  Scale,
  Loader,
  LayoutGrid,
  FileText,
  GitCompareArrows,
  MessageSquareDiff,
  History,
  Users,
  Store,
  Settings,
  FlaskConical,
  LogOut,
} from 'lucide-react';

// Screens from docs/screen-flow.md. `slug` is the URL hash (#/board).
export const pages = {
  home: { slug: 'home', screen: 'S2', label: 'Home', icon: House, description: 'Your campaigns and what needs you next.' },
  voice: { slug: 'voice', screen: 'S3', label: 'Voice Brief', icon: Mic, description: 'Say your idea. Fix any word before it becomes an offer.' },
  facts: { slug: 'facts', screen: 'S4', label: 'Offer Facts', icon: ShieldCheck, description: 'The only facts any asset can contain. Approve them after the read-back.' },
  planner: { slug: 'planner', screen: 'S5', label: 'Budget Planner', icon: Scale, description: 'Pick what you want. See what fits your time, money and review effort.' },
  generating: { slug: 'generating', screen: 'S6', label: 'Generating', icon: Loader, description: 'Live queue for every asset. Finished assets open while others run.' },
  board: { slug: 'board', screen: 'S7', label: 'Campaign Board', icon: LayoutGrid, description: 'Every asset by audience, language and channel.' },
  asset: { slug: 'asset', screen: 'S8', label: 'Asset Detail', icon: FileText, description: 'Preview, validator report, back-translation and history.' },
  compare: { slug: 'compare', screen: 'S9', label: 'Compare & Optimize', icon: GitCompareArrows, description: 'Blind pairwise comparison with repeats, plus votes from native speakers.' },
  change: { slug: 'change', screen: 'S10', label: 'Change by Voice', icon: MessageSquareDiff, description: 'Say a change. See exactly which assets it touches before it runs.' },
  log: { slug: 'log', screen: 'S11', label: 'Change Log', icon: History, description: 'What changed, who changed it, why, and what is still pending.' },
  customers: { slug: 'customers', screen: 'S12', label: 'Customers & Send', icon: Users, description: 'Consent per channel, language per customer, and a simulated send.' },
  brand: { slug: 'brand', screen: 'S1', label: 'Brand & Data', icon: Store, description: 'Menu, photos, sample posts, customers and your brand rules. Set once, used in every campaign.' },
  settings: { slug: 'settings', screen: 'S13', label: 'Settings', icon: Settings, description: 'Providers and keys, voice, limits, calibration, usage and data.' },
  bakeoff: { slug: 'bakeoff', screen: 'S14', label: 'Bake-off', icon: FlaskConical, description: 'Team tool: score speech-to-text and read-back voices per language.' },
};

export const sidebarGroups = [
  { title: 'Overview', items: [pages.home] },
  { title: 'Create', items: [pages.voice, pages.facts, pages.planner, pages.generating] },
  { title: 'Campaign', items: [pages.board, pages.compare, pages.change, pages.log, pages.customers] },
  { title: 'Setup', items: [pages.brand, pages.settings, pages.bakeoff] },
];

export const logoutItem = { slug: 'logout', label: 'Log out', icon: LogOut };

// Bottom pill: the main flow in order (docs/screen-flow.md section 2).
export const flowSteps = [
  { slug: 'voice', label: 'Brief', icon: Mic },
  { slug: 'facts', label: 'Facts', icon: ShieldCheck },
  { slug: 'planner', label: 'Plan', icon: Scale },
  { slug: 'generating', label: 'Generate', icon: Loader },
  { slug: 'board', label: 'Board', icon: LayoutGrid },
];

export const findPage = (slug) => pages[slug];
