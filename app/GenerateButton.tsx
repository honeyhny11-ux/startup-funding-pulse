"use client";
import { useState } from "react";

export default function GenerateButton({ label = "Generate brief now" }: { label?: string }) {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [email, setEmail] = useState(false);

  async function run() {
    setBusy(true);
    setMsg("Scanning live feeds and asking Gemini — this takes about a minute…");
    let key = "";
    try { key = localStorage.getItem("pulse-admin-key") ?? ""; } catch {}
    const res = await fetch(`/api/generate${email ? "?email=1" : ""}`, { method: "POST", headers: { "x-admin-key": key } });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    if (res.status === 401) return setMsg("Admin key required — set it on the Mandate & watchlist page.");
    if (!res.ok || !data.ok) return setMsg(`Failed: ${data.error ?? res.statusText}`);
    setMsg(`Done: ${data.deals} deals.${data.email?.sent ? " Email sent." : email ? ` Email not sent (${data.email?.reason}).` : ""}`);
    window.location.reload();
  }

  return (
    <div>
      <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
        <button onClick={run} disabled={busy}>{busy ? "Generating…" : label}</button>
        <label className="small" style={{ margin: 0, fontWeight: 400, display: "flex", gap: 6, alignItems: "center" }}>
          <input type="checkbox" checked={email} onChange={(e) => setEmail(e.target.checked)} style={{ width: "auto" }} /> also email it
        </label>
      </div>
      {msg && <div className="status muted">{msg}</div>}
    </div>
  );
}
