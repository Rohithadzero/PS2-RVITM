import { Check, Clock, ArrowLeftRight, ShieldX } from 'lucide-react';
import { useStore } from '../../state/store';
import { navigate } from '../../lib/router';

const CardShell = ({ title, icon: Icon, iconClass, children }) => (
  <article className="flex flex-col justify-between gap-4 rounded-2xl bg-white p-4 text-ink">
    <div className="flex items-center justify-between gap-2">
      <h3 className="text-sm font-semibold">{title}</h3>
      <span className={`grid size-7 place-items-center rounded-full ${iconClass}`}>
        <Icon size={14} strokeWidth={2.5} />
      </span>
    </div>
    <div className="flex items-end justify-between gap-3">{children}</div>
  </article>
);

const Value = ({ value, unit }) => (
  <p className="min-w-0">
    <span className="text-2xl font-bold tracking-tight">{value}</span> <span className="text-xs font-medium text-ink/50">{unit}</span>
  </p>
);

const Gauge = ({ ratio }) => {
  const length = Math.PI * 16;
  return (
    <svg viewBox="0 0 40 24" className="h-10 w-16 shrink-0" aria-hidden="true">
      <path d="M4 20 A16 16 0 0 1 36 20" fill="none" stroke="#e7e7ea" strokeWidth="5" strokeLinecap="round" />
      <path d="M4 20 A16 16 0 0 1 36 20" fill="none" stroke="var(--color-good)" strokeWidth="5" strokeLinecap="round" strokeDasharray={`${length * ratio} ${length}`} />
    </svg>
  );
};

const StatCards = () => {
  const { state, dispatch, approvedFacts } = useStore();
  const count = (s) => state.assets.filter((a) => a.status === s);
  const approved = count('approved');
  const pending = count('pending');
  const changed = count('changed');
  const blocked = count('blocked');
  const total = state.assets.length;

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <CardShell title="Approved" icon={Check} iconClass="bg-good/12 text-good">
        <Value value={`${approved.length}/${total}`} unit="assets" />
        <Gauge ratio={approved.length / total} />
      </CardShell>

      <CardShell title="Pending review" icon={Clock} iconClass="bg-info/12 text-info">
        <Value value={pending.length} unit="assets" />
        <button
          type="button"
          disabled={!pending.length}
          onClick={() => dispatch({ type: 'APPROVE_ASSETS', ids: pending.map((a) => a.id) })}
          className="btn-dark h-8 shrink-0 px-3.5 text-xs"
        >
          Approve all
        </button>
      </CardShell>

      <CardShell title="Changed" icon={ArrowLeftRight} iconClass="bg-warn/15 text-warn">
        <Value value={changed.length} unit={`need facts v${approvedFacts.version}`} />
        <button
          type="button"
          disabled={!changed.length}
          onClick={() => dispatch({ type: 'REGENERATE_ASSETS', ids: changed.map((a) => a.id) })}
          className="btn-ghost h-8 shrink-0 px-3.5 text-xs"
        >
          Regenerate
        </button>
      </CardShell>

      <CardShell title="Blocked" icon={ShieldX} iconClass="bg-bad/12 text-bad">
        <Value value={blocked.length} unit={blocked[0] ? `"Rs ${blocked[0].block_reason.token}" vs lock` : 'all clear'} />
        <button
          type="button"
          disabled={!blocked.length}
          onClick={() => navigate('asset', blocked[0].id)}
          className="btn h-8 shrink-0 bg-bad px-3.5 text-xs text-white hover:bg-bad/90"
        >
          Fix
        </button>
      </CardShell>
    </div>
  );
};

export default StatCards;
