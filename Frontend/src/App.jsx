import { useEffect, useState } from 'react';
import { MotionConfig } from 'framer-motion';
import Navbar from './components/Navbar';
import Sidebar from './components/Sidebar';
import BottomNav from './components/BottomNav';
import RightPanel from './components/dashboard/RightPanel';
import Home from './pages/Home';
import Agent from './pages/Agent';
import Replies from './pages/Replies';
import Talk from './pages/Talk';
import Plan from './pages/Plan';
import Campaign from './pages/Campaign';
import Dashboard from './pages/Dashboard';
import BudgetPlanner from './pages/BudgetPlanner';
import ChangeByVoice from './pages/ChangeByVoice';
import ChangeLog from './pages/ChangeLog';
import Customers from './pages/Customers';
import BrandData from './pages/BrandData';
import Settings from './pages/Settings';
import Bakeoff from './pages/Bakeoff';
import Login from './pages/Login';
import Studio from './pages/Studio';
import Launch from './pages/Launch';
import Identity from './pages/Identity';
import Website from './pages/Website';
import Video from './pages/Video';
import { findPage, pages } from './navigation';
import { useRoute, navigate } from './lib/router';
import { useStore } from './state/store';

const SCREENS = {
  home: Home,
  agent: Agent,
  replies: Replies,
  voice: Talk,
  plan: Plan,
  planner: BudgetPlanner,
  campaign: Campaign,
  dashboard: Dashboard,
  change: ChangeByVoice,
  log: ChangeLog,
  customers: Customers,
  brand: BrandData,
  settings: Settings,
  bakeoff: Bakeoff,
  studio: Studio,
  launch: Launch,
  identity: Identity,
  website: Website,
  video: Video,
};

const readExpanded = () => {
  try {
    return localStorage.getItem('sidebar-expanded') === '1';
  } catch {
    return false;
  }
};

const App = () => {
  const { state, dispatch } = useStore();
  const { slug, param } = useRoute();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [expanded, setExpanded] = useState(readExpanded);

  useEffect(() => {
    try {
      localStorage.setItem('sidebar-expanded', expanded ? '1' : '0');
    } catch {
      // Storage blocked: the sidebar just starts collapsed next time.
    }
  }, [expanded]);

  const select = (next) => {
    if (next === 'logout') {
      dispatch({ type: 'SIGN_OUT' });
      navigate('login');
      return;
    }
    navigate(next);
  };

  if (!state.signedIn || slug === 'login') {
    return (
      <MotionConfig reducedMotion="user">
        <Login />
      </MotionConfig>
    );
  }

  const page = findPage(slug) ?? pages.home;
  const Screen = SCREENS[page.slug];
  const isHome = page.slug === 'home';

  return (
    <MotionConfig reducedMotion="user">
      <div className="app-backdrop" aria-hidden="true" />
      <div className="flex min-h-dvh gap-4 p-3 sm:p-4 lg:h-dvh">
        <Sidebar
          active={page.slug}
          onSelect={select}
          expanded={expanded}
          onToggle={() => setExpanded((v) => !v)}
          mobileOpen={mobileOpen}
          onCloseMobile={() => setMobileOpen(false)}
          badges={{}}
        />

        <div className="glass-panel relative flex min-w-0 flex-1 flex-col rounded-[28px]">
          <main className="flex-1 overflow-y-auto p-4 pb-24 sm:p-6 sm:pb-24">
            <Navbar page={page} onSelect={select} onOpenMenu={() => setMobileOpen(true)} />
            <div className="mt-6">
              <Screen key={param} id={param} />
            </div>
          </main>
          <BottomNav active={page.slug} onSelect={select} />
        </div>

        {isHome && <RightPanel />}
      </div>
    </MotionConfig>
  );
};

export default App;
