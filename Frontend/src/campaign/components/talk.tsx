import { useCallback, useEffect, useRef, useState } from "react";
import { answerQuestion, editAnswer, finishInterview, getSession } from "../lib/api";
import { FIELD_LABEL, FIELD_OPTIONS, choiceLabels, formatValue, isMultiField, optionLabel } from "../lib/format";
import type { Route } from "../lib/route";
import { useSpeaker } from "../lib/speech";
import { useVoiceInput } from "../lib/voice";
import type { Answer, AnswerBody, Session } from "../lib/types";
import { Badge, Button, ErrorNote, Sheet } from "./ui";

function MicIcon() {
  return (
    <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="9" y="3" width="6" height="11" rx="3" />
      <path d="M5 11a7 7 0 0 0 14 0M12 18v3" />
    </svg>
  );
}

function quoteOf(a: Answer | undefined) {
  if (!a) return "";
  if (a.raw_text) return a.raw_text;
  if (a.choices.length) return `You chose ${choiceLabels(a.field, a.choices)}`;
  return "";
}

function HeardList({ session, onEdit, busy }: { session: Session; onEdit: (aid: string, body: AnswerBody) => Promise<void>; busy: boolean }) {
  const [editing, setEditing] = useState<string | null>(null);
  const [text, setText] = useState("");
  const [picked, setPicked] = useState<string[]>([]);
  const byId = new Map(session.answers.map((a) => [a.id, a]));
  const rows = Object.entries(session.fields).map(([field, f]) => ({ field, value: f.value, answer: byId.get(f.answer_id) }));
  const flagged = session.answers.filter((a) => a.status !== "accepted" && !rows.some((r) => r.answer?.id === a.id));

  if (!rows.length && !flagged.length) {
    return <p className="muted">Nothing gathered yet. Each answer you give appears here with your own words beside it.</p>;
  }

  function begin(field: string, a: Answer | undefined) {
    setEditing(field);
    setText(a?.raw_text || "");
    setPicked(a?.choices || []);
  }

  async function save(field: string, a: Answer) {
    const opts = FIELD_OPTIONS[field];
    const body: AnswerBody = opts ? { choices: picked, source: "tap" } : { text: text.trim(), source: "typed" };
    await onEdit(a.id, body);
    setEditing(null);
  }

  return (
    <ul className="heard-list">
      {rows.map(({ field, value, answer }) => {
        const opts = FIELD_OPTIONS[field];
        const multi = isMultiField(field);
        return (
          <li key={field} className="heard-row" data-field={field}>
            <div className="heard-head">
              <span className="label">{FIELD_LABEL[field] || field.replace(/_/g, " ")}</span>
              {answer ? <Button variant="quiet" onClick={() => (editing === field ? setEditing(null) : begin(field, answer))}>{editing === field ? "Cancel" : "Edit"}</Button> : null}
            </div>
            <p className="heard-value">{formatValue(field, value) || "Not set"}</p>
            {quoteOf(answer) ? <p className="quote">{answer?.raw_text ? `“${quoteOf(answer)}”` : quoteOf(answer)}</p> : null}
            {answer && answer.status !== "accepted" ? <Badge tone="flagged">{answer.status}{answer.reason ? `: ${answer.reason}` : ""}</Badge> : null}
            {editing === field && answer ? (
              <div className="heard-edit">
                {opts ? (
                  <div className="bubbles">
                    {opts.map((o) => (
                      <button
                        key={o}
                        type="button"
                        className="bubble"
                        aria-pressed={picked.includes(o)}
                        onClick={() => setPicked((cur) => (multi ? (cur.includes(o) ? cur.filter((x) => x !== o) : [...cur, o]) : [o]))}
                      >
                        {optionLabel(field, o)}
                      </button>
                    ))}
                  </div>
                ) : (
                  <input className="input" value={text} onChange={(e) => setText(e.target.value)} aria-label={`New answer for ${FIELD_LABEL[field] || field}`} />
                )}
                <Button variant="primary" disabled={busy || (opts ? picked.length === 0 : !text.trim())} onClick={() => save(field, answer)}>Save change</Button>
              </div>
            ) : null}
          </li>
        );
      })}
      {flagged.map((a) => (
        <li key={a.id} className="heard-row">
          <div className="heard-head"><span className="label">{FIELD_LABEL[a.field] || a.field}</span><Badge tone="flagged">{a.status}</Badge></div>
          <p className="quote">{a.raw_text ? `“${quoteOf(a)}”` : quoteOf(a)}</p>
          {a.reason ? <p className="muted">{a.reason}</p> : null}
        </li>
      ))}
    </ul>
  );
}

