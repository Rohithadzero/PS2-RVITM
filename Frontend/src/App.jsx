import { useCallback, useEffect, useState } from 'react';
import Backdrop from './components/Backdrop.jsx';
import { MotionConfig, motion } from 'framer-motion';
import Navbar from './components/Navbar';
import Sidebar from './components/Sidebar';
import BottomNav from './components/BottomNav';
import RightPanel from './components/dashboard/RightPanel';
import Home from './pages/Home';
import Agent from './pages/Agent';
import Replies from './pages/Replies';
import Insights from './pages/Insights';
import Connections from './pages/Connections';
import Memory from './pages/Memory';
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
import { useAuth } from './lib/auth';
import Walkthrough from './components/tour/Walkthrough';

const SCREENS = {
  home: Home,
  agent: Agent,
  replies: Replies,
  insights: Insights,
  connections: Connections,
  memory: Memory,
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
  const { me, loading, logout } = useAuth();
  const { slug, param } = useRoute();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [summaryOpen, setSummaryOpen] = useState(false);
  const [expanded, setExpanded] = useState(readExpanded);

  useEffect(() => {
    try {
      localStorage.setItem('sidebar-expanded', expanded ? '1' : '0');
    } catch {
      // Storage blocked: the sidebar just starts collapsed next time.
    }
  }, [expanded]);

  // Links inside the summary drawer change the route; the drawer should not stay over the new page.
  useEffect(() => {
    setSummaryOpen(false);
  }, [slug, param]);

  useEffect(() => {
    if (me?.signed_in && slug === 'login') navigate('home');
  }, [me?.signed_in, slug]);

  const closeSummary = useCallback(() => setSummaryOpen(false), []);

  const select = (next) => {
    if (next === 'logout') {
      logout().then(() => navigate('login'));
      return;
    }
    navigate(next);
  };

  if (loading) {
    return <Backdrop />;
  }

  // The server says whether login is required. Without it the app stays open for local work.
  const needLogin = me.require_login && !me.signed_in;
  if (needLogin || (slug === 'login' && !me.signed_in)) {
    return (
      <MotionConfig reducedMotion="user">
        <Login reason={slug === 'login' ? param : undefined} />
      </MotionConfig>
    );
  }

  const page = findPage(slug) ?? pages.home;
  const Screen = SCREENS[page.slug];

  return (
    <MotionConfig reducedMotion="user">
      <Backdrop />
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
            <Navbar page={page} onSelect={select} onOpenMenu={() => setMobileOpen(true)} onOpenSummary={() => setSummaryOpen(true)} />
            <motion.div
              key={`${page.slug}/${param ?? ''}`}
              className="mt-6"
              initial={{ opacity: 0, y: 14, scale: 0.985, filter: 'blur(10px)' }}
              animate={{ opacity: 1, y: 0, scale: 1, filter: 'blur(0px)', transitionEnd: { filter: 'none', transform: 'none' } }}
              transition={{ type: 'spring', stiffness: 260, damping: 28, mass: 0.9 }}
            >
              <Screen key={param} id={param} />
            </motion.div>
          </main>
          <BottomNav active={page.slug} onSelect={select} />
        </div>

        <RightPanel drawerOpen={summaryOpen} onCloseDrawer={closeSummary} />
      </div>
      <Walkthrough user={me.user} />
    </MotionConfig>
  );
};

export default App;
