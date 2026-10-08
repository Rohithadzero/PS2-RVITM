import { useEffect, useRef } from "react";
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
