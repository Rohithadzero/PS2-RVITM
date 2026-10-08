import { useState } from 'react';
import { KeyRound, ShieldCheck, CircleAlert, ArrowUp, ArrowDown, Trash2, Play, Loader2, Download, LogOut, Gauge, Check } from 'lucide-react';
import { CardTitle, Field, Tabs, Toggle, Banner } from '../components/ui';
import { providers as initialProviders, voiceProviders, voiceOptions, localModels, tiers, priceTable, calibration, usage, LANGS } from '../data/mock';
import { useStore } from '../state/store';

const TABS = ['Providers', 'Voice', 'Limits', 'Calibration', 'Usage', 'Data & privacy'];
const BYO_PROVIDERS = ['Agnes', 'Groq', 'Custom OpenAI-compatible'];

const Badge = ({ children, tone = 'neutral' }) => {
  const cls = { neutral: 'bg-ink/5 text-ink/70', good: 'bg-good/12 text-good', warn: 'bg-warn/15 text-warn', accent: 'bg-accent-soft text-accent' }[tone];
  return <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${cls}`}>{children}</span>;
};

// Blocks private, loopback, link-local and metadata ranges (SSRF). The backend repeats this check after DNS resolution.
const blockedUrl = (url) => {
  try {
    const u = new URL(url);
    if (u.protocol !== 'https:') return true;
    return /^(localhost|127\.|10\.|192\.168\.|169\.254\.|172\.(1[6-9]|2\d|3[01])\.|0\.|\[?::1\]?)/.test(u.hostname);
  } catch {
    return true;
  }
};

const ProviderCard = ({ id, p, onChange }) => {
  const [mode, setMode] = useState(p.mode);
  const [provider, setProvider] = useState(BYO_PROVIDERS[0]);
  const [key, setKey] = useState('');
  const [model, setModel] = useState(p.model);
  const [baseUrl, setBaseUrl] = useState('');
  const [test, setTest] = useState(null); // { ok, message }
  const [testing, setTesting] = useState(false);
  const [fallback, setFallback] = useState(p.fallback);
  const [reels, setReels] = useState(false);

  // Backend: POST /settings/providers/test, then PUT /settings/providers. The key is never sent back.
  const testAndSave = () => {
    setTesting(true);
    setTest(null);
    setTimeout(() => {
      setTesting(false);
      if (provider === 'Custom OpenAI-compatible' && blockedUrl(baseUrl)) return setTest({ ok: false, message: 'That address is not allowed. Use a public HTTPS endpoint.' });
      if (key.trim().length < 12) return setTest({ ok: false, message: 'Provider rejected this key (401).' });
      setTest({ ok: true, message: `Saved. Detected ${model}, free tier, 1.9 s. JSON 100%, tools yes. Calibrating in the background.` });
      onChange(id, { mode: 'byo', provider, key_last4: key.trim().slice(-4) });
      setKey('');
    }, 900);
  };

  const removeKey = () => {
    onChange(id, { mode: 'default', provider: 'Agnes', key_last4: undefined });
    setMode('default');
    setTest(null);
  };

  const move = (i, d) => {
    const xs = [...fallback];
    [xs[i], xs[i + d]] = [xs[i + d], xs[i]];
    setFallback(xs);
  };

  return (
    <section className="card">
      <CardTitle
        sub={p.model}
        action={
          <div className="flex flex-wrap gap-1">
            {p.mode === 'default' ? <Badge tone="accent">Default</Badge> : <Badge tone="good">Your key ••••{p.key_last4}</Badge>}
            <Badge>Cloud</Badge>
            <Badge>Free tier</Badge>
            <Badge tone={id === 'text' ? 'warn' : 'neutral'}>Kannada: {id === 'text' ? 'unverified' : 'n/a'}</Badge>
          </div>
        }
      >
        {p.capability}
      </CardTitle>

      <div className="flex flex-wrap gap-4 text-sm" role="radiogroup" aria-label={`${p.capability} provider`}>
        <label className="flex items-center gap-2">
          <input type="radio" name={`${id}-mode`} checked={mode === 'default'} onChange={() => setMode('default')} className="accent-[var(--color-accent)]" />
          Agnes default (shared key)
        </label>
        <label className="flex items-center gap-2">
          <input type="radio" name={`${id}-mode`} checked={mode === 'byo'} onChange={() => setMode('byo')} className="accent-[var(--color-accent)]" />
          My own key
        </label>
      </div>

      <p className="mt-3 rounded-xl bg-ink/5 px-3 py-2 text-xs text-ink/70">
        {p.status === 'ok' ? (
          <>Status OK, p50 {p.p50}{p.p90 ? `, p90 ${p.p90}` : ''}{p.json ? `, JSON ${p.json}` : ''}{p.tools ? `, tools ${p.tools}` : ''}{p.timeout ? `, timeout ${p.timeout}` : ''}. Tier {p.tier}.</>
        ) : (
          <>Not calibrated yet. Tier {p.tier}.</>
        )}
      </p>

      {id === 'video' && (
        <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
          <label className="flex items-center gap-2 text-sm">
            <Toggle checked={reels} onChange={setReels} label="Enable reels" /> Enable reels
          </label>
          <button type="button" className="btn-ghost h-9"><Gauge size={15} /> Calibrate video (uses 1 clip)</button>
        </div>
      )}

      {mode === 'byo' && (
        <div className="mt-4 grid gap-3 rounded-2xl border border-ink/10 p-4 sm:grid-cols-2">
          <Field label="Provider">
            <select value={provider} onChange={(e) => setProvider(e.target.value)} className="field">
              {BYO_PROVIDERS.filter((x) => id === 'text' || x !== 'Groq').filter((x) => id !== 'video' || x === 'Agnes').map((x) => <option key={x}>{x}</option>)}
            </select>
          </Field>
          <Field label="Model">
            <input value={model} onChange={(e) => setModel(e.target.value)} className="field" />
          </Field>
          {provider === 'Custom OpenAI-compatible' && (
            <div className="sm:col-span-2">
              <Field label="Base URL" hint="HTTPS only. Private and local addresses are blocked.">
                <input value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} className="field" placeholder="https://api.example.com/v1" />
              </Field>
            </div>
          )}
          <div className="sm:col-span-2">
            <Field label="API key" hint="Stored encrypted on our server and never shown again. Only the last 4 characters are kept for display.">
              <input type="password" autoComplete="off" value={key} onChange={(e) => setKey(e.target.value)} className="field font-mono" placeholder={p.key_last4 ? `••••••••${p.key_last4}` : 'Paste key'} />
            </Field>
          </div>
          <div className="flex flex-wrap items-center gap-2 sm:col-span-2">
            <button type="button" disabled={!key.trim() || testing} onClick={testAndSave} className="btn-primary">
              {testing ? <Loader2 size={15} className="animate-spin" /> : <KeyRound size={15} />} Test & save
            </button>
            {p.key_last4 && <button type="button" onClick={removeKey} className="btn-ghost"><Trash2 size={15} /> Remove key</button>}
          </div>
          {test && (
            <p className={`flex items-start gap-1.5 text-xs font-medium sm:col-span-2 ${test.ok ? 'text-good' : 'text-bad'}`}>
              {test.ok ? <ShieldCheck size={14} className="mt-px shrink-0" /> : <CircleAlert size={14} className="mt-px shrink-0" />} {test.message}
            </p>
          )}
        </div>
      )}

      <div className="mt-4">
        <p className="text-xs font-medium text-ink/55">Fallback order</p>
        {fallback.length === 0 ? (
          <p className="mt-1 text-xs text-ink/45">No fallback. Failures show the on-screen alternative.</p>
        ) : (
          <ol className="mt-1.5 flex flex-col gap-1">
            {fallback.map((f, i) => (
              <li key={f} className="flex items-center justify-between rounded-lg bg-ink/5 px-3 py-1.5 text-sm">
                <span>{i + 1}. {f}</span>
                <span className="flex gap-1">
                  <button type="button" disabled={i === 0} onClick={() => move(i, -1)} aria-label={`Move ${f} up`} className="grid size-7 place-items-center rounded-md hover:bg-ink/10 disabled:opacity-30"><ArrowUp size={14} /></button>
                  <button type="button" disabled={i === fallback.length - 1} onClick={() => move(i, 1)} aria-label={`Move ${f} down`} className="grid size-7 place-items-center rounded-md hover:bg-ink/10 disabled:opacity-30"><ArrowDown size={14} /></button>
                </span>
              </li>
            ))}
          </ol>
        )}
      </div>
    </section>
  );
};

const ProvidersTab = () => {
  const [providers, setProviders] = useState(initialProviders);
  const onChange = (id, patch) => setProviders((ps) => ({ ...ps, [id]: { ...ps[id], ...patch } }));
  return (
    <div className="grid gap-4 xl:grid-cols-2">
      {Object.entries(providers).map(([id, p]) => (
        <ProviderCard key={id} id={id} p={p} onChange={onChange} />
      ))}
    </div>
  );
};

const VoiceTab = () => {
  const [rows, setRows] = useState(voiceProviders);
  const [results, setResults] = useState({});
  const testRow = (lang, kind) => {
    setResults((r) => ({ ...r, [`${lang}-${kind}`]: 'running' }));
    setTimeout(() => setResults((r) => ({ ...r, [`${lang}-${kind}`]: kind === 'stt' ? 'Pass: 20 of 20 offer words, 820 ms' : 'Pass: played, 0.9 s' })), 800);
  };
  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
      <section className="card">
        <CardTitle sub="Agnes has no audio, so voice uses local or free providers. Default comes from the bake-off.">Speech per language</CardTitle>
        <div className="flex flex-col gap-4">
          {rows.map((r) => (
            <div key={r.lang} className="rounded-2xl bg-ink/[0.03] p-4">
              <p className="mb-3 font-semibold">{LANGS.find((l) => l.id === r.lang).label}</p>
              <div className="grid gap-3 sm:grid-cols-2">
                {['stt', 'tts'].map((kind) => (
                  <div key={kind}>
                    <Field label={kind === 'stt' ? 'Speech to text' : 'Read-back voice'}>
                      <select value={r[kind]} onChange={(e) => setRows((xs) => xs.map((x) => (x.lang === r.lang ? { ...x, [kind]: e.target.value } : x)))} className="field">
                        {voiceOptions[kind].map((o) => <option key={o}>{o}</option>)}
                      </select>
                    </Field>
                    <div className="mt-2 flex items-center gap-2">
                      <button type="button" onClick={() => testRow(r.lang, kind)} className="btn-ghost h-8 px-3 text-xs"><Play size={13} /> Test with sample</button>
                      <span className="text-xs text-ink/55">{results[`${r.lang}-${kind}`] === 'running' ? 'Testing…' : results[`${r.lang}-${kind}`]}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </section>
      <div className="flex flex-col gap-4">
        <section className="card">
          <CardTitle>Local models</CardTitle>
          <ul className="flex flex-col gap-2 text-sm">
            {localModels.map((m) => (
              <li key={m.name} className="flex items-center justify-between gap-3">
                <span><span className="font-medium">{m.name}</span> <span className="text-xs text-ink/50">{m.size}</span></span>
                <Badge tone={m.status === 'loaded' ? 'good' : m.status === 'loading' ? 'warn' : 'neutral'}>{m.status}</Badge>
              </li>
            ))}
          </ul>
        </section>
        <section className="card">
          <CardTitle>Free allowances</CardTitle>
          {[{ label: 'Sarvam credits', used: 5.5, cap: 100, fmt: (v) => `Rs ${v}` }, { label: 'Groq audio this hour', used: 6000, cap: 7200, fmt: (v) => `${v.toLocaleString('en-IN')} s` }].map((m) => (
            <div key={m.label} className="mb-3 last:mb-0">
              <div className="flex justify-between text-xs"><span className="font-medium">{m.label}</span><span className="text-ink/55">{m.fmt(m.used)} of {m.fmt(m.cap)}</span></div>
              <div className="mt-1 h-2 overflow-hidden rounded-full bg-ink/8"><span className={`block h-full rounded-full ${m.used / m.cap > 0.8 ? 'bg-warn' : 'bg-accent'}`} style={{ width: `${(m.used / m.cap) * 100}%` }} /></div>
            </div>
          ))}
        </section>
      </div>
    </div>
  );
};

const LimitsTab = () => {
  const [tier, setTier] = useState('free');
  const [custom, setCustom] = useState({ text: 10, image: 10, video: 1, daily: 1500, concurrency: 1 });
  const [caps, setCaps] = useState({ time: '3:00', money: 50, review: '8:00', currency: 'INR' });
  return (
    <div className="grid gap-4 xl:grid-cols-2">
      <section className="card">
        <CardTitle sub="Raises or lowers the queue's token buckets and the planner's capacity.">Agnes rate-limit tier</CardTitle>
        <p className="mb-3 flex items-center gap-1.5 rounded-xl bg-good/10 px-3 py-2 text-xs text-ink/70"><Check size={13} className="text-good" /> Detected from response headers: 10 RPM text.</p>
        <div className="flex flex-col gap-2">
          {[...tiers.Agnes, { id: 'custom', label: 'Custom' }].map((t) => (
            <label key={t.id} className={`flex cursor-pointer items-center justify-between gap-3 rounded-xl border px-3 py-2.5 text-sm ${tier === t.id ? 'border-accent bg-accent-soft/50' : 'border-ink/10'}`}>
              <span className="flex items-center gap-2">
                <input type="radio" name="tier" checked={tier === t.id} onChange={() => setTier(t.id)} className="accent-[var(--color-accent)]" />
                <span className="font-medium">{t.label}</span>
              </span>
              {t.text && <span className="text-xs text-ink/55">Text {t.text}, image {t.image}, video {t.video} RPM</span>}
            </label>
          ))}
        </div>
        {tier === 'custom' && (
          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
            {[['text', 'Text RPM'], ['image', 'Image RPM'], ['video', 'Video RPM'], ['daily', 'Daily cap'], ['concurrency', 'Concurrency']].map(([k, label]) => (
              <Field key={k} label={label}>
                <input type="number" min={0} value={custom[k]} onChange={(e) => setCustom({ ...custom, [k]: Number(e.target.value) })} className="field" />
              </Field>
            ))}
          </div>
        )}
      </section>
      <div className="flex flex-col gap-4">
        <section className="card">
          <CardTitle sub="Copied into the Budget Planner as defaults.">Budget caps</CardTitle>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Time limit" hint="Minutes:seconds"><input value={caps.time} onChange={(e) => setCaps({ ...caps, time: e.target.value })} className="field" /></Field>
            <Field label="Review effort" hint="Minutes:seconds"><input value={caps.review} onChange={(e) => setCaps({ ...caps, review: e.target.value })} className="field" /></Field>
            <Field label="Money cap"><input type="number" min={0} value={caps.money} onChange={(e) => setCaps({ ...caps, money: e.target.value })} className="field" /></Field>
            <Field label="Currency">
              <select value={caps.currency} onChange={(e) => setCaps({ ...caps, currency: e.target.value })} className="field"><option>INR</option><option>USD</option></select>
            </Field>
          </div>
        </section>
        <section className="card overflow-x-auto">
          <CardTitle sub="List prices; read-only.">Prices</CardTitle>
          <table className="w-full text-sm">
            <tbody>
              {priceTable.map((p) => (
                <tr key={p.item} className="border-t border-ink/8 first:border-0">
                  <td className="py-2 font-medium">{p.item}</td>
                  <td className="py-2 text-ink/70">{p.price}</td>
                  <td className="py-2 text-right text-xs text-ink/45">checked {p.verified}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      </div>
    </div>
  );
};

const CalibrationTab = () => {
  const [running, setRunning] = useState(null);
  const run = (mode) => {
    setRunning(mode);
    setTimeout(() => setRunning(null), 1600);
  };
  return (
    <section className="card overflow-x-auto">
      <CardTitle
        sub="Measured by the backend. The queue and the planner use these numbers; the planner shows “using calibration from 14:02”."
        action={
          <div className="flex flex-wrap gap-2">
            <button type="button" disabled={Boolean(running)} onClick={() => run('quick')} className="btn-dark">{running === 'quick' ? <Loader2 size={15} className="animate-spin" /> : <Gauge size={15} />} Run quick calibration</button>
            <button type="button" disabled={Boolean(running)} onClick={() => run('full')} className="btn-ghost" title="Adds a video clip and a burst test; takes longer">{running === 'full' ? <Loader2 size={15} className="animate-spin" /> : null} Run full calibration</button>
          </div>
        }
      >
        Calibration
      </CardTitle>
      <table className="w-full min-w-[720px] text-sm">
        <thead>
          <tr className="text-left text-xs text-ink/50">
            {['Provider', 'Capability', 'p50', 'p90', 'Errors', 'Observed limit', 'Tokens', 'Last run', 'TTL'].map((h) => <th key={h} className="pb-2 font-medium">{h}</th>)}
          </tr>
        </thead>
        <tbody>
          {calibration.map((c) => (
            <tr key={`${c.provider}-${c.capability}`} className="border-t border-ink/8">
              <td className="py-2 font-medium">{c.provider}</td>
              <td className="py-2">{c.capability}</td>
              <td className="py-2">{c.p50}</td>
              <td className="py-2">{c.p90}</td>
              <td className="py-2">{c.errors}</td>
              <td className="py-2">{c.limit}</td>
              <td className="py-2">{c.tokens}</td>
              <td className="py-2">{c.stale ? <Badge tone="warn">{c.ran}</Badge> : c.ran}</td>
              <td className="py-2">{c.ttl}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
};

const UsageTab = () => (
  <div className="flex flex-col gap-4">
    {usage.filter((u) => u.warn).map((u) => (
      <Banner key={u.provider} tone="warn">{u.provider} {u.capability}: {u.today.toLocaleString('en-IN')} {u.unit} {u.detail}. Requests may be refused soon.</Banner>
    ))}
    <section className="card overflow-x-auto">
      <CardTitle sub="Today. Actual spend is Rs 0 on free tiers; list price shows what it would cost.">Usage</CardTitle>
      <table className="w-full min-w-[720px] text-sm">
        <thead>
          <tr className="text-left text-xs text-ink/50">
            {['Provider', 'Capability', 'Used', 'Detail', 'List price', 'Actual', '429s', 'Cache hits'].map((h) => <th key={h} className="pb-2 font-medium">{h}</th>)}
          </tr>
        </thead>
        <tbody>
          {usage.map((u) => (
            <tr key={`${u.provider}-${u.capability}`} className="border-t border-ink/8">
              <td className="py-2 font-medium">{u.provider}</td>
              <td className="py-2">{u.capability}</td>
              <td className="py-2">{u.today.toLocaleString('en-IN')} {u.unit}</td>
              <td className="py-2 text-ink/60">{u.detail}</td>
              <td className="py-2">{u.listCost}</td>
              <td className="py-2 font-semibold">{u.actual}</td>
              <td className={`py-2 ${u.rateLimited ? 'font-semibold text-warn' : ''}`}>{u.rateLimited}</td>
              <td className="py-2">{u.cacheHits}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  </div>
);

const DataTab = () => {
  const { dispatch } = useStore();
  const [confirm, setConfirm] = useState(null);
  const [audio, setAudio] = useState({ Sarvam: true, Groq: false, ElevenLabs: false });
  const actions = [
    { id: 'export', label: 'Export all data', icon: Download, danger: false },
    { id: 'data', label: 'Delete all data', icon: Trash2, danger: true },
    { id: 'keys', label: 'Delete all stored API keys', icon: KeyRound, danger: true },
    { id: 'signout', label: 'Sign out of all devices', icon: LogOut, danger: false },
  ];
  return (
    <div className="grid gap-4 xl:grid-cols-2">
      <section className="card">
        <CardTitle>Your data</CardTitle>
        <div className="flex flex-col gap-2">
          {actions.map(({ id, label, icon: Icon, danger }) => (
            <div key={id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-ink/5 px-3 py-2.5">
              <span className="flex items-center gap-2 text-sm font-medium"><Icon size={15} className={danger ? 'text-bad' : ''} /> {label}</span>
              {confirm === id ? (
                <span className="flex gap-1">
                  <button
                    type="button"
                    onClick={() => {
                      setConfirm(null);
                      if (id === 'signout') dispatch({ type: 'SIGN_OUT' });
                    }}
                    className={`btn h-8 px-3 text-xs text-white ${danger ? 'bg-bad hover:bg-bad/90' : 'bg-ink'}`}
                  >
                    {danger ? 'Yes, delete' : 'Confirm'}
                  </button>
                  <button type="button" onClick={() => setConfirm(null)} className="btn-ghost h-8 px-3 text-xs">Cancel</button>
                </span>
              ) : (
                <button type="button" onClick={() => setConfirm(id)} className="btn-ghost h-8 px-3 text-xs">{id === 'export' ? 'Export' : 'Start'}</button>
              )}
            </div>
          ))}
        </div>
        {(confirm === 'data' || confirm === 'keys') && <p className="mt-3 text-xs font-medium text-bad">This cannot be undone.</p>}
      </section>
      <section className="card">
        <CardTitle sub="Local models keep audio on this laptop. Cloud providers receive it only if allowed here.">Where your data goes</CardTitle>
        <ul className="flex flex-col gap-2 text-sm">
          <li className="flex items-center justify-between rounded-xl bg-ink/5 px-3 py-2.5"><span><span className="font-medium">Agnes</span> <span className="text-ink/55">text and images, cloud</span></span><Badge>no audio</Badge></li>
          <li className="flex items-center justify-between rounded-xl bg-ink/5 px-3 py-2.5"><span><span className="font-medium">Local models</span> <span className="text-ink/55">audio, on device</span></span><Badge tone="good">local</Badge></li>
          {Object.entries(audio).map(([name, on]) => (
            <li key={name} className="flex items-center justify-between rounded-xl bg-ink/5 px-3 py-2.5">
              <span><span className="font-medium">{name}</span> <span className="text-ink/55">allow sending audio</span></span>
              <Toggle checked={on} onChange={(v) => setAudio({ ...audio, [name]: v })} label={`Allow sending audio to ${name}`} />
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
};

// S13: bring your own key per capability (default Agnes), voice, limits, calibration, usage, data (docs/settings.md).
const Settings = () => {
  const [tab, setTab] = useState('Providers');
  return (
    <div className="flex flex-col gap-4">
      <Banner tone="info" action={<button type="button" onClick={() => setTab('Providers')} className="btn-glass h-8 px-3 text-xs">Add your own key</button>}>
        The shared default key was rate limited 3 times today. Your own key raises the limits for your campaigns.
      </Banner>
      <Tabs tabs={TABS} active={tab} onChange={setTab} dark />
      {tab === 'Providers' && <ProvidersTab />}
      {tab === 'Voice' && <VoiceTab />}
      {tab === 'Limits' && <LimitsTab />}
      {tab === 'Calibration' && <CalibrationTab />}
      {tab === 'Usage' && <UsageTab />}
      {tab === 'Data & privacy' && <DataTab />}
    </div>
  );
};

export default Settings;
