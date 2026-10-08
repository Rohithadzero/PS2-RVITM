import { Search, Bell, Menu, Mic, Lock } from 'lucide-react';
import { owner } from '../data/mock';
import { useStore } from '../state/store';
import { SyncDot, ProviderChip } from './ui';

const greeting = () => {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
};

// AppShell top bar: page title, campaign name, facts version, sync dot and provider chip (docs/frontend.prd.md section 4).
const Navbar = ({ page, onSelect, onOpenMenu }) => {
  const { state, approvedFacts } = useStore();
  const isHome = page.slug === 'home';
  const pending = state.assets.filter((a) => a.status === 'pending' || a.status === 'blocked').length;

  return (
    <header className="flex flex-wrap items-start justify-between gap-4">
      <div className="flex min-w-0 items-start gap-2">
        <button type="button" aria-label="Open menu" onClick={onOpenMenu} className="-ml-2 grid size-10 shrink-0 place-items-center rounded-xl text-white/80 hover:bg-white/10 lg:hidden">
          <Menu size={20} />
        </button>
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold tracking-tight">{isHome ? `${greeting()}, ${owner.name} 👋` : page.label}</h1>
          <p className="mt-0.5 max-w-xl text-sm text-white/55">
            {isHome ? `${state.campaign.name} is live. ${pending} asset${pending === 1 ? '' : 's'} need you.` : page.description}
          </p>
          <div className="mt-2.5 flex flex-wrap items-center gap-2">
            <span className="rounded-full bg-white/10 px-2.5 py-1 text-xs font-medium text-white/80">{state.campaign.name}</span>
            <span className="inline-flex items-center gap-1 rounded-full bg-white/10 px-2.5 py-1 text-xs font-medium text-white/80">
              <Lock size={11} className="text-accent" /> Facts v{approvedFacts.version} approved
            </span>
            <ProviderChip name="Agnes, free tier" />
            <SyncDot state={state.sync} />
          </div>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <label className="hidden h-10 w-60 items-center gap-2 rounded-full bg-black/25 px-4 text-white/50 ring-1 ring-white/10 focus-within:ring-accent md:flex">
          <Search size={16} className="shrink-0" />
          <input type="search" placeholder="Search assets, customers…" className="w-full bg-transparent text-sm text-white placeholder:text-white/40 focus:outline-none" />
        </label>
        <button
          type="button"
          onClick={() => onSelect('change')}
          aria-label="Change something by voice"
          title="Change something by voice"
          className="grid size-10 place-items-center rounded-full bg-accent text-white transition-transform hover:scale-105"
        >
          <Mic size={18} />
        </button>
        <button
          type="button"
          onClick={() => onSelect('log')}
          aria-label={`Notifications, ${pending} pending`}
          className="relative grid size-10 place-items-center rounded-full bg-black/25 text-white/70 ring-1 ring-white/10 transition-colors hover:text-white"
        >
          <Bell size={18} />
          {pending > 0 && <span className="absolute right-2.5 top-2.5 size-2 rounded-full bg-accent ring-2 ring-panel" />}
        </button>
      </div>
    </header>
  );
};

export default Navbar;
