import { useEffect, useState } from "react";
import { cancelScheduled, getAdvice, listSchedule, markReminderDone, scheduleAsset } from "../lib/api";
import type { Asset, Plan } from "../lib/types";
import { Button, ErrorNote } from "./ui";

const IST_NOTE = "Times are India time (IST).";

// datetime-local gives "2026-10-12T19:00"; the server wants a zone, and this app plans in India time.
const toIso = (local: string) => (local.length === 16 ? `${local}:00+05:30` : `${local}+05:30`);
const toLocal = (iso: string) => {
  const t = new Date(new Date(iso).getTime() + 5.5 * 3600 * 1000);
  return t.toISOString().slice(0, 16);
};
const STATUS: Record<string, string> = { pending: "Waiting", due: "Due now", sent: "Sent", failed: "Failed", skipped: "Skipped", missed: "Missed", done: "Done", cancelled: "Cancelled" };

// Advice for one post: who it suits, hashtags, caption checks, best times, and the sources behind them.
export function PostAdvice({ asset, plan, onPickTime }: { asset: Asset; plan: Plan | null; onPickTime: (iso: string) => void }) {
  const [open, setOpen] = useState(false);
  const [data, setData] = useState<any>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!open || data) return;
    setBusy(true);
    getAdvice(asset.id, { brand: plan?.business?.name, area: plan?.business?.area })
      .then(setData)
      .catch((e) => setError((e as Error).message))
      .finally(() => setBusy(false));
  }, [open, data, asset.id, plan]);

  const copyTags = async () => {
    try { await navigator.clipboard.writeText(data.hashtags.text); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch { setError("Could not copy. Select the hashtags and copy them by hand."); }
  };

  return (
    <div className="advice" style={{ display: "grid", gap: 8, marginTop: 8 }}>
      <Button onClick={() => setOpen((v) => !v)} aria-expanded={open}>{open ? "Hide advice" : "Advice: audience, hashtags, best time"}</Button>
      {open ? (
        <div style={{ display: "grid", gap: 10 }}>
          {busy ? <p className="muted small" role="status">Working it out</p> : null}
          {error ? <ErrorNote>{error}</ErrorNote> : null}
          {data ? (
            <>
              <section aria-label="Best time to post" style={{ display: "grid", gap: 4 }}>
                <p className="label">Best time to post</p>
                <p className="muted small">{data.timing.note} Confidence: {data.timing.confidence}. {IST_NOTE}</p>
                <ul style={{ display: "grid", gap: 4 }}>
                  {data.timing.slots.map((s: any) => (
                    <li key={s.at} className="row wrap" style={{ justifyContent: "space-between", gap: 8 }}>
                      <span className="small"><strong>{s.label}</strong>. {s.reasons.join(" ")}</span>
                      <Button onClick={() => onPickTime(s.at)}>Use this time</Button>
                    </li>
                  ))}
                </ul>
                <p className="muted small">{data.timing.caveat}</p>
              </section>
              <section aria-label="Hashtags" style={{ display: "grid", gap: 4 }}>
                <p className="label">Hashtags</p>
                <p className="small mono">{data.hashtags.text || "No hashtags could be made from this offer."}</p>
                {data.hashtags.tags.length ? <ul className="small muted">{data.hashtags.tags.map((t: any) => <li key={t.tag}>{t.tag}: {t.why}</li>)}</ul> : null}
                <p className="muted small">{data.hashtags.note}</p>
                {data.hashtags.tags.length ? <div className="row"><Button onClick={copyTags}>{copied ? "Copied" : "Copy hashtags"}</Button></div> : null}
              </section>
              <section aria-label="Caption checks" style={{ display: "grid", gap: 4 }}>
                <p className="label">Caption checks</p>
                <ul className="small" style={{ display: "grid", gap: 2 }}>
                  {data.caption_checks.map((c: any) => <li key={c.id}>{c.ok ? "Good: " : "Fix: "}{c.message}</li>)}
                </ul>
              </section>
              <section aria-label="Audience" style={{ display: "grid", gap: 4 }}>
                <p className="label">Who this suits</p>
                <p className="small">
                  Most likely to respond: {data.audience.personas.top_segments.map((s: any) => `${s.segment} (${Math.round(s.share * 100)}%)`).join(", ")}. They care about {data.audience.personas.cares_about.join(", ")}.
                </p>
                <p className="muted small">From {data.audience.personas.basis}.</p>
                {data.audience.customers.total ? (
                  <p className="small">Your list: {data.audience.customers.total} people, {data.audience.customers.whatsapp_ok} agreed to WhatsApp, {data.audience.customers.email_ok} to email.</p>
                ) : <p className="muted small">Add your customers on the Customers screen and this will use them.</p>}
              </section>
              <details>
                <summary>Where this advice comes from</summary>
                <ul className="small" style={{ display: "grid", gap: 4, marginTop: 4 }}>
                  {data.rules.map((r: any) => (
                    <li key={r.id}>{r.claim} <span className="muted">(confidence {r.confidence}; <a href={r.source_url} target="_blank" rel="noopener noreferrer">{r.source_title}</a>)</span></li>
                  ))}
                </ul>
                <p className="muted small">{data.disclaimer}</p>
              </details>
            </>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

// Schedule an email, or a reminder to post by hand, for one approved asset.
export function SchedulePanel({ asset, picked, onChanged }: { asset: Asset; picked: string; onChanged: () => void }) {
  const isEmail = asset.channel === "cold_email";
  const [when, setWhen] = useState("");
  const [note, setNote] = useState("");
  const [useCustomers, setUseCustomers] = useState(false);
  const [items, setItems] = useState<any[]>([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const load = () => listSchedule().then((r) => setItems(r.items.filter((i) => i.asset_id === asset.id))).catch(() => undefined);
  useEffect(() => { load(); }, [asset.id]);
  useEffect(() => { if (picked) setWhen(toLocal(picked)); }, [picked]);

  const submit = async () => {
    setBusy(true); setError("");
    try {
      await scheduleAsset(asset.id, { kind: isEmail ? "email" : "reminder", at: toIso(when), note: note.trim() || undefined, customers: isEmail && useCustomers ? {} : undefined });
      setNote(""); await load(); onChanged();
    } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  };
  const act = async (fn: () => Promise<unknown>) => { setError(""); try { await fn(); await load(); } catch (e) { setError((e as Error).message); } };

  return (
    <div className="schedule" style={{ display: "grid", gap: 6, marginTop: 8 }}>
      <p className="label">{isEmail ? "Send this email later" : "Remind me to post this"}</p>
      <div className="row wrap">
        <input className="input" type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} aria-label="Date and time" />
        {isEmail ? (
          <label className="check-row"><input type="checkbox" checked={useCustomers} onChange={(e) => setUseCustomers(e.target.checked)} /><span>To my customers who agreed to email</span></label>
        ) : <input className="input" value={note} onChange={(e) => setNote(e.target.value)} maxLength={300} placeholder="Note, for example: use the cappuccino photo" aria-label="Note" />}
        <Button variant="primary" onClick={submit} disabled={busy || !when}>{busy ? "Saving" : isEmail ? "Schedule email" : "Set reminder"}</Button>
      </div>
      <p className="muted small">{IST_NOTE} {isEmail ? "If the text is edited or un-approved before then, nothing is sent." : "Nothing is posted for you. This only reminds you."}</p>
      {error ? <ErrorNote>{error}</ErrorNote> : null}
      {items.length ? (
        <ul style={{ display: "grid", gap: 4 }}>
          {items.map((i) => (
            <li key={i.id} className="row wrap small" style={{ justifyContent: "space-between", gap: 8 }}>
              <span>{i.label}: {STATUS[i.status] || i.status}{i.note ? `, ${i.note}` : ""}{i.result?.reason ? `. ${i.result.reason}` : ""}</span>
              {i.status === "pending" ? <Button onClick={() => act(() => cancelScheduled(i.id))}>Cancel</Button> : null}
              {i.kind === "reminder" && (i.status === "due" || i.status === "pending") ? <Button onClick={() => act(() => markReminderDone(i.id))}>Mark done</Button> : null}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
