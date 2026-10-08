import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ApiError, approveAsset, createLink, makeVideo, generate, getAssetState, getBoard, getPlan, logOutreach, makeImage,
  mediaUrl, saveCopy, sendEmail, uploadRender,
} from "../lib/api";
import { canvasBlob } from "../lib/compose";
import { CHANNEL_ORDER, MEANING_LABEL, channelLabel, langName } from "../lib/format";
import type { Route } from "../lib/route";
import type { Asset, AssetState, AssetStateMap, Board, OutreachAction, Plan } from "../lib/types";
import { ChangeByVoice } from "./change";
import { AssetSurface, IMAGE_CHANNELS, OVERLAY_KIND, mediaPhase, pickBase } from "./surfaces";
import { Badge, Button, Empty, ErrorNote } from "./ui";

const ACTIVE_JOB = ["queued", "running", "waiting_for_key"];

const hasText = (a: Asset) => Boolean(a.content || a.extra?.headline || a.extra?.title || a.extra?.script?.length);

// Badge comes from content and open jobs, so it can never contradict the card body.
function statusView(a: Asset, openJob: boolean, failed: string | null): { tone: "neutral" | "approved" | "flagged" | "blocked" | "checking"; text: string } {
  if (a.status === "approved") return { tone: "approved", text: "Approved" };
  if (a.status === "blocked") return { tone: "blocked", text: "Blocked" };
  if (!hasText(a) && !openJob && failed !== null) return { tone: "blocked", text: "Writing failed" };
  if (!hasText(a) || openJob) return { tone: "checking", text: a.status === "changed" ? "Changed, rewriting" : "Writing" };
  if (a.review?.status === "checking") return { tone: "checking", text: "Checking meaning" };
  if (a.review?.status === "flagged") return { tone: "flagged", text: "Meaning flagged" };
  if (a.status === "changed") return { tone: "checking", text: "Changed" };
  if (a.status === "pending") return { tone: "neutral", text: "Ready to review" };
  return { tone: "neutral", text: "Draft" };
}

function distributableText(a: Asset, link?: string) {
  const x = a.extra || {};
  let out = a.content || "";
  if (a.channel === "cold_email") out = `${x.subject ? x.subject + "\n\n" : ""}${out}`;
  else if (a.channel === "instagram_post" && x.hashtags?.length) out = `${out}\n\n${x.hashtags.map((h) => (h.startsWith("#") ? h : `#${h}`)).join(" ")}`;
  else if (a.channel === "blog_post" && x.title) out = `${x.title}\n\n${out}`;
  else if ((a.channel === "poster" || a.channel.includes("story")) && x.headline) out = `${x.headline}\n${x.subline || ""}\n${out}`.trim();
  if (link && !out.includes(link)) out = `${out}\n\n${link}`;
  return out.trim();
}

