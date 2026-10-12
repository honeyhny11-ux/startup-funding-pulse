"use client";
import { useEffect, useState } from "react";
import { STAGES, type PulseConfig, type Stage } from "@/lib/types";

const lines = (s: string) => s.split("\n").map((x) => x.trim()).filter(Boolean);

export default function ConfigPage() {
  const [cfg, setCfg] = useState<PulseConfig | null>(null);
  const [sectors, setSectors] = useState("");
  const [watch, setWatch] = useState("");
  const [adminKey, setAdminKey] = useState("");
  const [storage, setStorage] = useState("");
  const [status, setStatus] = useState("");

  useEffect(() => {
    try { setAdminKey(localStorage.getItem("pulse-admin-key") ?? ""); } catch {}
    fetch("/api/config").then((r) => r.json()).then((d) => {
      setCfg(d.config);
      setStorage(d.storageMode);
      setSectors(d.config.focusSectors.join("\n"));
      setWatch(d.config.watchlist.map((w: { name: string; note?: string }) => (w.note ? `${w.name} | ${w.note}` : w.name)).join("\n"));
    });
  }, []);

  if (!cfg) return <p className="muted">Loading…</p>;

  const toggleStage = (s: Stage) =>
    setCfg({ ...cfg, focusStages: cfg.focusStages.includes(s) ? cfg.focusStages.filter((x) => x !== s) : [...cfg.focusStages, s] });

  async function save() {
    setStatus("Saving…");
    try { localStorage.setItem("pulse-admin-key", adminKey); } catch {}
    const body: PulseConfig = {
      ...cfg!,
      focusSectors: lines(sectors),
      watchlist: lines(watch).map((l) => {
        const [name, ...note] = l.split("|");
        return { name: name.trim(), note: note.join("|").trim() || undefined };
      }),
    };
    const res = await fetch("/api/config", {
      method: "PUT",
      headers: { "Content-Type": "application/json", "x-admin-key": adminKey },
      body: JSON.stringify(body),
    });
    const d = await res.json().catch(() => ({}));
    if (!res.ok) return setStatus(`Not saved: ${d.error ?? res.statusText}`);
    setCfg(d.config);
    setStatus("Saved. Next Monday's brief will use this mandate.");
  }

  return (
    <div style={{ maxWidth: 720 }}>
      <div className="kicker">Configuration</div>
      <h1>Mandate &amp; watchlist</h1>
      <p className="muted">
        The brief ranks deals by these settings. Sectors are matched by meaning, so &quot;Fintech&quot; also catches lending, payments
        and insurtech.
      </p>
      {storage === "memory" && (
        <div className="card alert small" style={{ marginBottom: 12 }}>
          No database connected: changes will not persist. Connect Upstash Redis in Vercel to save them.
        </div>
      )}
      <div className="card">
        <label>Your name</label>
        <input value={cfg.ownerName} onChange={(e) => setCfg({ ...cfg, ownerName: e.target.value })} />

        <label>
          Email the Monday brief to <span className="hint">(comma-separate several addresses)</span>
        </label>
        <input type="email" multiple value={cfg.email} placeholder="you@familyoffice.in" onChange={(e) => setCfg({ ...cfg, email: e.target.value })} />

        <label>
          Focus sectors <span className="hint">(one per line)</span>
        </label>
        <textarea value={sectors} onChange={(e) => setSectors(e.target.value)} />

        <label>Focus stages</label>
        <div className="chips">
          {STAGES.map((s) => (
            <span key={s} className={`chip ${cfg.focusStages.includes(s) ? "on" : ""}`} onClick={() => toggleStage(s)}>
              {s}
            </span>
          ))}
        </div>

        <label>
          Watchlist <span className="hint">(one per line: <code>Company | note</code>; the note helps Gemini spot adjacent competitors)</span>
        </label>
        <textarea value={watch} onChange={(e) => setWatch(e.target.value)} style={{ minHeight: 180 }} />

        <label>
          Admin key <span className="hint">(the ADMIN_KEY set in Vercel; remembered in this browser)</span>
        </label>
        <input type="password" value={adminKey} onChange={(e) => setAdminKey(e.target.value)} />

        <div style={{ marginTop: 18 }}>
          <button onClick={save}>Save mandate</button>
          {status && <div className="status">{status}</div>}
        </div>
      </div>
    </div>
  );
}
