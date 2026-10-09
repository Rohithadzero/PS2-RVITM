import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { channelLabel } from '../../campaign/lib/format';

export const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const WEEKDAYS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];
const PURPOSE = { teaser: 'Teaser', launch: 'Launch', reminder: 'Reminder', last_day: 'Last day' };

// What is on each date, from the plan's computed schedule, the offer window and events the owner added.
// One model feeds the dot colours and the hover card, so they can never disagree.
export const useDayModel = (plan, ownerEvents) =>
  useMemo(() => {
    const dates = plan?.offer_facts.dates ?? [];
    const start = dates[0];
    const end = dates.at(-1);
    const bySchedule = {};
    for (const row of plan?.schedule ?? []) (bySchedule[row.date] ||= []).push(row);
    const todayIso = iso(new Date());
    const info = (d) => {
      const items = [];
      if (d === todayIso) items.push({ text: 'Today', tone: 'accent' });
      if (start && d >= start && d <= end) items.push({ text: start === end ? 'Offer day' : d === end ? 'Offer ends' : d === start ? 'Offer starts' : 'Offer runs', tone: d === end && start !== end ? 'rose' : 'good' });
      for (const r of bySchedule[d] ?? []) items.push({ text: `${channelLabel(r.channel)}: ${PURPOSE[r.purpose] ?? r.purpose}`, tone: 'good' });
      for (const e of ownerEvents ?? []) if (d >= e.start && d <= e.end) items.push({ text: e.name, tone: 'info' });
      return items;
    };
    const style = (d) => {
      if (d === todayIso) return 'bg-accent text-white font-semibold';
      if (end && start !== end && d === end) return 'bg-rose text-white font-semibold';
      if (bySchedule[d] || (start && d >= start && d <= end)) return 'bg-good text-white font-semibold';
      if ((ownerEvents ?? []).some((e) => d >= e.start && d <= e.end)) return 'bg-info/80 text-white font-semibold';
      return 'text-white/75 hover:bg-white/10';
    };
    return { info, style };
  }, [plan, ownerEvents]);

const TONE = { accent: 'bg-accent', good: 'bg-good', rose: 'bg-rose', info: 'bg-info' };

// Fixed-position card in <body>: the glass panel has a backdrop filter and scrolls, so it would trap or clip an absolute child.
const DayCard = ({ anchor, date, items, side }) => {
  if (!anchor) return null;
  const r = anchor.getBoundingClientRect();
  const width = 248;
  const left = side === 'left' ? Math.max(8, r.left - width - 10) : Math.min(window.innerWidth - width - 8, r.right + 10);
  const top = Math.min(Math.max(8, r.top - 12), window.innerHeight - 180);
  const label = new Date(`${date}T00:00:00`).toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' });
  return createPortal(
    <div role="tooltip" id="day-card" style={{ position: 'fixed', left, top, width }} className="pointer-events-none z-[70] rounded-2xl bg-white p-3.5 text-ink shadow-2xl ring-1 ring-black/10">
      <p className="text-sm font-semibold">{label}</p>
      {items.length === 0 ? (
        <p className="mt-1.5 text-sm text-ink/55">No event scheduled.</p>
      ) : (
        <ul className="mt-1.5 flex flex-col gap-1.5">
          {items.map((it, i) => (
            <li key={i} className="flex items-start gap-2 text-sm">
              <span className={`mt-1.5 size-2 shrink-0 rounded-full ${TONE[it.tone]}`} />
              {it.text}
            </li>
          ))}
        </ul>
      )}
    </div>,
    document.body
  );
};

// Hover or keyboard focus on a date shows its card. Escape or leaving hides it.
const useHover = () => {
  const [hover, setHover] = useState(null); // { date, el }
  useEffect(() => {
    if (!hover) return undefined;
    const esc = (e) => e.key === 'Escape' && setHover(null);
    window.addEventListener('keydown', esc);
    return () => window.removeEventListener('keydown', esc);
  }, [hover]);
  const bind = (date) => ({
    onMouseEnter: (e) => setHover({ date, el: e.currentTarget }),
    onMouseLeave: () => setHover(null),
    onFocus: (e) => setHover({ date, el: e.currentTarget }),
    onBlur: () => setHover(null),
    'aria-describedby': hover?.date === date ? 'day-card' : undefined,
  });
  return { hover, bind };
};

