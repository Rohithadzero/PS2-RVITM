import { useState } from 'react';
import { Upload, Plus, X, Trash2, WandSparkles, Check, ArrowRight } from 'lucide-react';
import { CardTitle, Field, Toggle, Tabs } from '../components/ui';
import { menu as initialMenu, photos as initialPhotos, brand as initialBrand, audiences as initialAudiences, decisionRules } from '../data/mock';
import { useStore } from '../state/store';
import { navigate } from '../lib/router';

const STEPS = ['Menu & prices', 'Photos', 'Sample posts', 'Customers'];
const SKIP_COST = {
  'Menu & prices': 'Without prices, every offer price must be typed by hand and cannot be checked against the menu.',
  Photos: 'Posters will use generated backgrounds instead of your real photos.',
  'Sample posts': 'The brand voice will start from defaults instead of how you already write.',
  Customers: 'Audiences will be guesses, and sending stays off.',
};

const TagInput = ({ label, values, onChange, placeholder }) => {
  const [draft, setDraft] = useState('');
  const add = () => {
    const v = draft.trim();
    if (v && !values.includes(v)) onChange([...values, v]);
    setDraft('');
  };
  return (
    <Field label={label}>
      <div className="flex min-h-10 flex-wrap items-center gap-1.5 rounded-xl border border-ink/15 bg-white p-1.5 focus-within:border-accent">
        {values.map((v) => (
          <span key={v} className="inline-flex items-center gap-1 rounded-full bg-ink/5 py-1 pl-2.5 pr-1 text-xs font-medium">
            {v}
            <button type="button" onClick={() => onChange(values.filter((x) => x !== v))} aria-label={`Remove ${v}`} className="grid size-5 place-items-center rounded-full hover:bg-ink/10">
              <X size={12} />
            </button>
          </span>
        ))}
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ',') {
              e.preventDefault();
              add();
            }
          }}
          onBlur={add}
          placeholder={placeholder}
          className="h-7 min-w-24 flex-1 bg-transparent px-1 text-sm focus:outline-none"
        />
      </div>
    </Field>
  );
};

