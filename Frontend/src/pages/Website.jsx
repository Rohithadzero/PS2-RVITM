import { useState } from 'react';
import { Globe, Loader2, Monitor, Smartphone, Sparkles } from 'lucide-react';
import { CardTitle, ChipToggle, Field, Toggle } from '../components/ui';
import { NotConnected, ContractCard } from '../components/ui/studio';
import { LogoMark } from '../lib/brand';
import { PALETTES, TAGLINES } from '../data/studio';
import { LANGS, menu } from '../data/mock';
import { api, ApiError } from '../api/client';
import { slotValues } from '../lib/facts';
import { useStore } from '../state/store';

const REQUEST = `POST /website/generate
{
  "business": { "name": "Priya's Café", "tagline": {"en":"...","hi":"...","kn":"..."} },
  "brand": { "palette": {"bg":"#fff7ef","ink":"#2b1d14","accent":"#c4561a","soft":"#fde3cf"},
             "fonts": {"heading":"Poppins","body":"Noto Sans Kannada"}, "logo": "starter-0" },
  "languages": ["en","kn"],
  "sections": ["hero","menu","about","gallery","hours","whatsapp"],
  "facts_version": 2,
  "menu": [{"name":"Filter coffee","price_inr":60}],
  "offer": { "discount_pct":20,"price_inr":48,"days":["sat","sun"],"terms":["dine_in_only"] },
  "photos": ["upload_id", "..."]
}`;
const RESPONSE = `202 { "site_id": "s_9f2", "status": "queued" }
GET /website/s_9f2
{ "status": "ready" | "queued" | "in_progress" | "failed",
  "preview_url": "https://.../s_9f2",
  "facts_version": 2,            // must equal the approved lock
  "validator": { "passed": true, "issues": [] }   // site text goes through the same validator
}
POST /website/s_9f2/publish -> { "url": "..." }`;