export const Calendar = ({ model }) => {
  const today = new Date();
  const [month, setMonth] = useState(new Date(today.getFullYear(), today.getMonth(), 1));
  const { hover, bind } = useHover();
  const firstWeekday = month.getDay();
  const daysInMonth = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
  const cells = [...Array(firstWeekday).fill(null), ...Array.from({ length: daysInMonth }, (_, i) => new Date(month.getFullYear(), month.getMonth(), i + 1))];
  const shift = (delta) => setMonth(new Date(month.getFullYear(), month.getMonth() + delta, 1));
  return (
    <div className="rounded-2xl bg-black/20 p-4">
      <div className="flex items-center justify-between">
        <p className="font-semibold">{month.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })}</p>
        <div className="flex gap-1">
          <button type="button" onClick={() => shift(-1)} aria-label="Previous month" className="grid size-7 place-items-center rounded-full bg-white/10 text-white/70 hover:text-white"><ChevronLeft size={14} /></button>
          <button type="button" onClick={() => shift(1)} aria-label="Next month" className="grid size-7 place-items-center rounded-full bg-white/10 text-white/70 hover:text-white"><ChevronRight size={14} /></button>
        </div>
      </div>
      <div className="mt-3 grid grid-cols-7 gap-y-1 text-center text-xs">
        {WEEKDAYS.map((d) => <span key={d} className="pb-1 text-white/40">{d}</span>)}
        {cells.map((date, i) =>
          date ? (
            <button key={i} type="button" {...bind(iso(date))} aria-label={date.toLocaleDateString('en-IN', { day: 'numeric', month: 'long' })} className={`mx-auto grid size-7 place-items-center rounded-full transition-colors ${model.style(iso(date))}`}>
              {date.getDate()}
            </button>
          ) : (
            <span key={i} />
          )
        )}
      </div>
      <ul className="mt-3 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-white/55">
        <li className="flex items-center gap-1.5"><span className="size-2 rounded-full bg-accent" />Today</li>
        <li className="flex items-center gap-1.5"><span className="size-2 rounded-full bg-good" />Scheduled</li>
        <li className="flex items-center gap-1.5"><span className="size-2 rounded-full bg-rose" />Last day</li>
        <li className="flex items-center gap-1.5"><span className="size-2 rounded-full bg-info" />Your event</li>
      </ul>
      {hover && <DayCard anchor={hover.el} date={hover.date} items={model.info(hover.date)} side="left" />}
    </div>
  );
};

// The collapsed form: one long bar with every day of the month, marked the same way as the full calendar.
export const DateRail = ({ model }) => {
  const today = new Date();
  const [month, setMonth] = useState(new Date(today.getFullYear(), today.getMonth(), 1));
  const { hover, bind } = useHover();
  const scroller = useRef(null);
  const daysInMonth = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
  const days = Array.from({ length: daysInMonth }, (_, i) => new Date(month.getFullYear(), month.getMonth(), i + 1));
  const shift = (delta) => setMonth(new Date(month.getFullYear(), month.getMonth() + delta, 1));
  useEffect(() => {
    // Keep today (or the first day of another month) in view on short screens.
    const target = scroller.current?.querySelector('[data-today="true"]') ?? scroller.current?.firstElementChild;
    target?.scrollIntoView?.({ block: 'center' });
  }, [month]);
  return (
    <div className="flex min-h-0 flex-1 flex-col items-center gap-1" aria-label={month.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })} role="group">
      <button type="button" onClick={() => shift(-1)} aria-label="Previous month" className="grid size-7 shrink-0 place-items-center rounded-full bg-white/10 text-white/70 hover:text-white"><ChevronLeft size={13} className="rotate-90" /></button>
      <p className="shrink-0 text-[10px] font-semibold uppercase tracking-wide text-white/50">{month.toLocaleDateString('en-IN', { month: 'short' })}</p>
      <div ref={scroller} className="flex min-h-0 flex-1 flex-col items-center gap-0.5 overflow-y-auto py-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {days.map((date) => {
          const d = iso(date);
          const marked = model.info(d).length > 0;
          return (
            <button
              key={d}
              type="button"
              data-today={d === iso(today)}
              {...bind(d)}
              aria-label={`${date.toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' })}${marked ? ', has something scheduled' : ''}`}
              className={`grid size-7 shrink-0 place-items-center rounded-full text-[11px] transition-colors ${model.style(d)}`}
            >
              {date.getDate()}
            </button>
          );
        })}
      </div>
      <button type="button" onClick={() => shift(1)} aria-label="Next month" className="grid size-7 shrink-0 place-items-center rounded-full bg-white/10 text-white/70 hover:text-white"><ChevronRight size={13} className="rotate-90" /></button>
      {hover && <DayCard anchor={hover.el} date={hover.date} items={model.info(hover.date)} side="left" />}
    </div>
  );
};