export function Talk({ sid, go }: { sid: string; go: (r: Route) => void }) {
  const [session, setSession] = useState<Session | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [picked, setPicked] = useState<string[]>([]);
  const [text, setText] = useState("");
  const [custom, setCustom] = useState("");
  const [typing, setTyping] = useState(false);
  const [heardOpen, setHeardOpen] = useState(false);
  const [lastHeard, setLastHeard] = useState("");
  const spokenFor = useRef("");

  const lang = session?.lang || "en";
  const speaker = useSpeaker(lang);

  const load = useCallback(() => {
    setError("");
    getSession(sid).then(setSession).catch((e: Error) => setError(e.message));
  }, [sid]);
  useEffect(load, [load]);

  const q = session?.question || null;
  const qKey = q ? `${q.id}|${session?.clarify?.reason ?? ""}` : "";

  useEffect(() => {
    setPicked([]);
    setText("");
    setCustom("");
    if (!q || !qKey || spokenFor.current === qKey) return;
    spokenFor.current = qKey;
    speaker.speak(`${session?.clarify ? session.clarify.reason + " " : ""}${q.prompt}`);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [qKey]);

  async function send(body: AnswerBody) {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      setSession(await answerQuestion(sid, body));
      setTyping(false);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function edit(aid: string, body: AnswerBody) {
    setBusy(true);
    setError("");
    try {
      setSession(await editAnswer(sid, aid, body));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const mic = useVoiceInput(lang, (said) => {
    setLastHeard(said);
    send({ text: said, source: "voice" });
  });

  async function finish() {
    setBusy(true);
    setError("");
    try {
      const { campaign_id } = await finishInterview(sid);
      go({ name: "plan", id: campaign_id });
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  }

  if (!session) {
    return <div className="talk-wrap">{error ? <ErrorNote onRetry={load}>{error}</ErrorNote> : <p className="muted">Opening the conversation.</p>}</div>;
  }

  const pct = session.progress.total_required ? Math.min(100, Math.round((session.progress.answered / session.progress.total_required) * 100)) : 0;
  const complete = session.status === "complete" || !q;
  const kind = q?.kind;
  const isChoice = kind === "single" || kind === "multi";
  const showInput = typing || (!mic.supported && !isChoice);
  const micButton = mic.supported ? (
    <button
      type="button"
      className={`mic${mic.listening ? " mic-live" : ""}`}
      onClick={() => (mic.listening ? mic.stop() : mic.start())}
      disabled={busy}
      aria-pressed={mic.listening}
      aria-label={mic.listening ? "Stop listening" : "Tap to talk"}
    >
      <MicIcon />
      <span>{mic.listening ? "Tap to stop" : "Tap to talk"}</span>
    </button>
  ) : (
    <p className="mic-off">Voice input is not available in this browser. Tap an option or type.</p>
  );

  return (
    <div className="talk-wrap">
      <div className="talk">
        <section className="talk-main" aria-live="polite">
          <div className="progress" role="progressbar" aria-valuemin={0} aria-valuemax={session.progress.total_required} aria-valuenow={session.progress.answered} aria-label="Questions answered">
            <div className="progress-bar"><span style={{ width: `${pct}%` }} /></div>
            <span className="progress-n">{session.progress.answered} of {session.progress.total_required}</span>
          </div>

          {complete ? (
            <div className="done-card">
              <p className="kicker">All answered</p>
              <h1 className="display">That is everything I need.</h1>
              <p className="lede">I will build the plan from your own words. Every line in it will show what you said.</p>
              <Button variant="primary" onClick={finish} disabled={busy}>{busy ? "Building the plan" : "Build my plan"}</Button>
            </div>
          ) : q ? (
            <>
              {session.clarify ? (
                <div className="clarify" role="status">
                  <p className="kicker">One thing to check</p>
                  <p className="clarify-reason">{session.clarify.reason}</p>
                  {session.clarify.quote ? <p className="quote">You said {"“"}{session.clarify.quote}{"”"}</p> : null}
                </div>
              ) : null}

              <p className="kicker">{FIELD_LABEL[q.field] || q.field.replace(/_/g, " ")}{q.required ? "" : " (optional)"}</p>
              <h1 className="question" data-field={q.field} data-kind={q.kind}>{q.prompt}</h1>
              {q.voice_hint ? <p className="hint">{q.voice_hint}</p> : null}

              <div className="speaker-row">
                {speaker.available && speaker.hasVoice ? (
                  <>
                    <Button variant="quiet" onClick={() => speaker.speak(q.prompt, true)}>Read it again</Button>
                    <Button variant="quiet" onClick={speaker.toggleMute} aria-pressed={speaker.muted}>{speaker.muted ? "Reading aloud is off" : "Mute reading aloud"}</Button>
                  </>
                ) : (
                  <span className="muted small">{speaker.available ? "No voice for this language on this device. Read the question above." : "This browser cannot read aloud. Read the question above."}</span>
                )}
              </div>

              <div className="mic-desk">{micButton}</div>
              {mic.listening || mic.transcribing || mic.interim || lastHeard ? (
                <div className={`transcript${mic.listening ? " live" : ""}`}>
                  <span className="label">{mic.listening ? "Listening" : mic.transcribing ? "Transcribing" : "Heard"}</span>
                  <p>{mic.listening ? mic.interim || "Speak now" : mic.transcribing ? "One moment" : busy ? `${lastHeard}` : lastHeard}</p>
                </div>
              ) : null}
              {mic.note ? <p className="muted small">{mic.note}</p> : null}
              {mic.error ? <ErrorNote>{mic.error}</ErrorNote> : null}
              {error ? <ErrorNote onRetry={load}>{error}</ErrorNote> : null}

              {isChoice ? (
                <div className="bubbles" role={kind === "multi" ? "group" : undefined} aria-label="Options">
                  {q.options.map((o) => (
                    <button
                      key={o.value}
                      type="button"
                      className="bubble"
                      data-value={o.value}
                      aria-pressed={picked.includes(o.value)}
                      disabled={busy}
                      onClick={() => {
                        if (kind === "single") send({ choices: [o.value], source: "tap" });
                        else setPicked((cur) => (cur.includes(o.value) ? cur.filter((x) => x !== o.value) : [...cur, o.value]));
                      }}
                    >
                      {o.label}
                    </button>
                  ))}
                </div>
              ) : null}

              {!q.required ? (
                <div className="bubbles">
                  <button type="button" className="bubble bubble-skip" disabled={busy} onClick={() => send({ choices: ["skip"], source: "tap" })}>Skip this one</button>
                </div>
              ) : null}

              {kind === "multi" ? (
                <div className="multi-extra">
                  {typing ? <input className="input" value={custom} onChange={(e) => setCustom(e.target.value)} placeholder="Something else, in your words" aria-label="Add another option in your own words" /> : null}
                  <Button
                    variant="primary"
                    disabled={busy || (picked.length === 0 && !custom.trim())}
                    onClick={() => send({ choices: picked, text: custom.trim() || undefined, source: custom.trim() ? "typed" : "tap" })}
                  >
                    Done, {picked.length + (custom.trim() ? 1 : 0)} chosen
                  </Button>
                </div>
              ) : null}

              {showInput ? (
                <form
                  className="type-box"
                  onSubmit={(e) => {
                    e.preventDefault();
                    if (text.trim()) send({ text: text.trim(), source: "typed" });
                  }}
                >
                  {kind === "list" ? (
                    <textarea className="input" rows={4} value={text} onChange={(e) => setText(e.target.value)} placeholder="One per line: Name <email>" aria-label="Your answer" />
                  ) : (
                    <input className="input" value={text} onChange={(e) => setText(e.target.value)} placeholder={kind === "date" ? "For example: 12 October, or next Sunday" : "Type your answer"} aria-label="Your answer" inputMode={kind === "number" ? "decimal" : "text"} />
                  )}
                  <Button variant="primary" type="submit" disabled={busy || !text.trim()}>Send answer</Button>
                </form>
              ) : null}

              <div className="talk-tools">
                <Button variant="quiet" onClick={() => setTyping((t) => !t)} aria-expanded={typing}>{typing ? "Hide typing" : "Type instead"}</Button>
                
              </div>
            </>
          ) : null}
        </section>

        <aside className="heard-side" aria-label="What I heard">
          <h2 className="panel-title">What I heard</h2>
          <HeardList session={session} onEdit={edit} busy={busy} />
        </aside>
      </div>

      {!complete ? (
        <div className="dock">
          <Button variant="secondary" className="heard-cvb" onClick={() => setHeardOpen(true)}>
            Heard ({Object.keys(session.fields).length})
          </Button>
          {micButton}
          <span className="dock-spacer" />
        </div>
      ) : null}

      <Sheet open={heardOpen} title="What I heard" onClose={() => setHeardOpen(false)}>
        <HeardList session={session} onEdit={edit} busy={busy} />
      </Sheet>
    </div>
  );
}
