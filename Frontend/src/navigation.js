import { NO_BACKEND } from './data/studio';
import {
  House,
  Mic,
  ShieldCheck,
  Scale,
  LayoutGrid,
  FileText,
  MessageSquareDiff,
  ChartNoAxesColumn,
  Bot,
  History,
  Users,
  Store,
  Settings,
  FlaskConical,
  LogOut,
  Sparkles,
  Rocket,
  Palette,
  Globe,
  Clapperboard,
} from 'lucide-react';

// Screens from docs/screen-flow.md. `slug` is the URL hash (#/board).
export const pages = {
  home: { slug: 'home', screen: 'S2', label: 'Home', icon: House, description: 'Your campaigns and what needs you next.' },
  agent: { slug: 'agent', screen: 'S20', label: 'Agent', icon: Bot, description: 'Describe your idea once. The agent plans the work, does what it can and stops at the steps that need you.' },
  voice: { slug: 'voice', screen: 'S3', label: 'Talk', icon: Mic, description: 'Answer a few questions by voice or tap. Every answer is kept with your own words.' },
  plan: { slug: 'plan', screen: 'S4', label: 'Plan', icon: ShieldCheck, description: 'What you said, as a plan. Each line shows its source and the schedule is worked out by rule.' },
  campaign: { slug: 'campaign', screen: 'S7', label: 'Campaign 0', icon: LayoutGrid, description: 'Every asset shown as the surface it will appear on, with its fact and meaning checks.' },
  dashboard: { slug: 'dashboard', screen: 'S9', label: 'Dashboard', icon: ChartNoAxesColumn, description: 'Sends, clicks and checks. Every number comes from this app.' },
  planner: { slug: 'planner', screen: 'S5', label: 'Budget Planner', icon: Scale, description: 'Pick what you want. See what fits your time, money and review effort.' },
  change: { slug: 'change', screen: 'S10', label: 'Change by Voice', icon: MessageSquareDiff, description: 'Say a change. See exactly which assets it touches before it runs.' },
  log: { slug: 'log', screen: 'S11', label: 'Change Log', icon: History, description: 'What changed, who changed it, why, and what is still pending.' },
  customers: { slug: 'customers', screen: 'S12', label: 'Customers & Send', icon: Users, description: 'Consent per channel, language per customer, and a simulated send.' },
  brand: { slug: 'brand', screen: 'S1', label: 'Brand & Data', icon: Store, description: 'Menu, photos, sample posts, customers and your brand rules. Set once, used in every campaign.' },
  settings: { slug: 'settings', screen: 'S13', label: 'Settings', icon: Settings, description: 'Your own Agnes keys, offline voice and the numbers the planner uses.' },
  studio: { slug: 'studio', screen: 'S15', label: 'Studio', icon: Sparkles, description: 'Posts, posters, taglines, a website, a reel. Pick what you want made.' },
  launch: { slug: 'launch', screen: 'S16', label: 'Build my business', icon: Rocket, description: 'No business yet? Answer a few questions and get ideas, a name, a brand and a launch pack.' },
  identity: { slug: 'identity', screen: 'S17', label: 'Names & Brand look', icon: Palette, description: 'Business names, taglines in each language, colours and starter logos.' },
  website: { slug: 'website', screen: 'S18', label: 'Website', icon: Globe, description: 'A one-page site from your menu, offer and brand. Preview it here.' },
  video: { slug: 'video', screen: 'S19', label: 'Reels & Video', icon: Clapperboard, description: 'Plan a short promo reel: shots, length, cost and queue time.' },
  bakeoff: { slug: 'bakeoff', screen: 'S14', label: 'Bake-off', icon: FlaskConical, description: 'Team tool: score speech-to-text and read-back voices per language.' },
};

export const sidebarGroups = [
  { title: 'Overview', items: [pages.home] },
  { title: 'Studio', items: [pages.studio, pages.launch, pages.identity, pages.website, pages.video] },
  { title: 'Campaign', items: [pages.agent, pages.voice, pages.plan, pages.planner, pages.campaign, pages.dashboard] },
  { title: 'Manage', items: [pages.change, pages.log, pages.customers] },
  { title: 'Setup', items: [pages.brand, pages.settings, pages.bakeoff] },
];

export const logoutItem = { slug: 'logout', label: 'Log out', icon: LogOut };

// Bottom pill: the main flow in order (docs/screen-flow.md section 2).
export const flowSteps = [
  { slug: 'voice', label: 'Talk', icon: Mic },
  { slug: 'plan', label: 'Plan', icon: ShieldCheck },
  { slug: 'campaign', label: 'Campaign 0', icon: LayoutGrid },
  { slug: 'dashboard', label: 'Dashboard', icon: ChartNoAxesColumn },
];

export const findPage = (slug) => pages[slug];

export const hasBackend = (slug) => !NO_BACKEND.includes(slug);
