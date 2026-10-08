import { useState } from 'react';
import { Check, Loader2, WandSparkles, Save } from 'lucide-react';
import { CardTitle, Field } from '../components/ui';
import { LogoMark, contrast, grade, isHex } from '../lib/brand';
import { NAME_IDEAS, TAGLINES, MORE_TAGLINES, PALETTES, FONT_PAIRS } from '../data/studio';
import { useStore } from '../state/store';

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

const PAIRS = [
  ['Text on background', 'ink', 'bg'],
  ['Accent on background', 'accent', 'bg'],
  ['White on accent (buttons)', null, 'accent'],
  ['Text on soft panel', 'ink', 'soft'],
];

// S17: business name, taglines per language, colours (real contrast maths) and starter logos (drawn in the browser).
const Identity = () => {
  const { state, dispatch } = useStore();
  const I = state.identity;
  const set = (patch) => dispatch({ type: 'SET_IDENTITY', patch: { ...patch, saved: false } });
  const [extra, setExtra] = useState([]);
  const [busy, setBusy] = useState(false);
  const preset = PALETTES.find((p) => p.id === I.palette) ?? PALETTES[0];
  const palette = I.custom ?? preset;
  const taglines = [...TAGLINES, ...extra];

  const setColour = (key, value) => set({ custom: { ...palette, [key]: value } });
  const more = async () => {
    setBusy(true);
    await wait(700);
    setExtra(MORE_TAGLINES);
    setBusy(false);
  };
  const save = () => {
    dispatch({ type: 'SET_IDENTITY', patch: { saved: true } });
    dispatch({ type: 'LOG', actor: 'Priya', kind: 'edits', action: 'Saved brand identity', why: `${I.name}, ${preset.name}` });
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-4 xl:grid-cols-2">
        <section className="card">
          <CardTitle sub="Shown on posters, the website and every message.">Business name</CardTitle>
          <Field label="Name"><input className="field" value={I.name} onChange={(e) => set({ name: e.target.value })} /></Field>
          <p className="mb-1.5 mt-4 text-sm font-medium">Ideas</p>
          <div className="flex flex-wrap gap-2">
            {Object.values(NAME_IDEAS).flat().map((n) => (
              <button key={n} type="button" onClick={() => set({ name: n })} className={`h-9 rounded-full px-3.5 text-sm font-medium ${I.name === n ? 'bg-ink text-white' : 'bg-ink/5 hover:bg-ink/10'}`}>{n}</button>
            ))}
          </div>
        </section>

        <section className="card">
          <CardTitle sub="Pick one. Each language is written natively, not translated word for word." action={
            <button type="button" disabled={busy || extra.length > 0} onClick={more} className="btn-ghost h-8 px-3 text-xs">
              {busy ? <Loader2 size={13} className="animate-spin" /> : <WandSparkles size={13} />} More ideas
            </button>
          }>Tagline</CardTitle>
          <ul className="flex flex-col gap-2">
            {taglines.map((t) => (
              <li key={t.id}>
                <button type="button" aria-pressed={I.tagline === t.id} onClick={() => set({ tagline: t.id })} className={`grid w-full gap-1 rounded-xl border p-3 text-left ${I.tagline === t.id ? 'border-accent bg-accent-soft' : 'border-ink/10 hover:bg-ink/5'}`}>
                  <span lang="en" className="flex items-center justify-between text-sm">{t.en}{I.tagline === t.id && <Check size={16} className="text-accent" />}</span>
                  <span lang="hi" className="text-sm">{t.hi} <em className="text-[11px] not-italic text-warn">draft: needs native review</em></span>
                  <span lang="kn" className="text-sm">{t.kn} <em className="text-[11px] not-italic text-warn">draft: needs native review</em></span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <section className="card">
          <CardTitle sub="Choose a palette, or edit the colours. Contrast follows WCAG 2.2.">Colours</CardTitle>
          <div className="mb-4 flex flex-wrap gap-2">
            {PALETTES.map((p) => (
              <button key={p.id} type="button" aria-pressed={!I.custom && I.palette === p.id} onClick={() => dispatch({ type: 'SET_IDENTITY', patch: { palette: p.id, custom: null, saved: false } })} className={`flex items-center gap-2 rounded-full border px-2.5 py-1.5 text-sm ${!I.custom && I.palette === p.id ? 'border-accent bg-accent-soft' : 'border-ink/10 hover:bg-ink/5'}`}>
                <span className="flex overflow-hidden rounded-full ring-1 ring-ink/10">{[p.bg, p.accent, p.ink].map((c) => <span key={c} className="size-5" style={{ background: c }} />)}</span>{p.name}
              </button>
            ))}
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {['bg', 'soft', 'accent', 'ink'].map((k) => (
              <Field key={k} label={{ bg: 'Background', soft: 'Soft panel', accent: 'Accent', ink: 'Text' }[k]} error={isHex(palette[k]) ? undefined : 'Use a hex colour like #c4561a'}>
                <div className="flex items-center gap-2">
                  <input type="color" aria-label={`${k} colour picker`} value={isHex(palette[k]) && palette[k].length === 7 ? palette[k] : '#000000'} onChange={(e) => setColour(k, e.target.value)} className="size-9 shrink-0 cursor-pointer rounded-lg border border-ink/15 bg-white p-0.5" />
                  <input className="field px-2 font-mono text-xs" value={palette[k]} onChange={(e) => setColour(k, e.target.value)} />
                </div>
              </Field>
            ))}
          </div>
          <table className="mt-4 w-full text-sm">
            <tbody>
              {PAIRS.map(([label, fg, bg]) => {
                const ratio = contrast(fg ? palette[fg] : '#ffffff', palette[bg]);
                const ok = ratio >= 4.5;
                return (
                  <tr key={label} className="border-t border-ink/8">
                    <td className="py-2">{label}</td>
                    <td className="py-2 text-right tabular-nums">{ratio.toFixed(1)}:1</td>
                    <td className={`py-2 text-right font-medium ${ok ? 'text-good' : ratio >= 3 ? 'text-warn' : 'text-bad'}`}>{grade(ratio)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </section>

        <section className="card">
          <CardTitle sub="Simple starter marks drawn from your initials. Swap for a designed logo any time.">Logo</CardTitle>
          <div className="flex flex-wrap gap-3">
            {[0, 1, 2].map((v) => (
              <button key={v} type="button" aria-pressed={I.logo === v} onClick={() => set({ logo: v })} className={`rounded-2xl border p-3 ${I.logo === v ? 'border-accent bg-accent-soft' : 'border-ink/10 hover:bg-ink/5'}`}>
                <LogoMark name={I.name} palette={palette} variant={v} size={84} />
              </button>
            ))}
          </div>
          <Field label="Fonts"><select className="field mt-4" value={I.fonts} onChange={(e) => set({ fonts: e.target.value })}>{FONT_PAIRS.map((f) => <option key={f.id} value={f.id}>{f.label}</option>)}</select></Field>
          <div className="mt-4 rounded-2xl p-4" style={{ background: palette.bg, color: palette.ink }}>
            <p className="text-xl font-semibold" style={{ color: palette.accent }}>{I.name}</p>
            <p className="text-sm">{taglines.find((t) => t.id === I.tagline)?.en}</p>
            <p lang="kn" className="text-sm">{taglines.find((t) => t.id === I.tagline)?.kn}</p>
          </div>
        </section>
      </div>

      <div className="flex items-center gap-3">
        <button type="button" onClick={save} className="btn-primary"><Save size={16} /> Save brand identity</button>
        {I.saved && <span className="text-sm text-good">Saved. Used by posters, the website and the reel.</span>}
      </div>
    </div>
  );
};

export default Identity;
