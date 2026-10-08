import { useState } from 'react';
import { Bot, User, Cog, ArrowUpRight } from 'lucide-react';
import { CardTitle, Tabs, StatusChip } from '../components/ui';
import { assetName } from '../data/mock';
import { useStore } from '../state/store';
import { navigate } from '../lib/router';

const FILTERS = ['All', 'Facts', 'Tone', 'Scope', 'Edits', 'Sends'];

const actorIcon = (actor) => (actor === 'system' ? Cog : actor.startsWith('agent') ? Bot : User);

// S11: pending items first, then the timeline of who changed what and why (GET /campaign/:id/log).
const ChangeLog = () => {
  const { state } = useStore();
  const [filter, setFilter] = useState('All');
  const pending = state.assets.filter((a) => a.status !== 'approved');
  const events = state.events.filter((e) => filter === 'All' || e.kind === filter.toLowerCase());

  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)]">
      <section className="card self-start">
        <CardTitle sub="What still needs you before everything is approved.">Pending ({pending.length + (state.draftFacts ? 1 : 0)})</CardTitle>
        <ul className="flex flex-col gap-2">
          {state.draftFacts && (
            <li>
              <button type="button" onClick={() => navigate('facts')} className="flex w-full items-center justify-between gap-3 rounded-xl bg-accent-soft px-3 py-2.5 text-left text-sm">
                <span className="font-medium">Offer facts draft waiting for approval</span>
                <ArrowUpRight size={15} />
              </button>
            </li>
          )}
          {pending.map((a) => (
            <li key={a.id}>
              <button type="button" onClick={() => navigate('asset', a.id)} className="flex w-full items-center justify-between gap-3 rounded-xl bg-ink/5 px-3 py-2.5 text-left text-sm hover:bg-ink/10">
                <span className="min-w-0 truncate">{assetName(a)}</span>
                <StatusChip status={a.status} />
              </button>
            </li>
          ))}
          {pending.length === 0 && !state.draftFacts && <li className="text-sm text-ink/55">Nothing pending.</li>}
        </ul>
      </section>

      <section className="card">
        <CardTitle action={<Tabs tabs={FILTERS} active={filter} onChange={setFilter} />}>Timeline</CardTitle>
        {events.length === 0 ? (
          <p className="text-sm text-ink/55">No {filter.toLowerCase()} events yet.</p>
        ) : (
          <ol className="relative flex flex-col gap-4 before:absolute before:inset-y-2 before:left-[15px] before:w-px before:bg-ink/10">
            {events.map((e) => {
              const Icon = actorIcon(e.actor);
              return (
                <li key={e.id} className="relative flex gap-3">
                  <span className="relative grid size-8 shrink-0 place-items-center rounded-full bg-white ring-1 ring-ink/10">
                    <Icon size={15} className="text-ink/70" />
                  </span>
                  <div className="min-w-0 flex-1 pt-0.5">
                    <p className="text-sm font-semibold">{e.action}</p>
                    <p className="text-xs text-ink/60">{e.why}</p>
                    <p className="mt-0.5 text-xs text-ink/45">
                      {e.ts}, {e.actor}, {e.kind}
                      {e.link && (
                        <button type="button" onClick={() => navigate('asset', e.link)} className="ml-2 font-medium text-accent hover:underline">
                          Open asset
                        </button>
                      )}
                    </p>
                  </div>
                </li>
              );
            })}
          </ol>
        )}
      </section>
    </div>
  );
};

export default ChangeLog;
