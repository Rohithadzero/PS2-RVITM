import { useState } from 'react';
import { Lock, LockOpen, ShieldCheck, ArrowRight, CircleAlert, Undo2 } from 'lucide-react';
import { CardTitle, SourceChip, ChipToggle, Tabs, Banner } from '../components/ui';
import ReadBackPlayer from '../components/ui/ReadBackPlayer';
import { menu, DAYS, TERMS, CTAS, factSources } from '../data/mock';
import { useStore } from '../state/store';
import { arithmeticOk, expectedPrice, readBackScript, slotValues, diffFacts, termLabel } from '../lib/facts';
import { navigate } from '../lib/router';

const DAY_OPTIONS = DAYS.map((d) => ({ id: d, label: d[0].toUpperCase() + d.slice(1) }));

const Row = ({ label, source, children, error }) => (
  <div className="grid gap-2 border-b border-ink/8 py-3 last:border-0 sm:grid-cols-[8rem_1fr_auto] sm:items-center">
    <span className="text-sm font-medium text-ink/70">{label}</span>
    <div className="min-w-0">
      {children}
      {error && (
        <p className="mt-1.5 flex items-center gap-1 text-xs font-medium text-bad">
          <CircleAlert size={13} /> {error}
        </p>
      )}
    </div>
    {source && <SourceChip>source: {source}</SourceChip>}
  </div>
);

const readBackFor = (facts, lang) => {
  if (lang === 'en') return readBackScript(facts);
  const v = slotValues(facts, lang);
  return [v.item, `${v.discount}`, v.price, v.days, v.time, v.terms].join(', ');
};

const formatApproved = (iso) => new Date(iso).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: false });

