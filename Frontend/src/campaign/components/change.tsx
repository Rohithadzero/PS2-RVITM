import { useState } from "react";
import { ApiError, applyChange, proposeChange } from "../lib/api";
import { FIELD_LABEL, LANGS, channelLabel, langName, prettyText } from "../lib/format";
import { useVoiceInput } from "../lib/voice";
import type { Asset, Board, ChangeProposal, Lang } from "../lib/types";
import { Badge, Button, ErrorNote, Sheet } from "./ui";

export function ChangeByVoice({ campaignId, assets, onApplied, defaultOpen = false }: { campaignId: string; assets: Asset[]; onApplied: (b: Board) => void; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  const [lang, setLang] = useState<Lang>("en");
  const [text, setText] = useState("");
  const [proposal, setProposal] = useState<ChangeProposal | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState("");

  async function propose(said: string) {
    if (!said.trim()) return;
    setBusy(true);
    setError("");
    setDone("");
    try { setProposal(await proposeChange(campaignId, said.trim())); } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }

  const mic = useVoiceInput(lang, (said) => { setText(said); propose(said); });
  const byId = new Map(assets.map((a) => [a.id, a]));

  async function apply() {
    if (!proposal) return;
    setBusy(true);
    setError("");
    try {
      onApplied(await applyChange(campaignId, proposal.proposal_id));
      setDone(`Applied. ${proposal.affected_asset_ids.length} ${proposal.affected_asset_ids.length === 1 ? "asset is" : "assets are"} being rewritten and checked again.`);
      setProposal(null);
      setText("");
    } catch (e) {
      const err = e as ApiError;
      setError(err.code === "not_understood" ? "I did not understand that change. Please say it another way." : err.code === "already_applied" ? "That change was already applied." : err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <button type="button" className="fab" onClick={() => setOpen(true)}>Tell me what to change</button>
      <Sheet open={open} title="Tell me what to change" onClose={() => setOpen(false)}>
        <div className="change">
          <p className="muted">Say or type one change, for example a new price or date. I show what it touches before anything changes.</p>
          <div className="row wrap" role="group" aria-label="Language you speak">
            {LANGS.map((l) => (
              <button key={l.code} type="button" className="bubble" aria-pressed={lang === l.code} onClick={() => setLang(l.code)}>{l.native}</button>
            ))}
          </div>
          {mic.supported ? (
            <button type="button" className={`mic mic-inline${mic.listening ? " mic-live" : ""}`} onClick={() => (mic.listening ? mic.stop() : mic.start())} disabled={busy} aria-pressed={mic.listening}>
              {mic.listening ? "Tap to stop" : "Tap to talk"}
            </button>
          ) : (
            <p className="muted small">Voice input is not available in this browser. Type the change.</p>
          )}
          {mic.listening || mic.transcribing || mic.interim ? <div className="transcript live"><span className="label">Listening</span><p>{mic.interim || "Speak now"}</p></div> : null}
          {mic.note ? <p className="muted small">{mic.note}</p> : null}
          {mic.error ? <ErrorNote>{mic.error}</ErrorNote> : null}
          <form onSubmit={(e) => { e.preventDefault(); propose(text); }} className="type-box">
            <input className="input" value={text} onChange={(e) => setText(e.target.value)} placeholder="Type the change" aria-label="Describe the change" />
            <Button type="submit" variant="secondary" disabled={busy || !text.trim()}>Show what changes</Button>
          </form>
          {error ? <ErrorNote>{error}</ErrorNote> : null}
          {done ? <p className="note" role="status">{done}</p> : null}

          {proposal ? (
            <div className="proposal">
              <div className="row wrap"><Badge tone="neutral">{proposal.kind}</Badge>{proposal.grounded ? null : <Badge tone="blocked">Not found in your words</Badge>}</div>
              <p className="proposal-sum">{prettyText(proposal.summary)}</p>
              {proposal.patch ? <p className="mono small">{Object.entries(proposal.patch).map(([k, v]) => `${FIELD_LABEL[k] || k.replace(/_/g, " ")}: ${typeof v === "string" ? v : JSON.stringify(v)}`).join(", ")}</p> : null}
              {proposal.instruction ? <p className="quote">{proposal.instruction}</p> : null}
              {proposal.scope ? (
                <p className="small">
                  {[["Add channels", proposal.scope.add_channels.map(channelLabel)], ["Remove channels", proposal.scope.remove_channels.map(channelLabel)], ["Add languages", proposal.scope.add_languages.map(langName)], ["Remove languages", proposal.scope.remove_languages.map(langName)]]
                    .filter(([, v]) => (v as string[]).length)
                    .map(([k, v]) => `${k}: ${(v as string[]).join(", ")}`)
                    .join(". ")}
                </p>
              ) : null}
              <p className="label">Touches {proposal.affected_asset_ids.length} {proposal.affected_asset_ids.length === 1 ? "asset" : "assets"}</p>
              <ul className="affected">
                {proposal.affected_asset_ids.map((aid) => {
                  const a = byId.get(aid);
                  return <li key={aid}>{a ? `${channelLabel(a.channel)}, ${langName(a.lang)}` : aid}</li>;
                })}
              </ul>
              {!proposal.grounded ? <p className="muted small">I could not find that number, date or day in what you said. Say it again to continue.</p> : null}
              <div className="row">
                <Button variant="primary" onClick={apply} disabled={busy || !proposal.grounded}>Apply this change</Button>
                <Button variant="quiet" onClick={() => setProposal(null)}>Discard</Button>
              </div>
            </div>
          ) : null}
        </div>
      </Sheet>
    </>
  );
}
