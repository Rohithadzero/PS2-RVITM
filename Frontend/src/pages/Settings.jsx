import { useCallback, useEffect, useState } from 'react';
import { KeyRound, ShieldCheck, CircleAlert, Trash2, Loader2, Mic, Check, RotateCcw } from 'lucide-react';
import { CardTitle, Field, Tabs, Banner, Toggle } from '../components/ui';
import { api, API_URL, runEvals } from '../campaign/lib/api';
import { readVoicePref, saveVoicePref } from '../campaign/lib/voice';
import { ACCENTS, BACKDROPS, DEFAULTS, SURFACES, useAppearance } from '../lib/appearance';

const TABS = ['Appearance', 'Providers', 'Voice', 'Calibration', 'Guardrails'];

const CAPABILITY = {
  text: { title: 'Text', model: 'agnes-3.0-flash', note: 'Copy, interview extraction, meaning check, change by voice.' },
  image: { title: 'Images', model: 'agnes-image-2.5-flash', note: 'Backgrounds for posts, stories, posters, blog covers.' },
  video: { title: 'Video', model: 'agnes-video-2.5-flash', note: 'Reel clips. Free tier allows 1 request a minute.' },
};

const Badge = ({ children, tone = 'neutral' }) => {
  const cls = { neutral: 'bg-ink/5 text-ink/70', good: 'bg-good/12 text-good', accent: 'bg-accent-soft text-accent-deep' }[tone];
  return <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${cls}`}>{children}</span>;
};

const ProviderCard = ({ cap, row, onSaved }) => {
  const meta = CAPABILITY[cap];
  const [key, setKey] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null); // { ok, text }

  const save = async () => {
    setBusy(true);
    setMsg(null);
    try {
      await api(`/settings/providers/${cap}`, { method: 'PUT', body: JSON.stringify({ provider: 'agnes', api_key: key.trim(), model: meta.model }) });
      setKey('');
      setMsg({ ok: true, text: 'Saved. Requests for this capability now use your key. It is stored encrypted and never shown again.' });
      onSaved();
    } catch (e) {
      setMsg({ ok: false, text: e.message });
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    setBusy(true);
    try {
      await api(`/settings/providers/${cap}`, { method: 'DELETE' });
      setMsg({ ok: true, text: 'Key removed. The shared default is back.' });
      onSaved();
    } catch (e) {
      setMsg({ ok: false, text: e.message });
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="card">
      <CardTitle sub={meta.model} action={row.key_set ? <Badge tone="good">Your key ••••{row.last4}</Badge> : <Badge tone="accent">Default key</Badge>}>
        {meta.title}
      </CardTitle>
      <p className="text-sm text-ink/65">{meta.note}</p>
      <div className="mt-4">
        <Field label="Agnes API key" hint="Leave the default, or paste your own to use your own limits. Only the last 4 characters are kept for display.">
          <input type="password" autoComplete="off" value={key} onChange={(e) => setKey(e.target.value)} className="field font-mono" placeholder={row.last4 ? `••••••••${row.last4}` : 'Paste key'} />
        </Field>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button type="button" disabled={!key.trim() || busy} onClick={save} className="btn-primary">
          {busy ? <Loader2 size={15} className="animate-spin" /> : <KeyRound size={15} />} Save key
        </button>
        {row.key_set && (
          <button type="button" disabled={busy} onClick={remove} className="btn-ghost">
            <Trash2 size={15} /> Remove key
          </button>
        )}
      </div>
      {msg && (
        <p role="status" className={`mt-3 flex items-start gap-1.5 text-xs font-medium ${msg.ok ? 'text-good' : 'text-bad'}`}>
          {msg.ok ? <ShieldCheck size={14} className="mt-px shrink-0" /> : <CircleAlert size={14} className="mt-px shrink-0" />} {msg.text}
        </p>
      )}
    </section>
  );
};


// Groq and Gemini keys live in the server's .env. These switches are the owner's consent to use them.
const ServicesCard = () => {
  const [rows, setRows] = useState(null);
  const [error, setError] = useState('');
  useEffect(() => {
    api('/settings/toggles').then((d) => setRows(d.toggles)).catch((e) => setError(e.message));
  }, []);
  const flip = async (name, enabled) => {
    setError('');
    const before = rows;
    setRows((cur) => cur.map((r) => (r.name === name ? { ...r, enabled, active: r.configured && enabled } : r)));
    try {
      const next = await api(`/settings/toggles/${name}`, { method: 'PUT', body: JSON.stringify({ enabled }) });
      setRows((cur) => cur.map((r) => (r.name === name ? next : r)));
    } catch (e) {
      setRows(before);
      setError(e.message);
    }
  };
  return (
    <section className="card xl:col-span-2">
      <CardTitle sub="Switch a service off to stop the app using it, even if its key is set.">Other services</CardTitle>
      {error && <p role="alert" className="mb-2 text-sm text-bad">{error}</p>}
      {!rows && !error && <p className="text-sm text-ink/55">Loading.</p>}
      <ul className="flex flex-col gap-2">
        {rows?.map((r) => (
          <li key={r.name} className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-ink/5 px-3 py-3">
            <div className="min-w-0">
              <p className="flex flex-wrap items-center gap-2 text-sm font-semibold">
                {r.label}
                {r.configured ? <Badge tone={r.active ? 'good' : 'neutral'}>{r.active ? 'On' : 'Off'}</Badge> : <Badge>No key on the server</Badge>}
              </p>
              <p className="text-xs text-ink/60">{r.used_for}</p>
              {!r.configured && <p className="text-xs text-ink/50">Add {r.name === 'groq' ? 'GROQ_API_KEY' : 'GEMINI_API_KEY'} to the server's .env, then restart it.</p>}
            </div>
            <Toggle checked={r.enabled} onChange={(v) => flip(r.name, v)} label={`Use ${r.label}`} />
          </li>
        ))}
      </ul>
    </section>
  );
};

const ProvidersTab = ({ data, reload }) => (
  <div className="grid gap-4 xl:grid-cols-2">
    {Object.keys(CAPABILITY).map((cap) => {
      const row = data.providers.find((p) => p.capability === cap) || { key_set: false };
      return <ProviderCard key={cap} cap={cap} row={row} onSaved={reload} />;
    })}
    <ServicesCard />
    <section className="card">
      <CardTitle sub="Agnes has no audio models">Speech</CardTitle>
      <p className="text-sm text-ink/65">Speech to text uses the browser microphone, or offline Vosk on this machine. Read-back uses the browser voice. Other speech providers are not connected yet.</p>
    </section>
  </div>
);

const ENGINE_LABEL = { vosk: 'Offline (Vosk)', groq: 'Groq Whisper (cloud)' };
const PREFS = [
  { id: 'auto', label: 'Automatic', hint: 'Kannada goes to Groq when it is on. Other languages use the browser microphone, else the server.' },
  { id: 'server', label: 'Always the server', hint: 'Record, then transcribe on the server (offline Vosk, or Groq for Kannada). Nothing live while you talk.' },
  { id: 'browser', label: 'Browser only', hint: 'Use only the browser speech recognition. Kannada may be unreliable.' },
];

const EnginesCard = () => {
  const [map, setMap] = useState(null);
  const [pref, setPref] = useState(readVoicePref);
  useEffect(() => {
    api('/stt/languages').then(setMap).catch(() => setMap(false));
  }, []);
  const choose = (id) => {
    saveVoicePref(id);
    setPref(id);
  };
  return (
    <section className="card xl:col-span-2">
      <CardTitle sub="What turns your voice into text, per language, right now.">Microphone engine</CardTitle>
      {map === false && <p role="alert" className="text-sm text-bad">The server did not answer.</p>}
      {map && (
        <ul className="mb-4 grid gap-2 sm:grid-cols-3">
          {['en', 'hi', 'kn'].map((l) => (
            <li key={l} className="rounded-xl bg-ink/5 px-3 py-2.5 text-sm">
              <span className="font-semibold">{{ en: 'English', hi: 'Hindi', kn: 'Kannada' }[l]}</span>
              <span className="mt-0.5 block text-xs text-ink/60">{map.engines[l] ? ENGINE_LABEL[map.engines[l]] : l === 'kn' ? 'Needs Groq switched on' : 'Not installed'}</span>
            </li>
          ))}
        </ul>
      )}
      <div role="radiogroup" aria-label="Microphone engine" className="flex flex-col gap-2">
        {PREFS.map((p) => (
          <label key={p.id} className={`flex cursor-pointer items-start gap-3 rounded-xl border px-3 py-2.5 text-sm ${pref === p.id ? 'border-accent bg-accent-soft/50' : 'border-ink/10'}`}>
            <input type="radio" name="voice-engine" checked={pref === p.id} onChange={() => choose(p.id)} className="mt-1 accent-[var(--color-accent)]" />
            <span><span className="font-medium">{p.label}</span><span className="block text-xs text-ink/60">{p.hint}</span></span>
          </label>
        ))}
      </div>
    </section>
  );
};

const VoiceTab = ({ data }) => {
  const [lang, setLang] = useState('en');
  const [state, setState] = useState(null);
  const installed = data.stt_offline.languages;

  const test = async (file) => {
    if (!file) return;
    setState({ busy: true });
    const form = new FormData();
    form.append('audio', file);
    form.append('lang', lang);
    try {
      const r = await fetch(`${API_URL}/stt`, { method: 'POST', body: form, credentials: 'include' });
      const body = await r.json();
      if (!r.ok) throw new Error(body?.detail?.message || 'Request failed');
      setState({ text: body.text || '(no speech found)', ms: body.latency_ms, model: body.model });
    } catch (e) {
      setState({ error: e.message });
    }
  };

  return (
    <div className="grid gap-4 xl:grid-cols-2">
      <EnginesCard />
      <section className="card">
        <CardTitle sub="Runs on this machine. No audio leaves it.">Offline speech to text (Vosk)</CardTitle>
        <ul className="flex flex-col gap-2 text-sm">
          {['en', 'hi', 'kn'].map((l) => (
            <li key={l} className="flex items-center justify-between rounded-xl bg-ink/5 px-3 py-2.5">
              <span className="font-medium">{{ en: 'English', hi: 'Hindi', kn: 'Kannada' }[l]}</span>
              {installed.includes(l) ? <Badge tone="good">installed</Badge> : <Badge>{l === 'kn' ? 'no Vosk model: use Groq (Other services) or the browser mic' : 'not installed'}</Badge>}
            </li>
          ))}
        </ul>
        <p className="mt-3 text-xs text-ink/55">Install models with <code>python apps/api/scripts/get_vosk_models.py</code>. Vosk has no Kannada or Hinglish model.</p>
      </section>
      <section className="card">
        <CardTitle sub="Upload a 16-bit WAV to see what Vosk hears.">Try it</CardTitle>
        <div className="flex flex-wrap items-end gap-3">
          <Field label="Language">
            <select value={lang} onChange={(e) => setLang(e.target.value)} className="field">
              {installed.map((l) => <option key={l} value={l}>{l}</option>)}
            </select>
          </Field>
          <label className="btn-ghost cursor-pointer">
            <Mic size={15} /> Choose WAV
            <input type="file" accept="audio/wav,.wav" className="sr-only" onChange={(e) => test(e.target.files?.[0])} disabled={!installed.length} />
          </label>
        </div>
        {state?.busy && <p className="mt-3 text-sm text-ink/60">Listening.</p>}
        {state?.text && <p className="mt-3 rounded-xl bg-ink/5 p-3 text-sm">{state.text} <span className="text-xs text-ink/50">({state.model}, {state.ms} ms)</span></p>}
        {state?.error && <p role="alert" className="mt-3 text-sm text-bad">{state.error}</p>}
      </section>
    </div>
  );
};

const CalibrationTab = () => {
  const [c, setC] = useState(null);
  useEffect(() => {
    api('/calibration').then(setC).catch(() => setC(false));
  }, []);
  if (c === null) return <p className="text-sm text-white/60">Loading.</p>;
  if (c === false) return <Banner tone="warn">Calibration is not available.</Banner>;
  return (
    <section className="card">
      <CardTitle sub={`Source: ${c.source === 'defaults' ? 'documented free-tier limits' : `measured, ${c.source}`}. The Budget Planner uses these numbers.`}>Calibration</CardTitle>
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-xs text-ink/50">
            <th className="pb-2 font-medium">Capability</th>
            <th className="pb-2 font-medium">Requests per minute</th>
            <th className="pb-2 font-medium">Typical latency</th>
          </tr>
        </thead>
        <tbody>
          {['text', 'image', 'video'].map((k) => (
            <tr key={k} className="border-t border-ink/8">
              <td className="py-2 font-medium">{CAPABILITY[k].title}</td>
              <td className="py-2">{c.rpm[k]}</td>
              <td className="py-2">{c.latency_s[k]} s</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="mt-3 text-xs text-ink/55">Run <code>python apps/api/calibration/quick_calibrate.py</code> to measure with your key. Video latency is an estimate until a clip has been generated.</p>
    </section>
  );
};


const GuardrailsTab = () => {
  const [out, setOut] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const run = async () => {
    setBusy(true);
    setError('');
    try {
      setOut(await runEvals());
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };
  useEffect(() => {
    run();
  }, []);
  return (
    <section className="card">
      <CardTitle sub="Offline replays of the guards on synthetic data. They need no key and no network." action={<button type="button" disabled={busy} onClick={run} className="btn-dark h-9 px-4 text-sm">{busy ? <Loader2 size={14} className="animate-spin" /> : <ShieldCheck size={14} />} Run again</button>}>
        Guardrail checks
      </CardTitle>
      {error && <p role="alert" className="text-sm text-bad">{error}</p>}
      {out && (
        <>
          <p role="status" className={`mb-3 rounded-xl px-3 py-2 text-sm font-medium ${out.ok ? 'bg-good/12' : 'bg-bad/12'}`}>{out.ok ? 'Every guard held.' : 'A guard failed. Read the failures below.'}</p>
          <ul className="flex flex-col gap-2">
            {out.checks.map((c) => (
              <li key={c.id} className="rounded-xl bg-ink/5 px-3 py-2.5">
                <p className="flex flex-wrap items-center justify-between gap-2 text-sm font-semibold">
                  <span>{c.title}</span>
                  <Badge tone={c.ok ? 'good' : 'accent'}>{c.passed} of {c.total}</Badge>
                </p>
                <p className="text-xs text-ink/60">{c.proves}</p>
                {c.failures.map((f) => <p key={f} className="mt-1 text-xs font-medium text-bad">{f}</p>)}
              </li>
            ))}
          </ul>
          <p className="mt-3 text-xs text-ink/55">{out.note}</p>
        </>
      )}
    </section>
  );
};

const Choices = ({ name, options, value, onChange }) => (
  <div role="radiogroup" aria-label={name} className="flex flex-col gap-2">
    {options.map((o) => (
      <label key={o.id} className={`flex cursor-pointer items-start gap-3 rounded-xl border px-3 py-2.5 text-sm transition-colors ${value === o.id ? 'border-accent bg-accent-soft/60' : 'border-ink/10 hover:bg-ink/5'}`}>
        <input type="radio" name={name} checked={value === o.id} onChange={() => onChange(o.id)} className="mt-1 accent-[var(--color-accent)]" />
        <span><span className="font-medium">{o.label}</span><span className="block text-xs text-ink/60">{o.hint}</span></span>
      </label>
    ))}
  </div>
);

// Saved on this device only. Changes show straight away across the whole app.
const AppearanceTab = () => {
  const [look, setLook] = useAppearance();
  const preset = ACCENTS.find((a) => a.hex === look.accent.toLowerCase());
  const isDefault = look.accent === DEFAULTS.accent && look.surface === DEFAULTS.surface && look.backdrop === DEFAULTS.backdrop;

  return (
    <div className="grid gap-4 xl:grid-cols-2">
      <section className="card xl:col-span-2">
        <CardTitle
          sub="Buttons, the active page, the mic, toggles and highlights all use this colour."
          action={
            <button type="button" disabled={isDefault} onClick={() => setLook(DEFAULTS)} className="btn-ghost h-9 px-4 text-sm">
              <RotateCcw size={14} /> Reset
            </button>
          }
        >
          Accent colour
        </CardTitle>
        <div role="radiogroup" aria-label="Accent colour" className="flex flex-wrap gap-2">
          {ACCENTS.map((a) => {
            const on = preset?.id === a.id;
            return (
              <button
                key={a.id}
                type="button"
                role="radio"
                aria-checked={on}
                onClick={() => setLook({ accent: a.hex })}
                className={`flex items-center gap-2 rounded-full border py-1.5 pl-1.5 pr-3.5 text-sm font-medium transition-colors ${on ? 'border-ink bg-ink/5' : 'border-ink/10 hover:bg-ink/5'}`}
              >
                <span className="grid size-7 place-items-center rounded-full ring-1 ring-ink/10" style={{ background: a.hex }}>
                  {on && <Check size={15} strokeWidth={3} className="text-on-accent" />}
                </span>
                {a.label}
              </button>
            );
          })}
          <label className={`flex cursor-pointer items-center gap-2 rounded-full border py-1.5 pl-1.5 pr-3.5 text-sm font-medium transition-colors ${preset ? 'border-ink/10 hover:bg-ink/5' : 'border-ink bg-ink/5'}`}>
            <input type="color" value={look.accent} onChange={(e) => setLook({ accent: e.target.value })} className="size-7 cursor-pointer rounded-full border-0 bg-transparent p-0 [&::-webkit-color-swatch-wrapper]:p-0 [&::-webkit-color-swatch]:rounded-full [&::-webkit-color-swatch]:border-0 [&::-moz-color-swatch]:rounded-full [&::-moz-color-swatch]:border-0" />
            Custom <span className="font-mono text-xs text-ink/50">{look.accent}</span>
          </label>
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-3 rounded-2xl bg-ink/5 p-3">
          <span className="text-xs font-medium text-ink/50">Preview</span>
          <span className="btn-primary pointer-events-none">Primary button</span>
          <span className="voice-mic grid size-10 place-items-center rounded-full"><Mic size={18} /></span>
          <Toggle checked onChange={() => {}} label="Preview toggle" />
          <span className="rounded-full bg-accent-soft px-2.5 py-1 text-xs font-semibold text-accent-deep">Highlight</span>
        </div>
      </section>
      <section className="card">
        <CardTitle sub="How see-through the panels and cards are.">Surfaces</CardTitle>
        <Choices name="Surfaces" options={SURFACES} value={look.surface} onChange={(surface) => setLook({ surface })} />
      </section>
      <section className="card">
        <CardTitle sub="What sits behind the glass.">Background</CardTitle>
        <Choices name="Background" options={BACKDROPS} value={look.backdrop} onChange={(backdrop) => setLook({ backdrop })} />
      </section>
    </div>
  );
};

// S13: bring your own Agnes key per capability, offline voice, and the numbers the planner uses (docs/settings.md).
const Settings = () => {
  const [tab, setTab] = useState('Appearance');
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const load = useCallback(() => {
    api('/settings/providers').then((d) => (setData(d), setError(''))).catch((e) => setError(e.message));
  }, []);
  useEffect(load, [load]);

  return (
    <div className="flex flex-col gap-4">
      {data && !data.default_agnes_key_configured && !data.providers.some((p) => p.key_set) && (
        <Banner tone="warn">No Agnes key is set on the server. Paste your own below to start writing.</Banner>
      )}
      {error && <Banner tone="warn">{error}</Banner>}
      <Tabs tabs={TABS} active={tab} onChange={setTab} dark />
      {tab === 'Appearance' && <AppearanceTab />}
      {!data && !error && tab !== 'Appearance' && <p className="text-sm text-white/60">Loading.</p>}
      {data && tab === 'Providers' && <ProvidersTab data={data} reload={load} />}
      {data && tab === 'Voice' && <VoiceTab data={data} />}
      {tab === 'Calibration' && <CalibrationTab />}
      {tab === 'Guardrails' && <GuardrailsTab />}
    </div>
  );
};

export default Settings;