function download(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

function AssetCard({ asset, state, plan, business, onChanged, onMakeImage, imageBusy, openJob, failed, onRetry }: {
  openJob: boolean;
  failed: string | null;
  onRetry: () => void;
  asset: Asset;
  state: AssetState | undefined;
  plan: Plan | null;
  business: string;
  onChanged: () => void;
  onMakeImage: (id: string) => Promise<void>;
  imageBusy: boolean;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  const [motion, setMotion] = useState(false);
  const [aspect, setAspect] = useState<"16:9" | "9:16">("16:9");
  const view = statusView(asset, openJob, failed);
  const approved = asset.status === "approved";
  const link = state?.link?.url;
  const out = state?.outreach;
  const written = hasText(asset);
  const emailCard = asset.channel === "cold_email";
  const hasOverlay = Boolean(OVERLAY_KIND[asset.channel]);
  const hasImage = IMAGE_CHANNELS.has(asset.channel);
  const base = pickBase(state);
  const canApprove = written && !approved && asset.status !== "blocked" && asset.review?.status !== "checking" && asset.status !== "changed";

  async function run(label: string, fn: () => Promise<void>) {
    setBusy(label);
    setError("");
    setNote("");
    try { await fn(); } catch (e) { setError((e as Error).message); } finally { setBusy(""); }
  }

  const log = (action: OutreachAction) => logOutreach(asset.id, action).then(onChanged).catch(() => undefined);

  // Tracked link is created on demand; without a CTA the text goes out without one.
  const ensureLink = async () => {
    if (link) return link;
    try { const l = await createLink(asset.id); onChanged(); return l.url; } catch (e) {
      if (e instanceof ApiError && e.code === "no_cta") return undefined;
      throw e;
    }
  };

  const copy = () => run("copy", async () => {
    await navigator.clipboard.writeText(distributableText(asset, await ensureLink()));
    await log("copied");
    setNote("Copied to the clipboard.");
  });

  const whatsapp = () => run("wa", async () => {
    window.open(`https://wa.me/?text=${encodeURIComponent(distributableText(asset, await ensureLink()))}`, "_blank", "noopener");
    await log("shared_whatsapp");
    setNote("WhatsApp opened with the message.");
  });

  const email = () => run("email", async () => {
    const recipients = plan?.email_recipients || [];
    await ensureLink();
    try {
      const res = await sendEmail(asset.id, recipients.length ? recipients : undefined);
      setNote(`Sent to ${res.sent}${res.failed?.length ? `, ${res.failed.length} failed` : ""}.`);
      onChanged();
    } catch (e) {
      if (e instanceof ApiError && e.status === 409 && e.code === "smtp_not_configured") {
        const to = recipients.map((r) => r.email).join(",");
        const name = recipients.length === 1 ? recipients[0].name : "{name}";
        const body = (asset.content || "").replace(/\{name\}/g, name) + (link ? `\n\n${link}` : "");
        const url = `mailto:${recipients.length > 1 ? "" : to}?${recipients.length > 1 ? `bcc=${encodeURIComponent(to)}&` : ""}subject=${encodeURIComponent(asset.extra?.subject || "")}&body=${encodeURIComponent(body)}`;
        window.location.href = url;
        await log("email_opened_in_app");
        setNote("Email sending is not set up on the server, so your mail app opened instead.");
      } else {
        throw e;
      }
    }
  });

  const downloadPng = () => run("png", async () => {
    let blob: Blob;
    if (hasOverlay && canvasRef.current) {
      blob = await canvasBlob(canvasRef.current);
      await uploadRender(asset.id, blob);
      onChanged();
    } else if (base && base.url) {
      blob = await (await fetch(mediaUrl(base.url))).blob();
    } else {
      throw new Error("There is no picture to download yet.");
    }
    download(blob, `${asset.channel}-${asset.lang}.png`);
    await log("downloaded");
    setNote("Picture downloaded.");
  });

  const posted = () => run("posted", async () => {
    await logOutreach(asset.id, "posted_manually");
    onChanged();
    setNote("Marked as posted.");
  });

  const video = () => run("video", async () => {
    await makeVideo(asset.id, aspect);
    onChanged();
    setNote("The video is being made. This can take a few minutes.");
  });

  const approve = () => run("approve", async () => { await approveAsset(asset.id); onChanged(); });

  const saveEdit = () => run("save", async () => {
    await saveCopy(asset.id, draft);
    setEditing(false);
    onChanged();
    setNote("Saved. The checks run again.");
  });

  const counts: [string, number][] = out
    ? ([["copied", out.copied], ["shared on WhatsApp", out.shared_whatsapp], ["downloaded", out.downloaded], ["posted", out.posted_manually], ["emailed", out.email_sent], ["clicks", out.clicks], ["opens", out.opens]] as [string, number][]).filter(([, n]) => n > 0)
    : [];

  return (
    <article className="asset" data-asset={asset.id} data-channel={asset.channel} data-lang={asset.lang}>
      <header className="asset-head">
        <span className="chip">{langName(asset.lang)}</span>
        {asset.audience && asset.audience !== "all" ? <span className="muted small">{asset.audience.replace(/_/g, " ")}</span> : null}
        <span className="grow" />
        <Badge tone={view.tone}>{view.text}</Badge>
      </header>

      <AssetSurface
        asset={asset}
        state={state}
        facts={plan?.offer_facts || ({ item: "", discount_percent: null, price_amount: null, currency: null, dates: [], timings: null, terms: null, audiences: [], languages: [], channels: [] })}
        business={business}
        area={plan?.business.area || ""}
        recipients={plan?.email_recipients.length || 0}
        canvasRef={canvasRef}
        onMakeImage={() => onMakeImage(asset.id)}
        imageBusy={imageBusy}
      />

      {!written && !openJob && failed !== null ? (
        <div className="check check-blocked">
          <p className="check-title">The copy could not be written</p>
          {failed ? <p>{failed}</p> : null}
          <Button onClick={onRetry}>Write it again</Button>
        </div>
      ) : null}

      {written ? (
        <div className="checks">
          {asset.status === "blocked" || asset.block_reason.length ? (
            <div className="check check-blocked">
              <p className="check-title">Fact check: blocked</p>
              <ul>{asset.block_reason.map((r) => <li key={r}>{r}</li>)}</ul>
            </div>
          ) : asset.status === "pending" || asset.status === "approved" ? (
            <p className="check check-ok">Fact check: prices, dates and weekdays match the lock.</p>
          ) : null}
          {asset.review && asset.review.status !== "not_needed" ? (
            <div className={`check check-meaning meaning-${asset.review.status}`}>
              <p className="check-title">{MEANING_LABEL[asset.review.status] || asset.review.status}</p>
              {asset.review.issues?.length ? <ul>{asset.review.issues.map((r) => <li key={r}>{r}</li>)}</ul> : null}
              {asset.review.language_problems?.length ? <ul>{asset.review.language_problems.map((r) => <li key={r}>{r}</li>)}</ul> : null}
              {asset.review.back_translation ? (
                <details>
                  <summary>Show the English back-translation</summary>
                  <p lang="en">{asset.review.back_translation}</p>
                </details>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : null}

      {editing ? (
        <div className="edit-box">
          <textarea className="input" rows={6} value={draft} onChange={(e) => setDraft(e.target.value)} lang={asset.lang} aria-label="Edit the text" />
          <div className="row">
            <Button variant="primary" onClick={saveEdit} disabled={Boolean(busy) || !draft.trim()}>Save text</Button>
            <Button variant="quiet" onClick={() => setEditing(false)}>Cancel</Button>
          </div>
        </div>
      ) : null}

      {written ? (
        <div className="actions">
          {!approved ? (
            <Button variant="primary" onClick={approve} disabled={Boolean(busy) || !canApprove}>{busy === "approve" ? "Approving" : "Approve"}</Button>
          ) : null}
          {asset.content !== null && !editing ? <Button onClick={() => { setDraft(asset.content || ""); setEditing(true); }}>Edit text</Button> : null}
        </div>
      ) : null}

      {asset.channel === "reel" && written ? (
        <div className="video-opt">
          <label className="check-row">
            <input type="checkbox" checked={motion} onChange={(e) => setMotion(e.target.checked)} />
            <span>Yes, add motion to this video</span>
          </label>
          <div className="row wrap">
            <select className="input select" value={aspect} onChange={(e) => setAspect(e.target.value as "16:9" | "9:16")} aria-label="Video shape">
              <option value="16:9">Landscape 16:9</option>
              <option value="9:16">Vertical 9:16</option>
            </select>
            <Button onClick={video} disabled={!motion || Boolean(busy)}>{busy === "video" ? "Starting" : "Make an 8 second video (adds motion)"}</Button>
          </div>
        </div>
      ) : null}

      {approved ? (
        <div className="distribute" aria-label="Send this out">
          <span className="label">Send it out</span>
          <div className="row wrap">
            <Button onClick={copy} disabled={Boolean(busy)}>Copy</Button>
            <Button onClick={whatsapp} disabled={Boolean(busy)}>Share on WhatsApp</Button>
            {emailCard ? <Button onClick={email} disabled={Boolean(busy)}>{busy === "email" ? "Sending" : "Send email"}</Button> : null}
            {hasImage && mediaPhase(base) === "ready" ? <Button onClick={downloadPng} disabled={Boolean(busy)}>Download PNG</Button> : null}
            {!emailCard ? <Button onClick={posted} disabled={Boolean(busy)}>Mark as posted</Button> : null}
          </div>
        </div>
      ) : written && asset.status !== "blocked" ? (
        <p className="muted small">Approve to unlock copy, share and download.</p>
      ) : null}

      {counts.length ? <p className="counts mono">{counts.map(([k, n]) => `${n} ${k}`).join(" / ")}</p> : null}
      {note ? <p className="note" role="status">{note}</p> : null}
      {error ? <ErrorNote>{error}</ErrorNote> : null}
    </article>
  );
}

export function CampaignView({ id, go, onBusiness }: { id: string; go: (r: Route) => void; onBusiness: (b: string) => void }) {
  const [board, setBoard] = useState<Board | null>(null);
  const [states, setStates] = useState<AssetStateMap>({});
  const [statesMissing, setStatesMissing] = useState(false);
  const [plan, setPlan] = useState<Plan | null>(null);
  const [error, setError] = useState("");
  const [fatal, setFatal] = useState(false);
  const [writing, setWriting] = useState(false);
  const [imageBusy, setImageBusy] = useState(false);
  const alive = useRef(true);

  const refresh = useCallback(async () => {
    try {
      const b = await getBoard(id);
      if (!alive.current) return;
      setBoard(b);
      setFatal(false);
      setError("");
    } catch (e) {
      if (alive.current) { setError((e as Error).message); setFatal(true); }
    }
    try {
      const s = await getAssetState(id);
      if (alive.current) { setStates(s); setStatesMissing(false); }
    } catch (e) {
      if (alive.current && e instanceof ApiError && (e.status === 404 || e.status === 405)) setStatesMissing(true);
    }
  }, [id]);

  useEffect(() => {
    alive.current = true;
    getPlan(id).then((p) => { if (alive.current) { setPlan(p); onBusiness(p.business?.name || ""); } }).catch(() => undefined);
    return () => { alive.current = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const busyNow = useMemo(() => {
    if (!board) return true;
    const jobs = board.jobs.some((j) => ACTIVE_JOB.includes(j.status));
    const reviewing = board.assets.some((a) => a.review?.status === "checking");
    const media = Object.values(states).some((s) => s.media?.some((m) => ["queued", "running", "pending", "generating"].includes(m.status)));
    return jobs || reviewing || media;
  }, [board, states]);

  useEffect(() => {
    let t: ReturnType<typeof setTimeout>;
    let stop = false;
    const tick = async () => {
      await refresh();
      if (!stop) t = setTimeout(tick, busyNow ? 2500 : 8000);
    };
    tick();
    return () => { stop = true; clearTimeout(t); };
  }, [refresh, busyNow]);

  async function write() {
    setWriting(true);
    setError("");
    try { setBoard(await generate(id)); } catch (e) { setError((e as Error).message); } finally { setWriting(false); }
  }

  async function makeOne(aid: string) {
    setImageBusy(true);
    try { await makeImage(aid); await refresh(); } catch (e) { setError((e as Error).message); } finally { setImageBusy(false); }
  }

  async function makeAll() {
    if (!board) return;
    setImageBusy(true);
    setError("");
    try {
      for (const a of board.assets) {
        if (!IMAGE_CHANNELS.has(a.channel) || !(a.content || a.extra?.headline)) continue;
        if (pickBase(states[a.id])) continue;
        await makeImage(a.id);
      }
      await refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setImageBusy(false);
    }
  }

  if (!board) return <div className="page">{fatal ? <ErrorNote onRetry={refresh}>{error}</ErrorNote> : <p className="muted">Loading Campaign 0.</p>}</div>;

  const locked = Boolean(board.facts?.approved);
  const business = plan?.business.name || "";
  const assets = board.assets;
  const written = assets.filter((a) => a.content || a.extra?.headline || a.extra?.title);
  const approvedN = assets.filter((a) => a.status === "approved").length;
  const jobsLeft = board.jobs.filter((j) => ACTIVE_JOB.includes(j.status)).length;
  const openJobs = new Set(board.jobs.filter((j) => ACTIVE_JOB.includes(j.status) && j.asset_id && j.kind !== "image").map((j) => j.asset_id as string));
  const failedCopy = new Map<string, string>();
  [...board.jobs].filter((j) => j.kind === "copy" && j.asset_id).sort((x, y) => x.updated_at.localeCompare(y.updated_at)).forEach((j) => {
    if (j.status === "failed") failedCopy.set(j.asset_id as string, "The writing service returned an unusable answer.");
    else failedCopy.delete(j.asset_id as string);
  });
  const missingImages = assets.filter((a) => IMAGE_CHANNELS.has(a.channel) && (a.content || a.extra?.headline) && !pickBase(states[a.id])).length;

  const groups = [...CHANNEL_ORDER, ...[...new Set(assets.map((a) => a.channel))].filter((c) => !(CHANNEL_ORDER as readonly string[]).includes(c))]
    .map((c) => ({ channel: c, items: assets.filter((a) => a.channel === c).sort((a, b) => a.lang.localeCompare(b.lang)) }))
    .filter((g) => g.items.length);

  return (
    <div className="page campaign">
      <header className="camp-head">
        <div>
          <p className="kicker">Campaign 0{business ? ` for ${business}` : ""}</p>
          <h1 className="display-sm">{assets.length ? `${approvedN} of ${assets.length} approved` : "Not written yet"}</h1>
          {assets.length ? (
            <div className="progress-bar camp-bar" aria-hidden="true"><span style={{ width: `${assets.length ? (approvedN / assets.length) * 100 : 0}%` }} /></div>
          ) : null}
          {jobsLeft ? <p className="muted small">{jobsLeft} {jobsLeft === 1 ? "job" : "jobs"} still working. This page updates by itself.</p> : null}
        </div>
        <div className="camp-actions">
          {missingImages ? <Button onClick={makeAll} disabled={imageBusy}>{imageBusy ? "Queueing pictures" : `Make ${missingImages} ${missingImages === 1 ? "picture" : "pictures"}`}</Button> : null}
          <Button variant="secondary" onClick={() => go({ name: "dashboard", id })}>Open dashboard</Button>
        </div>
      </header>

      {error ? <ErrorNote onRetry={refresh}>{error}</ErrorNote> : null}
      {statesMissing ? <p className="muted small">Pictures and tracked links are not available yet (the asset state endpoint is missing).</p> : null}

      {!assets.length ? (
        <Empty title={locked ? "Campaign 0 has not been written yet" : "The plan is not locked yet"}>
          {locked ? "Write it to create every channel and language from your locked facts." : "Lock the plan first. Copy is only written from locked facts."}
        </Empty>
      ) : null}
      {!assets.length ? (
        locked ? <Button variant="primary" onClick={write} disabled={writing}>{writing ? "Writing" : "Write Campaign 0"}</Button> : <Button variant="primary" onClick={() => go({ name: "plan", id })}>Back to the plan</Button>
      ) : null}
      {assets.length && !written.length ? <p className="muted">Waiting for the first copy to arrive.</p> : null}

      {groups.map((g) => (
        <section key={g.channel} className="channel" aria-labelledby={`ch-${g.channel}`}>
          <h2 id={`ch-${g.channel}`} className="section-title">{channelLabel(g.channel)}</h2>
          <p className="channel-sum mono">
            {[
              `${g.items.filter(hasText).length}/${g.items.length} written`,
              `${g.items.filter((a) => a.status === "approved").length} approved`,
              g.items.some((a) => a.status === "blocked") ? `${g.items.filter((a) => a.status === "blocked").length} blocked` : "",
              g.items.some((a) => a.review?.status === "flagged") ? `${g.items.filter((a) => a.review?.status === "flagged").length} meaning flagged` : "",
            ].filter(Boolean).join(" / ")}
          </p>
          <div className="asset-grid">
            {g.items.map((a) => (
              <AssetCard key={a.id} asset={a} state={states[a.id]} plan={plan} business={business} onChanged={refresh} onMakeImage={makeOne} imageBusy={imageBusy} openJob={openJobs.has(a.id)} failed={failedCopy.has(a.id) ? failedCopy.get(a.id) || "" : null} onRetry={write} />
            ))}
          </div>
        </section>
      ))}

      {assets.length ? <ChangeByVoice campaignId={id} assets={assets} onApplied={(b) => { setBoard(b); refresh(); }} /> : null}
    </div>
  );
}