const MenuStep = () => {
  const [items, setItems] = useState(initialMenu);
  const set = (id, patch) => setItems((xs) => xs.map((x) => (x.id === id ? { ...x, ...patch } : x)));
  return (
    <>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <label className="btn-ghost h-9 cursor-pointer">
          <Upload size={15} /> Upload CSV, XLSX or PDF
          <input type="file" accept=".csv,.xlsx,.pdf" className="sr-only" />
        </label>
        <span className="text-xs text-ink/50">Parsed items appear below for review.</span>
      </div>
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-xs text-ink/50">
            <th className="pb-2 font-medium">Item</th>
            <th className="w-32 pb-2 font-medium">Price (Rs)</th>
            <th className="w-10 pb-2" />
          </tr>
        </thead>
        <tbody>
          {items.map((m) => (
            <tr key={m.id}>
              <td className="py-1 pr-2"><input value={m.name} onChange={(e) => set(m.id, { name: e.target.value })} className="field" aria-label="Item name" /></td>
              <td className="py-1 pr-2"><input type="number" min={1} value={m.price_inr} onChange={(e) => set(m.id, { price_inr: Number(e.target.value) })} className="field" aria-label="Price in rupees" /></td>
              <td className="py-1">
                <button type="button" onClick={() => setItems((xs) => xs.filter((x) => x.id !== m.id))} aria-label={`Remove ${m.name}`} className="grid size-9 place-items-center rounded-xl text-ink/50 hover:bg-bad/10 hover:text-bad">
                  <Trash2 size={16} />
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <button type="button" onClick={() => setItems((xs) => [...xs, { id: `m${Date.now()}`, name: '', price_inr: 0 }])} className="btn-ghost mt-3 h-9">
        <Plus size={15} /> Add item
      </button>
    </>
  );
};

const PhotosStep = () => {
  const [items, setItems] = useState(initialPhotos);
  return (
    <>
      <label className="btn-ghost mb-4 h-9 cursor-pointer">
        <Upload size={15} /> Upload photos
        <input type="file" accept="image/*" multiple capture="environment" className="sr-only" />
      </label>
      <p className="mb-4 text-xs text-ink/50">The server re-encodes every upload; the preview shows the re-encoded copy.</p>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {items.map((p) => (
          <figure key={p.id} className="overflow-hidden rounded-xl border border-ink/10">
            <div className={`aspect-square bg-gradient-to-br ${p.tint}`} />
            <figcaption className="flex items-center justify-between gap-2 p-2.5">
              <span className="min-w-0 text-xs">
                <span className="block truncate font-medium">{p.name}</span>
                <span className="text-ink/50">Use for posters</span>
              </span>
              <Toggle checked={p.use_for_posters} onChange={(v) => setItems((xs) => xs.map((x) => (x.id === p.id ? { ...x, use_for_posters: v } : x)))} label={`Use ${p.name} for posters`} />
            </figcaption>
          </figure>
        ))}
      </div>
    </>
  );
};

const PostsStep = () => {
  const [posts, setPosts] = useState(initialBrand.sample_posts);
  const [draft, setDraft] = useState('');
  return (
    <>
      <ul className="flex flex-col gap-2">
        {posts.map((p) => (
          <li key={p} className="flex items-start justify-between gap-3 rounded-xl bg-ink/5 p-3 text-sm">
            <span>{p}</span>
            <button type="button" onClick={() => setPosts((xs) => xs.filter((x) => x !== p))} aria-label="Remove post" className="text-ink/45 hover:text-bad"><X size={16} /></button>
          </li>
        ))}
      </ul>
      <div className="mt-3 flex gap-2">
        <textarea rows={2} value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="Paste a post you wrote before" className="field h-auto flex-1 py-2" />
        <button type="button" disabled={!draft.trim()} onClick={() => { setPosts((xs) => [...xs, draft.trim()]); setDraft(''); }} className="btn-ghost self-end">Add</button>
      </div>
    </>
  );
};

const CustomersStep = () => {
  const columns = ['mobile', 'pref_lang', 'wa_optin_date', 'sms_optin_date', 'name'];
  const targets = ['Phone', 'Language', 'WhatsApp consent date', 'SMS consent date'];
  const [mapping, setMapping] = useState({ Phone: 'mobile', Language: 'pref_lang', 'WhatsApp consent date': 'wa_optin_date', 'SMS consent date': 'sms_optin_date' });
  return (
    <>
      <label className="btn-ghost mb-4 h-9 cursor-pointer">
        <Upload size={15} /> Upload customer CSV
        <input type="file" accept=".csv" className="sr-only" />
      </label>
      <p className="mb-3 text-sm font-medium">Match your columns</p>
      <div className="grid gap-3 sm:grid-cols-2">
        {targets.map((t) => (
          <Field key={t} label={t}>
            <select value={mapping[t]} onChange={(e) => setMapping({ ...mapping, [t]: e.target.value })} className="field">
              {columns.map((c) => <option key={c}>{c}</option>)}
            </select>
          </Field>
        ))}
      </div>
      <p className="mt-4 text-xs text-ink/55">Names are not imported. Last import: 12 accepted, 2 rejected. Manage customers on Customers & Send.</p>
    </>
  );
};

// S1: upload once, reused in every campaign. Brand Constitution is proposed from samples and versioned.
const BrandData = () => {
  const { dispatch } = useStore();
  const [step, setStep] = useState(STEPS[0]);
  const [brand, setBrand] = useState(initialBrand);
  const [aud, setAud] = useState(initialAudiences);
  const [rules, setRules] = useState(decisionRules);
  const [proposed, setProposed] = useState(false);
  const index = STEPS.indexOf(step);

  const next = () => {
    dispatch({ type: 'LOG', actor: 'Priya', kind: 'scope', action: `Saved ${step.toLowerCase()}`, why: 'Onboarding' });
    if (index < STEPS.length - 1) setStep(STEPS[index + 1]);
    else navigate('home');
  };

  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
      <section className="card">
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
          <Tabs tabs={STEPS} active={step} onChange={setStep} />
          <span className="text-xs font-medium text-ink/55">Step {index + 1} of {STEPS.length}</span>
        </div>
        {step === 'Menu & prices' && <MenuStep />}
        {step === 'Photos' && <PhotosStep />}
        {step === 'Sample posts' && <PostsStep />}
        {step === 'Customers' && <CustomersStep />}
        <div className="mt-6 flex flex-wrap items-center justify-between gap-3 border-t border-ink/8 pt-4">
          <p className="max-w-sm text-xs text-ink/55">If you skip: {SKIP_COST[step]}</p>
          <div className="flex gap-2">
            {index < STEPS.length - 1 && <button type="button" onClick={() => setStep(STEPS[index + 1])} className="btn-ghost">Skip</button>}
            <button type="button" onClick={next} className="btn-primary">Save and continue <ArrowRight size={16} /></button>
          </div>
        </div>
      </section>

      <div className="flex flex-col gap-4">
        <section className="card">
          <CardTitle
            sub={`Version ${brand.version}. Sent with every model call.`}
            action={
              <button type="button" onClick={() => setProposed(true)} className="btn-ghost h-9">
                <WandSparkles size={15} /> Propose from samples
              </button>
            }
          >
            Brand constitution
          </CardTitle>
          {proposed && <p className="mb-3 rounded-xl bg-accent-soft p-3 text-xs">Proposed from your 2 sample posts: keep the warm tone, add “Kannada first”. Edit below and save.</p>}
          <div className="flex flex-col gap-4">
            <Field label="Brand voice">
              <textarea rows={2} value={brand.voice} onChange={(e) => setBrand({ ...brand, voice: e.target.value })} className="field h-auto py-2" />
            </Field>
            <TagInput label="Banned phrases" values={brand.banned_phrases} onChange={(v) => setBrand({ ...brand, banned_phrases: v })} placeholder="Type and press Enter" />
            <TagInput label="Taboo claims" values={brand.taboo_claims} onChange={(v) => setBrand({ ...brand, taboo_claims: v })} placeholder="e.g. health claims" />
            <button type="button" onClick={() => setBrand({ ...brand, version: brand.version + 1 })} className="btn-dark w-fit">Save as version {brand.version + 1}</button>
          </div>
        </section>

        <section className="card">
          <CardTitle sub="Grounded in your customer list. Personas stay fixed between runs.">Audiences</CardTitle>
          <ul className="flex flex-col gap-2">
            {aud.map((a) => (
              <li key={a.id} className="rounded-xl bg-ink/5 p-3 text-sm">
                <div className="flex items-center justify-between gap-2">
                  <input value={a.name} onChange={(e) => setAud((xs) => xs.map((x) => (x.id === a.id ? { ...x, name: e.target.value } : x)))} className="min-w-0 flex-1 bg-transparent font-semibold focus:outline-none" aria-label="Audience name" />
                  <button type="button" onClick={() => setAud((xs) => xs.filter((x) => x.id !== a.id))} aria-label={`Remove ${a.name}`} className="text-ink/45 hover:text-bad"><X size={15} /></button>
                </div>
                <p className="text-xs text-ink/60">{a.description}</p>
              </li>
            ))}
          </ul>
          <button type="button" onClick={() => setAud((xs) => [...xs, { id: `a${Date.now()}`, name: 'New audience', description: 'Describe who they are.', persona: [] }])} className="btn-ghost mt-3 h-9">
            <Plus size={15} /> Add audience
          </button>
        </section>

        <section className="card">
          <CardTitle sub="Learned from your edits. Confirm to apply them to every campaign.">Remembered rules</CardTitle>
          <ul className="flex flex-col gap-2">
            {rules.map((r) => (
              <li key={r.id} className="flex items-center justify-between gap-3 rounded-xl bg-ink/5 p-3 text-sm">
                <span className="min-w-0">
                  <span className="block font-medium">{r.rule}</span>
                  <span className="text-xs text-ink/55">{r.reason}</span>
                </span>
                {r.status === 'confirmed' ? (
                  <span className="inline-flex items-center gap-1 text-xs font-semibold text-good"><Check size={13} /> Confirmed</span>
                ) : (
                  <span className="flex shrink-0 gap-1">
                    <button type="button" onClick={() => setRules((xs) => xs.map((x) => (x.id === r.id ? { ...x, status: 'confirmed' } : x)))} className="btn-dark h-8 px-3 text-xs">Confirm</button>
                    <button type="button" onClick={() => setRules((xs) => xs.filter((x) => x.id !== r.id))} className="btn-ghost h-8 px-3 text-xs">Drop</button>
                  </span>
                )}
              </li>
            ))}
          </ul>
        </section>
      </div>
    </div>
  );
};

export default BrandData;
