import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ApiError, getDashboard, getForecast, getPlan, optimize, predict } from "../lib/api";
import { channelLabel, humanize, langName, prettyText, when } from "../lib/format";
import type { Route } from "../lib/route";
import type { Forecast } from "../lib/types";
import type { Dashboard } from "../lib/types";
import { Badge, Button, Empty, ErrorNote } from "./ui";

const HOUR = 3600_000;

function Kpi({ label, value, note, big }: { label: string; value: number; note?: string; big?: boolean }) {
  return (
    <div className={`kpi${big ? " kpi-big" : ""}`}>
      <span className="label">{label}</span>
      <strong className="kpi-n">{value}</strong>
      {note ? <span className="kpi-note">{note}</span> : null}
    </div>
  );
}

function Funnel({ rows }: { rows: Dashboard["funnel"] }) {
  const max = Math.max(1, ...rows.map((r) => r.count));
  if (rows.every((r) => r.count === 0)) return <Empty title="Nothing has happened yet">The funnel fills in as assets are planned, written, approved and sent.</Empty>;
  return (
    <ol className="funnel">
      {rows.map((r, i) => {
        const prev = i > 0 ? rows[i - 1].count : 0;
        return (
          <li key={r.stage}>
            <span className="funnel-label">{humanize(r.stage)}</span>
            <span className="funnel-track"><span className="funnel-fill" style={{ width: `${(r.count / max) * 100}%` }} /></span>
            <span className="funnel-n mono">{r.count}{i > 0 && prev > 0 ? <em> {Math.round((r.count / prev) * 100)}%</em> : null}</span>
          </li>
        );
      })}
    </ol>
  );
}

type Bucket = { t: number; count: number };

