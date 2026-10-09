import { useEffect, useRef, useState } from "react";
import type { ButtonHTMLAttributes, ReactNode } from "react";
import { createPortal } from "react-dom";

type BtnProps = ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "secondary" | "quiet"; block?: boolean };

export function Button({ variant = "secondary", block, className = "", type = "button", ...rest }: BtnProps) {
  return <button type={type} className={`cvb cvb-${variant}${block ? " cvb-block" : ""} ${className}`} {...rest} />;
}

export function Badge({ tone, children }: { tone: "neutral" | "approved" | "flagged" | "blocked" | "checking"; children: ReactNode }) {
  return <span className={`badge badge-${tone}`}>{children}</span>;
}

export function Empty({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="empty">
      <p className="empty-title">{title}</p>
      {children ? <p className="empty-body">{children}</p> : null}
    </div>
  );
}

export function ErrorNote({ children, onRetry }: { children: ReactNode; onRetry?: () => void }) {
  return (
    <div className="error-note" role="alert">
      <span>{children}</span>
      {onRetry ? <Button variant="secondary" onClick={onRetry}>Try again</Button> : null}
    </div>
  );
}

export function Sheet({ open, title, onClose, children, wide }: { open: boolean; title: string; onClose: () => void; children: ReactNode; wide?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const prev = document.activeElement as HTMLElement | null;
    ref.current?.focus();
    const key = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", key);
    document.body.classList.add("no-scroll");
    return () => {
      window.removeEventListener("keydown", key);
      document.body.classList.remove("no-scroll");
      prev?.focus?.();
    };
  }, [open, onClose]);
  if (!open) return null;
  // Portal to <body> so the fixed sheet is not trapped by the glass panel's backdrop-filter.
  return createPortal(
    <div className="cv cv-portal"><div className="sheet-wrap">
      <div className="sheet-backdrop" onClick={onClose} />
      <div className={`sheet${wide ? " sheet-wide" : ""}`} role="dialog" aria-modal="true" aria-label={title} tabIndex={-1} ref={ref}>
        <div className="sheet-head">
          <h2>{title}</h2>
          <Button variant="quiet" onClick={onClose} aria-label={`Close ${title}`}>Close</Button>
        </div>
        <div className="sheet-body">{children}</div>
      </div>
    </div></div>,
    document.body,
  );
}

export function Kicker({ children }: { children: ReactNode }) {
  return <p className="kicker">{children}</p>;
}

const foldKey = (id: string) => `fold-${id}`;
const readFold = (id: string, fallback: boolean) => {
  try { const v = localStorage.getItem(foldKey(id)); return v === null ? fallback : v === "1"; } catch { return fallback; }
};

// A section the owner can fold away. The choice is remembered on this device. A folded section renders nothing inside, so a
// panel that fetches or polls does not do that work while it is out of sight.
export function Fold({ id, title, defaultOpen = false, className = "panel", titleClass = "panel-title", children }: {
  id: string; title: string; defaultOpen?: boolean; className?: string; titleClass?: string; children: ReactNode;
}) {
  const [open, setOpen] = useState(() => readFold(id, defaultOpen));
  const toggle = () => setOpen((v) => {
    try { localStorage.setItem(foldKey(id), v ? "0" : "1"); } catch { /* storage blocked: it holds until reload */ }
    return !v;
  });
  return (
    <section className={`${className} fold${open ? " fold-open" : ""}`} aria-labelledby={`${id}-h`}>
      <h2 id={`${id}-h`} className={titleClass}>
        <button type="button" className="fold-btn" aria-expanded={open} aria-controls={`${id}-body`} onClick={toggle}>
          <span>{title}</span>
          <svg className="fold-chev" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m6 9 6 6 6-6" /></svg>
        </button>
      </h2>
      {open ? <div id={`${id}-body`} className="fold-body">{children}</div> : null}
    </section>
  );
}
