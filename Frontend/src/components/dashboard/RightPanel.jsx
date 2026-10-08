import { useState } from 'react';
import { ChevronLeft, ChevronRight, ShieldX, Clock, ArrowLeftRight } from 'lucide-react';
import { owner, audiences, LANGS, channelName } from '../../data/mock';
import { useStore } from '../../state/store';
import { navigate } from '../../lib/router';

const WEEKDAYS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];
const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

const Profile = () => {
  const { state } = useStore();
  const stats = [
    { value: LANGS.length, label: 'Languages' },
    { value: audiences.length, label: 'Audiences' },
    { value: state.customers.length, label: 'Customers' },
  ];
  return (
    <div>
      <div className="flex items-center gap-3">
        <span className="grid size-11 shrink-0 place-items-center rounded-full bg-accent font-semibold">{owner.initials}</span>
        <div className="min-w-0 flex-1">
          <p className="truncate font-semibold">{owner.business}</p>
          <p className="text-xs text-white/50">{owner.area}</p>
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

const Calendar = () => {
  const { approvedFacts } = useStore();
  const facts = approvedFacts.json;
  const today = new Date();
  const [month, setMonth] = useState(new Date(today.getFullYear(), today.getMonth(), 1));
  const firstWeekday = month.getDay();
  const daysInMonth = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
  const cells = [...Array(firstWeekday).fill(null), ...Array.from({ length: daysInMonth }, (_, i) => new Date(month.getFullYear(), month.getMonth(), i + 1))];
  const shift = (delta) => setMonth(new Date(month.getFullYear(), month.getMonth() + delta, 1));

  const dayStyle = (date) => {
    const d = iso(date);
    if (d === iso(today)) return 'bg-accent text-white font-semibold';
    if (d === facts.end_date) return 'bg-rose text-white font-semibold';
    if (d >= facts.start_date && d <= facts.end_date) return 'bg-good text-white font-semibold';
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
        <li className="flex items-center gap-1.5"><span className="size-2 rounded-full bg-good" />Offer runs</li>
        <li className="flex items-center gap-1.5"><span className="size-2 rounded-full bg-rose" />Last day</li>
      </ul>
    </div>
  );
};

const NextUp = () => {
  const { state } = useStore();
  const items = [
    ...state.assets.filter((a) => a.status === 'blocked').map((a) => ({ id: a.id, icon: ShieldX, tone: 'text-bad bg-bad/20', tag: 'Blocked', title: `Fix ${a.lang.toUpperCase()} ${channelName(a.channel)}`, detail: `"${a.block_reason.token}" is not the locked price` })),
    ...state.assets.filter((a) => a.status === 'pending').map((a) => ({ id: a.id, icon: Clock, tone: 'text-info bg-info/20', tag: 'Pending', title: `Review ${a.lang.toUpperCase()} ${channelName(a.channel)}`, detail: audiences.find((x) => x.id === a.audience_id).name })),
    ...state.assets.filter((a) => a.status === 'changed').map((a) => ({ id: a.id, icon: ArrowLeftRight, tone: 'text-warn bg-warn/20', tag: 'Changed', title: `Regenerate ${a.lang.toUpperCase()} ${channelName(a.channel)}`, detail: 'Uses an older facts version' })),
  ].slice(0, 4);

  return (
    <section>
      <div className="flex items-center justify-between">
        <h2 className="border-l-2 border-accent pl-2 font-semibold">Next up</h2>
        <button type="button" onClick={() => navigate('log')} className="text-sm text-white/60 hover:text-white">View all</button>
      </div>
      {items.length === 0 ? (
        <p className="mt-3 rounded-2xl bg-black/20 p-4 text-sm text-white/60">Nothing waiting. Every asset is approved.</p>
      ) : (
        <ul className="mt-3 flex flex-col gap-2">
          {items.map(({ id, icon: Icon, tone, tag, title, detail }) => (
            <li key={id}>
              <button type="button" onClick={() => navigate('asset', id)} className="flex w-full items-center gap-3 rounded-2xl bg-black/20 p-2.5 text-left transition-colors hover:bg-black/30">
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

const RightPanel = () => (
  <aside className="glass-panel hidden w-80 shrink-0 flex-col gap-4 overflow-y-auto rounded-[28px] p-4 xl:flex">
    <Profile />
    <Calendar />
    <NextUp />
  </aside>
);

export default RightPanel;