function ClicksChart({ series }: { series: Dashboard["clicks_series"] }) {
  const wrap = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(600);
  const [tip, setTip] = useState<number | null>(null);
  const [table, setTable] = useState(false);

  useEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setW(Math.max(260, el.clientWidth)));
    ro.observe(el);
    setW(Math.max(260, el.clientWidth));
    return () => ro.disconnect();
  });

  const buckets: Bucket[] = useMemo(() => {
    if (!series.length) return [];
    const totals = new Map<number, number>();
    series.forEach((s) => { const t = new Date(s.bucket_start).getTime(); totals.set(t, (totals.get(t) || 0) + s.count); });
    const times = [...totals.keys()];
    const max = Math.max(...times);
    const min = Math.max(Math.min(...times), max - 71 * HOUR);
    const out: Bucket[] = [];
    for (let t = min; t <= max; t += HOUR) out.push({ t, count: totals.get(t) || 0 });
    return out;
  }, [series]);

  if (!buckets.length) return <Empty title="No clicks yet">Clicks appear here once someone opens a tracked link from an approved asset.</Empty>;

  const H = 190, padL = 32, padB = 26, padT = 10, padR = 8;
  const innerW = w - padL - padR, innerH = H - padB - padT;
  const maxC = Math.max(1, ...buckets.map((b) => b.count));
  const top = Math.ceil(maxC / 2) * 2 || 2;
  const slot = innerW / buckets.length;
  const bw = Math.max(2, Math.min(36, slot - 2));
  const fmt = (t: number) => new Date(t).toLocaleString(undefined, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
  const tickIdx = [0, Math.floor((buckets.length - 1) / 2), buckets.length - 1].filter((v, i, a) => a.indexOf(v) === i);

  return (
    <div>
      <div className="chart-bar"><Button variant="quiet" onClick={() => setTable((t) => !t)} aria-pressed={table}>{table ? "Show chart" : "Show as table"}</Button></div>
      {table ? (
        <table className="tbl">
          <thead><tr><th>Hour</th><th className="num">Clicks</th></tr></thead>
          <tbody>{buckets.filter((b) => b.count).map((b) => <tr key={b.t}><td>{fmt(b.t)}</td><td className="num">{b.count}</td></tr>)}</tbody>
        </table>
      ) : (
        <div className="chart" ref={wrap}>
          <svg width={w} height={H} role="img" aria-label={`Clicks per hour, peak ${maxC}`}>
            {[0, top / 2, top].map((v) => {
              const y = padT + innerH - (v / top) * innerH;
              return (
                <g key={v}>
                  <line x1={padL} x2={w - padR} y1={y} y2={y} className="grid-line" />
                  <text x={padL - 6} y={y + 4} textAnchor="end" className="axis-t">{v}</text>
                </g>
              );
            })}
            {buckets.map((b, i) => {
              const h = (b.count / top) * innerH;
              const x = padL + i * slot + (slot - bw) / 2;
              const y = padT + innerH - h;
              return (
                <g key={b.t}>
                  {b.count > 0 ? <path d={`M${x},${padT + innerH} V${y + 3} Q${x},${y} ${x + 3},${y} H${x + bw - 3} Q${x + bw},${y} ${x + bw},${y + 3} V${padT + innerH} Z`} className="bar" /> : null}
                  <rect x={padL + i * slot} y={padT} width={slot} height={innerH} fill="transparent" tabIndex={0} aria-label={`${fmt(b.t)}: ${b.count} clicks`} onMouseEnter={() => setTip(i)} onMouseLeave={() => setTip(null)} onFocus={() => setTip(i)} onBlur={() => setTip(null)} onClick={() => setTip(i)} />
                </g>
              );
            })}
            {tickIdx.map((i) => (
              <text key={i} x={Math.min(Math.max(padL + i * slot + slot / 2, padL + 30), w - padR - 30)} y={H - 6} textAnchor="middle" className="axis-t">{new Date(buckets[i].t).toLocaleString(undefined, { day: "numeric", month: "short", hour: "2-digit" })}</text>
            ))}
          </svg>
          {tip !== null ? (
            <div className="tooltip" style={{ left: Math.min(Math.max(padL + tip * slot + slot / 2, 70), w - 70) }}>
              <strong>{buckets[tip].count} {buckets[tip].count === 1 ? "click" : "clicks"}</strong>
              <span>{fmt(buckets[tip].t)}</span>
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}

type Row = Record<string, string | number>;

function Breakdown({ rows, kind }: { rows: Row[]; kind: "channel" | "lang" }) {
  if (!rows.length) return <Empty title="No assets yet" />;
  const name = (r: Row) => (kind === "channel" ? channelLabel(String(r.channel)) : langName(String(r.lang)));
  return (
    <div className="tbl-wrap">
      <table className="tbl">
        <thead>
          <tr>
            <th>{kind === "channel" ? "Channel" : "Language"}</th><th className="num">Assets</th><th className="num">Approved</th>
            {kind === "channel" ? <th className="num">Sent</th> : null}
            <th className="num">Clicks</th>
            {kind === "channel" ? <th className="num">Opens</th> : null}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={String(r.channel ?? r.lang)}>
              <td>{name(r)}</td>
              <td className="num">{r.assets}</td>
              <td className="num">{r.approved}</td>
              {kind === "channel" ? <td className="num">{r.distributed}</td> : null}
              <td className="num">{r.clicks}</td>
              {kind === "channel" ? <td className="num">{r.opens}</td> : null}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}


function pct(v: number) {
  return `${(v * 100).toFixed(v < 0.1 ? 1 : 0)}%`;
}

function ForecastPanel({ id }: { id: string }) {
  const [data, setData] = useState<Forecast | null>(null);
  const [error, setError] = useState("");
  const [reach, setReach] = useState("");
  useEffect(() => {
    const n = Number(reach);
    getForecast(id, n > 0 ? n : undefined).then((f) => { setData(f); setError(""); }).catch((e: Error) => setError(e.message));
  }, [id, reach]);
  if (error) return <ErrorNote>{error}</ErrorNote>;
  if (!data) return <p className="muted">Working out the forecast.</p>;
  const rows = data.items.filter((i) => i.comparable);
  const skipped = data.items.filter((i) => !i.comparable);
  const top = Math.max(0.01, ...rows.map((r) => r.rate?.high ?? 0));
  const mae = data.model.leave_one_out_mae;
  return (
    <>
      <p className="muted small">
        Expected share of people reached who redeem, from {data.model.n} synthetic past campaigns. Checked by leaving each one out:
        typical error {pct(mae.channel_mean)} points for the channel average against {pct(mae.global_mean)} for a single overall average.
        Channel explains most of the difference; the wording of the copy is not modelled.
      </p>
      <label className="row wrap small" style={{ marginTop: 8 }}>
        <span>People reached per asset</span>
        <input className="input" style={{ maxWidth: 160, minHeight: 36 }} inputMode="numeric" placeholder="typical for the channel" value={reach} onChange={(e) => setReach(e.target.value.replace(/\D/g, ""))} aria-label="People reached per asset" />
      </label>
      {data.totals ? (
        <p className="panel-title" style={{ marginTop: 12 }}>
          About {data.totals.mid} redemptions across these assets <span className="muted small">(likely {data.totals.low} to {data.totals.high})</span>
        </p>
      ) : null}
      {data.notes.map((n) => <p key={n} className="note">{n}</p>)}
      {rows.length === 0 ? <Empty title="Nothing to forecast yet">Write assets for Instagram, WhatsApp or poster first. Other channels have no history.</Empty> : (
        <div className="tbl-wrap">
          <table className="tbl">
            <thead><tr><th>Asset</th><th>Expected redemption</th><th className="num">Per asset</th><th>Because</th></tr></thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.asset_id}>
                  <td>{channelLabel(r.channel)}, {langName(r.lang)}</td>
                  <td>
                    <div style={{ position: "relative", height: 14, background: "var(--paper-2)", borderRadius: 7, minWidth: 140 }} role="img" aria-label={`${pct(r.rate!.low)} to ${pct(r.rate!.high)}, most likely ${pct(r.rate!.mid)}`}>
                      <span style={{ position: "absolute", left: `${(r.rate!.low / top) * 100}%`, width: `${((r.rate!.high - r.rate!.low) / top) * 100}%`, top: 4, height: 6, background: "var(--approved-bg)", borderRadius: 3 }} />
                      <span style={{ position: "absolute", left: `calc(${(r.rate!.mid / top) * 100}% - 3px)`, top: 0, width: 6, height: 14, background: "var(--accent)", borderRadius: 3 }} />
                    </div>
                    <span className="small">{pct(r.rate!.mid)} <span className="muted">({pct(r.rate!.low)} to {pct(r.rate!.high)})</span></span>
                  </td>
                  <td className="num">{r.redemptions!.mid} <span className="muted small">of {r.reach_assumed}{r.reach_is_default ? " typical" : ""}</span></td>
                  <td className="small">{(r.drivers ?? []).map((d) => `${d.factor} ${d.effect}`).join(", ")}{r.approximate ? " (price offers compared with combos)" : ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {skipped.length ? <p className="muted small">No forecast for {Array.from(new Set(skipped.map((s) => channelLabel(s.channel)))).join(", ")}: {skipped[0].reason}</p> : null}
    </>
  );
}

const KIND_LABEL: Record<string, string> = { click: "Click", email_sent: "Email sent", email_open: "Email opened" };

export function DashboardView({ id, go, onBusiness }: { id: string; go: (r: Route) => void; onBusiness: (b: string) => void }) {
  const [data, setData] = useState<Dashboard | null>(null);
  const [error, setError] = useState("");
  const [fatal, setFatal] = useState(false);
  const [busy, setBusy] = useState("");
  const [msg, setMsg] = useState("");
  const [updated, setUpdated] = useState("");

  const load = useCallback(async () => {
    try {
      setData(await getDashboard(id));
      setFatal(false);
      setError("");
      setUpdated(new Date().toLocaleTimeString());
    } catch (e) {
      setError(e instanceof ApiError && e.status === 404 ? "The dashboard is not available yet on this server." : (e as Error).message);
      setFatal(true);
    }
  }, [id]);

  useEffect(() => {
    getPlan(id).then((p) => onBusiness(p.business?.name || "")).catch(() => undefined);
    load();
    const t = setInterval(load, 5000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [load]);

  async function act(kind: "predict" | "optimize") {
    setBusy(kind);
    setMsg("");
    try {
      await (kind === "predict" ? predict(id) : optimize(id));
      setMsg(kind === "predict" ? "Prediction started. Scores appear here as each asset is scored." : "Optimizing weak assets. Before and after scores appear here.");
      load();
    } catch (e) {
      setMsg((e as Error).message);
    } finally {
      setBusy("");
    }
  }

  if (!data) return <div className="page">{fatal ? <ErrorNote onRetry={load}>{error}</ErrorNote> : <p className="muted">Loading the dashboard.</p>}</div>;
  const t = data.totals;
  const q = data.quality;
  const pred = data.predictions;

  return (
    <div className="page dash">
      <header className="dash-head">
        <div>
          <p className="kicker">Dashboard</p>
          <h1 className="display-sm">What happened after you sent it</h1>
          <p className="muted small">Real events from this app only. Updated {updated}.</p>
        </div>
        <Button onClick={() => go({ name: "campaign", id })}>Back to Campaign 0</Button>
      </header>
      {error ? <ErrorNote onRetry={load}>{error}</ErrorNote> : null}

      <section className="kpis" aria-label="Totals">
        <Kpi big label="Clicks" value={t.clicks} note={t.clicks === 0 ? "No link opened yet" : undefined} />
        <Kpi label="Assets" value={t.assets} />
        <Kpi label="Approved" value={t.approved} />
        <Kpi label="Blocked" value={t.blocked} />
        <Kpi label="Distributed" value={t.distributed} />
        <Kpi label="Emails sent" value={t.email_sent} />
        <Kpi label="Email opens" value={t.email_opens} />
      </section>

      <div className="dash-grid">
        <section className="panel" aria-labelledby="fn-h"><h2 id="fn-h" className="panel-title">Funnel</h2><Funnel rows={data.funnel} /></section>
        <section className="panel" aria-labelledby="ck-h"><h2 id="ck-h" className="panel-title">Clicks over time</h2><ClicksChart series={data.clicks_series} /></section>
        <section className="panel" aria-labelledby="bc-h"><h2 id="bc-h" className="panel-title">By channel</h2><Breakdown kind="channel" rows={data.by_channel as unknown as Row[]} /></section>
        <section className="panel" aria-labelledby="bl-h"><h2 id="bl-h" className="panel-title">By language</h2><Breakdown kind="lang" rows={data.by_language as unknown as Row[]} /></section>

        <section className="panel" aria-labelledby="ac-h">
          <h2 id="ac-h" className="panel-title">Live activity</h2>
          {data.activity.length === 0 ? <Empty title="No activity yet">Approvals, sends, clicks and opens show up here as they happen.</Empty> : (
            <ul className="feed">
              {data.activity.map((a, i) => (
                <li key={`${a.ts}-${i}`}>
                  <time className="mono">{when(a.ts)}</time>
                  <span className="chip">{KIND_LABEL[a.kind] || humanize(a.kind)}</span>
                  <span>{prettyText(a.detail)}</span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="panel" aria-labelledby="ql-h">
          <h2 id="ql-h" className="panel-title">Quality</h2>
          <div className="quality">
            <Kpi label="Fact blocks" value={q.fact_blocks} note="Copy stopped for a wrong price, date or day" />
            <Kpi label="Meaning flags" value={q.meaning_flags} note="Back-translation did not match" />
            <Kpi label="Repairs" value={q.repairs} note={`${q.repairs_succeeded} succeeded`} />
          </div>
        </section>

        <section className="panel panel-wide" aria-labelledby="fc-h">
          <h2 id="fc-h" className="panel-title">Forecast from synthetic history</h2>
          <ForecastPanel id={id} />
        </section>

        <section className="panel panel-wide" aria-labelledby="pr-h">
          <h2 id="pr-h" className="panel-title">Persona opinions (qualitative)</h2>
          <p className="muted small">An AI playing synthetic customers reads each asset and says what works and what does not. The 1 to 10 scores are opinions, not a forecast. Kannada and Hindi opinions are unverified until a native speaker checks them.</p>
          <div className="row wrap">
            <Button onClick={() => act("predict")} disabled={Boolean(busy)}>{busy === "predict" ? "Starting" : "Run prediction"}</Button>
            {pred ? <Button onClick={() => act("optimize")} disabled={Boolean(busy)}>{busy === "optimize" ? "Starting" : "Optimize weak assets"}</Button> : null}
          </div>
          {msg ? <p className="note" role="status">{msg}</p> : null}
          {!pred ? <Empty title="No predictions yet">Run the prediction after assets are written.</Empty> : (
            <div className="tbl-wrap">
              <table className="tbl">
                <thead><tr><th>Asset</th><th className="num">Mean</th><th>Dimensions</th><th>Optimizer</th></tr></thead>
                <tbody>
                  {pred.items.map((p) => (
                    <tr key={p.asset_id}>
                      <td>{channelLabel(p.channel)}, {langName(p.lang)}</td>
                      <td className="num">{p.mean.toFixed(1)}</td>
                      <td className="dims mono">{Object.entries(p.dimensions).map(([k, v]) => `${k.replace(/_/g, " ")} ${Number(v).toFixed(1)}`).join(" / ")}</td>
                      <td>{p.after_mean !== null ? <Badge tone="approved">{p.before_mean.toFixed(1)} to {p.after_mean.toFixed(1)}</Badge> : p.optimization ? <Badge tone="checking">{p.optimization.status}</Badge> : <span className="muted">Not run</span>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
