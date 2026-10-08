import { useState } from 'react';
import { ArrowLeft, Copy, Check, RefreshCw, ImagePlus, ShieldCheck, ShieldX, Pencil, FileQuestion } from 'lucide-react';
import { StatusChip, SlotText, Tabs, ScoreBar, Field, Empty, ValidatorBadge } from '../components/ui';
import { audiences, validatorRules, backTranslations, LANGS, photos, channelName } from '../data/mock';
import { useStore } from '../state/store';
import { renderText, termLabel } from '../lib/facts';
import { navigate } from '../lib/router';
import { issuesOf } from './Board';

const LIMITS = { instagram: 2200, whatsapp: 1024, poster: 140 };

const smsSegments = (text, lang) => {
  const unicode = lang !== 'en';
  const single = unicode ? 70 : 160;
  const multi = unicode ? 67 : 153;
  return text.length <= single ? 1 : Math.ceil(text.length / multi);
};

const ruleResults = (asset, text, approvedVersion) =>
  validatorRules.map((r) => {
    if (r.id === 'V1' && asset.block_reason) {
      return { ...r, pass: false, note: `"${asset.block_reason.token}" is not from a slot. Lock price is ${asset.block_reason.expected}.` };
    }
    if (r.id === 'V10' && asset.facts_version !== approvedVersion) {
      return { ...r, pass: false, note: `Uses facts v${asset.facts_version}; v${approvedVersion} is approved.` };
    }
    if (r.id === 'V9') {
      return { ...r, pass: text.length <= LIMITS[asset.channel], note: `${text.length} of ${LIMITS[asset.channel]} characters${asset.channel === 'whatsapp' ? `, ${smsSegments(text, asset.lang)} SMS segment(s) if sent as SMS` : ''}` };
    }
    return { ...r, pass: true };
  });

const Preview = ({ asset, text }) => {
  if (asset.channel === 'poster') {
    const photo = photos.find((p) => p.id === asset.photo_id);
    const lines = text.split('\n');
    return (
      <div className={`relative flex aspect-[3/4] w-full flex-col justify-end rounded-2xl bg-gradient-to-br ${photo.tint} p-5 text-white`}>
        <span className="absolute left-4 top-4 rounded-full bg-black/35 px-2.5 py-0.5 text-[11px]">Photo: {photo.name}</span>
        <p lang={asset.lang} className="text-2xl font-bold leading-snug">{lines[0]}</p>
        <p lang={asset.lang} className="mt-1 text-sm text-white/85">{lines[1]}</p>
        <p lang={asset.lang} className="mt-2 text-xl font-semibold">{lines[2]}</p>
        <p lang={asset.lang} className="mt-1 text-xs text-white/80">{lines[3]}</p>
      </div>
    );
  }
  if (asset.channel === 'whatsapp') {
    return (
      <div className="rounded-2xl bg-[#e7ddd3] p-4">
        <p lang={asset.lang} className="ml-auto max-w-[90%] rounded-2xl rounded-tr-sm bg-[#d9fdd3] p-3 text-sm text-ink shadow-sm">{text}</p>
      </div>
    );
  }
  return (
    <div className="overflow-hidden rounded-2xl border border-ink/10">
      <div className="aspect-square bg-gradient-to-br from-amber-600 to-stone-900" />
      <p lang={asset.lang} className="p-3 text-sm"><span className="font-semibold">priyas.cafe</span> {text}</p>
    </div>
  );
};

