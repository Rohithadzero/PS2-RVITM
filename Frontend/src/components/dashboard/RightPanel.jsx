import { useEffect, useState } from 'react';
import { ChevronLeft, ChevronRight, ShieldX, Clock, Languages } from 'lucide-react';
import { getBoard, getPlan } from '../../campaign/lib/api';
import { channelLabel, langName } from '../../campaign/lib/format';
import { useCurrent } from '../../campaign/lib/current';
import { navigate } from '../../lib/router';

const WEEKDAYS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];
const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const initialsOf = (name) => (name || '?').split(/\s+/).filter(Boolean).slice(0, 2).map((w) => [...w][0].toUpperCase()).join('');

const Profile = ({ plan }) => {
  const stats = [
    { value: plan?.languages.length ?? '–', label: 'Languages' },
    { value: plan?.audiences.length ?? '–', label: 'Audiences' },
    { value: plan?.channels.length ?? '–', label: 'Channels' },
  ];
  return (
    <div>
      <div className="flex items-center gap-3">
        <span className="grid size-11 shrink-0 place-items-center rounded-full bg-accent font-semibold">{plan ? initialsOf(plan.business.name) : '·'}</span>
        <div className="min-w-0 flex-1">
          <p className="truncate font-semibold">{plan ? plan.business.name : 'No campaign yet'}</p>
          <p className="truncate text-xs text-white/50">{plan ? plan.business.area : 'Start one with Talk'}</p>
        </div>
      </div>
      <dl className="mt-4 grid grid-cols-3 divide-x divide-white/10 rounded-2xl bg-black/20 py-3 text-center">
        {stats.map((s) => (
          <div key={s.label}>
            <dd className="text-lg font-semibold">{s.value}</dd>
            <dt className="text-xs text-white/50">{s.label}</dt>
          </div>
        ))}
      </dl>
    </div>
  );
};

// Marks come from the plan's computed schedule: offer days, teaser and last day.
const Calendar = ({ plan }) => {
  const today = new Date();
  const [month, setMonth] = useState(new Date(today.getFullYear(), today.getMonth(), 1));
  const dates = plan?.offer_facts.dates ?? [];
  const start = dates[0];
  const end = dates.at(-1);
  const firstWeekday = month.getDay();
  const daysInMonth = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
  const cells = [...Array(firstWeekday).fill(null), ...Array.from({ length: daysInMonth }, (_, i) => new Date(month.getFullYear(), month.getMonth(), i + 1))];
  const shift = (delta) => setMonth(new Date(month.getFullYear(), month.getMonth() + delta, 1));
  const scheduled = new Set((plan?.schedule ?? []).map((s) => s.date));

  const dayStyle = (date) => {
    const d = iso(date);
    if (d === iso(today)) return 'bg-accent text-white font-semibold';
    if (end && start !== end && d === end) return 'bg-rose text-white font-semibold';
    if (scheduled.has(d) || (start && d >= start && d <= end)) return 'bg-good text-white font-semibold';
    return 'text-white/75';
  };

  return (
    <div className="rounded-2xl bg-black/20 p-4">
      <div className="flex items-center justify-between">
        <p className="font-semibold">{month.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })}</p>
        <div className="flex gap-1">
          <button type="button" onClick={() => shift(-1)} aria-label="Previous month" className="grid size-7 place-items-center rounded-full bg-white/10 text-white/70 hover:text-white">
            <ChevronLeft size={14} />
          </button>
          <button type="button" onClick={() => shift(1)} aria-label="Next month" className="grid size-7 place-items-center rounded-full bg-white/10 text-white/70 hover:text-white">
            <ChevronRight size={14} />
          </button>
        </div>
      </div>
      <div className="mt-3 grid grid-cols-7 gap-y-1 text-center text-xs">
        {WEEKDAYS.map((d) => (
          <span key={d} className="pb-1 text-white/40">{d}</span>
        ))}
        {cells.map((date, i) =>
          date ? (
            <span key={i} className={`mx-auto grid size-7 place-items-center rounded-full ${dayStyle(date)}`}>{date.getDate()}</span>
          ) : (
            <span key={i} />
          )
        )}
      </div>
      <ul className="mt-3 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-white/55">
        <li className="flex items-center gap-1.5"><span className="size-2 rounded-full bg-accent" />Today</li>
        <li className="flex items-center gap-1.5"><span className="size-2 rounded-full bg-good" />Scheduled</li>
        <li className="flex items-center gap-1.5"><span className="size-2 rounded-full bg-rose" />Last day</li>
      </ul>
    </div>
  );
};

const NextUp = ({ board, id }) => {
  const items = (board?.assets ?? [])
    .filter((a) => a.status !== 'approved')
    .map((a) => {
      const blocked = a.status === 'blocked';
      return {
        id: a.id,
        icon: blocked ? ShieldX : a.review?.status === 'flagged' ? Languages : Clock,
        tone: blocked ? 'text-bad bg-bad/20' : a.review?.status === 'flagged' ? 'text-warn bg-warn/20' : 'text-info bg-info/20',
        tag: blocked ? 'Blocked' : a.review?.status === 'flagged' ? 'Meaning flagged' : 'To review',
        title: `${blocked ? 'Fix' : 'Review'} ${langName(a.lang)} ${channelLabel(a.channel)}`,
        detail: blocked ? (a.block_reason?.[0] ?? 'Fact check failed') : a.audience,
      };
    })
    .slice(0, 4);

  return (
    <section>
      <div className="flex items-center justify-between">
        <h2 className="border-l-2 border-accent pl-2 font-semibold">Next up</h2>
        {id && (
          <button type="button" onClick={() => navigate('campaign', id)} className="text-sm text-white/60 hover:text-white">View all</button>
        )}
      </div>
      {items.length === 0 ? (
        <p className="mt-3 rounded-2xl bg-black/20 p-4 text-sm text-white/60">{board ? 'Nothing waiting. Every asset is approved.' : 'Nothing yet. Assets that need you appear here.'}</p>
      ) : (
        <ul className="mt-3 flex flex-col gap-2">
          {items.map(({ id: aid, icon: Icon, tone, tag, title, detail }) => (
            <li key={aid}>
              <button type="button" onClick={() => navigate('campaign', id)} className="flex w-full items-center gap-3 rounded-2xl bg-black/20 p-2.5 text-left transition-colors hover:bg-black/30">
                <span className={`grid size-11 shrink-0 place-items-center rounded-xl ${tone}`}>
                  <Icon size={18} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="rounded-md bg-white/10 px-1.5 py-0.5 text-[10px] font-medium text-white/70">{tag}</span>
                  <span className="mt-1 block truncate text-sm font-semibold">{title}</span>
                  <span className="block truncate text-xs text-white/50">{detail}</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
};

const RightPanel = () => {
  const { id } = useCurrent();
  const [plan, setPlan] = useState(null);
  const [board, setBoard] = useState(null);

  useEffect(() => {
    setPlan(null);
    setBoard(null);
    if (!id) return undefined;
    let live = true;
    getPlan(id).then((p) => live && setPlan(p)).catch(() => undefined);
    getBoard(id).then((b) => live && setBoard(b)).catch(() => undefined);
    return () => {
      live = false;
    };
  }, [id]);

  return (
    <aside aria-label="Campaign summary" className="glass-panel hidden w-[320px] shrink-0 flex-col gap-5 overflow-y-auto rounded-[28px] p-5 xl:flex">
      <Profile plan={plan} />
      <Calendar plan={plan} />
      <NextUp board={board} id={id} />
    </aside>
  );
};

export default RightPanel;
