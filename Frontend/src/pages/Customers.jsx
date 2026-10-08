import { useState } from 'react';
import { Upload, Radio, ShieldCheck, ShieldX, CircleAlert } from 'lucide-react';
import { CardTitle, Field, Toggle, Banner, Empty } from '../components/ui';
import { audiences, customerImport, LANGS } from '../data/mock';
import { useStore } from '../state/store';

const consentLabel = (date, optedOut) => (optedOut ? 'opted out' : date ? `yes, ${new Date(date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })}` : 'no');

// S12: consent list, per-customer language, and a simulated send gated by the validator.
const Customers = () => {
  const { state, dispatch, approvedFacts } = useStore();
  const [audience, setAudience] = useState('locals');
  const [channel, setChannel] = useState('whatsapp');
  const [imported, setImported] = useState(false);
  const customers = state.customers;

  // Backend: POST /send/preview { campaign_id, audience_id, channel }.
  const consentKey = channel === 'sms' ? 'sms' : 'whatsapp';
  const assetChannel = channel === 'sms' ? 'whatsapp' : channel;
  const reachable = customers.filter((c) => !c.opted_out && c[consentKey]);
  const skipped = customers.length - reachable.length;
  const byLang = LANGS.map((l) => ({ ...l, count: reachable.filter((c) => c.lang === l.id).length }));
  const assets = LANGS.map((l) => state.assets.find((a) => a.id === `${audience}-${l.id}-${assetChannel}`));
  const blocked = assets.filter((a) => a && (a.status === 'blocked' || a.facts_version !== approvedFacts.version));
  const notApproved = assets.filter((a) => a && a.status !== 'approved' && !blocked.includes(a));
  const gateOk = blocked.length === 0;

  // Backend: POST /send/simulate writes send_log rows; never contacts a real provider.
  const simulate = () => {
    const rows = customers.map((c) => {
      const asset = assets.find((a) => a.lang === c.lang);
      const outcome = c.opted_out
        ? 'skipped_opt_out'
        : !c[consentKey]
          ? 'skipped_no_consent'
          : asset.status === 'blocked'
            ? 'blocked_validator'
            : asset.facts_version !== approvedFacts.version
              ? 'blocked_stale'
              : 'simulated_sent';
      return { id: `${c.id}-${Date.now()}`, phone: c.phone, lang: c.lang, asset: asset.id, facts: approvedFacts.version, channel, outcome };
    });
    dispatch({ type: 'SIMULATE_SEND', rows });
  };

  return (
    <div className="flex flex-col gap-4">
      <Banner tone="warn">
        <span className="font-semibold">Simulated send.</span> No real messages go out. Real sending needs DLT registration and WhatsApp-approved templates.
      </Banner>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
        <section className="card min-w-0">
          <CardTitle
            sub="Only masked phone, language and consent per channel are shown."
            action={
              <label className="btn-ghost h-9 cursor-pointer">
                <Upload size={15} /> Upload CSV
                <input type="file" accept=".csv" className="sr-only" onChange={() => setImported(true)} />
              </label>
            }
          >
            Customers ({customers.length})
          </CardTitle>

          {imported && (
            <div className="mb-4 rounded-xl bg-ink/5 p-3 text-sm">
              <p className="font-semibold">{customerImport.accepted} rows accepted, {customerImport.rejected.length} rejected</p>
              <ul className="mt-1 text-xs text-ink/60">
                {customerImport.rejected.map((r) => (
                  <li key={r.row}>Row {r.row}: {r.reason}</li>
                ))}
              </ul>
            </div>
          )}

          {customers.length === 0 ? (
            <Empty title="No customers yet">Upload a CSV with phone, language and consent per channel.</Empty>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[560px] text-sm">
                <thead>
                  <tr className="text-left text-xs text-ink/50">
                    <th className="pb-2 font-medium">Phone</th>
                    <th className="pb-2 font-medium">Language</th>
                    <th className="pb-2 font-medium">WhatsApp consent</th>
                    <th className="pb-2 font-medium">SMS consent</th>
                    <th className="pb-2 font-medium">Opted out</th>
                  </tr>
                </thead>
                <tbody>
                  {customers.map((c) => (
                    <tr key={c.id} className="border-t border-ink/8">
                      <td className="py-2 font-mono text-xs">{c.phone}</td>
                      <td className="py-2">{c.lang.toUpperCase()}</td>
                      <td className={`py-2 ${c.whatsapp && !c.opted_out ? '' : 'text-ink/45'}`}>{consentLabel(c.whatsapp, c.opted_out)}</td>
                      <td className={`py-2 ${c.sms && !c.opted_out ? '' : 'text-ink/45'}`}>{consentLabel(c.sms, c.opted_out)}</td>
                      <td className="py-2">
                        <Toggle checked={c.opted_out} onChange={() => dispatch({ type: 'TOGGLE_OPT_OUT', id: c.id })} label={`Opt out ${c.phone}`} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <section className="card self-start">
          <CardTitle sub="Each customer gets the asset in their own language.">Send</CardTitle>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Audience">
              <select value={audience} onChange={(e) => setAudience(e.target.value)} className="field">
                {audiences.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
              </select>
            </Field>
            <Field label="Channel">
              <select value={channel} onChange={(e) => setChannel(e.target.value)} className="field">
                <option value="whatsapp">WhatsApp</option>
                <option value="sms">SMS</option>
              </select>
            </Field>
          </div>
          <p className="mt-3 text-xs text-ink/55">Asset set: facts v{approvedFacts.version}</p>

          <div className="mt-4 grid grid-cols-4 gap-2 text-center">
            {byLang.map((l) => (
              <div key={l.id} className="rounded-xl bg-ink/5 py-2">
                <p className="text-lg font-bold">{l.count}</p>
                <p className="text-xs text-ink/55">{l.short}</p>
              </div>
            ))}
            <div className="rounded-xl bg-ink/5 py-2">
              <p className="text-lg font-bold">{skipped}</p>
              <p className="text-xs text-ink/55">Skipped</p>
            </div>
          </div>

          <div className={`mt-4 flex items-start gap-2 rounded-xl p-3 text-sm ${gateOk ? 'bg-good/10' : 'bg-bad/10'}`}>
            {gateOk ? <ShieldCheck size={17} className="mt-0.5 shrink-0 text-good" /> : <ShieldX size={17} className="mt-0.5 shrink-0 text-bad" />}
            <div>
              <p className="font-semibold">{gateOk ? 'Validator gate: 0 issues' : `Validator gate: ${blocked.length} blocked or stale asset${blocked.length > 1 ? 's' : ''}`}</p>
              {!gateOk && <p className="text-xs text-ink/60">Fix {blocked.map((a) => a.lang.toUpperCase()).join(', ')} before sending.</p>}
              {gateOk && notApproved.length > 0 && (
                <p className="flex items-center gap-1 text-xs text-ink/60"><CircleAlert size={12} /> {notApproved.length} asset(s) still pending approval.</p>
              )}
            </div>
          </div>

          <button type="button" disabled={!gateOk || reachable.length === 0} onClick={simulate} className="btn-primary mt-4 w-full">
            <Radio size={16} /> Simulate send to {reachable.length}
          </button>
        </section>
      </div>

      {state.sendLog.length > 0 && (
        <section className="card overflow-x-auto">
          <CardTitle sub="Every row is simulated.">Send log</CardTitle>
          <table className="w-full min-w-[560px] text-sm">
            <thead>
              <tr className="text-left text-xs text-ink/50">
                <th className="pb-2 font-medium">Phone</th>
                <th className="pb-2 font-medium">Language</th>
                <th className="pb-2 font-medium">Asset</th>
                <th className="pb-2 font-medium">Facts</th>
                <th className="pb-2 font-medium">Outcome</th>
              </tr>
            </thead>
            <tbody>
              {state.sendLog.map((r) => (
                <tr key={r.id} className="border-t border-ink/8">
                  <td className="py-2 font-mono text-xs">{r.phone}</td>
                  <td className="py-2">{r.lang.toUpperCase()}</td>
                  <td className="py-2 text-xs">{r.asset}</td>
                  <td className="py-2">v{r.facts}</td>
                  <td className={`py-2 text-xs font-medium ${r.outcome === 'simulated_sent' ? 'text-good' : 'text-ink/55'}`}>{r.outcome.replace(/_/g, ' ')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}
    </div>
  );
};

export default Customers;
