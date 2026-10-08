import { useEffect, useState } from "react";
import type { RefObject } from "react";
import { drawOverlay, loadImage } from "../lib/compose";
import type { OverlayKind } from "../lib/compose";
import { mediaUrl } from "../lib/api";
import type { Asset, AssetState, MediaEntry, OfferFacts } from "../lib/types";
import { Button } from "./ui";

export const OVERLAY_KIND: Record<string, OverlayKind | undefined> = {
  poster: "poster",
  instagram_post: "post",
  instagram_story: "story",
  story: "story",
};
export const IMAGE_CHANNELS = new Set(["instagram_post", "instagram_story", "story", "poster", "blog_post", "google_business_post"]);
const PENDING_MEDIA = ["queued", "running", "pending", "waiting_for_key", "generating"];

export function pickBase(state: AssetState | undefined): MediaEntry | null {
  const list = state?.media || [];
  return list.find((m) => m.kind === "base") || list.find((m) => m.kind === "final") || null;
}

export function mediaPhase(entry: MediaEntry | null): "none" | "pending" | "failed" | "ready" {
  if (!entry) return "none";
  if (PENDING_MEDIA.includes(entry.status)) return "pending";
  if (["failed", "error"].includes(entry.status)) return "failed";
  return entry.url ? "ready" : "pending";
}

function OverlayCanvas({ canvasRef, kind, asset, facts, business, imageUrl }: {
  canvasRef: RefObject<HTMLCanvasElement | null>;
  kind: OverlayKind;
  asset: Asset;
  facts: OfferFacts;
  business: string;
  imageUrl: string | null;
}) {
  const [problem, setProblem] = useState("");
  const headline = asset.extra?.headline || "";
  const subline = kind === "story" ? asset.content || "" : asset.extra?.subline || "";

  useEffect(() => {
    let alive = true;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const paint = (img: HTMLImageElement | null) => {
      if (alive && canvasRef.current) drawOverlay(canvasRef.current, img, { kind, headline, subline, business, facts, lang: asset.lang });
    };
    paint(null);
    if (!imageUrl) return;
    setProblem("");
    loadImage(imageUrl).then(paint).catch((e: Error) => alive && setProblem(e.message));
    return () => { alive = false; };
  }, [canvasRef, kind, headline, subline, business, facts, asset.lang, imageUrl]);

  return (
    <>
      <canvas ref={canvasRef} className={`ov ov-${kind}`} role="img" aria-label={`${kind} preview with the locked offer facts`} />
      {problem ? <p className="muted small">{problem}</p> : null}
    </>
  );
}

function Frame({ ratio, children }: { ratio: string; children: React.ReactNode }) {
  return <div className="media-frame" style={{ aspectRatio: ratio }}>{children}</div>;
}

function MediaSlot({ ratio, phase, onMake, busy }: { ratio: string; phase: "none" | "pending" | "failed"; onMake: () => void; busy: boolean }) {
  return (
    <Frame ratio={ratio}>
      <div className="media-empty">
        {phase === "pending" ? <p>The picture is being made.</p> : null}
        {phase === "failed" ? <p>The picture could not be made.</p> : null}
        {phase === "none" ? <p>No picture yet.</p> : null}
        {phase !== "pending" ? <Button variant="secondary" onClick={onMake} disabled={busy}>{phase === "failed" ? "Try the picture again" : "Make the picture"}</Button> : null}
      </div>
    </Frame>
  );
}

function Tokens({ text }: { text: string }) {
  const parts = text.split(/(\{name\})/g);
  return <>{parts.map((p, i) => (p === "{name}" ? <mark key={i} className="token">{"{name}"}</mark> : <span key={i}>{p}</span>))}</>;
}

function BlogBody({ text, lang }: { text: string; lang: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <div className={`blog-body${open ? " blog-open" : ""}`}><Paragraphs text={text} lang={lang} /></div>
      <Button variant="quiet" onClick={() => setOpen((o) => !o)} aria-expanded={open}>{open ? "Show less" : "Read the full post"}</Button>
    </>
  );
}

function Paragraphs({ text, lang }: { text: string; lang: string }) {
  return <>{text.split(/\n{2,}/).map((p, i) => <p key={i} lang={lang}>{p}</p>)}</>;
}

