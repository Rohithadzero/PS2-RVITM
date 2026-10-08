import { useEffect, useState } from 'react';
import { Check, Loader2, RotateCcw, Zap, CircleAlert, ArrowRight } from 'lucide-react';
import { CardTitle, Banner, StatusChip } from '../components/ui';
import { assetName } from '../data/mock';
import { useStore } from '../state/store';
import { navigate } from '../lib/router';
import { formatDuration } from '../lib/planner';

const STEPS = ['copy', 'render', 'validate', 'score'];
const TICK_MS = 700;
const CACHED = new Set(['locals-en-instagram', 'locals-en-whatsapp', 'office-en-instagram']);
const FAILS = 'office-hi-poster'; // image 429 -> falls back to saved demo output

// S6: per-asset progress from the queue. Backend: job.progress events on GET /campaign/:id/events.
const Generating = () => {
  const { state } = useStore();
  const assets = state.assets;
  const [tick, setTick] = useState(0);
  const [retried, setRetried] = useState(false);
  const total = assets.length * STEPS.length;

  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), TICK_MS);
    return () => clearInterval(id);
  }, []);

  const rows = assets.map((a, i) => {
    const cached = CACHED.has(a.id);
    const done = cached ? STEPS.length : Math.max(0, Math.min(STEPS.length, tick - Math.floor(i * 0.8)));
    const failed = a.id === FAILS && done >= 2 && !retried;
    return { ...a, done: failed ? 1 : done, cached, failed, queue: Math.max(0, Math.floor(i * 0.8) - tick + 1) };
  });

  const finished = rows.reduce((n, r) => n + r.done, 0);
  const remainingS = Math.max(0, Math.round(((total - finished) * TICK_MS) / 1000 * 6));
  const byKind = (pred) => {
    const r = rows.filter(pred);
    return { done: r.filter((x) => x.done === STEPS.length).length, all: r.length };
  };
  const classes = [
    { label: 'Text', rpm: '10 RPM', ...byKind((r) => r.channel !== 'poster') },
    { label: 'Image', rpm: '10 RPM at 1K', ...byKind((r) => r.channel === 'poster') },
    { label: 'Video', rpm: '1 RPM', done: 0, all: 0 },
  ];
  const allDone = rows.every((r) => r.done === STEPS.length);
  const anyFailed = rows.some((r) => r.failed);

  // Auto-retry after the backoff; the saved demo output is used if the retry also fails.
  useEffect(() => {
    if (!anyFailed) return undefined;
    const id = setTimeout(() => setRetried(true), 6000);
    return () => clearTimeout(id);
  }, [anyFailed]);

  return (
    <div className="flex flex-col gap-4">
      {anyFailed && (
        <Banner tone="warn" action={<button type="button" onClick={() => setRetried(true)} className="btn-glass h-8 px-3 text-xs"><RotateCcw size={14} /> Retry</button>}>
          Image queue hit the rate limit (429). One poster is waiting; retrying in 6 s. Saved demo output is labelled if used.
        </Banner>
      )}

      <section className="card">
        <CardTitle
          sub={allDone ? 'All assets generated. Open the board to review.' : 'Finished assets open while others run.'}
          action={
            <span className="rounded-full bg-accent-soft px-3 py-1 text-sm font-semibold">
              {allDone ? 'Done' : `Estimated finish ${formatDuration(remainingS)}`}
            </span>
          }
        >
          {finished} of {total} steps
        </CardTitle>
        <div className="grid gap-4 sm:grid-cols-3">
          {classes.map((c) => (
            <div key={c.label}>
              <div className="flex justify-between text-xs">
                <span className="font-semibold">{c.label}</span>
                <span className="text-ink/55">{c.all ? `${c.done} of ${c.all}` : 'not in plan'}, {c.rpm}</span>
              </div>
              <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-ink/8">
                <span className="block h-full rounded-full bg-accent transition-[width] duration-500" style={{ width: c.all ? `${(c.done / c.all) * 100}%` : '0%' }} />
              </div>
            </div>
          ))}
        </div>
        {allDone && (
          <button type="button" onClick={() => navigate('board')} className="btn-primary mt-5">
            Open board <ArrowRight size={16} />
          </button>
        )}
      </section>

      <section className="card overflow-x-auto p-0 sm:p-0">
        <table className="w-full min-w-[640px] text-sm">
          <thead>
            <tr className="text-left text-xs text-ink/50">
              <th className="px-4 py-3 font-medium sm:px-5">Asset</th>
              {STEPS.map((s) => (
                <th key={s} className="px-2 py-3 font-medium capitalize">{s}</th>
              ))}
              <th className="px-4 py-3 font-medium sm:px-5">Queue</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const complete = r.done === STEPS.length;
              return (
                <tr key={r.id} className="border-t border-ink/8">
                  <td className="px-4 py-2.5 sm:px-5">
                    <button type="button" disabled={!complete} onClick={() => navigate('asset', r.id)} className="text-left font-medium enabled:hover:text-accent disabled:cursor-default">
                      {assetName(r)}
                    </button>
                  </td>
                  {STEPS.map((s, i) => {
                    const skip = s === 'render' && r.channel !== 'poster';
                    const state = skip ? 'skip' : r.failed && i === 1 ? 'fail' : i < r.done ? 'done' : i === r.done && r.queue === 0 ? 'run' : 'wait';
                    return (
                      <td key={s} className="px-2 py-2.5">
                        {state === 'done' && <Check size={16} className="text-good" aria-label="done" />}
                        {state === 'run' && <Loader2 size={16} className="animate-spin text-accent" aria-label="running" />}
                        {state === 'fail' && <CircleAlert size={16} className="text-bad" aria-label="rate limited" />}
                        {state === 'wait' && <span className="block size-2 rounded-full bg-ink/15" aria-label="waiting" />}
                        {state === 'skip' && <span className="text-ink/30" aria-label="not needed">–</span>}
                      </td>
                    );
                  })}
                  <td className="px-4 py-2.5 sm:px-5">
                    {r.cached ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-good/12 px-2 py-0.5 text-[11px] font-semibold text-good"><Zap size={11} /> Cache hit</span>
                    ) : complete && r.is_fallback ? (
                      <StatusChip status="fallback" />
                    ) : complete ? (
                      <span className="text-xs text-ink/50">Done</span>
                    ) : r.queue > 0 ? (
                      <span className="text-xs text-ink/50">#{r.queue} in queue</span>
                    ) : (
                      <span className="text-xs text-ink/50">Running</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>
    </div>
  );
};

export default Generating;