// S4: structured facts with sources, read-back, and approval. Nothing generates before this.
const OfferFacts = () => {
  const { state, dispatch, approvedFacts } = useStore();
  const draft = state.draftFacts;
  const facts = draft ?? approvedFacts.json;
  const editing = Boolean(draft);
  const nextVersion = state.factsVersions.at(-1).version + 1;

  const [lang, setLang] = useState('KN');
  const [played, setPlayed] = useState(false);
  const [checkedOnScreen, setCheckedOnScreen] = useState(false);
  const langId = { KN: 'kn', EN: 'en', HI: 'hi' }[lang];

  const update = (patch) => {
    setPlayed(false);
    dispatch({ type: 'SAVE_DRAFT_FACTS', facts: { ...facts, ...patch } });
  };

  const priceOk = arithmeticOk(facts);
  const wantPrice = expectedPrice(facts.original_price_inr, facts.discount_pct);
  const datesOk = facts.start_date <= facts.end_date;
  const timeOk = facts.time_window.from < facts.time_window.to;
  const valid = priceOk && datesOk && timeOk && facts.days.length > 0;
  const diff = editing ? diffFacts(approvedFacts.json, facts) : [];

  const approve = () => {
    dispatch({ type: 'APPROVE_FACTS', method: played ? 'readback_played' : 'onscreen_confirm' });
    setPlayed(false);
    setCheckedOnScreen(false);
  };

  const field = 'field';
  const disabled = !editing;

  return (
    <div className="flex flex-col gap-4">
      {editing ? (
        <Banner tone="warn" action={<button type="button" onClick={() => dispatch({ type: 'DISCARD_DRAFT_FACTS' })} className="btn-glass h-8 px-3 text-xs"><Undo2 size={14} /> Discard draft</button>}>
          Draft v{nextVersion}. Assets keep using v{approvedFacts.version} until you approve.
        </Banner>
      ) : (
        <Banner tone="good" action={<button type="button" onClick={() => update({})} className="btn-glass h-8 px-3 text-xs"><LockOpen size={14} /> Change facts</button>}>
          Facts v{approvedFacts.version} approved by Priya, {formatApproved(approvedFacts.approved_at)}.
        </Banner>
      )}

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)]">
        <section className="card">
          <CardTitle
            sub="Every field is editable. Each edit makes a new draft version."
            action={
              <span className="inline-flex items-center gap-1.5 rounded-full bg-ink/5 px-2.5 py-1 text-xs font-semibold">
                {editing ? <LockOpen size={12} /> : <Lock size={12} className="text-accent" />}
                {editing ? `v${nextVersion} (draft)` : `v${approvedFacts.version} (approved)`}
              </span>
            }
          >
            Offer facts
          </CardTitle>

          <Row label="Item" source={factSources.item}>
            <select
              className={field}
              disabled={disabled}
              value={facts.item.menu_item_id}
              onChange={(e) => {
                const m = menu.find((x) => x.id === e.target.value);
                update({ item: { menu_item_id: m.id, name: m.name }, original_price_inr: m.price_inr, price_inr: expectedPrice(m.price_inr, facts.discount_pct) });
              }}
            >
              {menu.map((m) => (
                <option key={m.id} value={m.id}>{m.name} (menu Rs {m.price_inr})</option>
              ))}
            </select>
          </Row>

          <Row label="Discount" source={factSources.discount_pct}>
            <div className="flex items-center gap-2">
              <input type="number" min={1} max={90} className={`${field} w-24`} disabled={disabled} value={facts.discount_pct} onChange={(e) => update({ discount_pct: Number(e.target.value) })} />
              <span className="text-sm text-ink/60">% off</span>
            </div>
          </Row>

          <Row label="Original price" source={factSources.original_price_inr}>
            <div className="flex items-center gap-2">
              <span className="text-sm text-ink/60">Rs</span>
              <input type="number" min={1} className={`${field} w-28`} disabled={disabled} value={facts.original_price_inr} onChange={(e) => update({ original_price_inr: Number(e.target.value) })} />
            </div>
          </Row>

          <Row label="Offer price" source={factSources.price_inr} error={priceOk ? null : `Rs ${facts.original_price_inr} at ${facts.discount_pct}% off is Rs ${wantPrice}. The lock cannot be approved until they match.`}>
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm text-ink/60">Rs</span>
              <input type="number" min={1} className={`${field} w-28 ${priceOk ? '' : 'border-bad'}`} disabled={disabled} value={facts.price_inr} onChange={(e) => update({ price_inr: Number(e.target.value) })} />
              {!priceOk && (
                <button type="button" onClick={() => update({ price_inr: wantPrice })} className="btn-ghost h-9 px-3 text-xs">Use Rs {wantPrice}</button>
              )}
              {priceOk && <span className="inline-flex items-center gap-1 text-xs font-medium text-good"><ShieldCheck size={13} /> Arithmetic checked</span>}
            </div>
          </Row>

          <Row label="Days" source={factSources.days} error={facts.days.length ? null : 'Pick at least one day.'}>
            <fieldset disabled={disabled}>
              <ChipToggle options={DAY_OPTIONS} value={facts.days} onChange={(days) => update({ days: DAYS.filter((d) => days.includes(d)) })} />
            </fieldset>
          </Row>

          <Row label="Dates" source={factSources.dates} error={datesOk ? null : 'End date is before start date.'}>
            <div className="flex flex-wrap items-center gap-2">
              <input type="date" className={`${field} w-auto`} disabled={disabled} value={facts.start_date} onChange={(e) => update({ start_date: e.target.value })} aria-label="Start date" />
              <span className="text-sm text-ink/50">to</span>
              <input type="date" className={`${field} w-auto`} disabled={disabled} value={facts.end_date} onChange={(e) => update({ end_date: e.target.value })} aria-label="End date" />
            </div>
          </Row>

          <Row label="Timing" source={factSources.time_window} error={timeOk ? null : 'Start time must be before end time.'}>
            <div className="flex flex-wrap items-center gap-2">
              <input type="time" className={`${field} w-auto`} disabled={disabled} value={facts.time_window.from} onChange={(e) => update({ time_window: { ...facts.time_window, from: e.target.value } })} aria-label="From" />
              <span className="text-sm text-ink/50">to</span>
              <input type="time" className={`${field} w-auto`} disabled={disabled} value={facts.time_window.to} onChange={(e) => update({ time_window: { ...facts.time_window, to: e.target.value } })} aria-label="To" />
            </div>
          </Row>

          <Row label="Terms" source={factSources.terms}>
            <fieldset disabled={disabled}>
              <ChipToggle options={TERMS} value={facts.terms} onChange={(terms) => update({ terms })} />
            </fieldset>
          </Row>

          <Row label="Exclusions">
            <input
              className={field}
              disabled={disabled}
              placeholder="e.g. not with other offers"
              value={facts.exclusions.join(', ')}
              onChange={(e) => update({ exclusions: e.target.value.split(',').map((x) => x.trim()).filter(Boolean) })}
            />
          </Row>

          <Row label="Call to action" source={factSources.cta}>
            <select className={field} disabled={disabled} value={facts.cta} onChange={(e) => update({ cta: e.target.value })}>
              {CTAS.map((c) => (
                <option key={c.id} value={c.id}>{c.label}</option>
              ))}
            </select>
          </Row>
        </section>

        <div className="flex flex-col gap-4">
          {editing && diff.length > 0 && (
            <section className="card">
              <CardTitle sub="Assets that use these fields will move to Changed.">What changes in v{nextVersion}</CardTitle>
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-ink/50">
                    <th className="pb-2 font-medium">Field</th>
                    <th className="pb-2 font-medium">v{approvedFacts.version}</th>
                    <th className="pb-2 font-medium">v{nextVersion}</th>
                  </tr>
                </thead>
                <tbody>
                  {diff.map((d) => (
                    <tr key={d.field} className="border-t border-ink/8">
                      <td className="py-2 font-medium">{d.field.replace(/_/g, ' ')}</td>
                      <td className="py-2 text-ink/50 line-through">{d.from}</td>
                      <td className="py-2 font-semibold">{d.to}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          )}

          <section className="card">
            <CardTitle sub="Template-generated per language. Play it, or confirm you checked every field on screen." action={<Tabs tabs={['KN', 'EN', 'HI']} active={lang} onChange={setLang} />}>
              Read-back
            </CardTitle>
            <ReadBackPlayer key={`${lang}-${JSON.stringify(facts)}`} script={readBackFor(facts, langId)} lang={langId} onPlayed={() => setPlayed(true)} />

            {editing && (
              <>
                <label className="mt-4 flex items-start gap-2.5 text-sm">
                  <input type="checkbox" checked={checkedOnScreen} onChange={(e) => setCheckedOnScreen(e.target.checked)} className="mt-0.5 size-4 accent-[var(--color-accent)]" />
                  I checked every field on screen
                </label>
                <button type="button" disabled={!valid || diff.length === 0 || !(played || checkedOnScreen)} onClick={approve} className="btn-primary mt-4 w-full">
                  <ShieldCheck size={16} /> Approve facts v{nextVersion}
                </button>
                {!valid && <p className="mt-2 text-xs text-bad">Fix the highlighted fields first.</p>}
                {valid && diff.length === 0 && <p className="mt-2 text-xs text-ink/50">No changes from v{approvedFacts.version} yet.</p>}
              </>
            )}
            {!editing && (
              <button type="button" onClick={() => navigate('planner')} className="btn-dark mt-4 w-full">
                Plan the assets <ArrowRight size={16} />
              </button>
            )}
          </section>

          <section className="card">
            <CardTitle>Versions</CardTitle>
            <ol className="flex flex-col gap-2">
              {[...state.factsVersions].reverse().map((v) => (
                <li key={v.version} className="flex items-center justify-between gap-3 rounded-xl bg-ink/5 px-3 py-2 text-sm">
                  <span className="font-semibold">v{v.version}</span>
                  <span className="min-w-0 flex-1 truncate text-ink/60">
                    {v.json.days.join(', ')}, {v.json.time_window.from}–{v.json.time_window.to}, {v.json.terms.map(termLabel).join(', ')}
                  </span>
                  <span className="text-xs text-ink/50">{v.approval_method === 'readback_played' ? 'read-back' : 'on screen'}, {formatApproved(v.approved_at)}</span>
                </li>
              ))}
            </ol>
          </section>
        </div>
      </div>
    </div>
  );
};

export default OfferFacts;