// S18: the editor and the live preview are real (built from your brand and approved facts). Generation and
// publishing are the website team's service and show as not connected.
const Website = () => {
  const { state, dispatch, approvedFacts } = useStore();
  const W = state.website;
  const I = state.identity;
  const palette = I.custom ?? PALETTES.find((p) => p.id === I.palette) ?? PALETTES[0];
  const tagline = TAGLINES.find((t) => t.id === I.tagline) ?? TAGLINES[0];
  const [device, setDevice] = useState('desktop');
  const [lang, setLang] = useState(W.langs[0] ?? 'en');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const set = (patch) => dispatch({ type: 'SET_WEBSITE', patch });
  const facts = approvedFacts.json;
  const sv = slotValues(facts, lang);
  const on = (id) => W.sections.find((s) => s.id === id)?.on;

  const generate = async () => {
    setBusy(true);
    setError(null);
    try {
      await api.website.generate({ name: I.name });
    } catch (e) {
      setError(e instanceof ApiError ? e : new ApiError(0, 'unknown', String(e)));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      {error && <NotConnected service="Website generation" owner="Website team">The preview below is built locally from your brand and approved facts. Generating and publishing a real site turns on when that service is plugged in ({error.message}).</NotConnected>}

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
        <section className="card">
          <CardTitle sub="Turn sections on or off. The preview updates instantly.">Sections</CardTitle>
          <ul className="flex flex-col gap-3">
            {W.sections.map((s) => (
              <li key={s.id} className="flex items-center justify-between gap-3">
                <span><span className="block text-sm font-medium">{s.label}</span><span className="text-xs text-ink/55">{s.note}</span></span>
                <Toggle label={s.label} checked={s.on} onChange={(v) => set({ sections: W.sections.map((x) => (x.id === s.id ? { ...x, on: v } : x)) })} />
              </li>
            ))}
          </ul>
          <div className="mt-5 flex flex-col gap-4">
            <Field label="Languages on the site"><ChipToggle options={LANGS} value={W.langs} onChange={(v) => { set({ langs: v }); if (!v.includes(lang) && v[0]) setLang(v[0]); }} /></Field>
            <Field label="Web address" hint="Where it will live once published."><input className="field" value={W.slug} onChange={(e) => set({ slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '') })} /></Field>
          </div>
          <div className="mt-5 flex flex-wrap gap-2">
            <button type="button" disabled={busy} onClick={generate} className="btn-primary">{busy ? <Loader2 size={16} className="animate-spin" /> : <Sparkles size={16} />} Generate with AI</button>
            <button type="button" disabled className="btn-ghost" title="Publishing needs the website service"><Globe size={16} /> Publish</button>
          </div>
        </section>

        <section className="card">
          <CardTitle sub="Built from your brand and the approved offer. Prices are always the locked values." action={
            <div className="flex items-center gap-2">
              {W.langs.length > 1 && <select aria-label="Preview language" className="field h-8 w-auto px-2 text-xs" value={lang} onChange={(e) => setLang(e.target.value)}>{W.langs.map((l) => <option key={l} value={l}>{l.toUpperCase()}</option>)}</select>}
              <button type="button" aria-pressed={device === 'desktop'} onClick={() => setDevice('desktop')} className={`grid size-8 place-items-center rounded-lg ${device === 'desktop' ? 'bg-ink text-white' : 'bg-ink/5'}`} aria-label="Desktop preview"><Monitor size={15} /></button>
              <button type="button" aria-pressed={device === 'phone'} onClick={() => setDevice('phone')} className={`grid size-8 place-items-center rounded-lg ${device === 'phone' ? 'bg-ink text-white' : 'bg-ink/5'}`} aria-label="Phone preview"><Smartphone size={15} /></button>
            </div>
          }>Preview</CardTitle>
          <div className="flex justify-center rounded-2xl bg-ink/5 p-3">
            <div lang={lang} className={`overflow-hidden rounded-xl shadow-lg ring-1 ring-ink/10 ${device === 'phone' ? 'w-[300px]' : 'w-full'}`} style={{ background: palette.bg, color: palette.ink }}>
              <header className="flex items-center gap-2 px-4 py-3" style={{ background: palette.soft }}>
                <LogoMark name={I.name} palette={palette} variant={I.logo} size={34} />
                <span className="font-semibold">{I.name}</span>
              </header>
              {on('hero') && (
                <div className="px-4 py-6">
                  <h2 className="text-2xl font-bold" style={{ color: palette.accent }}>{tagline[lang]}</h2>
                  <p className="mt-2 text-sm">{sv.item}: {sv.discount} · {sv.price} <s className="opacity-60">{sv.original_price}</s></p>
                  <p className="text-sm">{sv.days}, {sv.time}. {sv.terms}</p>
                  {on('whatsapp') && <span className="mt-3 inline-block rounded-full px-4 py-2 text-sm font-semibold text-white" style={{ background: palette.accent }}>Order on WhatsApp</span>}
                </div>
              )}
              {on('menu') && (
                <div className="px-4 pb-4">
                  <h3 className="mb-1 font-semibold">Menu</h3>
                  <ul className="text-sm">{menu.map((m) => <li key={m.id} className="flex justify-between border-b py-1" style={{ borderColor: palette.soft }}><span>{m.name}</span><span>Rs {m.price_inr}</span></li>)}</ul>
                </div>
              )}
              {on('gallery') && <div className="grid grid-cols-3 gap-1 px-4 pb-4">{[1, 2, 3].map((n) => <div key={n} className="aspect-square rounded-lg" style={{ background: palette.soft }} aria-label="Photo placeholder" />)}</div>}
              {on('about') && <p className="px-4 pb-4 text-sm">A neighbourhood café. Short story goes here in {lang.toUpperCase()}.</p>}
              {on('hours') && <p className="px-4 pb-4 text-xs opacity-80">Hours and map location appear here.</p>}
            </div>
          </div>
        </section>
      </div>

      <ContractCard title="Website service contract" request={REQUEST} response={RESPONSE} />
    </div>
  );
};

export default Website;