// S8: preview, copy with slots, validator report, back-translation diff and history.
const AssetDetail = ({ id }) => {
  const { state, dispatch, approvedFacts } = useStore();
  const asset = state.assets.find((a) => a.id === id);
  const [tab, setTab] = useState('Copy');
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const [reason, setReason] = useState('');
  const [copied, setCopied] = useState(false);

  if (!asset) {
    return (
      <Empty icon={FileQuestion} title="Asset not found" action={<button type="button" onClick={() => navigate('board')} className="btn-primary">Back to board</button>}>
        Pick an asset on the board to see its preview and validator report.
      </Empty>
    );
  }

  const facts = approvedFacts.json;
  const text = renderText(asset.template, facts, asset.lang);
  const rules = ruleResults(asset, text, approvedFacts.version);
  const issues = issuesOf(asset, approvedFacts.version);
  const audience = audiences.find((a) => a.id === asset.audience_id);
  const canApprove = asset.status !== 'blocked' && asset.status !== 'approved' && asset.facts_version === approvedFacts.version;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      setCopied(false);
    }
  };

  const saveEdit = () => {
    dispatch({ type: 'EDIT_ASSET', id: asset.id, template: draft, reason });
    setEditing(false);
    setReason('');
  };

  const extracted = asset.lang === 'en' ? null : [
    { field: 'Item', lock: facts.item.name, got: facts.item.name },
    { field: 'Discount', lock: `${facts.discount_pct}%`, got: `${facts.discount_pct}%` },
    { field: 'Price', lock: `Rs ${facts.price_inr}`, got: asset.block_reason ? `Rs ${asset.block_reason.token}` : `Rs ${facts.price_inr}` },
    { field: 'Days', lock: facts.days.join(', '), got: facts.days.join(', ') },
    { field: 'Time', lock: `${facts.time_window.from}–${facts.time_window.to}`, got: `${facts.time_window.from}–${facts.time_window.to}` },
    { field: 'Terms', lock: facts.terms.map(termLabel).join(', '), got: facts.terms.map(termLabel).join(', ') },
  ];

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <button type="button" onClick={() => navigate('board')} className="btn-glass h-9">
          <ArrowLeft size={16} /> Board
        </button>
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="font-semibold">{audience.name}, {LANGS.find((l) => l.id === asset.lang).label}, {channelName(asset.channel)}</span>
          <StatusChip status={asset.status} />
          {asset.is_fallback && <StatusChip status="fallback" />}
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)]">
        <section className="card flex flex-col gap-4">
          <Preview asset={asset} text={text} />
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={copy} className="btn-ghost h-9">{copied ? <Check size={15} /> : <Copy size={15} />} {copied ? 'Copied' : 'Copy text'}</button>
            {asset.channel === 'poster' && (
              <label className="btn-ghost h-9 cursor-pointer">
                <ImagePlus size={15} /> Replace photo
                <input type="file" accept="image/*" className="sr-only" onChange={() => dispatch({ type: 'LOG', actor: 'Priya', kind: 'edits', action: 'Replaced poster photo', why: 'Uploaded a new photo', link: asset.id })} />
              </label>
            )}
          </div>
          <ScoreBar score={asset.score} />
          <div className="mt-auto flex flex-wrap gap-2 border-t border-ink/8 pt-4">
            <button type="button" disabled={!canApprove} onClick={() => dispatch({ type: 'APPROVE_ASSETS', ids: [asset.id] })} className="btn-primary flex-1">
              <ShieldCheck size={16} /> {asset.status === 'approved' ? 'Approved' : 'Approve'}
            </button>
            <button type="button" onClick={() => dispatch({ type: 'REGENERATE_ASSETS', ids: [asset.id] })} className="btn-ghost">
              <RefreshCw size={15} /> Regenerate
            </button>
          </div>
          {asset.status === 'blocked' && <p className="text-xs font-medium text-bad">Blocked assets cannot be approved. Edit the copy or regenerate.</p>}
        </section>

        <section className="card">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <Tabs tabs={['Copy', 'Validator', 'Back-translation', 'History']} active={tab} onChange={setTab} />
            <ValidatorBadge issues={issues} onClick={() => setTab('Validator')} />
          </div>

          {tab === 'Copy' && (
            <div>
              <div className="mb-3 flex flex-wrap gap-2">
                {LANGS.map((l) => (
                  <button
                    key={l.id}
                    type="button"
                    onClick={() => navigate('asset', `${asset.audience_id}-${l.id}-${asset.channel}`)}
                    aria-pressed={l.id === asset.lang}
                    className={`h-8 rounded-full px-3 text-xs font-semibold ${l.id === asset.lang ? 'bg-ink text-white' : 'bg-ink/5 text-ink/70 hover:bg-ink/10'}`}
                  >
                    {l.label}
                  </button>
                ))}
              </div>
              {editing ? (
                <div className="flex flex-col gap-3">
                  <Field label="Copy with slots" hint="Keep {slots} for facts. Code fills them; typed numbers are blocked.">
                    <textarea lang={asset.lang} rows={5} value={draft} onChange={(e) => setDraft(e.target.value)} className="field h-auto py-2.5" />
                  </Field>
                  <Field label="Why this change?" hint="Saved to the decision log so the brand remembers it.">
                    <input value={reason} onChange={(e) => setReason(e.target.value)} className="field" placeholder="e.g. Never say cheap" />
                  </Field>
                  <div className="flex gap-2">
                    <button type="button" disabled={!reason.trim() || !draft.trim()} onClick={saveEdit} className="btn-primary">Save edit</button>
                    <button type="button" onClick={() => setEditing(false)} className="btn-ghost">Cancel</button>
                  </div>
                </div>
              ) : (
                <>
                  <div className="rounded-xl bg-ink/[0.03] p-4">
                    <SlotText template={asset.template} facts={facts} lang={asset.lang} blockToken={asset.block_reason?.token} className="text-base" />
                  </div>
                  <p className="mt-2 text-xs text-ink/50">Highlighted words come from Offer Facts v{approvedFacts.version}. Hover to see the slot.</p>
                  <button type="button" onClick={() => { setDraft(asset.template); setEditing(true); }} className="btn-ghost mt-4 h-9">
                    <Pencil size={14} /> Edit copy
                  </button>
                </>
              )}
            </div>
          )}

          {tab === 'Validator' && (
            <ul className="flex flex-col divide-y divide-ink/8">
              {rules.map((r) => (
                <li key={r.id} className="flex gap-3 py-2.5 text-sm">
                  {r.pass ? <ShieldCheck size={17} className="mt-0.5 shrink-0 text-good" /> : <ShieldX size={17} className="mt-0.5 shrink-0 text-bad" />}
                  <div className="min-w-0">
                    <p className="font-medium">
                      <span className="text-ink/45">{r.id}</span> {r.name} <span className={r.pass ? 'text-good' : 'text-bad'}>{r.pass ? 'pass' : 'fail'}</span>
                    </p>
                    <p className="text-xs text-ink/55">{r.note ?? r.detail}</p>
                  </div>
                </li>
              ))}
            </ul>
          )}

          {tab === 'Back-translation' && (
            asset.lang === 'en' ? (
              <p className="rounded-xl bg-ink/5 p-4 text-sm text-ink/60">English copy is checked against the lock directly. Back-translation runs for Kannada and Hindi.</p>
            ) : (
              <div className="flex flex-col gap-4">
                <div>
                  <p className="text-xs font-medium text-ink/50">Back to English</p>
                  <p className="mt-1 rounded-xl bg-ink/5 p-3 text-sm">
                    {asset.block_reason ? backTranslations[asset.lang].replace('Rs 48', `Rs ${asset.block_reason.token}`) : backTranslations[asset.lang]}
                  </p>
                </div>
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-xs text-ink/50">
                      <th className="pb-2 font-medium">Field</th>
                      <th className="pb-2 font-medium">Lock</th>
                      <th className="pb-2 font-medium">Extracted</th>
                      <th className="pb-2 font-medium">Match</th>
                    </tr>
                  </thead>
                  <tbody>
                    {extracted.map((r) => {
                      const ok = r.lock === r.got;
                      return (
                        <tr key={r.field} className="border-t border-ink/8">
                          <td className="py-2 font-medium">{r.field}</td>
                          <td className="py-2 text-ink/70">{r.lock}</td>
                          <td className={`py-2 ${ok ? '' : 'font-semibold text-bad'}`}>{r.got}</td>
                          <td className="py-2">{ok ? <Check size={16} className="text-good" aria-label="match" /> : <ShieldX size={16} className="text-bad" aria-label="mismatch" />}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )
          )}

          {tab === 'History' && (
            <ol className="flex flex-col gap-2 text-sm">
              {[
                { v: 3, what: 'Current copy', facts: asset.facts_version, when: '14:20' },
                { v: 2, what: 'Optimizer round 1 rewrite', facts: asset.facts_version, when: '14:12' },
                { v: 1, what: 'First generation', facts: 1, when: '12:55' },
              ].map((h) => (
                <li key={h.v} className="flex items-center justify-between gap-3 rounded-xl bg-ink/5 px-3 py-2.5">
                  <span><span className="font-semibold">Version {h.v}</span> <span className="text-ink/60">{h.what}</span></span>
                  <span className="text-xs text-ink/50">facts v{h.facts}, {h.when}</span>
                </li>
              ))}
            </ol>
          )}
        </section>
      </div>
    </div>
  );
};

export default AssetDetail;
