import { useCallback, useEffect, useRef, useState } from 'react';
import { Bell, Check, ChevronDown, Heart, Mail, ShoppingBag, Sparkles, UserMinus, X, Info } from 'lucide-react';
import { api } from '../campaign/lib/api';
import { navigate } from '../lib/router';

const send = (method, path) => api(path, { method });
const ICON = { order: ShoppingBag, engagement: Heart, schedule: Mail, customer: UserMinus, system: Info };

const ago = (iso) => {
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  return `${Math.floor(s / 86400)} d ago`;
};

// The name chip at the top right. It opens what GrowIt wants a yes on, and what has happened: orders from the website, likes and
// shares on Instagram, scheduled emails, reminders, customers who unsubscribed.
const NotificationsMenu = ({ user }) => {
  const [open, setOpen] = useState(false);
  const [feed, setFeed] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const root = useRef(null);
  const button = useRef(null);

  const load = useCallback(async () => {
    try {
      setFeed(await api('/notifications'));
      setError('');
    } catch (e) {
      setError(e.message);
    }
  }, []);

  // The badge stays current while the page is open.
  useEffect(() => {
    load();
    const t = setInterval(() => { if (!document.hidden) load(); }, 60000);
    return () => clearInterval(t);
  }, [load]);

  // Opening the list also asks Instagram for fresh numbers (the server does this at most every ten minutes).
  useEffect(() => {
    if (open) send('POST', '/notifications/sync').catch(() => undefined).finally(load);
  }, [open, load]);

  useEffect(() => {
    if (!open) return undefined;
    const away = (e) => { if (!root.current?.contains(e.target)) setOpen(false); };
    const esc = (e) => { if (e.key === 'Escape') { setOpen(false); button.current?.focus(); } };
    document.addEventListener('pointerdown', away);
    document.addEventListener('keydown', esc);
    return () => { document.removeEventListener('pointerdown', away); document.removeEventListener('keydown', esc); };
  }, [open]);

  const act = async (fn) => {
    setBusy(true);
    try { await fn(); await load(); } catch (e) { setError(e.message); } finally { setBusy(false); }
  };
  const go = (page, id) => {
    if (id) send('POST', `/notifications/${id}/read`).then(load).catch(() => undefined);
    setOpen(false);
    if (page) navigate(page);
  };

  const badge = feed?.badge ?? 0;
  return (
    <div ref={root} className="relative">
      <button
        ref={button}
        type="button"
        aria-haspopup="dialog"
        aria-expanded={open}
        data-tour="notifications"
        onClick={() => setOpen((v) => !v)}
        aria-label={badge ? `Notifications, ${badge} new` : 'Notifications'}
        className="relative flex items-center gap-2 rounded-full bg-black/25 py-1 pl-1 pr-2.5 text-xs text-white/80 ring-1 ring-white/10 transition-colors hover:bg-black/35"
        title={user?.email}
      >
        {user?.picture ? (
          <img src={user.picture} alt="" referrerPolicy="no-referrer" className="size-8 rounded-full" />
        ) : (
          <span className="grid size-8 place-items-center rounded-full bg-accent text-sm font-semibold text-on-accent">{user?.name?.[0] ?? <Bell size={15} />}</span>
        )}
        {user?.name && <span className="hidden max-w-32 truncate sm:inline">{user.name.split(' ')[0]}</span>}
        <ChevronDown size={14} className={`transition-transform ${open ? 'rotate-180' : ''}`} />
        {badge > 0 && <span className="absolute -right-1 -top-1 grid min-w-[18px] place-items-center rounded-full bg-accent px-1 text-[10px] font-bold leading-[18px] text-on-accent ring-2 ring-[#2a2118]">{badge > 9 ? '9+' : badge}</span>}
      </button>

      {open && (
        <div role="dialog" aria-label="Notifications" className="cp-pop absolute right-0 top-full z-50 mt-2 w-[22rem] max-w-[calc(100vw-2rem)] overflow-hidden rounded-2xl text-white">
          <div className="max-h-[70vh] overflow-y-auto p-2">
            {error && <p role="alert" className="px-2 py-1.5 text-sm text-bad">{error}</p>}

            {feed?.suggestion_count > 0 && (
              <section aria-label="Suggestions from GrowIt" className="mb-2">
                <p className="flex items-center gap-1.5 px-2 pb-1 pt-1.5 text-[11px] font-semibold uppercase tracking-wide text-white/50"><Sparkles size={12} /> GrowIt suggests</p>
                <ul className="flex flex-col gap-1.5">
                  {feed.suggestions.map((s) => (
                    <li key={s.id} className="rounded-xl bg-white/8 p-2.5">
                      <p className="text-sm font-medium">{s.title}</p>
                      <p className="mt-0.5 line-clamp-2 text-xs text-white/60">{s.body}</p>
                      <div className="mt-2 flex gap-1.5">
                        <button type="button" disabled={busy} onClick={() => act(() => send('POST', `/memory/${s.id}/accept`))} className="inline-flex h-7 items-center gap-1 rounded-full bg-accent px-3 text-xs font-semibold text-on-accent"><Check size={12} /> Accept</button>
                        <button type="button" disabled={busy} onClick={() => act(() => send('POST', `/memory/${s.id}/dismiss`))} className="inline-flex h-7 items-center gap-1 rounded-full bg-white/10 px-3 text-xs font-medium hover:bg-white/20"><X size={12} /> Not right</button>
                      </div>
                    </li>
                  ))}
                </ul>
                {feed.suggestion_count > feed.suggestions.length && <p className="px-2 pt-1.5 text-xs text-white/50">{feed.suggestion_count - feed.suggestions.length} more waiting.</p>}
                <button type="button" onClick={() => go('insights')} className="mt-1 w-full rounded-lg px-2 py-1.5 text-left text-xs font-medium text-accent hover:bg-white/8">See all suggestions on Insights</button>
              </section>
            )}

            <section aria-label="Activity">
              <div className="flex items-center justify-between px-2 pb-1 pt-1.5">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-white/50">Activity</p>
                {feed?.unread > 0 && <button type="button" disabled={busy} onClick={() => act(() => send('POST', '/notifications/read-all'))} className="text-xs font-medium text-accent hover:underline">Mark all read</button>}
              </div>
              {feed && feed.items.length === 0 && <p className="px-2 py-4 text-sm text-white/55">Nothing yet. Orders from your website, likes and shares on Instagram, and scheduled emails will show up here.</p>}
              <ul className="flex flex-col">
                {feed?.items.map((n) => {
                  const Icon = ICON[n.kind] || Info;
                  return (
                    <li key={n.id}>
                      <button type="button" onClick={() => go(n.page, n.read ? null : n.id)} className="flex w-full items-start gap-2.5 rounded-xl px-2 py-2 text-left hover:bg-white/8">
                        <span className={`mt-0.5 grid size-7 shrink-0 place-items-center rounded-full ${n.read ? 'bg-white/8 text-white/50' : 'bg-accent/20 text-accent'}`}><Icon size={14} /></span>
                        <span className="min-w-0 flex-1">
                          <span className={`block text-sm ${n.read ? 'text-white/70' : 'font-medium'}`}>{n.title}</span>
                          {n.body && <span className="mt-0.5 block text-xs text-white/55">{n.body}</span>}
                          <span className="mt-0.5 block text-[11px] text-white/40">{ago(n.ts)}</span>
                        </span>
                        {!n.read && <span aria-label="Unread" className="mt-2 size-2 shrink-0 rounded-full bg-accent" />}
                      </button>
                    </li>
                  );
                })}
              </ul>
            </section>
          </div>
        </div>
      )}
    </div>
  );
};

export default NotificationsMenu;
