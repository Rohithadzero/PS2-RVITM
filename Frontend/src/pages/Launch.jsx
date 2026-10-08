import { useState } from 'react';
import { ArrowLeft, ArrowRight, Loader2, Lightbulb, Check, Plus, Trash2, WandSparkles } from 'lucide-react';
import { CardTitle, ChipToggle, Field } from '../components/ui';
import { LogoMark, contrast, grade } from '../lib/brand';
import { expectedPrice } from '../lib/facts';
import {
  LAUNCH_STEPS, SKILLS, BUDGETS, IDEAS, NAME_IDEAS, TAGLINES, MORE_TAGLINES, PALETTES, LAUNCH_PACK, DELIVERABLES, PIPELINES,
} from '../data/studio';
import { LANGS } from '../data/mock';
import { useStore } from '../state/store';
import { navigate } from '../lib/router';

// Starter menus per idea. Prices are examples the owner edits; the owner decides every price.
const STARTER_ITEMS = {
  tiffin: [{ name: 'Weekly thali plan (6 days)', price: 600 }, { name: 'Single meal box', price: 110 }, { name: 'Evening snack box', price: 70 }],
  kiosk: [{ name: 'Filter coffee', price: 30 }, { name: 'Masala chai', price: 20 }, { name: 'Bun maska', price: 40 }],
  craft: [{ name: 'Festival hamper (small)', price: 799 }, { name: 'Custom gift box', price: 499 }, { name: 'Handmade card set', price: 199 }],
};

const DAYS = [
  { id: 'mon', label: 'Mon' }, { id: 'tue', label: 'Tue' }, { id: 'wed', label: 'Wed' }, { id: 'thu', label: 'Thu' },
  { id: 'fri', label: 'Fri' }, { id: 'sat', label: 'Sat' }, { id: 'sun', label: 'Sun' },
];

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