export function AssetSurface({ asset, state, facts, business, area, recipients, canvasRef, onMakeImage, imageBusy }: {
  asset: Asset;
  state: AssetState | undefined;
  facts: OfferFacts;
  business: string;
  area: string;
  recipients: number;
  canvasRef: RefObject<HTMLCanvasElement | null>;
  onMakeImage: () => void;
  imageBusy: boolean;
}) {
  const ch = asset.channel;
  const text = asset.content || "";
  const x = asset.extra || {};
  const base = pickBase(state);
  const phase = mediaPhase(base);
  const imageUrl = phase === "ready" && base?.url ? mediaUrl(base.url) : null;
  const link = state?.link?.url;

  if (!text && !x.headline && !x.title && !x.subject && !x.script) {
    return <div className="surf surf-empty"><p className="muted">Not written yet.</p></div>;
  }

  if (ch === "cold_email") {
    return (
      <div className="surf surf-email">
        <div className="mail-row"><span className="label">From</span><span>{business}</span></div>
        <div className="mail-row"><span className="label">To</span><span>{recipients ? `${recipients} ${recipients === 1 ? "person" : "people"}, {name} filled at send` : "No recipients added"}</span></div>
        <p className="mail-subject" lang={asset.lang}>{x.subject || "No subject"}</p>
        <div className="mail-body" lang={asset.lang}>{text.split(/\n/).map((line, i) => <p key={i}><Tokens text={line} /></p>)}</div>
        {link ? <p className="mail-link">{link}</p> : null}
      </div>
    );
  }

  if (ch === "whatsapp") {
    return (
      <div className="surf surf-wa">
        <div className="wa-bubble" lang={asset.lang}>
          <Paragraphs text={text} lang={asset.lang} />
          {link ? <p className="wa-link">{link}</p> : null}
        </div>
      </div>
    );
  }

  if (ch === "instagram_post") {
    return (
      <div className="surf surf-ig">
        <div className="ig-head"><span className="avatar" aria-hidden="true">{business.slice(0, 1).toUpperCase()}</span><div><strong>{business}</strong><span className="small muted">{area}</span></div></div>
        {imageUrl ? <OverlayCanvas canvasRef={canvasRef} kind="post" asset={asset} facts={facts} business={business} imageUrl={imageUrl} /> : <MediaSlot ratio="4 / 5" phase={phase === "ready" ? "none" : phase} onMake={onMakeImage} busy={imageBusy} />}
        <div className="ig-caption" lang={asset.lang}>
          <p><strong>{business}</strong> {text}</p>
          {x.hashtags?.length ? <p className="tags">{x.hashtags.map((h) => (h.startsWith("#") ? h : `#${h}`)).join(" ")}</p> : null}
          {link ? <p className="small mono">{link}</p> : null}
        </div>
      </div>
    );
  }

  if (ch === "instagram_story" || ch === "story") {
    return (
      <div className="surf surf-story">
        {imageUrl ? <OverlayCanvas canvasRef={canvasRef} kind="story" asset={asset} facts={facts} business={business} imageUrl={imageUrl} /> : <MediaSlot ratio="9 / 16" phase={phase === "ready" ? "none" : phase} onMake={onMakeImage} busy={imageBusy} />}
        {!imageUrl ? <p className="story-line" lang={asset.lang}><strong>{x.headline}</strong> {text}</p> : null}
      </div>
    );
  }

  if (ch === "poster") {
    return (
      <div className="surf surf-poster">
        {imageUrl ? <OverlayCanvas canvasRef={canvasRef} kind="poster" asset={asset} facts={facts} business={business} imageUrl={imageUrl} /> : <MediaSlot ratio="3 / 4" phase={phase === "ready" ? "none" : phase} onMake={onMakeImage} busy={imageBusy} />}
        {!imageUrl ? <p className="story-line" lang={asset.lang}><strong>{x.headline}</strong> {x.subline}</p> : null}
      </div>
    );
  }

  if (ch === "blog_post") {
    return (
      <article className="surf surf-blog">
        {imageUrl ? <Frame ratio="16 / 9"><img src={imageUrl} alt="" crossOrigin="anonymous" /></Frame> : <MediaSlot ratio="16 / 9" phase={phase === "ready" ? "none" : phase} onMake={onMakeImage} busy={imageBusy} />}
        <h3 lang={asset.lang}>{x.title || "Untitled"}</h3>
        <BlogBody text={text} lang={asset.lang} />
        {link ? <p className="small mono">{link}</p> : null}
      </article>
    );
  }

  if (ch === "google_business_post") {
    return (
      <div className="surf surf-gbp">
        <div className="gbp-head"><strong>{business}</strong><span className="small muted">{area}</span></div>
        {imageUrl ? <Frame ratio="4 / 3"><img src={imageUrl} alt="" crossOrigin="anonymous" /></Frame> : <MediaSlot ratio="4 / 3" phase={phase === "ready" ? "none" : phase} onMake={onMakeImage} busy={imageBusy} />}
        <div lang={asset.lang}><Paragraphs text={text} lang={asset.lang} /></div>
        {x.button ? <span className="chip">Button: {x.button === "call" ? "Call" : "Learn more"}</span> : null}
      </div>
    );
  }

  if (ch === "reel") {
    const lines = x.script?.length ? x.script : text.split(/\n/).filter(Boolean);
    const video = (state?.media || []).find((m) => m.kind === "video");
    const vPhase = mediaPhase(video || null);
    return (
      <div className="surf surf-reelwrap">
        <ol className="surf-reel" lang={asset.lang}>
          {lines.map((l, i) => <li key={i}>{l}</li>)}
        </ol>
        {vPhase === "ready" && video?.url ? <video className="reel-video" controls preload="metadata" src={mediaUrl(video.url)} /> : null}
        {vPhase === "pending" ? <p className="muted small">The video is being made.</p> : null}
        {vPhase === "failed" ? <p className="muted small">The video could not be made.{video?.detail ? ` ${video.detail}` : ""}</p> : null}
      </div>
    );
  }

  return <div className="surf" lang={asset.lang}><Paragraphs text={text} lang={asset.lang} /></div>;
}
