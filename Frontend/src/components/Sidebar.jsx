import { motion, AnimatePresence } from 'framer-motion';
import { AudioLines, ChevronRight, ChevronLeft, Plus, X } from 'lucide-react';
import { sidebarGroups, logoutItem } from '../navigation';

const RAIL = 64;
const EXPANDED = 236;

const Brand = ({ showName }) => (
  <div className="flex items-center gap-1">
    <span className="grid size-10 shrink-0 place-items-center text-accent" aria-hidden="true">
      <AudioLines size={22} strokeWidth={2.4} />
    </span>
    {showName && <span className="whitespace-nowrap text-base font-semibold">Tell it once</span>}
  </div>
);

const Tooltip = ({ children }) => (
  <span
    role="tooltip"
    className="pointer-events-none absolute left-full top-1/2 z-50 ml-3 -translate-y-1/2 whitespace-nowrap rounded-lg bg-neutral-900 px-2.5 py-1 text-xs font-medium text-white opacity-0 shadow-lg ring-1 ring-white/10 transition-opacity group-hover:opacity-100 group-has-[:focus-visible]:opacity-100"
  >
    {children}
  </span>
);

const NavButton = ({ item, active, expanded, onSelect, badge, accent = false }) => {
  const Icon = item.icon;
  return (
    <div className="group relative">
      <button
        type="button"
        onClick={() => onSelect(item.slug)}
        aria-label={expanded ? undefined : badge ? `${item.label}, ${badge} need you` : item.label}
        aria-current={active ? 'page' : undefined}
        className={`relative flex items-center rounded-xl text-sm font-medium transition-colors ${
          expanded ? 'h-10 w-full gap-3 px-3' : 'rail-btn justify-center'
        } ${
          accent
            ? 'rounded-full bg-accent text-white hover:bg-accent/90'
            : active
              ? 'bg-accent text-white shadow-[0_8px_18px_-8px_rgb(242_107_29/0.9)]'
              : 'text-white/60 hover:bg-white/10 hover:text-white'
        }`}
      >
        <Icon size={18} className="shrink-0" />
        {expanded && <span className="truncate">{item.label}</span>}
        {badge && expanded && (
          <span className={`ml-auto rounded-md px-1.5 text-xs font-semibold ${active ? 'bg-white/20' : 'bg-accent/20 text-accent'}`}>{badge}</span>
        )}
        {badge && !expanded && !active && <span className="absolute right-1.5 top-1.5 size-2 rounded-full bg-accent ring-2 ring-panel" />}
      </button>
      {!expanded && <Tooltip>{item.label}</Tooltip>}
    </div>
  );
};

const NavList = ({ active, onSelect, expanded, badges }) => (
  <nav aria-label="Main" className={`flex flex-1 flex-col gap-1 ${expanded ? 'items-stretch' : 'items-center'}`}>
    {sidebarGroups.map((group, index) => (
      <div key={group.title} className={`flex flex-col gap-1 ${expanded ? 'items-stretch' : 'items-center'}`}>
        {expanded ? (
          index > 0 && <p className="mt-3 px-3 pb-1 text-xs font-medium text-white/40">{group.title}</p>
        ) : (
          index > 0 && <span aria-hidden="true" className="my-1.5 h-px w-6 bg-white/10" />
        )}
        {group.items.map((item) => (
          <NavButton
            key={item.slug}
            item={item}
            active={active === item.slug || (item.slug === 'board' && active === 'asset')}
            expanded={expanded}
            onSelect={onSelect}
            badge={badges[item.slug]}
          />
        ))}
      </div>
    ))}
  </nav>
);

const Footer = ({ expanded, onSelect }) => (
  <div className={`flex flex-col gap-1 ${expanded ? 'items-stretch' : 'items-center'}`}>
    <NavButton item={{ slug: 'voice', label: 'New campaign', icon: Plus }} expanded={expanded} onSelect={onSelect} accent />
    <span aria-hidden="true" className="h-1" />
    <NavButton item={logoutItem} expanded={expanded} onSelect={onSelect} />
  </div>
);

const Rail = ({ active, onSelect, expanded, onToggle, badges }) => (
  // z-30 keeps tooltips above the main panel, which has its own stacking context from backdrop-filter.
  <motion.aside
    initial={false}
    animate={{ width: expanded ? EXPANDED : RAIL }}
    transition={{ type: 'spring', stiffness: 320, damping: 34 }}
    className={`glass-panel relative z-30 hidden shrink-0 flex-col py-3 lg:flex ${expanded ? 'rounded-[28px] px-3' : 'items-center rounded-full'}`}
  >
    <Brand showName={expanded} />

    <button
      type="button"
      onClick={onToggle}
      aria-label={expanded ? 'Collapse sidebar' : 'Expand sidebar'}
      aria-expanded={expanded}
      className="absolute -right-3.5 top-14 z-10 grid size-7 place-items-center rounded-full bg-accent text-white shadow-lg ring-4 ring-[#3a2c22]/60 transition-transform hover:scale-110"
    >
      {expanded ? <ChevronLeft size={15} strokeWidth={2.5} /> : <ChevronRight size={15} strokeWidth={2.5} />}
    </button>

    <div className={`mt-4 flex min-h-0 flex-1 flex-col ${expanded ? '-mx-1 overflow-y-auto px-1' : ''}`}>
      <NavList active={active} onSelect={onSelect} expanded={expanded} badges={badges} />
    </div>
    <div className="mt-3">
      <Footer expanded={expanded} onSelect={onSelect} />
    </div>
  </motion.aside>
);

const Drawer = ({ active, onSelect, onClose, badges }) => (
  <div className="fixed inset-0 z-[60] lg:hidden">
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose} className="absolute inset-0 bg-black/50 backdrop-blur-sm" />
    <motion.aside
      initial={{ x: '-100%' }}
      animate={{ x: 0 }}
      exit={{ x: '-100%' }}
      transition={{ type: 'spring', stiffness: 360, damping: 38 }}
      className="absolute inset-y-0 left-0 w-[min(18rem,85vw)] p-3"
    >
      <div className="glass-panel flex h-full flex-col rounded-3xl p-3">
        <div className="flex items-center justify-between">
          <Brand showName />
          <button type="button" onClick={onClose} aria-label="Close menu" className="grid size-10 place-items-center rounded-xl text-white/70 hover:bg-white/10 hover:text-white">
            <X size={20} />
          </button>
        </div>
        <div className="mt-3 flex-1 overflow-y-auto">
          <NavList active={active} onSelect={onSelect} expanded badges={badges} />
        </div>
        <div className="border-t border-white/10 pt-3">
          <Footer expanded onSelect={onSelect} />
        </div>
      </div>
    </motion.aside>
  </div>
);

const Sidebar = ({ active, onSelect, expanded, onToggle, mobileOpen, onCloseMobile, badges = {} }) => {
  const selectAndClose = (slug) => {
    onSelect(slug);
    onCloseMobile();
  };

  return (
    <>
      <Rail active={active} onSelect={onSelect} expanded={expanded} onToggle={onToggle} badges={badges} />
      <AnimatePresence>{mobileOpen && <Drawer active={active} onSelect={selectAndClose} onClose={onCloseMobile} badges={badges} />}</AnimatePresence>
    </>
  );
};

export default Sidebar;