// S16: for someone with no business yet. Six steps from a few answers to a launch pack. All suggestions are example
// content; the planner and identity services will generate them (docs/screen-flow.md S16).
const Launch = () => {
  const { state, dispatch } = useStore();
  const L = state.launch;
  const [busy, setBusy] = useState(false);
  const [extra, setExtra] = useState([]);
  const set = (patch) => dispatch({ type: 'SET_LAUNCH', patch });
  const setAnswers = (patch) => set({ answers: { ...L.answers, ...patch } });
  const step = L.step;
  const idea = IDEAS.find((i) => i.id === L.chosenIdea);
  const palette = PALETTES.find((p) => p.id === state.identity.palette) ?? PALETTES[0];
  const name = L.name || 'Your business';
  const taglines = [...TAGLINES, ...extra];

  const findIdeas = async () => {
    setBusy(true);
    await wait(900);
    const ranked = [...IDEAS].sort((a, b) => b.fit.filter((s) => L.answers.skills.includes(s)).length - a.fit.filter((s) => L.answers.skills.includes(s)).length);
    set({ ideas: ranked.map((i) => i.id), step: 1 });
    setBusy(false);
  };

  const pickIdea = (id) => set({ chosenIdea: id, name: '', tagline: null, items: STARTER_ITEMS[id].map((i, n) => ({ id: `i${n}`, ...i })) });

  const moreTaglines = async () => {
    setBusy(true);
    await wait(700);
    setExtra(MORE_TAGLINES);
    setBusy(false);
  };

  const finish = () => {
    dispatch({ type: 'SET_IDENTITY', patch: { name, tagline: L.tagline ?? TAGLINES[0].id } });
    dispatch({ type: 'SET_STUDIO', patch: { mode: 'have', selected: ['post', 'whatsapp', 'poster'] } });
    dispatch({ type: 'LOG', actor: 'Priya', kind: 'scope', action: `Business plan ready: ${idea?.title}`, why: `Name: ${name}` });
    navigate('voice');
  };

  const setItem = (id, patch) => set({ items: L.items.map((i) => (i.id === id ? { ...i, ...patch } : i)) });
  const canNext = [
    L.answers.skills.length > 0,
    Boolean(L.chosenIdea),
    Boolean(L.name.trim() && L.tagline),
    true,
    Boolean(L.items?.length && L.items.every((i) => i.name.trim() && i.price > 0)),
    true,
  ][step];

  return (
    <div className="flex flex-col gap-4">
      <ol className="flex flex-wrap gap-2" aria-label="Steps">
        {LAUNCH_STEPS.map((s, i) => (
          <li key={s}>
            <button
              type="button"
              disabled={i > step}
              onClick={() => set({ step: i })}
              aria-current={i === step ? 'step' : undefined}
              className={`inline-flex h-9 items-center gap-2 rounded-full px-3.5 text-sm font-medium transition-colors ${
                i === step ? 'bg-accent text-white' : i < step ? 'bg-white/15 text-white' : 'bg-white/5 text-white/40'
              }`}
            >
              <span className="grid size-5 place-items-center rounded-full bg-black/20 text-xs">{i < step ? <Check size={12} /> : i + 1}</span>
              {s}
            </button>
          </li>
        ))}
      </ol>

      <section className="card">
        {step === 0 && (
          <>
            <CardTitle sub="Rough answers are fine. You can change everything later.">Tell us about you</CardTitle>
            <div className="flex flex-col gap-5">
              <Field label="City or area"><input className="field" value={L.answers.city} onChange={(e) => setAnswers({ city: e.target.value })} /></Field>
              <Field label="What are you good at?" hint="Pick all that apply.">
                <ChipToggle options={SKILLS} value={L.answers.skills} onChange={(v) => setAnswers({ skills: v })} />
              </Field>
              <Field label="How much can you start with?">
                <ChipToggle multiple={false} options={BUDGETS} value={L.answers.budget} onChange={(v) => setAnswers({ budget: v })} />
              </Field>
              <Field label="Hours per week you can give" hint="Part-time is fine.">
                <input type="number" min={2} max={80} className="field w-32" value={L.answers.hours} onChange={(e) => setAnswers({ hours: Number(e.target.value) })} />
              </Field>
              <Field label="Anything you want to avoid?" hint="For example: no late nights, no heavy lifting."><input className="field" value={L.answers.avoid} onChange={(e) => setAnswers({ avoid: e.target.value })} /></Field>
            </div>
          </>
        )}

        {step === 1 && (
          <>
            <CardTitle sub="Ranked by how well they match your skills. Pick one to continue.">Ideas for you</CardTitle>
            <div className="grid gap-3 lg:grid-cols-3">
              {(L.ideas ?? IDEAS.map((i) => i.id)).map((id) => {
                const i = IDEAS.find((x) => x.id === id);
                const on = L.chosenIdea === id;
                const fit = i.fit.filter((s) => L.answers.skills.includes(s)).length;
                return (
                  <button key={id} type="button" aria-pressed={on} onClick={() => pickIdea(id)} className={`flex flex-col gap-2 rounded-2xl border p-4 text-left transition-colors ${on ? 'border-accent bg-accent-soft' : 'border-ink/10 hover:bg-ink/5'}`}>
                    <span className="flex items-start justify-between gap-2"><span className="font-semibold">{i.title}</span>{on && <Check size={18} className="text-accent" />}</span>
                    <span className="text-sm text-ink/70">{i.why}</span>
                    <span className="text-xs"><strong>Start-up cost (example):</strong> {i.startup}</span>
                    <span className="text-xs"><strong>First month:</strong> {i.firstMonth}</span>
                    <span className="text-xs"><strong>Watch out:</strong> {i.risks.join('; ')}</span>
                    <span className="mt-1 text-xs text-ink/50">Skill match: {fit} of {i.fit.length}. Sells on {i.channels.join(', ')}.</span>
                  </button>
                );
              })}
            </div>
          </>
        )}

        {step === 2 && idea && (
          <>
            <CardTitle sub="Pick a name and a tagline, or write your own. Hindi and Kannada lines are drafts until a native speaker checks them.">Name and tagline</CardTitle>
            <div className="flex flex-col gap-5">
              <Field label="Business name">
                <div className="flex flex-wrap gap-2">
                  {NAME_IDEAS[idea.id].map((n) => (
                    <button key={n} type="button" aria-pressed={L.name === n} onClick={() => set({ name: n })} className={`h-9 rounded-full px-3.5 text-sm font-medium ${L.name === n ? 'bg-ink text-white' : 'bg-ink/5 hover:bg-ink/10'}`}>{n}</button>
                  ))}
                </div>
                <input className="field mt-2" placeholder="Or type your own name" value={L.name} onChange={(e) => set({ name: e.target.value })} />
              </Field>
              <div>
                <p className="mb-2 flex items-center justify-between text-sm font-medium">
                  Tagline
                  <button type="button" disabled={busy || extra.length > 0} onClick={moreTaglines} className="btn-ghost h-8 px-3 text-xs">
                    {busy ? <Loader2 size={13} className="animate-spin" /> : <WandSparkles size={13} />} More ideas
                  </button>
                </p>
                <ul className="flex flex-col gap-2">
                  {taglines.map((t) => (
                    <li key={t.id}>
                      <button type="button" aria-pressed={L.tagline === t.id} onClick={() => set({ tagline: t.id })} className={`grid w-full gap-1 rounded-xl border p-3 text-left sm:grid-cols-3 ${L.tagline === t.id ? 'border-accent bg-accent-soft' : 'border-ink/10 hover:bg-ink/5'}`}>
                        <span lang="en" className="text-sm">{t.en}</span>
                        <span lang="hi" className="text-sm">{t.hi} <em className="text-[11px] not-italic text-warn">draft</em></span>
                        <span lang="kn" className="text-sm">{t.kn} <em className="text-[11px] not-italic text-warn">draft</em></span>
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </>
        )}

        {step === 3 && (
          <>
            <CardTitle sub="Colours are checked for readable contrast. Starter logos are made from your name.">Brand look</CardTitle>
            <div className="grid gap-5 lg:grid-cols-2">
              <div className="flex flex-col gap-3">
                {PALETTES.map((p) => {
                  const ratio = contrast(p.ink, p.bg);
                  const on = state.identity.palette === p.id;
                  return (
                    <button key={p.id} type="button" aria-pressed={on} onClick={() => dispatch({ type: 'SET_IDENTITY', patch: { palette: p.id } })} className={`flex items-center gap-3 rounded-xl border p-3 text-left ${on ? 'border-accent bg-accent-soft' : 'border-ink/10 hover:bg-ink/5'}`}>
                      <span className="flex overflow-hidden rounded-lg ring-1 ring-ink/10">{[p.bg, p.soft, p.accent, p.ink].map((c) => <span key={c} className="size-9" style={{ background: c }} />)}</span>
                      <span className="text-sm"><span className="block font-medium">{p.name}</span><span className="text-xs text-ink/55">Text on background {ratio.toFixed(1)}:1 ({grade(ratio)})</span></span>
                    </button>
                  );
                })}
              </div>
              <div>
                <p className="mb-2 text-sm font-medium">Starter logos for {name}</p>
                <div className="flex flex-wrap gap-3">
                  {[0, 1, 2].map((v) => (
                    <button key={v} type="button" aria-pressed={state.identity.logo === v} onClick={() => dispatch({ type: 'SET_IDENTITY', patch: { logo: v } })} className={`rounded-2xl border p-3 ${state.identity.logo === v ? 'border-accent bg-accent-soft' : 'border-ink/10 hover:bg-ink/5'}`}>
                      <LogoMark name={name} palette={palette} variant={v} />
                    </button>
                  ))}
                </div>
                <p className="mt-2 text-xs text-ink/55">Simple placeholders. A designer-made logo can replace them later.</p>
              </div>
            </div>
          </>
        )}

        {step === 4 && L.items && (
          <>
            <CardTitle sub="Example prices to start from. You set the real ones. The opening offer price is calculated, never typed.">Offer and prices</CardTitle>
            <div className="flex flex-col gap-2">
              {L.items.map((i) => (
                <div key={i.id} className="grid grid-cols-[1fr_7rem_auto] items-center gap-2">
                  <input className="field" value={i.name} onChange={(e) => setItem(i.id, { name: e.target.value })} aria-label="Item name" />
                  <input type="number" min={1} className="field" value={i.price} onChange={(e) => setItem(i.id, { price: Number(e.target.value) })} aria-label={`Price of ${i.name} in rupees`} />
                  <button type="button" aria-label={`Remove ${i.name}`} onClick={() => set({ items: L.items.filter((x) => x.id !== i.id) })} className="grid size-9 place-items-center rounded-lg hover:bg-ink/5"><Trash2 size={15} /></button>
                </div>
              ))}
              <button type="button" onClick={() => set({ items: [...L.items, { id: `i${Date.now()}`, name: '', price: 100 }] })} className="btn-ghost h-9 self-start"><Plus size={15} /> Add item</button>
            </div>
            <div className="mt-5 grid gap-3 rounded-2xl bg-ink/5 p-4 sm:grid-cols-3">
              <Field label="Opening offer: discount %"><input type="number" min={1} max={90} className="field" value={L.offer.discount_pct} onChange={(e) => set({ offer: { ...L.offer, discount_pct: Number(e.target.value) } })} /></Field>
              <div className="sm:col-span-2"><p className="mb-1.5 text-sm font-medium">Opening days</p><ChipToggle options={DAYS} value={L.offer.days} onChange={(v) => set({ offer: { ...L.offer, days: v } })} /></div>
              <ul className="text-sm sm:col-span-3">
                {L.items.slice(0, 3).map((i) => (<li key={i.id}>{i.name || 'Item'}: Rs {i.price} becomes <strong>Rs {expectedPrice(i.price, L.offer.discount_pct)}</strong> on opening days.</li>))}
              </ul>
            </div>
          </>
        )}

        {step === 5 && (
          <>
            <CardTitle sub="Everything below is made from your answers. Each item opens the screen that makes it.">Your launch pack</CardTitle>
            <div className="mb-4 flex flex-wrap items-center gap-4 rounded-2xl bg-ink/5 p-4">
              <LogoMark name={name} palette={palette} variant={state.identity.logo} />
              <div>
                <p className="text-lg font-semibold">{name}</p>
                <p className="text-sm text-ink/65">{taglines.find((t) => t.id === L.tagline)?.en ?? ''}</p>
                <p className="mt-1 text-xs text-ink/50">{idea?.title}. Menu of {L.items?.length ?? 0} items. Opening offer {L.offer.discount_pct}% on {L.offer.days.join(', ')}.</p>
              </div>
            </div>
            <ul className="flex flex-col gap-2">
              {LAUNCH_PACK.map((p) => {
                const d = DELIVERABLES.find((x) => x.id === p.deliverable);
                const live = d ? PIPELINES[d.pipeline].backend : false;
                return (
                  <li key={p.id} className={`flex flex-wrap items-center gap-3 rounded-xl border border-ink/10 p-3 ${live ? '' : 'opacity-50'}`}>
                    <span className="min-w-0 flex-1 text-sm font-medium">{p.label}</span>
                    <button type="button" onClick={() => navigate(p.slug)} className="btn-ghost h-8 px-3 text-xs">Open</button>
                  </li>
                );
              })}
            </ul>
          </>
        )}
      </section>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <button type="button" disabled={step === 0} onClick={() => set({ step: step - 1 })} className="btn-glass"><ArrowLeft size={16} /> Back</button>
        {step === 0 && (
          <button type="button" disabled={!canNext || busy} onClick={findIdeas} className="btn-primary">
            {busy ? <Loader2 size={16} className="animate-spin" /> : <Lightbulb size={16} />} Find ideas
          </button>
        )}
        {step > 0 && step < 5 && <button type="button" disabled={!canNext} onClick={() => set({ step: step + 1 })} className="btn-primary">Next <ArrowRight size={16} /></button>}
        {step === 5 && <button type="button" onClick={finish} className="btn-primary">Start my opening campaign <ArrowRight size={16} /></button>}
      </div>
    </div>
  );
};

export default Launch;
