import { useEffect, useState } from 'react';
import NoCampaign from '../campaign/NoCampaign';
import { getBoard } from '../campaign/lib/api';
import { humanize, prettyText, when } from '../campaign/lib/format';
import { useCurrent } from '../campaign/lib/current';

// S11: the audit trail the server keeps for this campaign: who did what, when.
const ChangeLog = () => {
  const { id } = useCurrent();
  const [events, setEvents] = useState(null);
  const [error, setError] = useState('');
  useEffect(() => {
    if (!id) return undefined;
    let live = true;
    getBoard(id).then((b) => live && setEvents(b.events)).catch((e) => live && setError(e.message));
    return () => {
      live = false;
    };
  }, [id]);

  if (!id) return <NoCampaign what="the change log" />;
  return (
    <section className="card">
      <h2 className="font-semibold">Change log</h2>
      {error && <p role="alert" className="mt-2 text-sm text-bad">{error}</p>}
      {events === null && !error && <p className="mt-2 text-sm text-ink/55">Loading.</p>}
      {events?.length === 0 && <p className="mt-2 text-sm text-ink/55">Nothing has happened yet.</p>}
      <ol className="mt-3 flex flex-col gap-2">
        {events?.map((e) => (
          <li key={e.id} className="flex flex-wrap items-baseline gap-x-3 rounded-xl bg-ink/5 px-3 py-2 text-sm">
            <time className="text-xs text-ink/50">{when(e.ts)}</time>
            <span className="font-semibold">{humanize(e.action)}</span>
            <span className="text-xs text-ink/55">by {e.actor}</span>
            {e.detail && <span className="w-full text-ink/70">{prettyText(e.detail)}</span>}
          </li>
        ))}
      </ol>
    </section>
  );
};

export default ChangeLog;
