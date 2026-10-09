import { useCallback, useEffect, useState } from 'react';
import { Check, RefreshCw, Sparkles, X } from 'lucide-react';
import { CardTitle } from './ui';
import { api } from '../campaign/lib/api';
import { navigate } from '../lib/router';

const send = (method, path) => api(path, { method });

// What GrowIT noticed about the business (from saved details, approved offers, customers and results). Each one waits for a yes:
// nothing is used until it is accepted, and "Not right" keeps it from coming back. Accepted ones live on the Memory screen.
const Suggestions = ({ className = '' }) => {
  const [items, setItems] = useState(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      setItems((await api('/memory')).suggested);
      setError('');
    } catch (e) {
      setError(e.message);
      setItems((cur) => cur ?? []);
    }
  }, []);

  useEffect(() => {
    // Look at the shop's data once on opening, so anything new is waiting.
    send('POST', '/memory/refresh').catch(() => undefined).finally(load);
  }, [load]);

  const act = async (fn, message) => {
    setBusy(true);
    setNotice('');
    try { await fn(); if (message) setNotice(message); await load(); } catch (e) { setError(e.message); } finally { setBusy(false); }
  };
  const refresh = () => act(async () => {
    const r = await send('POST', '/memory/refresh');
    setNotice(r.added ? `GrowIT found ${r.added} new thing${r.added === 1 ? '' : 's'} to suggest.` : 'Nothing new to suggest.');
  });

  if (items === null) return null;
  return (
    <section className={`card ${className}`} aria-label="Suggested by GrowIT">
      <CardTitle sub="Nothing is used until you accept it. Accepted ones are kept on the Memory screen, where you can edit them." action={
        <button type="button" className="btn-ghost" onClick={refresh} disabled={busy}><RefreshCw size={15} /> Look at my shop again</button>
      }>Suggested by GrowIT</CardTitle>
      {error && <p role="alert" className="mb-2 text-sm text-bad">{error}</p>}
      {items.length === 0 ? (
        <p className="text-sm text-ink/55">No suggestions right now. Save your shop details, approve an offer or enter results, and GrowIT will suggest what it noticed.</p>
      ) : (
        <ul className="grid gap-3 md:grid-cols-2">
          {items.map((s) => (
            <li key={s.id} className="flex flex-col gap-2 rounded-2xl border border-accent/40 bg-accent-soft/40 p-3.5">
              <div className="flex flex-wrap items-center gap-2"><Sparkles size={15} className="text-accent-deep" /><strong className="text-sm">{s.title}</strong><span className="text-[11px] text-ink/50">{s.kind_label}</span></div>
              <p className="whitespace-pre-wrap text-sm text-ink/80">{s.body}</p>
              <p className="text-xs text-ink/55">{s.evidence}</p>
              <div className="mt-auto flex flex-wrap gap-2">
                <button type="button" className="btn-primary h-9" disabled={busy} onClick={() => act(() => send('POST', `/memory/${s.id}/accept`), 'Added to Memory.')}><Check size={14} /> Accept</button>
                <button type="button" className="btn-ghost h-9" disabled={busy} onClick={() => act(() => send('POST', `/memory/${s.id}/dismiss`))}><X size={14} /> Not right</button>
              </div>
            </li>
          ))}
        </ul>
      )}
      {notice && <p role="status" className="mt-3 flex flex-wrap items-center gap-2 text-sm text-good">{notice} <button type="button" className="underline" onClick={() => navigate('memory')}>Open Memory</button></p>}
    </section>
  );
};

export default Suggestions;
