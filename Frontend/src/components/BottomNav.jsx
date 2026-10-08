import { motion } from 'framer-motion';
import { flowSteps } from '../navigation';

// Floating pill with the main flow: Brief, Facts, Plan, Generate, Board.
// Doubles as the phone bottom bar (docs/frontend.prd.md section 2).
const BottomNav = ({ active, onSelect }) => (
  <nav aria-label="Campaign steps" className="fixed bottom-4 left-1/2 z-40 -translate-x-1/2 lg:absolute">
    <ol className="flex items-center gap-0.5 rounded-full bg-neutral-900/85 p-1 ring-1 ring-white/10 backdrop-blur-xl">
      {flowSteps.map(({ slug, label, icon: Icon }) => {
        const isActive = active === slug || (slug === 'board' && active === 'asset');
        return (
          <li key={slug}>
            <button
              type="button"
              onClick={() => onSelect(slug)}
              aria-current={isActive ? 'step' : undefined}
              aria-label={label}
              className={`relative flex h-9 items-center gap-2 rounded-full px-3 text-sm font-medium transition-colors ${isActive ? 'text-white' : 'text-white/60 hover:text-white'}`}
            >
              {isActive && (
                <motion.span layoutId="bottom-nav-pill" className="absolute inset-0 rounded-full bg-accent" transition={{ type: 'spring', stiffness: 420, damping: 34 }} />
              )}
              <Icon size={16} className="relative shrink-0" />
              <span className={`relative whitespace-nowrap ${isActive ? '' : 'hidden md:inline'}`}>{label}</span>
            </button>
          </li>
        );
      })}
    </ol>
  </nav>
);

export default BottomNav;
