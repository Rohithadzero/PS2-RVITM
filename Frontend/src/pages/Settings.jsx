import { useCallback, useEffect, useState } from 'react';
import { KeyRound, ShieldCheck, CircleAlert, Trash2, Loader2, Mic } from 'lucide-react';
import { CardTitle, Field, Tabs, Banner } from '../components/ui';
import { api, API_URL, runEvals } from '../campaign/lib/api';

const TABS = ['Providers', 'Voice', 'Calibration', 'Guardrails'];

const CAPABILITY = {
  text: { title: 'Text', model: 'agnes-3.0-flash', note: 'Copy, interview extraction, meaning check, change by voice.' },
  image: { title: 'Images', model: 'agnes-image-2.5-flash', note: 'Backgrounds for posts, stories, posters, blog covers.' },
  video: { title: 'Video', model: 'agnes-video-2.5-flash', note: 'Reel clips. Free tier allows 1 request a minute.' },
};

const Badge = ({ children, tone = 'neutral' }) => {
  const cls = { neutral: 'bg-ink/5 text-ink/70', good: 'bg-good/12 text-good', accent: 'bg-accent-soft text-accent' }[tone];
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

const ProvidersTab = ({ data, reload }) => (
  <div className="grid gap-4 xl:grid-cols-2">
    {Object.keys(CAPABILITY).map((cap) => {
      const row = data.providers.find((p) => p.capability === cap) || { key_set: false };
      return <ProviderCard key={cap} cap={cap} row={row} onSaved={reload} />;
    })}
    <section className="card">
      <CardTitle sub="Agnes has no audio models">Speech</CardTitle>
      <p className="text-sm text-ink/65">Speech to text uses the browser microphone, or offline Vosk on this machine. Read-back uses the browser voice. Other speech providers are not connected yet.</p>
    </section>
  </div>
);

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
      const r = await fetch(`${API_URL}/stt`, { method: 'POST', body: form });
      const body = await r.json();
      if (!r.ok) throw new Error(body?.detail?.message || 'Request failed');
      setState({ text: body.text || '(no speech found)', ms: body.latency_ms, model: body.model });
    } catch (e) {
      setState({ error: e.message });
    }
  };

  return (
    <div className="grid gap-4 xl:grid-cols-2">
      <section className="card">
        <CardTitle sub="Runs on this machine. No audio leaves it.">Offline speech to text (Vosk)</CardTitle>
        <ul className="flex flex-col gap-2 text-sm">
          {['en', 'hi', 'kn'].map((l) => (
            <li key={l} className="flex items-center justify-between rounded-xl bg-ink/5 px-3 py-2.5">
              <span className="font-medium">{{ en: 'English', hi: 'Hindi', kn: 'Kannada' }[l]}</span>
              {installed.includes(l) ? <Badge tone="good">installed</Badge> : <Badge>{l === 'kn' ? 'no Vosk model, use browser mic' : 'not installed'}</Badge>}
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

// S13: bring your own Agnes key per capability, offline voice, and the numbers the planner uses (docs/settings.md).
const Settings = () => {
  const [tab, setTab] = useState('Providers');
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
      {!data && !error && <p className="text-sm text-white/60">Loading.</p>}
      {data && tab === 'Providers' && <ProvidersTab data={data} reload={load} />}
      {data && tab === 'Voice' && <VoiceTab data={data} />}
      {tab === 'Calibration' && <CalibrationTab />}
      {tab === 'Guardrails' && <GuardrailsTab />}
    </div>
  );
};

export default Settings;
