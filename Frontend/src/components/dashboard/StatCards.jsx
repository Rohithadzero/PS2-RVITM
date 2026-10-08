import { Check, ShieldX, Send, MousePointerClick } from 'lucide-react';
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

// Real totals from GET /campaign/:id/dashboard. Until they load the cards show a dash, never a made-up number.
const StatCards = ({ totals, id }) => {
  const t = totals;
  const dash = '–';
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <CardShell title="Approved" icon={Check} iconClass="bg-good/12 text-good">
        <Value value={t ? `${t.approved}/${t.assets}` : dash} unit="assets" />
        <Gauge ratio={t && t.assets ? t.approved / t.assets : 0} />
      </CardShell>
      <CardShell title="Blocked" icon={ShieldX} iconClass="bg-bad/12 text-bad">
        <Value value={t ? t.blocked : dash} unit={t && !t.blocked ? 'all clear' : 'by fact check'} />
        <button type="button" onClick={() => navigate('campaign', id)} className="btn-ghost h-8 shrink-0 px-3.5 text-xs">
          Open
        </button>
      </CardShell>
      <CardShell title="Sent" icon={Send} iconClass="bg-info/12 text-info">
        <Value value={t ? t.distributed : dash} unit="assets shared" />
      </CardShell>
      <CardShell title="Clicks" icon={MousePointerClick} iconClass="bg-warn/15 text-warn">
        <Value value={t ? t.clicks : dash} unit="tracked" />
        <button type="button" onClick={() => navigate('dashboard', id)} className="btn-dark h-8 shrink-0 px-3.5 text-xs">
          Dashboard
        </button>
      </CardShell>
    </div>
  );
};

export default StatCards;
