import { useEffect, useRef, useState } from "react";
import { Button } from "./ui";

type Recipient = { id: number; valid: boolean; number: string; name?: string; wa_url: string | null };

const COOLDOWN = 4; // seconds between chats: WhatsApp can restrict accounts that message many people at machine speed

// Walks through the chats one at a time. Each chat opens from its own click, so the browser allows it, and the owner presses send
// in WhatsApp. The "next" button waits a few seconds after each one, so a long list is sent at a human pace.
export function WhatsAppQueue({ recipients, opened, openChat }: {
  recipients: Recipient[];
  opened: Record<number, boolean>;
  openChat: (url: string, id: number) => boolean;
}) {
  const people = recipients.filter((r) => r.valid && r.wa_url);
  const [skipped, setSkipped] = useState<Record<number, boolean>>({});
  const [wait, setWait] = useState(0);
  const next = people.find((r) => !opened[r.id] && !skipped[r.id]);
  const done = people.filter((r) => opened[r.id]).length;
  const skips = people.filter((r) => skipped[r.id] && !opened[r.id]).length;
  const button = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (wait <= 0) return undefined;
    const t = setTimeout(() => setWait((w) => w - 1), 1000);
    return () => clearTimeout(t);
  }, [wait]);
  useEffect(() => { if (wait === 0) button.current?.focus(); }, [wait, next?.id]);

  if (people.length < 2) return null;
  const label = (r: Recipient) => r.name || r.number;
  const go = () => {
    if (!next) return;
    if (openChat(next.wa_url as string, next.id)) setWait(COOLDOWN);
  };

  return (
    <div className="wa-queue" style={{ display: "grid", gap: 8, padding: 12, borderRadius: 12, border: "1px solid rgba(0,0,0,0.12)" }} aria-label="Send to everyone, one chat at a time">
      <div className="row wrap" style={{ justifyContent: "space-between", gap: 8 }}>
        <strong className="small">Send one by one</strong>
        <span className="small" role="status">{done} of {people.length} opened{skips ? `, ${skips} skipped` : ""}</span>
      </div>
      <div role="progressbar" aria-label="Chats opened" aria-valuemin={0} aria-valuemax={people.length} aria-valuenow={done} style={{ height: 6, borderRadius: 999, background: "rgba(0,0,0,0.1)", overflow: "hidden" }}>
        <div style={{ width: `${(done / people.length) * 100}%`, height: "100%", background: "var(--color-accent, #f0b429)", transition: "width .25s" }} />
      </div>
      {next ? (
        <>
          <p className="small">Next: <strong>{label(next)}</strong>. WhatsApp opens in a new tab with the message ready. Press send there, then come back here.</p>
          <div className="row wrap">
            <button ref={button} type="button" className="btn-primary" onClick={go} disabled={wait > 0}>
              {wait > 0 ? `Next chat in ${wait}` : done ? "Open the next chat" : "Open the first chat"}
            </button>
            <Button onClick={() => setSkipped((s) => ({ ...s, [next.id]: true }))}>Skip {label(next)}</Button>
          </div>
        </>
      ) : (
        <div className="row wrap" style={{ justifyContent: "space-between", gap: 8 }}>
          <p className="small">All done. {done} chat{done === 1 ? "" : "s"} opened{skips ? `, ${skips} skipped` : ""}.</p>
          {skips ? <Button onClick={() => setSkipped({})}>Go back to the skipped ones</Button> : null}
        </div>
      )}
      <p className="muted small">A short pause between chats keeps your WhatsApp account safe. Only message people who agreed to hear from you.</p>
    </div>
  );
}
