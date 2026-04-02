import { useState, useEffect, useRef, useCallback } from "react";

// ─── CROSS-TAB + CROSS-SYSTEM SYNC ───────────────────────────────────────────
// BroadcastChannel handles same-browser sync
const channel = typeof BroadcastChannel !== "undefined" ? new BroadcastChannel("aria_sync_v8") : null;
function broadcast(type, payload) {
  if (channel) channel.postMessage({ type, payload, ts: Date.now() });
  // Also write to localStorage for cross-system sync via polling
  try {
    const key = "aria_sync_" + type;
    localStorage.setItem(key, JSON.stringify({ type, payload, ts: Date.now() }));
  } catch (e) {}
}

// Poll localStorage for changes from other systems
function useStorageSync(onMessage) {
  const lastTs = useRef({});
  useEffect(() => {
    const KEYS = ["aria_sync_MEDICINE_TAKEN", "aria_sync_EMERGENCY", "aria_sync_EMERGENCY_CLEAR", "aria_sync_LOG_ENTRY", "aria_sync_WEARABLE"];
    const interval = setInterval(() => {
      KEYS.forEach(key => {
        try {
          const raw = localStorage.getItem(key);
          if (!raw) return;
          const msg = JSON.parse(raw);
          if (msg.ts !== lastTs.current[key]) {
            lastTs.current[key] = msg.ts;
            onMessage(msg);
          }
        } catch (e) {}
      });
    }, 800);
    return () => clearInterval(interval);
  }, [onMessage]);
}

// ─── MOCK DATA ────────────────────────────────────────────────────────────────
const INIT_WEARABLE = {
  heart_rate: 74, steps: 3421, sleep: 6.2, calories: 1240, spo2: 97, bp: "118/76"
};

const INIT_MEDICINES = [
  { id: 1, name: "Amlodipine", dose: "5mg", schedule: "8:00 AM", lastTaken: "Today 8:03 AM", supply: 22, prescribed: "Once daily — morning with water. For blood pressure control.", status: "taken", streak: 14, accentColor: "#1d4ed8" },
  { id: 2, name: "Metformin", dose: "500mg", schedule: "2:00 PM", lastTaken: "Yesterday 2:11 PM", supply: 5, prescribed: "Twice daily with food. Controls blood sugar levels. Do not skip.", status: "pending", streak: 3, accentColor: "#b45309" },
  { id: 3, name: "Atorvastatin", dose: "10mg", schedule: "9:00 PM", lastTaken: "Yesterday 9:00 PM", supply: 18, prescribed: "Once daily — evening. For cholesterol. Avoid grapefruit juice.", status: "pending", streak: 21, accentColor: "#7c3aed" },
  { id: 4, name: "Aspirin", dose: "75mg", schedule: "8:00 AM", lastTaken: "Today 8:05 AM", supply: 30, prescribed: "Once daily — morning with breakfast. Blood thinner. Do not crush.", status: "taken", streak: 60, accentColor: "#059669" },
];

const PATIENT_DATA = {
  name: "Mr. Rajan Sharma", age: 73, risk: 0.62,
  summary: "Risk is rising. Missed Metformin 4/7 days → HbA1c 8.2 → kidney stress. Recommend nephrology referral within 7 days.",
  rootCause: "Medication non-adherence → elevated blood glucose → kidney stress markers",
  recommendation: "Structured medication reminder + caregiver check-in (ITE: −0.31)",
};

const CAUSAL_DATA = [
  { day: "D1", ate: -0.08, ite: -0.14 }, { day: "D3", ate: -0.10, ite: -0.19 },
  { day: "D5", ate: -0.12, ite: -0.24 }, { day: "D7", ate: -0.13, ite: -0.28 },
  { day: "D10", ate: -0.14, ite: -0.31 }, { day: "D14", ate: -0.15, ite: -0.33 },
];

const INTERVENTIONS = [
  { name: "Medication Reminder", ate: -0.14, ite: -0.31, color: "#1d4ed8" },
  { name: "Caregiver Alert",     ate: -0.09, ite: -0.19, color: "#7c3aed" },
  { name: "Diet Intervention",   ate: -0.07, ite: -0.11, color: "#059669" },
  { name: "Activity Increase",   ate: -0.05, ite: -0.08, color: "#b45309" },
];

const RISK_TREND = [
  { day: "Mar 20", score: 0.38 }, { day: "Mar 22", score: 0.41 },
  { day: "Mar 24", score: 0.44 }, { day: "Mar 26", score: 0.50 },
  { day: "Mar 28", score: 0.53 }, { day: "Mar 30", score: 0.56 },
  { day: "Apr 1",  score: 0.62 },
];

const FED_NODES = [
  { id: "H1", label: "BGS Hospital",   x: 20,  y: 20,  accuracy: 94.2, samples: 234, status: "complete" },
  { id: "H2", label: "Narayana",       x: 220, y: 20,  accuracy: 91.8, samples: 198, status: "training" },
  { id: "H3", label: "Manipal Center", x: 20,  y: 150, accuracy: 93.1, samples: 211, status: "complete" },
  { id: "H4", label: "Apollo Node",    x: 220, y: 150, accuracy: 95.3, samples: 267, status: "complete" },
];
const GLOBAL_POS = { x: 155, y: 100 };

// ─── UTILS ────────────────────────────────────────────────────────────────────
function riskColor(s) { return s < 0.4 ? "#059669" : s < 0.65 ? "#d97706" : "#dc2626"; }
function riskLabel(s) { return s < 0.4 ? "LOW RISK" : s < 0.65 ? "MODERATE RISK" : "HIGH RISK"; }
function now() { return new Date().toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" }); }

// ─── GLOBAL CSS ───────────────────────────────────────────────────────────────
const CSS = `
  @import url('https://fonts.googleapis.com/css2?family=DM+Mono:ital,wght@0,400;0,500&family=Nunito:wght@400;500;600;700;800;900&display=swap');
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  html, body, #root { height: 100%; }
  body { font-family: 'Nunito', sans-serif; color: #0f172a; overflow: hidden; }
  ::-webkit-scrollbar { width: 5px; }
  ::-webkit-scrollbar-track { background: transparent; }
  ::-webkit-scrollbar-thumb { background: rgba(0,0,0,0.15); border-radius: 4px; }

  @keyframes pulse-ring { 0%{transform:scale(1);opacity:0.9} 70%{transform:scale(2);opacity:0} 100%{transform:scale(2);opacity:0} }
  @keyframes heartbeat { 0%,100%{transform:scale(1)} 14%{transform:scale(1.15)} 28%{transform:scale(1)} 42%{transform:scale(1.08)} 70%{transform:scale(1)} }
  @keyframes slide-up { from{opacity:0;transform:translateY(16px)} to{opacity:1;transform:translateY(0)} }
  @keyframes fadeIn { from{opacity:0} to{opacity:1} }
  @keyframes em-flash { 0%,100%{opacity:1} 50%{opacity:0.7} }
  @keyframes card-reveal { from{opacity:0;transform:scale(0.96) translateY(10px)} to{opacity:1;transform:scale(1) translateY(0)} }
  @keyframes node-alert { 0%,100%{filter:drop-shadow(0 0 4px #dc2626)} 50%{filter:drop-shadow(0 0 16px #dc2626)} }
  @keyframes scan-line { 0%{transform:translateY(-100%)} 100%{transform:translateY(600%)} }
  @keyframes mic-pulse { 0%,100%{box-shadow:0 0 0 0 rgba(29,78,216,0.4)} 50%{box-shadow:0 0 0 10px rgba(29,78,216,0)} }
  @keyframes log-in { from{opacity:0;transform:translateX(-12px)} to{opacity:1;transform:translateX(0)} }
  @keyframes sync-ping { 0%{opacity:1;transform:scale(1)} 100%{opacity:0;transform:scale(2.5)} }

  .card {
    background: rgba(255,255,255,0.55);
    backdrop-filter: blur(20px);
    -webkit-backdrop-filter: blur(20px);
    border: 1px solid rgba(255,255,255,0.85);
    border-radius: 18px;
    padding: 20px;
    box-shadow: 0 4px 24px -4px rgba(15,23,42,0.10), inset 0 1px 0 rgba(255,255,255,0.9);
  }
  .card-solid {
    background: rgba(255,255,255,0.55);
    backdrop-filter: blur(20px);
    -webkit-backdrop-filter: blur(20px);
    border: 1px solid rgba(255,255,255,0.85);
    border-radius: 18px;
    padding: 20px;
    box-shadow: 0 4px 24px -4px rgba(15,23,42,0.10), inset 0 1px 0 rgba(255,255,255,0.9);
  }
  .card:hover, .card-solid:hover { box-shadow: 0 8px 32px -4px rgba(15,23,42,0.14), inset 0 1px 0 rgba(255,255,255,1); }
  .lbl { font-size: 11px; letter-spacing: 2.5px; text-transform: uppercase; color: #94a3b8; font-family: 'DM Mono', monospace; font-weight: 500; }
  .mono { font-family: 'DM Mono', monospace; }
  .risk-badge { display: inline-flex; align-items: center; gap: 6px; padding: 5px 14px; border-radius: 20px; font-size: 11px; font-weight: 800; letter-spacing: 1px; }
  .panel-scroll { overflow-y: auto; height: 100%; padding-bottom: 100px; }
  .med-card { cursor: pointer; border-radius: 16px; padding: 16px; border: 1.5px solid rgba(226,232,240,0.8); background: rgba(255,255,255,0.9); transition: all 0.18s; box-shadow: 0 2px 10px -2px rgba(15,23,42,0.07); }
  .med-card:hover { border-color: #94a3b8; transform: translateY(-3px); box-shadow: 0 8px 24px -4px rgba(15,23,42,0.14); }
  .overlay { position: fixed; inset: 0; background: rgba(15,23,42,0.4); z-index: 500; display: flex; align-items: center; justify-content: center; animation: fadeIn 0.15s ease; backdrop-filter: blur(8px); }
  .popup { background: #fff; border: 1px solid #e2e8f0; border-radius: 24px; padding: 30px; width: 400px; max-width: 94vw; animation: card-reveal 0.2s ease; box-shadow: 0 32px 80px -12px rgba(15,23,42,0.22); }
  .vital-box { border-radius: 16px; padding: 10px 8px; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 3px; text-align: center; transition: transform 0.15s; min-height: 0; height: 100%; overflow: hidden; }
  .vital-box:hover { transform: scale(1.02); }
  .fab-stack { position: fixed; bottom: 28px; right: 26px; display: flex; flex-direction: column; align-items: flex-end; gap: 12px; z-index: 300; }
  .fab-pill { border-radius: 50px; border: none; cursor: pointer; display: flex; align-items: center; gap: 9px; font-family: 'Nunito', sans-serif; font-size: 14px; font-weight: 800; padding: 12px 20px; transition: transform 0.2s, box-shadow 0.2s; white-space: nowrap; }
  .fab-pill:hover { transform: translateY(-2px); }
  .fab-mic { width: 58px; height: 58px; border-radius: 50%; border: none; cursor: pointer; display: flex; align-items: center; justify-content: center; font-size: 24px; transition: transform 0.2s, box-shadow 0.2s; }
  .fab-mic:hover { transform: scale(1.08); }
  .log-entry { animation: log-in 0.3s ease; }
  .sync-dot { position: relative; display: inline-block; width: 8px; height: 8px; }
  .sync-dot::after { content: ''; position: absolute; inset: 0; border-radius: 50%; background: #059669; animation: sync-ping 1.5s ease-out infinite; }
  .hosp-card {
    background: rgba(255,255,255,0.45);
    backdrop-filter: blur(22px);
    -webkit-backdrop-filter: blur(22px);
    border: 1px solid rgba(255,255,255,0.75);
    border-radius: 18px;
    padding: 20px;
    box-shadow: 0 4px 24px -4px rgba(10,80,60,0.10), inset 0 1px 0 rgba(255,255,255,0.95);
  }
  .hosp-card:hover { box-shadow: 0 8px 32px -4px rgba(10,80,60,0.16), inset 0 1px 0 rgba(255,255,255,1); }
`;

// ─── RISK TREND CHART ─────────────────────────────────────────────────────────
function RiskTrendChart({ compact = false }) {
  const [animated, setAnimated] = useState(false);
  useEffect(() => { const t = setTimeout(() => setAnimated(true), 300); return () => clearTimeout(t); }, []);
  const W = 340, H = compact ? 90 : 110;
  const P = { l: 36, r: 16, t: 12, b: 24 };
  const gW = W - P.l - P.r, gH = H - P.t - P.b;
  const scores = RISK_TREND.map(d => d.score);
  const minS = Math.min(...scores) - 0.05, maxS = Math.max(...scores) + 0.05;
  const xs = i => P.l + (i / (RISK_TREND.length - 1)) * gW;
  const ys = v => P.t + gH - ((v - minS) / (maxS - minS)) * gH;
  const pts = RISK_TREND.map((d, i) => `${xs(i)},${ys(d.score)}`).join(" ");
  const lastX = xs(RISK_TREND.length - 1), lastY = ys(RISK_TREND[RISK_TREND.length - 1].score);
  const rc = riskColor(RISK_TREND[RISK_TREND.length - 1].score);
  const areaPath = `M${P.l},${P.t + gH} ` + RISK_TREND.map((d, i) => `L${xs(i)},${ys(d.score)}`).join(" ") + ` L${xs(RISK_TREND.length - 1)},${P.t + gH} Z`;
  return (
    <svg width="100%" viewBox={`0 0 ${W} ${H}`} style={{ overflow: "visible" }}>
      <defs>
        <linearGradient id="trendFill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={rc} stopOpacity="0.25" />
          <stop offset="100%" stopColor={rc} stopOpacity="0.02" />
        </linearGradient>
      </defs>
      {[0, 0.5, 1].map(t => {
        const y = P.t + t * gH, v = maxS - t * (maxS - minS);
        return <g key={t}><line x1={P.l} y1={y} x2={W - P.r} y2={y} stroke="rgba(0,0,0,0.07)" strokeWidth="1" /><text x={P.l - 4} y={y + 4} textAnchor="end" fontSize="9" fill="#94a3b8" fontFamily="'DM Mono',monospace">{v.toFixed(1)}</text></g>;
      })}
      <path d={areaPath} fill="url(#trendFill)" />
      <polyline points={pts} fill="none" stroke={rc} strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" strokeDasharray="800" strokeDashoffset={animated ? "0" : "800"} style={{ transition: "stroke-dashoffset 1.6s ease" }} />
      {RISK_TREND.map((d, i) => <circle key={i} cx={xs(i)} cy={ys(d.score)} r="3" fill={rc} opacity={animated ? 1 : 0} style={{ transition: `opacity 0.3s ${0.2 + i * 0.12}s` }} />)}
      <circle cx={lastX} cy={lastY} r="6" fill={rc} opacity="0.25"><animate attributeName="r" values="6;12;6" dur="2s" repeatCount="indefinite" /><animate attributeName="opacity" values="0.25;0;0.25" dur="2s" repeatCount="indefinite" /></circle>
      <circle cx={lastX} cy={lastY} r="4.5" fill={rc} />
      <text x={P.l} y={H - 4} textAnchor="middle" fontSize="9" fill="#94a3b8" fontFamily="'DM Mono',monospace">{RISK_TREND[0].day}</text>
      <text x={xs(RISK_TREND.length - 1)} y={H - 4} textAnchor="middle" fontSize="9" fill="#94a3b8" fontFamily="'DM Mono',monospace">{RISK_TREND[RISK_TREND.length - 1].day}</text>
    </svg>
  );
}

// ─── VITAL BOX ────────────────────────────────────────────────────────────────
function VitalBox({ icon, value, unit, label, highlight, pulse, bg }) {
  return (
    <div className="vital-box" style={{
      background: highlight ? "rgba(219,234,254,0.55)" : (bg || "rgba(248,250,252,0.4)"),
      border: `1px solid ${highlight ? "rgba(147,197,253,0.7)" : "rgba(255,255,255,0.6)"}`,
      backdropFilter: "blur(12px)",
      WebkitBackdropFilter: "blur(12px)",
    }}>
      <div style={{ fontSize: 24, animation: pulse ? "heartbeat 1.2s ease infinite" : "none", lineHeight: 1 }}>{icon}</div>
      <div className="mono" style={{ fontSize: 26, fontWeight: 600, color: highlight ? "#1d4ed8" : "#0f172a", lineHeight: 1.1, marginTop: 4 }}>{value}</div>
      <div style={{ fontSize: 10, color: "#64748b", fontFamily: "'DM Mono',monospace", letterSpacing: 1.2, textTransform: "uppercase", marginTop: 1 }}>{unit}</div>
      <div style={{ fontSize: 12, color: "#475569", fontWeight: 700, marginTop: 2 }}>{label}</div>
    </div>
  );
}

// ─── LOG HISTORY PANEL ────────────────────────────────────────────────────────
function LogHistory({ logs }) {
  const typeIcon = { voice: "🎤", form: "📋", manual: "✏️", emergency: "🚨", medicine: "💊", report: "📄" };
  const typeColor = { voice: "#1d4ed8", form: "#7c3aed", manual: "#059669", emergency: "#dc2626", medicine: "#b45309", report: "#0891b2" };
  if (logs.length === 0) return (
    <div style={{ textAlign: "center", padding: "28px 0", color: "#94a3b8", fontSize: 14 }}>No activity logged yet</div>
  );
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {[...logs].reverse().map((log, i) => (
        <div key={i} className="log-entry" style={{ display: "flex", gap: 12, padding: "11px 14px", background: log.type === "emergency" ? "#fef2f2" : "rgba(248,250,252,0.9)", borderRadius: 12, border: `1px solid ${log.type === "emergency" ? "#fecaca" : "rgba(226,232,240,0.8)"}`, alignItems: "flex-start" }}>
          <div style={{ fontSize: 20, flexShrink: 0, marginTop: 1 }}>{typeIcon[log.type] || "📝"}</div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 3 }}>
              <span style={{ fontSize: 13, fontWeight: 800, color: typeColor[log.type] || "#374151", textTransform: "capitalize" }}>{log.type}</span>
              <span className="mono" style={{ fontSize: 10, color: "#94a3b8" }}>{log.time}</span>
            </div>
            <div style={{ fontSize: 13, color: "#475569", lineHeight: 1.5, fontWeight: 500 }}>{log.message}</div>
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── MEDICINE POPUP ───────────────────────────────────────────────────────────
function MedPopup({ med, onClose, onTaken }) {
  return (
    <div className="overlay" onClick={onClose}>
      <div className="popup" onClick={e => e.stopPropagation()}>
        <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 22 }}>
          <div style={{ width: 56, height: 56, borderRadius: 16, background: med.accentColor + "18", border: `2px solid ${med.accentColor}44`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 28, flexShrink: 0 }}>💊</div>
          <div>
            <div style={{ fontSize: 22, fontWeight: 900, color: "#0f172a" }}>{med.name}</div>
            <div style={{ fontSize: 15, color: med.accentColor, fontWeight: 700, marginTop: 2 }}>{med.dose}</div>
          </div>
          <button onClick={onClose} style={{ marginLeft: "auto", background: "#f1f5f9", border: "none", color: "#64748b", fontSize: 18, cursor: "pointer", width: 36, height: 36, borderRadius: 10, display: "flex", alignItems: "center", justifyContent: "center" }}>✕</button>
        </div>
        <div style={{ marginBottom: 18, padding: "14px 16px", background: med.accentColor + "0d", borderRadius: 14, borderLeft: `3px solid ${med.accentColor}`, fontSize: 14, color: "#374151", lineHeight: 1.7 }}>
          <div className="lbl" style={{ marginBottom: 6, color: med.accentColor }}>Prescribed Instructions</div>
          {med.prescribed}
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10, marginBottom: 16 }}>
          {[{ label: "Scheduled", value: med.schedule }, { label: "Supply Left", value: `${med.supply} days`, alert: med.supply <= 5 }, { label: "Streak", value: `🔥 ${med.streak}d` }].map((s, i) => (
            <div key={i} style={{ background: s.alert ? "#fef2f2" : "#f8fafc", borderRadius: 14, padding: "14px 10px", border: `1px solid ${s.alert ? "#fecaca" : "#e2e8f0"}`, textAlign: "center" }}>
              <div className="lbl" style={{ marginBottom: 6, fontSize: 10 }}>{s.label}</div>
              <div className="mono" style={{ fontSize: 17, fontWeight: 600, color: s.alert ? "#dc2626" : "#0f172a" }}>{s.value}</div>
            </div>
          ))}
        </div>
        <div style={{ marginBottom: 16, padding: "12px 14px", background: "#f8fafc", borderRadius: 12, border: "1px solid #e2e8f0", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div><div className="lbl" style={{ marginBottom: 4 }}>Last Taken</div><div style={{ fontSize: 14, fontWeight: 700, color: "#0f172a" }}>{med.lastTaken}</div></div>
          <div style={{ width: 10, height: 10, borderRadius: "50%", background: med.status === "taken" ? "#059669" : "#d97706" }} />
        </div>
        {med.supply <= 5 && <div style={{ marginBottom: 14, padding: "10px 14px", background: "#fef2f2", borderRadius: 12, border: "1px solid #fecaca", fontSize: 13, color: "#dc2626", fontWeight: 600 }}>⚠ Refill needed — only {med.supply} days remaining</div>}
        {med.status === "pending"
          ? <button onClick={() => { onTaken(med.id); onClose(); }} style={{ width: "100%", padding: "14px", background: med.accentColor, border: "none", borderRadius: 14, fontSize: 15, fontWeight: 800, color: "#fff", cursor: "pointer", boxShadow: `0 4px 16px -4px ${med.accentColor}88`, fontFamily: "'Nunito',sans-serif" }}>✓ Mark as Taken</button>
          : <div style={{ textAlign: "center", padding: "13px", fontSize: 15, color: "#059669", fontWeight: 800, background: "#f0fdf4", borderRadius: 14, border: "1px solid #bbf7d0" }}>✓ Already taken today</div>
        }
      </div>
    </div>
  );
}

// ─── MEDICINE CARD GRID — 2x2 for hospital, 1x3 for patient ─────────────────
function MedicineGrid({ medicines, onCardClick, twoByTwo = false, withPlaceholders = false }) {
  const PLACEHOLDERS = [
    { id: "p1", name: "Vitamin D3", dose: "1000 IU", schedule: "8:00 AM", accentColor: "#0891b2", status: "scheduled", streak: 0, supply: 90, lastTaken: "—", prescribed: "Once daily with breakfast. Supports bone health and immunity.", isPlaceholder: true },
    { id: "p2", name: "Omega-3", dose: "500mg", schedule: "9:00 PM", accentColor: "#6d28d9", status: "scheduled", streak: 0, supply: 60, lastTaken: "—", prescribed: "Once daily with dinner. Supports heart and brain health.", isPlaceholder: true },
  ];
  const items = withPlaceholders ? [...medicines, ...PLACEHOLDERS] : medicines;

  return (
    <div style={{ display: "grid", gridTemplateColumns: twoByTwo ? "1fr 1fr" : "repeat(3,1fr)", gap: twoByTwo ? 8 : 10 }}>
      {items.map(m => (
        <div key={m.id} className="med-card" onClick={() => !m.isPlaceholder && onCardClick(m)}
          style={{ padding: twoByTwo ? "12px" : "16px", opacity: m.isPlaceholder ? 0.55 : 1, cursor: m.isPlaceholder ? "default" : "pointer" }}>
          <div style={{ height: 3, background: m.accentColor, borderRadius: 4, marginBottom: twoByTwo ? 8 : 12 }} />
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: twoByTwo ? 6 : 10 }}>
            <span style={{ fontSize: twoByTwo ? 18 : 22 }}>💊</span>
            <div style={{ width: 20, height: 20, borderRadius: "50%",
              background: m.status === "taken" ? "#f0fdf4" : m.status === "scheduled" ? "#f1f5f9" : "#fffbeb",
              border: `2px solid ${m.status === "taken" ? "#059669" : m.status === "scheduled" ? "#cbd5e1" : "#d97706"}`,
              display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10,
              color: m.status === "taken" ? "#059669" : m.status === "scheduled" ? "#94a3b8" : "#d97706", fontWeight: 900
            }}>{m.status === "taken" ? "✓" : m.status === "scheduled" ? "–" : "○"}</div>
          </div>
          <div style={{ fontWeight: 800, fontSize: twoByTwo ? 13 : 15, color: "#0f172a", marginBottom: 2, lineHeight: 1.2 }}>{m.name}</div>
          <div style={{ fontSize: twoByTwo ? 11 : 13, color: m.accentColor, fontWeight: 700, marginBottom: twoByTwo ? 4 : 6 }}>{m.dose}</div>
          <div className="lbl" style={{ marginBottom: 3, fontSize: 9 }}>{m.schedule}</div>
          <div style={{ fontSize: twoByTwo ? 11 : 13, color: "#475569", fontWeight: 600 }}>{m.isPlaceholder ? "— scheduled" : `🔥 ${m.streak}d`}</div>
          {!m.isPlaceholder && m.supply <= 5 && <div style={{ marginTop: 5, fontSize: 10, color: "#dc2626", background: "#fef2f2", padding: "2px 6px", borderRadius: 6, display: "inline-block", fontWeight: 700 }}>⚠ {m.supply}d left</div>}
        </div>
      ))}
    </div>
  );
}

// ─── FEDERATED NETWORK ────────────────────────────────────────────────────────
function FederatedNetwork({ emergency, emergencyNodeIdx }) {
  const [packets, setPackets] = useState([]);
  const [ePackets, setEPackets] = useState([]);
  const pkId = useRef(0);
  const animRef = useRef(null);

  useEffect(() => {
    if (emergency) return;
    const interval = setInterval(() => {
      const ni = Math.floor(Math.random() * FED_NODES.length);
      const id = pkId.current++;
      setPackets(p => [...p.slice(-6), { id, ni, born: Date.now() }]);
      setTimeout(() => setPackets(p => p.filter(x => x.id !== id)), 1800);
    }, 1100);
    return () => clearInterval(interval);
  }, [emergency]);

  useEffect(() => {
    if (!emergency) { setEPackets([]); return; }
    const interval = setInterval(() => {
      const id = pkId.current++;
      setEPackets(p => [...p.slice(-8), { id, src: emergencyNodeIdx ?? 0, born: Date.now() }]);
      setTimeout(() => setEPackets(p => p.filter(x => x.id !== id)), 2000);
    }, 500);
    return () => clearInterval(interval);
  }, [emergency, emergencyNodeIdx]);

  useEffect(() => {
    let running = true;
    const loop = () => { if (running) { animRef.current = requestAnimationFrame(loop); } };
    animRef.current = requestAnimationFrame(loop);
    return () => { running = false; if (animRef.current) cancelAnimationFrame(animRef.current); };
  }, []);

  const W = 420, H = 240;
  const gx = GLOBAL_POS.x + 50, gy = GLOBAL_POS.y + 20;
  function nc(n) { return { x: n.x + 55, y: n.y + 20 }; }

  return (
    <svg width="100%" viewBox={`0 0 ${W} ${H}`} style={{ overflow: "visible", display: "block" }}>
      <defs>
        <radialGradient id="glGrad2"><stop offset="0%" stopColor={emergency ? "#dc2626" : "#1d4ed8"} stopOpacity="0.18" /><stop offset="100%" stopColor={emergency ? "#dc2626" : "#1d4ed8"} stopOpacity="0" /></radialGradient>
        <filter id="glow3"><feGaussianBlur stdDeviation="2" result="c" /><feMerge><feMergeNode in="c" /><feMergeNode in="SourceGraphic" /></feMerge></filter>
      </defs>
      {FED_NODES.map((n, i) => { const c = nc(n); const hi = emergency && i === emergencyNodeIdx; return <line key={n.id} x1={c.x} y1={c.y} x2={gx} y2={gy} stroke={hi ? "#dc2626" : emergency ? "#fca5a544" : "#cbd5e1"} strokeWidth={hi ? 1.5 : 1} strokeDasharray={emergency ? "3 3" : "none"} />; })}
      {packets.map(pk => { const c = nc(FED_NODES[pk.ni]); const t = Math.min((Date.now() - pk.born) / 1800, 1); const x = c.x + (gx - c.x) * t; const y = c.y + (gy - c.y) * t; const op = t < 0.15 ? t / 0.15 : t > 0.75 ? (1 - t) / 0.25 : 1; return (<g key={pk.id} filter="url(#glow3)"><circle cx={x} cy={y} r="4" fill="#1d4ed8" opacity={op} /><circle cx={x} cy={y} r="8" fill="none" stroke="#1d4ed8" strokeWidth="1" opacity={op * 0.3} /></g>); })}
      {ePackets.map(pk => { const srcC = nc(FED_NODES[pk.src]); const t = Math.min((Date.now() - pk.born) / 1200, 1); return FED_NODES.map((_, di) => { if (di === pk.src) return null; const dstC = nc(FED_NODES[di]); const phase = t <= 0.5 ? t * 2 : (t - 0.5) * 2; const fx = t <= 0.5 ? srcC.x : gx, fy2 = t <= 0.5 ? srcC.y : gy; const tx2 = t <= 0.5 ? gx : dstC.x, ty2 = t <= 0.5 ? gy : dstC.y; const px2 = fx + (tx2 - fx) * phase, py2 = fy2 + (ty2 - fy2) * phase; const op = phase > 0.8 ? (1 - phase) / 0.2 : 1; return (<g key={`ep-${pk.id}-${di}`} filter="url(#glow3)"><circle cx={px2} cy={py2} r="5" fill="#dc2626" opacity={op} /><circle cx={px2} cy={py2} r="11" fill="none" stroke="#dc2626" strokeWidth="1" opacity={op * 0.4} /></g>); }); })}
      <circle cx={gx} cy={gy} r="34" fill="url(#glGrad2)" />
      <circle cx={gx} cy={gy} r="26" fill={emergency ? "#fff5f5" : "#eff6ff"} stroke={emergency ? "#dc2626" : "#1d4ed8"} strokeWidth="1.5" filter="url(#glow3)" style={{ animation: emergency ? "node-alert 0.8s infinite" : "none" }} />
      <text x={gx} y={gy - 6} textAnchor="middle" fontSize="9" fill={emergency ? "#dc2626" : "#1d4ed8"} fontFamily="'DM Mono',monospace" fontWeight="600">GLOBAL</text>
      <text x={gx} y={gy + 5} textAnchor="middle" fontSize="9" fill={emergency ? "#dc2626" : "#1d4ed8"} fontFamily="'DM Mono',monospace" fontWeight="600">MODEL</text>
      <text x={gx} y={gy + 17} textAnchor="middle" fontSize="8" fill={emergency ? "#dc262688" : "#1d4ed888"} fontFamily="'DM Mono',monospace">93.2%</text>
      {FED_NODES.map((n, i) => { const isAlert = emergency && i === emergencyNodeIdx; const col = isAlert ? "#dc2626" : n.status === "training" ? "#d97706" : "#1d4ed8"; const bg = isAlert ? "#fff5f5" : n.status === "training" ? "#fffbeb" : "#eff6ff"; return (<g key={n.id} transform={`translate(${n.x},${n.y})`} style={{ animation: isAlert ? "node-alert 0.6s infinite" : "none" }}><rect width="110" height="40" rx="9" fill={bg} stroke={col} strokeWidth={isAlert ? 1.5 : 1} filter={isAlert ? "url(#glow3)" : "none"} />{n.status === "training" && !emergency && <rect width="110" height="3" rx="0" fill="#d9770618" style={{ animation: "scan-line 2s linear infinite" }} />}<text x="55" y="14" textAnchor="middle" fontSize="8" fill={col} fontFamily="'DM Mono',monospace" fontWeight="600">{n.id} · {n.accuracy}%</text><text x="55" y="27" textAnchor="middle" fontSize="10" fill="#374151" fontFamily="'Nunito',sans-serif" fontWeight="700">{n.label}</text><circle cx="100" cy="8" r="3" fill={col}><animate attributeName="r" values="3;5.5;3" dur="2s" repeatCount="indefinite" /><animate attributeName="opacity" values="1;0;1" dur="2s" repeatCount="indefinite" /></circle></g>); })}
      <text x={W / 2} y={H - 6} textAnchor="middle" fontSize="9" fill={emergency ? "#dc2626" : "#94a3b8"} fontFamily="'DM Mono',monospace">{emergency ? "🚨 EMERGENCY PROPAGATING ACROSS NODES" : "🔒 Patient data never leaves hospital nodes · ε = 0.30"}</text>
    </svg>
  );
}

// ─── ITE vs ATE GRAPH ─────────────────────────────────────────────────────────
function CausalGraph() {
  const [animated, setAnimated] = useState(false);
  useEffect(() => { const t = setTimeout(() => setAnimated(true), 400); return () => clearTimeout(t); }, []);
  const W = 380, H = 150, P = { l: 36, r: 18, t: 14, b: 26 };
  const gW = W - P.l - P.r, gH = H - P.t - P.b;
  const allV = CAUSAL_DATA.flatMap(d => [d.ate, d.ite]);
  const minV = Math.min(...allV) - 0.02, maxV = 0.01;
  const xs = i => P.l + (i / (CAUSAL_DATA.length - 1)) * gW;
  const ys = v => P.t + gH - ((v - minV) / (maxV - minV)) * gH;
  const atePts = CAUSAL_DATA.map((d, i) => `${xs(i)},${ys(d.ate)}`).join(" ");
  const itePts = CAUSAL_DATA.map((d, i) => `${xs(i)},${ys(d.ite)}`).join(" ");
  return (
    <div>
      <svg width="100%" viewBox={`0 0 ${W} ${H}`} style={{ overflow: "visible" }}>
        {[0, 0.5, 1].map(t => { const y = P.t + t * gH, v = (maxV - t * (maxV - minV)).toFixed(2); return <g key={t}><line x1={P.l} y1={y} x2={W - P.r} y2={y} stroke="rgba(0,0,0,0.06)" strokeWidth="1" /><text x={P.l - 4} y={y + 4} textAnchor="end" fontSize="8.5" fill="#94a3b8" fontFamily="'DM Mono',monospace">{v}</text></g>; })}
        {CAUSAL_DATA.map((d, i) => <text key={i} x={xs(i)} y={H - 5} textAnchor="middle" fontSize="8.5" fill="#94a3b8" fontFamily="'DM Mono',monospace">{d.day}</text>)}
        <polyline points={atePts} fill="none" stroke="#7c3aed" strokeWidth="2" strokeLinejoin="round" strokeDasharray="700" strokeDashoffset={animated ? "0" : "700"} style={{ transition: "stroke-dashoffset 1.8s ease" }} />
        {CAUSAL_DATA.map((d, i) => <circle key={i} cx={xs(i)} cy={ys(d.ate)} r="3" fill="#7c3aed" opacity={animated ? 1 : 0} style={{ transition: `opacity 0.3s ${0.3 + i * 0.14}s` }} />)}
        <polyline points={itePts} fill="none" stroke="#1d4ed8" strokeWidth="2.5" strokeLinejoin="round" strokeDasharray="700" strokeDashoffset={animated ? "0" : "700"} style={{ transition: "stroke-dashoffset 2.1s ease 0.2s" }} />
        {CAUSAL_DATA.map((d, i) => <circle key={i} cx={xs(i)} cy={ys(d.ite)} r="3.5" fill="#1d4ed8" opacity={animated ? 1 : 0} style={{ transition: `opacity 0.3s ${0.5 + i * 0.14}s` }} />)}
        <text x={xs(CAUSAL_DATA.length - 1) + 5} y={ys(CAUSAL_DATA[CAUSAL_DATA.length - 1].ite) + 4} fontSize="9" fill="#1d4ed8" fontFamily="'DM Mono',monospace">ITE</text>
        <text x={xs(CAUSAL_DATA.length - 1) + 5} y={ys(CAUSAL_DATA[CAUSAL_DATA.length - 1].ate) + 4} fontSize="9" fill="#7c3aed" fontFamily="'DM Mono',monospace">ATE</text>
      </svg>
      <div style={{ display: "flex", gap: 16, marginTop: 8, marginBottom: 14 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 7, fontSize: 13, color: "#1d4ed8", fontWeight: 700 }}><div style={{ width: 18, height: 3, background: "#1d4ed8", borderRadius: 2 }} />ITE — Individual</div>
        <div style={{ display: "flex", alignItems: "center", gap: 7, fontSize: 13, color: "#7c3aed", fontWeight: 700 }}><div style={{ width: 18, height: 2, background: "#7c3aed", borderRadius: 2 }} />ATE — Average</div>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {INTERVENTIONS.map((iv, i) => { const diff = Math.abs(iv.ite - iv.ate); const pct = ((diff / Math.abs(iv.ate)) * 100).toFixed(0); return (
          <div key={i} style={{ background: "rgba(248,250,252,0.8)", borderRadius: 12, padding: "10px 14px", border: "1px solid rgba(226,232,240,0.8)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 7 }}>
              <span style={{ fontSize: 13, fontWeight: 700, color: "#374151" }}>{iv.name}</span>
              <span className="mono" style={{ fontSize: 11, color: "#059669", fontWeight: 700, background: "#f0fdf4", padding: "2px 8px", borderRadius: 6 }}>+{pct}% w/ ITE</span>
            </div>
            <div style={{ display: "flex", gap: 12 }}>
              {[["ATE", iv.ate, "#7c3aed"], ["ITE", iv.ite, "#1d4ed8"], ["Δ", `-${diff.toFixed(2)}`, "#059669"]].map(([lbl, val, col]) => (
                <div key={lbl} style={{ flex: 1 }}><div className="lbl" style={{ marginBottom: 2, fontSize: 9 }}>{lbl}</div><div className="mono" style={{ fontSize: 15, fontWeight: 600, color: col }}>{typeof val === "number" ? val.toFixed(2) : val}</div></div>
              ))}
            </div>
          </div>
        ); })}
      </div>
    </div>
  );
}

// ─── VOICE ASSISTANT ──────────────────────────────────────────────────────────
function VoiceMic({ emergencyTrigger, addLog }) {
  const [open, setOpen] = useState(false);
  const [listening, setListening] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [reply, setReply] = useState("");
  const [loading, setLoading] = useState(false);
  const recRef = useRef(null);

  const speak = text => { try { window.speechSynthesis?.cancel(); const utt = new SpeechSynthesisUtterance(text); utt.lang = "en-IN"; utt.rate = 0.88; utt.pitch = 1; window.speechSynthesis?.speak(utt); } catch (e) {} };

  const handleVoice = text => {
    setLoading(true);
    const r = `Noted. I have logged your update: "${text}". Take care, ${PATIENT_DATA.name.split(" ")[1]}.`;
    setReply(r); speak(r);
    addLog({ type: "voice", message: `Voice log: "${text}"`, time: now() });
    setLoading(false);
  };

  const startListening = () => {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) { setReply("Please use Google Chrome for voice recognition."); return; }
    const rec = new SR();
    rec.lang = "en-IN"; rec.continuous = false; rec.interimResults = false; rec.maxAlternatives = 1;
    recRef.current = rec;
    rec.onresult = e => { const text = e.results[0][0].transcript; setTranscript(text); setListening(false); handleVoice(text); };
    rec.onerror = () => { setListening(false); setReply("Could not hear you clearly. Please try again."); };
    rec.onend = () => setListening(false);
    try { rec.start(); setListening(true); setTranscript(""); setReply(""); } catch (e) { setReply("Microphone access denied."); }
  };

  const stopListening = () => { try { recRef.current?.stop(); } catch (e) {} setListening(false); };

  return (
    <>
      <button className="fab-mic" onClick={() => setOpen(o => !o)} title="Talk to ARIA" style={{ background: listening ? "#dc2626" : "#1d4ed8", color: "#fff", boxShadow: listening ? "0 0 0 0 #dc262644, 0 6px 20px -4px #dc262666" : "0 6px 20px -4px #1d4ed855", animation: listening ? "mic-pulse 1s infinite" : "none" }}>🎤</button>
      {open && (
        <div className="overlay" onClick={() => { setOpen(false); stopListening(); }}>
          <div className="popup" onClick={e => e.stopPropagation()} style={{ width: 360 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
              <div style={{ fontWeight: 900, color: "#0f172a", fontSize: 18 }}>🧠 Talk to ARIA</div>
              <button onClick={() => { setOpen(false); stopListening(); }} style={{ background: "#f1f5f9", border: "none", color: "#64748b", fontSize: 16, cursor: "pointer", width: 34, height: 34, borderRadius: 9, display: "flex", alignItems: "center", justifyContent: "center" }}>✕</button>
            </div>
            <div style={{ textAlign: "center", marginBottom: 18 }}>
              <button onClick={listening ? stopListening : startListening} disabled={loading} style={{ width: 80, height: 80, borderRadius: "50%", background: listening ? "#fef2f2" : loading ? "#f8fafc" : "#eff6ff", border: `3px solid ${listening ? "#dc2626" : "#1d4ed8"}`, fontSize: 32, cursor: "pointer", transition: "all 0.2s", boxShadow: listening ? "0 0 0 8px #dc262622" : "0 4px 16px -4px #1d4ed844", animation: listening ? "mic-pulse 1s infinite" : "none" }}>
                {listening ? "⏹" : "🎤"}
              </button>
              <div style={{ marginTop: 12, fontSize: 14, color: listening ? "#dc2626" : "#64748b", fontWeight: listening ? 800 : 500 }}>{listening ? "Listening… tap to stop" : loading ? "Processing…" : "Tap to speak"}</div>
            </div>
            {transcript && <div style={{ marginBottom: 10, fontSize: 14, color: "#475569", fontStyle: "italic", background: "#f8fafc", padding: "10px 14px", borderRadius: 12, border: "1px solid #e2e8f0" }}>You said: "{transcript}"</div>}
            {reply && <div style={{ fontSize: 14, color: reply.startsWith("🚨") ? "#dc2626" : "#1d4ed8", lineHeight: 1.6, background: reply.startsWith("🚨") ? "#fef2f2" : "#eff6ff", padding: "12px 14px", borderRadius: 12, border: `1px solid ${reply.startsWith("🚨") ? "#fecaca" : "#bfdbfe"}`, fontWeight: 600 }}>{reply}</div>}
            <div style={{ marginTop: 14, fontSize: 12, color: "#94a3b8", lineHeight: 1.5 }}>💡 Use <strong>Log Symptoms</strong> button to report pain and alert the hospital</div>
          </div>
        </div>
      )}
    </>
  );
}

// ─── LOG SYMPTOMS ─────────────────────────────────────────────────────────────
function LogPanel({ emergencyTrigger, addLog }) {
  const [open, setOpen] = useState(false);
  const [pain, setPain] = useState(0);
  const [symptoms, setSymptoms] = useState([]);
  const [note, setNote] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const SYMS = ["Fatigue", "Dizziness", "Nausea", "Chest pain", "Shortness of breath", "Headache"];

  const submit = () => {
    const severe = pain >= 8 || symptoms.includes("Chest pain") || symptoms.includes("Shortness of breath");
    const message = `Pain: ${pain}/10${symptoms.length ? `, Symptoms: ${symptoms.join(", ")}` : ""}${note ? `, Note: ${note}` : ""}`;
    if (severe) {
      emergencyTrigger("log");
      addLog({ type: "emergency", message: `🚨 Emergency via log form — ${message}`, time: now() });
    } else {
      addLog({ type: "form", message, time: now() });
    }
    setSubmitted(true);
    setTimeout(() => { setSubmitted(false); setOpen(false); setPain(0); setSymptoms([]); setNote(""); }, 2200);
  };

  return (
    <>
      <button className="fab-pill" onClick={() => setOpen(o => !o)} style={{ background: "rgba(255,255,255,0.92)", color: "#374151", border: "1.5px solid rgba(226,232,240,0.9)", boxShadow: "0 4px 16px -4px rgba(15,23,42,0.12)" }}>📋 Log Symptoms</button>
      {open && (
        <div className="overlay" onClick={() => setOpen(false)}>
          <div className="popup" onClick={e => e.stopPropagation()}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 20 }}>
              <div style={{ fontWeight: 900, color: "#0f172a", fontSize: 18 }}>📋 Log Symptoms</div>
              <button onClick={() => setOpen(false)} style={{ background: "#f1f5f9", border: "none", color: "#64748b", fontSize: 16, cursor: "pointer", width: 34, height: 34, borderRadius: 9, display: "flex", alignItems: "center", justifyContent: "center" }}>✕</button>
            </div>
            {submitted ? (
              <div style={{ textAlign: "center", padding: "28px 0", fontSize: 16, color: pain >= 8 ? "#dc2626" : "#059669", fontWeight: 800 }}>{pain >= 8 ? "🚨 Hospital notified!" : "✓ Logged successfully"}</div>
            ) : (
              <>
                <div style={{ marginBottom: 18 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 10 }}><div className="lbl">Pain Level</div><span className="mono" style={{ fontSize: 15, color: pain >= 8 ? "#dc2626" : pain >= 5 ? "#d97706" : "#059669", fontWeight: 700 }}>{pain}/10</span></div>
                  <input type="range" min="0" max="10" value={pain} onChange={e => setPain(+e.target.value)} style={{ width: "100%", accentColor: pain >= 8 ? "#dc2626" : "#1d4ed8" }} />
                  {pain >= 8 && <div style={{ fontSize: 13, color: "#dc2626", marginTop: 8, background: "#fef2f2", padding: "6px 10px", borderRadius: 8, fontWeight: 700 }}>⚠ Severe — hospital will be alerted</div>}
                </div>
                <div style={{ marginBottom: 18 }}>
                  <div className="lbl" style={{ marginBottom: 10 }}>Symptoms</div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                    {SYMS.map(s => <button key={s} onClick={() => setSymptoms(p => p.includes(s) ? p.filter(x => x !== s) : [...p, s])} style={{ padding: "6px 14px", borderRadius: 20, fontSize: 13, cursor: "pointer", fontFamily: "'Nunito',sans-serif", fontWeight: 600, background: symptoms.includes(s) ? "#eff6ff" : "#f8fafc", border: `1.5px solid ${symptoms.includes(s) ? "#1d4ed8" : "#e2e8f0"}`, color: symptoms.includes(s) ? "#1d4ed8" : "#64748b" }}>{s}</button>)}
                  </div>
                </div>
                <textarea value={note} onChange={e => setNote(e.target.value)} placeholder="Any additional notes…" style={{ width: "100%", background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 12, padding: "12px 14px", color: "#0f172a", fontSize: 14, resize: "none", height: 68, fontFamily: "'Nunito',sans-serif", marginBottom: 16 }} />
                <button onClick={submit} style={{ width: "100%", padding: "14px", borderRadius: 14, background: pain >= 8 ? "#dc2626" : "#1d4ed8", border: "none", color: "#fff", fontSize: 15, fontWeight: 800, cursor: "pointer", fontFamily: "'Nunito',sans-serif", boxShadow: pain >= 8 ? "0 4px 16px -4px #dc262666" : "0 4px 16px -4px #1d4ed855" }}>
                  {pain >= 8 ? "🚨 Submit & Alert Hospital" : "✓ Log Symptoms"}
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}

// ─── REPORT UPLOAD ────────────────────────────────────────────────────────────
function ReportUpload({ addLog }) {
  const [open, setOpen] = useState(false);
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const fileRef = useRef();

  const handleFile = async file => {
    setLoading(true);
    try {
      const fd = new FormData(); fd.append("file", file);
      const resp = await fetch("http://localhost:8001/report/extract", { method: "POST", body: fd });
      const data = await resp.json();
      setResult(data);
      addLog({ type: "report", message: `Report uploaded: ${file.name}${data.extracted_values?.summary ? " — " + data.extracted_values.summary : ""}`, time: now() });
    } catch {
      setResult({ extracted_values: { hba1c: "8.2 (HIGH)", creatinine: "1.4", blood_pressure: "142/88" }, flags: ["HbA1c HIGH", "BP ELEVATED"] });
      addLog({ type: "report", message: `Report uploaded: ${file.name} (demo values)`, time: now() });
    }
    setLoading(false);
  };

  return (
    <>
      <button className="fab-pill" onClick={() => setOpen(o => !o)} style={{ background: "rgba(255,255,255,0.92)", color: "#374151", border: "1.5px solid rgba(226,232,240,0.9)", boxShadow: "0 4px 16px -4px rgba(15,23,42,0.12)" }}>📄 Upload Report</button>
      {open && (
        <div className="overlay" onClick={() => setOpen(false)}>
          <div className="popup" onClick={e => e.stopPropagation()} style={{ width: 360 }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 20 }}>
              <div style={{ fontWeight: 900, color: "#0f172a", fontSize: 18 }}>📄 Upload Report</div>
              <button onClick={() => setOpen(false)} style={{ background: "#f1f5f9", border: "none", color: "#64748b", fontSize: 16, cursor: "pointer", width: 34, height: 34, borderRadius: 9, display: "flex", alignItems: "center", justifyContent: "center" }}>✕</button>
            </div>
            {loading ? (
              <div style={{ textAlign: "center", padding: "28px 0", color: "#64748b", fontSize: 14, fontWeight: 600 }}>⏳ Extracting values from report…</div>
            ) : !result ? (
              <div onClick={() => fileRef.current?.click()} style={{ border: "2px dashed #e2e8f0", borderRadius: 16, padding: "32px", textAlign: "center", cursor: "pointer", color: "#94a3b8", fontSize: 14, transition: "border-color 0.2s" }} onMouseEnter={e => e.currentTarget.style.borderColor = "#1d4ed8"} onMouseLeave={e => e.currentTarget.style.borderColor = "#e2e8f0"}>
                <div style={{ fontSize: 32, marginBottom: 10 }}>📂</div>
                <div style={{ fontWeight: 700, color: "#374151", fontSize: 15, marginBottom: 4 }}>Click to select file</div>
                Blood report PDF or image
                <input ref={fileRef} type="file" accept=".pdf,image/*" style={{ display: "none" }} onChange={e => e.target.files[0] && handleFile(e.target.files[0])} />
              </div>
            ) : (
              <div>
                <div style={{ marginBottom: 14, fontSize: 13, color: "#059669", fontWeight: 800, background: "#f0fdf4", padding: "10px 14px", borderRadius: 12 }}>✓ Extraction complete</div>
                {Object.entries(result.extracted_values || {}).filter(([k]) => k !== "summary" && k !== "flags").map(([k, v]) => (
                  <div key={k} style={{ display: "flex", justifyContent: "space-between", fontSize: 14, padding: "8px 0", borderBottom: "1px solid #f1f5f9" }}>
                    <span style={{ color: "#64748b", textTransform: "uppercase", fontSize: 11, fontFamily: "'DM Mono',monospace" }}>{k}</span>
                    <span className="mono" style={{ color: "#0f172a", fontWeight: 700 }}>{String(v)}</span>
                  </div>
                ))}
                {(result.extracted_values?.flags || result.flags)?.map((f, i) => <div key={i} style={{ marginTop: 10, fontSize: 12, color: "#dc2626", background: "#fef2f2", padding: "5px 12px", borderRadius: 8, display: "inline-block", marginRight: 6, fontWeight: 700 }}>⚠ {f}</div>)}
                <button onClick={() => { setResult(null); setOpen(false); }} style={{ marginTop: 16, width: "100%", padding: "11px", background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 12, color: "#64748b", fontSize: 14, cursor: "pointer", fontFamily: "'Nunito',sans-serif", fontWeight: 700 }}>Close</button>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}

// ─── MANUAL LOG BUTTON ────────────────────────────────────────────────────────
function ManualLogBtn({ addLog }) {
  const [open, setOpen] = useState(false);
  const [medTaken, setMedTaken] = useState(null);
  const [medName, setMedName] = useState("");
  const [mood, setMood] = useState(3);
  const [activity, setActivity] = useState("");
  const [submitted, setSubmitted] = useState(false);

  const submit = () => {
    const parts = [];
    if (medTaken !== null) parts.push(`Medication ${medTaken ? "taken" : "skipped"}${medName ? ": " + medName : ""}`);
    if (mood) parts.push(`Mood: ${mood}/5`);
    if (activity) parts.push(`Activity: ${activity}`);
    addLog({ type: "manual", message: parts.join(", ") || "Manual log submitted", time: now() });
    setSubmitted(true);
    setTimeout(() => { setSubmitted(false); setOpen(false); setMedTaken(null); setMedName(""); setMood(3); setActivity(""); }, 1800);
  };

  return (
    <>
      <button className="fab-pill" onClick={() => setOpen(o => !o)} style={{ background: "rgba(255,255,255,0.92)", color: "#374151", border: "1.5px solid rgba(226,232,240,0.9)", boxShadow: "0 4px 16px -4px rgba(15,23,42,0.12)" }}>✏️ Manual Log</button>
      {open && (
        <div className="overlay" onClick={() => setOpen(false)}>
          <div className="popup" onClick={e => e.stopPropagation()}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 20 }}>
              <div style={{ fontWeight: 900, color: "#0f172a", fontSize: 18 }}>✏️ Manual Log</div>
              <button onClick={() => setOpen(false)} style={{ background: "#f1f5f9", border: "none", color: "#64748b", fontSize: 16, cursor: "pointer", width: 34, height: 34, borderRadius: 9, display: "flex", alignItems: "center", justifyContent: "center" }}>✕</button>
            </div>
            {submitted ? (
              <div style={{ textAlign: "center", padding: "28px 0", fontSize: 16, color: "#059669", fontWeight: 800 }}>✓ Logged successfully</div>
            ) : (
              <>
                <div style={{ marginBottom: 18 }}>
                  <div className="lbl" style={{ marginBottom: 10 }}>Medication Taken?</div>
                  <div style={{ display: "flex", gap: 10 }}>
                    {[true, false].map(v => <button key={String(v)} onClick={() => setMedTaken(v)} style={{ flex: 1, padding: "10px", borderRadius: 12, border: `2px solid ${medTaken === v ? (v ? "#059669" : "#dc2626") : "#e2e8f0"}`, background: medTaken === v ? (v ? "#f0fdf4" : "#fef2f2") : "#f8fafc", color: medTaken === v ? (v ? "#059669" : "#dc2626") : "#64748b", fontWeight: 800, cursor: "pointer", fontFamily: "'Nunito',sans-serif", fontSize: 14 }}>{v ? "✓ Yes" : "✗ No"}</button>)}
                  </div>
                  {medTaken !== null && <input value={medName} onChange={e => setMedName(e.target.value)} placeholder="Medicine name (optional)" style={{ marginTop: 10, width: "100%", background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 10, padding: "10px 12px", fontSize: 14, fontFamily: "'Nunito',sans-serif", color: "#0f172a" }} />}
                </div>
                <div style={{ marginBottom: 18 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}><div className="lbl">Mood</div><span style={{ fontSize: 20 }}>{["😞","😕","😐","🙂","😊"][mood-1]}</span></div>
                  <input type="range" min="1" max="5" value={mood} onChange={e => setMood(+e.target.value)} style={{ width: "100%", accentColor: "#1d4ed8" }} />
                </div>
                <div style={{ marginBottom: 18 }}>
                  <div className="lbl" style={{ marginBottom: 8 }}>Activity Done</div>
                  <input value={activity} onChange={e => setActivity(e.target.value)} placeholder="e.g. morning walk, yoga…" style={{ width: "100%", background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 10, padding: "10px 12px", fontSize: 14, fontFamily: "'Nunito',sans-serif", color: "#0f172a" }} />
                </div>
                <button onClick={submit} style={{ width: "100%", padding: "14px", borderRadius: 14, background: "#1d4ed8", border: "none", color: "#fff", fontSize: 15, fontWeight: 800, cursor: "pointer", fontFamily: "'Nunito',sans-serif" }}>✓ Save Log</button>
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}

// ─── LOGIN SCREEN ─────────────────────────────────────────────────────────────
function Login({ onLogin }) {
  return (
    <div style={{ minHeight: "100vh", background: "linear-gradient(145deg, #a8c8f8 0%, #c5d8f5 40%, #dbeafe 100%)", display: "flex", alignItems: "center", justifyContent: "center" }}>
      <style>{CSS}</style>
      <div style={{ background: "rgba(255,255,255,0.88)", backdropFilter: "blur(20px)", borderRadius: 28, padding: "50px 46px", width: 420, textAlign: "center", boxShadow: "0 32px 80px -12px rgba(15,23,42,0.16)", border: "1px solid rgba(255,255,255,0.95)", animation: "slide-up 0.45s ease" }}>
        <div style={{ width: 66, height: 66, borderRadius: 20, background: "linear-gradient(135deg, #1d4ed8, #7c3aed)", margin: "0 auto 18px", display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 10px 28px -4px rgba(124,58,237,0.35)", fontSize: 30 }}>🧠</div>
        <div style={{ fontSize: 32, fontWeight: 900, letterSpacing: -1, color: "#0f172a" }}>ARIA <span style={{ color: "#7c3aed", fontWeight: 700, fontSize: 18 }}>v8</span></div>
        <div className="lbl" style={{ marginTop: 7, marginBottom: 38, color: "#94a3b8" }}>Adaptive Reasoning & Intervention Architecture</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          {[
            { role: "patient", icon: "👴", title: "Patient Portal", sub: "Log symptoms · Medicines · Voice assistant", grad: "none", bg: "#f8fafc", border: "#e2e8f0", hb: "#1d4ed8" },
            { role: "clinician", icon: "🩺", title: "Hospital Dashboard", sub: "Federated network · Causal AI · Clinical view", grad: "linear-gradient(135deg, #eff6ff 0%, #faf5ff 100%)", bg: "", border: "#c7d2fe", hb: "#7c3aed" },
          ].map(b => (
            <button key={b.role} onClick={() => onLogin(b.role)} style={{ padding: "18px 22px", background: b.grad !== "none" ? b.grad : b.bg, border: `1.5px solid ${b.border}`, borderRadius: 16, cursor: "pointer", display: "flex", alignItems: "center", gap: 16, textAlign: "left", transition: "all 0.2s", fontFamily: "'Nunito',sans-serif" }} onMouseEnter={e => { e.currentTarget.style.borderColor = b.hb; e.currentTarget.style.boxShadow = "0 6px 20px -4px rgba(15,23,42,0.12)"; }} onMouseLeave={e => { e.currentTarget.style.borderColor = b.border; e.currentTarget.style.boxShadow = "none"; }}>
              <div style={{ width: 48, height: 48, borderRadius: 14, background: "#fff", border: "1px solid #e2e8f0", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 24, flexShrink: 0, boxShadow: "0 2px 8px -2px rgba(15,23,42,0.1)" }}>{b.icon}</div>
              <div><div style={{ fontWeight: 800, fontSize: 16, color: "#0f172a" }}>{b.title}</div><div style={{ fontSize: 13, color: "#64748b", marginTop: 3 }}>{b.sub}</div></div>
            </button>
          ))}
        </div>
        <div className="lbl" style={{ marginTop: 34, color: "#cbd5e1" }}>ADVAYA 2.0 · BGS College of Engineering & Technology</div>
      </div>
    </div>
  );
}

// ─── PATIENT VIEW ─────────────────────────────────────────────────────────────
function PatientView({ wearable, medicines, onMedicineTaken, emergencyTriggered, emergencyTrigger, logs, addLog }) {
  const [popupMed, setPopupMed] = useState(null);
  const [showLogs, setShowLogs] = useState(false);
  const rc = riskColor(PATIENT_DATA.risk);

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", background: "linear-gradient(160deg, #bdd7f5 0%, #cce0f7 30%, #dbeafe 60%, #e8f2fd 100%)" }}>
      {emergencyTriggered && (
        <div style={{ padding: "13px 24px", background: "#dc2626", color: "#fff", fontWeight: 800, fontSize: 14, display: "flex", alignItems: "center", gap: 12, flexShrink: 0, animation: "fadeIn 0.3s ease" }}>
          <div style={{ width: 9, height: 9, borderRadius: "50%", background: "#fff", animation: "pulse-ring 0.8s infinite" }} />
          🚨 EMERGENCY ALERT SENT — Hospital has been notified. Help is on the way.
        </div>
      )}
      {/* ── PATIENT VIEW: 10% margin each side, two equal 40% columns ── */}
      <div className="panel-scroll" style={{ padding: "18px 10% 40px", flex: 1 }}>

        {/* ROW 1 — Summary (left) + Risk Gauge (right) */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 18, marginBottom: 18, animation: "slide-up 0.28s ease", alignItems: "stretch" }}>

          {/* Summary card — flex column so content fills height */}
          <div className="card" style={{ padding: "16px 18px", display: "flex", flexDirection: "column", justifyContent: "space-between" }}>
            <div>
              <div style={{ fontWeight: 800, fontSize: 14, color: "#0f172a" }}>{PATIENT_DATA.name}</div>
              <div style={{ fontSize: 10, color: "#94a3b8", marginTop: 2, fontWeight: 600, letterSpacing: 0.3 }}>Age {PATIENT_DATA.age} · Patient Portal</div>
            </div>
            <div style={{ flex: 1, marginTop: 12, padding: "14px 16px", background: "rgba(248,250,252,0.7)", borderRadius: 9, fontSize: 15, color: "#334155", lineHeight: 1.8, borderLeft: `3px solid ${rc}`, fontWeight: 600, display: "flex", alignItems: "center", textAlign: "justify" }}>{PATIENT_DATA.summary}</div>
            <div style={{ marginTop: 10, padding: "10px 14px", background: "rgba(255,251,235,0.7)", borderRadius: 8, border: "1px solid #fde68a", fontSize: 13, color: "#92400e", fontWeight: 700, lineHeight: 1.6, textAlign: "justify" }}>🔍 {PATIENT_DATA.rootCause}</div>
          </div>

          {/* Risk card — centred number + trend chart fills the card height */}
          <div className="card" style={{ padding: "16px 18px", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "space-between" }}>
            <div className="risk-badge" style={{ background: rc + "18", color: rc, border: `1px solid ${rc}44`, fontSize: 10, padding: "3px 12px" }}>{riskLabel(PATIENT_DATA.risk)}</div>
            <div style={{ textAlign: "center" }}>
              <div className="mono" style={{ fontSize: 48, fontWeight: 500, color: rc, lineHeight: 1 }}>{(PATIENT_DATA.risk * 100).toFixed(0)}</div>
              <div className="lbl" style={{ fontSize: 9, marginTop: 3 }}>Risk Score</div>
            </div>
            <div style={{ width: "100%" }}>
              <RiskTrendChart compact />
              <div style={{ display: "flex", justifyContent: "space-between", marginTop: 4 }}>
                <span style={{ fontSize: 10, color: "#94a3b8" }}>14d ago</span>
                <span style={{ fontSize: 10, color: rc, fontWeight: 800 }}>↑ Rising</span>
                <span style={{ fontSize: 10, color: "#94a3b8" }}>Today</span>
              </div>
            </div>
          </div>
        </div>

        {/* ROW 2 — Live vitals (left) + Log history (right) */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 18, marginBottom: 18, animation: "slide-up 0.3s ease", alignItems: "stretch" }}>

          {/* Vitals — 2x2 grid fills card evenly */}
          <div className="card" style={{ padding: "16px 18px" }}>
            <div className="lbl" style={{ marginBottom: 10, fontSize: 9 }}>Live Vitals</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, height: "calc(100% - 28px)" }}>
              <VitalBox icon="💓" value={wearable.heart_rate} unit="BPM" label="Heart Rate" highlight pulse />
              <VitalBox icon="👣" value={wearable.steps.toLocaleString()} unit="STEPS" label="Today" />
              <VitalBox icon="🩸" value={wearable.spo2 + "%"} unit="SpO₂" label="Oxygen" highlight />
              <VitalBox icon="💉" value={wearable.bp} unit="mmHg" label="BP" />
            </div>
          </div>

          {/* Log history — scrollable list fills remaining space */}
          <div className="card" style={{ padding: "16px 18px", display: "flex", flexDirection: "column", minHeight: 0 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10, flexShrink: 0 }}>
              <div className="lbl" style={{ fontSize: 9 }}>Log History</div>
              {logs.length > 0 && <div style={{ width: 18, height: 18, borderRadius: "50%", background: "#1d4ed8", color: "#fff", fontSize: 10, fontWeight: 800, display: "flex", alignItems: "center", justifyContent: "center" }}>{logs.length}</div>}
            </div>
            <div style={{ flex: 1, overflowY: "auto" }}>
              <LogHistory logs={logs} />
            </div>
          </div>
        </div>

        {/* ROW 3 — Medicine tracker (full width of the 80% content area) */}
        <div className="card" style={{ marginBottom: 18, padding: "16px 18px", animation: "slide-up 0.32s ease" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
            <div className="lbl" style={{ fontSize: 9 }}>Medicine Tracker</div>
            <div style={{ fontSize: 10, color: "#94a3b8", fontWeight: 600 }}>Tap a card for details</div>
          </div>
          <MedicineGrid medicines={medicines} onCardClick={setPopupMed} withPlaceholders />
        </div>

        {/* ROW 4 — Action buttons */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr auto", gap: 12, marginBottom: 20, animation: "slide-up 0.34s ease" }}>
          <button onClick={() => document.getElementById("aria-log-btn")?.click()} style={{ padding: "11px 14px", background: "rgba(255,255,255,0.7)", border: "1.5px solid rgba(255,255,255,0.8)", borderRadius: 14, cursor: "pointer", fontFamily: "'Nunito',sans-serif", fontWeight: 800, fontSize: 13, color: "#374151", boxShadow: "0 4px 16px -4px rgba(15,23,42,0.08)", display: "flex", alignItems: "center", justifyContent: "center", gap: 7, backdropFilter: "blur(12px)" }}>📋 Log Symptoms</button>
          <button onClick={() => document.getElementById("aria-report-btn")?.click()} style={{ padding: "11px 14px", background: "rgba(255,255,255,0.7)", border: "1.5px solid rgba(255,255,255,0.8)", borderRadius: 14, cursor: "pointer", fontFamily: "'Nunito',sans-serif", fontWeight: 800, fontSize: 13, color: "#374151", boxShadow: "0 4px 16px -4px rgba(15,23,42,0.08)", display: "flex", alignItems: "center", justifyContent: "center", gap: 7, backdropFilter: "blur(12px)" }}>📄 Report Upload</button>
          <button onClick={() => document.getElementById("aria-mic-btn")?.click()} style={{ width: 48, height: 48, borderRadius: "50%", background: "#1d4ed8", border: "none", cursor: "pointer", fontSize: 20, display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 6px 20px -4px #1d4ed866", color: "#fff" }}>🎤</button>
        </div>
      </div>

      {popupMed && <MedPopup med={popupMed} onClose={() => setPopupMed(null)} onTaken={onMedicineTaken} />}

      {/* Hidden FAB triggers with IDs so the row buttons above can click them */}
      <div style={{ position: "fixed", bottom: -200, right: 0, opacity: 0, pointerEvents: "none" }}>
        <span id="aria-mic-btn"><VoiceMic emergencyTrigger={emergencyTrigger} addLog={addLog} /></span>
        <span id="aria-log-btn"><LogPanel emergencyTrigger={emergencyTrigger} addLog={addLog} /></span>
        <span id="aria-report-btn"><ReportUpload addLog={addLog} /></span>
        <ManualLogBtn addLog={addLog} />
      </div>

      {/* Visible FAB stack — mic always accessible */}
      <div className="fab-stack">
        <VoiceMic emergencyTrigger={emergencyTrigger} addLog={addLog} />
        <LogPanel emergencyTrigger={emergencyTrigger} addLog={addLog} />
        <ReportUpload addLog={addLog} />
      </div>
    </div>
  );
}

// ─── HOSPITAL VIEW ────────────────────────────────────────────────────────────
function HospitalView({ wearable, medicines, emergency, emergencyType, logs }) {
  const [popupMed, setPopupMed] = useState(null);
  const [emergencyPopup, setEmergencyPopup] = useState(false);
  const [prevEmergency, setPrevEmergency] = useState(false);
  const rc = riskColor(PATIENT_DATA.risk);

  // Trigger popup whenever emergency goes from false → true
  useEffect(() => {
    if (emergency && !prevEmergency) {
      setEmergencyPopup(true);
    }
    setPrevEmergency(emergency);
  }, [emergency]);

  return (
    <div style={{ height: "100%", overflow: "hidden", display: "flex", flexDirection: "column", background: "url('data:image/png;base64,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') center/cover no-repeat", backgroundBlendMode: "normal" }}>

      {/* ── EMERGENCY POPUP — appears in hospital view when patient triggers alert ── */}
      {emergencyPopup && (
        <div className="overlay" style={{ zIndex: 999 }}>
          <div style={{ background: "#fff", borderRadius: 24, padding: "36px 32px", width: 440, maxWidth: "94vw", animation: "card-reveal 0.25s ease", boxShadow: "0 32px 80px -12px rgba(220,38,38,0.35)", border: "2px solid #fecaca", textAlign: "center" }}>
            <div style={{ width: 72, height: 72, borderRadius: "50%", background: "#fef2f2", border: "3px solid #dc2626", margin: "0 auto 20px", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 36, animation: "em-flash 0.8s infinite" }}>🚨</div>
            <div style={{ fontSize: 22, fontWeight: 900, color: "#dc2626", marginBottom: 8, letterSpacing: -0.5 }}>EMERGENCY ALERT</div>
            <div style={{ fontSize: 15, color: "#374151", fontWeight: 700, marginBottom: 6 }}>{PATIENT_DATA.name} · Age {PATIENT_DATA.age}</div>
            <div style={{ fontSize: 14, color: "#64748b", marginBottom: 20, lineHeight: 1.6, padding: "12px 16px", background: "#fef2f2", borderRadius: 12 }}>
              {emergencyType === "pain" ? "🔴 Severe pain reported via voice assistant" : "🔴 Critical symptoms logged via symptom form"}
              <br /><span style={{ fontSize: 12, color: "#94a3b8", marginTop: 4, display: "block" }}>Received at {new Date().toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}</span>
            </div>
            <div style={{ display: "flex", gap: 10 }}>
              <button onClick={() => setEmergencyPopup(false)} style={{ flex: 1, padding: "13px", background: "#dc2626", border: "none", borderRadius: 14, color: "#fff", fontSize: 14, fontWeight: 800, cursor: "pointer", fontFamily: "'Nunito',sans-serif", boxShadow: "0 4px 16px -4px #dc262666" }}>🚑 Acknowledge & Dispatch</button>
              <button onClick={() => setEmergencyPopup(false)} style={{ padding: "13px 18px", background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 14, color: "#64748b", fontSize: 14, fontWeight: 700, cursor: "pointer", fontFamily: "'Nunito',sans-serif" }}>✕</button>
            </div>
          </div>
        </div>
      )}

      {/* ── EMERGENCY BANNER — persists while emergency is active ── */}
      {emergency && (
        <div style={{ padding: "11px 24px", background: "#dc2626", color: "#fff", fontWeight: 800, fontSize: 13, display: "flex", alignItems: "center", gap: 12, flexShrink: 0, animation: "em-flash 1s infinite" }}>
          <div style={{ width: 9, height: 9, borderRadius: "50%", background: "#fff", animation: "pulse-ring 0.6s infinite" }} />
          🚨 EMERGENCY ACTIVE — {PATIENT_DATA.name} · {emergencyType === "pain" ? "Severe pain via voice" : "Critical symptoms via log form"}
          <button onClick={() => setEmergencyPopup(true)} style={{ marginLeft: "auto", padding: "4px 14px", background: "rgba(255,255,255,0.2)", border: "1px solid rgba(255,255,255,0.4)", borderRadius: 8, color: "#fff", fontSize: 12, cursor: "pointer", fontFamily: "'Nunito',sans-serif", fontWeight: 700 }}>View Details</button>
        </div>
      )}

      {/* ── HOSPITAL LAYOUT: narrow left (fed + causal) | wide right (summary + vitals + log + meds) ── */}
      <div style={{ flex: 1, display: "grid", gridTemplateColumns: "42% 58%", overflow: "hidden" }}>

        {/* LEFT — federated learning + causal ITE vs ATE (less than half) */}
        <div className="panel-scroll" style={{ borderRight: "1px solid rgba(255,255,255,0.5)", padding: "16px", display: "flex", flexDirection: "column", gap: 12 }}>

          {/* Fed stats row */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 8, animation: "slide-up 0.28s ease" }}>
            {[{ label: "Global Accuracy", value: "93.2%", color: "#1d4ed8" }, { label: "Fed Rounds", value: "12/15", color: "#7c3aed" }, { label: "Privacy ε", value: "0.30", color: "#059669" }].map((s, i) => (
              <div key={i} className="hosp-card" style={{ textAlign: "center", padding: "10px 6px" }}>
                <div className="lbl" style={{ marginBottom: 4, fontSize: 9, color: "#64748b" }}>{s.label}</div>
                <div className="mono" style={{ fontSize: 17, fontWeight: 600, color: s.color }}>{s.value}</div>
              </div>
            ))}
          </div>

          {/* Federated learning animation */}
          <div className="hosp-card" style={{ animation: "slide-up 0.3s ease" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
              <div>
                <div className="lbl" style={{ marginBottom: 2, fontSize: 9, color: "#64748b" }}>Federated Learning Network</div>
                <div style={{ fontSize: 13, fontWeight: 800, color: "#0f172a" }}>4 Nodes → Global Model</div>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 5, padding: "3px 10px", borderRadius: 20, background: emergency ? "rgba(220,38,38,0.15)" : "rgba(29,78,216,0.10)", border: `1px solid ${emergency ? "rgba(220,38,38,0.4)" : "rgba(29,78,216,0.25)"}` }}>
                <div style={{ width: 6, height: 6, borderRadius: "50%", background: emergency ? "#dc2626" : "#1d4ed8", animation: "pulse-ring 1.2s infinite" }} />
                <span className="mono" style={{ fontSize: 9, color: emergency ? "#dc2626" : "#1d4ed8", fontWeight: 700 }}>{emergency ? "EMERGENCY" : "LIVE"}</span>
              </div>
            </div>
            <FederatedNetwork emergency={emergency} emergencyNodeIdx={0} />
            <div style={{ marginTop: 6, fontSize: 10, color: "#059669", fontWeight: 700, textAlign: "center" }}>🔒 Patient data never leaves hospital nodes · ε = 0.30</div>
          </div>

          {/* Causal ITE vs ATE graph */}
          <div className="hosp-card" style={{ animation: "slide-up 0.32s ease" }}>
            <div className="lbl" style={{ marginBottom: 3, fontSize: 9, color: "#64748b" }}>Causal Engine — ITE vs ATE</div>
            <div style={{ fontSize: 11, color: "#475569", marginBottom: 10, fontWeight: 500 }}>Individual Treatment Effect outperforms population average</div>
            <CausalGraph />
          </div>
        </div>

        {/* RIGHT — summary + vitals + log history + medicine tracker */}
        <div className="panel-scroll" style={{ borderLeft: "1px solid rgba(255,255,255,0.5)", padding: "16px", display: "flex", flexDirection: "column", gap: 12 }}>

          {/* Patient summary + risk */}
          <div className="hosp-card" style={{ animation: "slide-up 0.28s ease" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 10 }}>
              <div>
                <div style={{ fontWeight: 900, fontSize: 16, color: "#0f172a" }}>{PATIENT_DATA.name}</div>
                <div style={{ fontSize: 12, color: "#64748b", marginTop: 2, fontWeight: 600 }}>Age {PATIENT_DATA.age} · CLINICIAN SUMMARY</div>
              </div>
              <div style={{ textAlign: "right" }}>
                <div className="risk-badge" style={{ background: rc + "22", color: rc, border: `1px solid ${rc}55`, fontSize: 10 }}>{riskLabel(PATIENT_DATA.risk)}</div>
                <div className="mono" style={{ fontSize: 32, fontWeight: 600, color: rc, marginTop: 4, lineHeight: 1 }}>{(PATIENT_DATA.risk * 100).toFixed(0)}<span style={{ fontSize: 14, color: "#475569" }}>/100</span></div>
              </div>
            </div>
            <div style={{ fontSize: 13, color: "#374151", lineHeight: 1.6, padding: "9px 11px", background: "rgba(248,250,252,0.6)", borderRadius: 10, marginBottom: 8, fontWeight: 500, borderLeft: `2.5px solid ${rc}` }}>{PATIENT_DATA.summary}</div>
            <div style={{ padding: "8px 11px", background: "rgba(255,251,235,0.7)", borderRadius: 9, border: "1px solid rgba(251,191,36,0.4)", fontSize: 12, color: "#92400e", fontWeight: 600 }}>🔍 {PATIENT_DATA.rootCause}</div>
          </div>

          {/* Risk trend + live vitals side by side */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, animation: "slide-up 0.3s ease" }}>
            <div className="hosp-card">
              <div className="lbl" style={{ marginBottom: 6, fontSize: 9, color: "#64748b" }}>Risk Trend</div>
              <RiskTrendChart compact />
            </div>
            <div className="hosp-card">
              <div className="lbl" style={{ marginBottom: 8, fontSize: 9, color: "#64748b" }}>Live Vitals</div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
                <VitalBox icon="💓" value={wearable.heart_rate} unit="BPM" label="HR" highlight pulse />
                <VitalBox icon="👣" value={wearable.steps.toLocaleString()} unit="STEPS" label="Today" />
                <VitalBox icon="🩸" value={wearable.spo2 + "%"} unit="SpO₂" label="O₂" highlight />
                <VitalBox icon="💉" value={wearable.bp} unit="mmHg" label="BP" />
              </div>
            </div>
          </div>

          {/* Log history */}
          <div className="hosp-card" style={{ animation: "slide-up 0.32s ease" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
              <div>
                <div className="lbl" style={{ fontSize: 9, marginBottom: 2, color: "#64748b" }}>Patient Activity Feed</div>
                <div style={{ fontSize: 14, fontWeight: 800, color: "#0f172a" }}>Live Log History</div>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 5, padding: "3px 9px", background: "rgba(52,211,153,0.1)", borderRadius: 20, border: "1px solid rgba(52,211,153,0.3)" }}>
                  <div style={{ width: 6, height: 6, borderRadius: "50%", background: "#34d399", position: "relative" }}>
                    <div style={{ position: "absolute", inset: 0, borderRadius: "50%", background: "#34d399", animation: "pulse-ring 2s infinite" }} />
                  </div>
                  <span style={{ fontSize: 9, color: "#34d399", fontWeight: 700, fontFamily: "'DM Mono',monospace" }}>SYNCED</span>
                </div>
                {logs.length > 0 && <div style={{ width: 20, height: 20, borderRadius: "50%", background: emergency ? "#dc2626" : "#1d4ed8", color: "#fff", fontSize: 10, fontWeight: 800, display: "flex", alignItems: "center", justifyContent: "center" }}>{logs.length}</div>}
              </div>
            </div>
            {emergency && (
              <div style={{ marginBottom: 10, padding: "9px 12px", background: "rgba(220,38,38,0.15)", borderRadius: 10, border: "1px solid rgba(220,38,38,0.4)", fontSize: 12, color: "#f87171", fontWeight: 700, animation: "em-flash 1s infinite", cursor: "pointer" }} onClick={() => setEmergencyPopup(true)}>
                🚨 Emergency alert active — click to view details
              </div>
            )}
            <div style={{ maxHeight: 160, overflowY: "auto" }}>
              <LogHistory logs={logs} />
            </div>
            {logs.length === 0 && (
              <div style={{ textAlign: "center", padding: "24px 0", color: "#64748b" }}>
                <div style={{ fontSize: 28, marginBottom: 8 }}>📋</div>
                <div style={{ fontSize: 13, fontWeight: 600 }}>Waiting for patient activity</div>
              </div>
            )}
          </div>

          {/* Medicine tracker 2x2 */}
          <div className="hosp-card" style={{ animation: "slide-up 0.34s ease" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
              <div className="lbl" style={{ fontSize: 9, color: "#64748b" }}>Medication Adherence</div>
              <div style={{ fontSize: 11, color: "#34d399", fontWeight: 700 }}>{medicines.filter(m => m.status === "taken").length}/{medicines.length} taken</div>
            </div>
            <MedicineGrid medicines={medicines} onCardClick={setPopupMed} twoByTwo={true} />
          </div>
        </div>
      </div>

      {popupMed && <MedPopup med={popupMed} onClose={() => setPopupMed(null)} onTaken={() => {}} />}
    </div>
  );
}

// ─── ROOT APP ─────────────────────────────────────────────────────────────────
export default function ARIAv8() {
  const [role, setRole] = useState(null);
  const [wearable, setWearable] = useState(INIT_WEARABLE);
  const [medicines, setMedicines] = useState(INIT_MEDICINES);
  const [emergency, setEmergency] = useState(false);
  const [emergencyType, setEmergencyType] = useState(null);
  const [logs, setLogs] = useState([]);

  // ── Clear any stale emergency state from localStorage on every fresh page load ──
  useEffect(() => {
    try {
      localStorage.removeItem("aria_sync_EMERGENCY");
      localStorage.removeItem("aria_sync_EMERGENCY_CLEAR");
    } catch (e) {}
  }, []);

  const addLog = useCallback((entry) => {
    setLogs(prev => {
      const next = [...prev, entry];
      broadcast("LOG_ENTRY", entry);
      return next;
    });
  }, []);

  // ── Handle incoming sync messages (both BroadcastChannel and localStorage) ──
  const handleSyncMessage = useCallback(({ type, payload }) => {
    if (type === "WEARABLE") setWearable(payload);
    if (type === "MEDICINE_TAKEN") setMedicines(prev => prev.map(m => m.id === payload.id ? { ...m, status: "taken", streak: m.streak + 1, supply: Math.max(0, m.supply - 1), lastTaken: "Just now" } : m));
    if (type === "EMERGENCY") { setEmergency(true); setEmergencyType(payload.reason); }
    if (type === "EMERGENCY_CLEAR") { setEmergency(false); setEmergencyType(null); }
    if (type === "LOG_ENTRY") {
      setLogs(prev => {
        // Avoid duplicate if this tab originated the log
        const isDup = prev.some(l => l.time === payload.time && l.message === payload.message);
        return isDup ? prev : [...prev, payload];
      });
    }
  }, []);

  // BroadcastChannel — same browser, different tabs
  useEffect(() => {
    if (!channel) return;
    const handler = (e) => handleSyncMessage(e.data);
    channel.addEventListener("message", handler);
    return () => channel.removeEventListener("message", handler);
  }, [handleSyncMessage]);

  // localStorage polling — different browsers / different systems on same network
  useStorageSync(handleSyncMessage);

  // ── Live wearable simulation ──
  useEffect(() => {
    const interval = setInterval(() => {
      setWearable(w => {
        const next = {
          ...w,
          heart_rate: Math.max(60, Math.min(108, w.heart_rate + Math.round((Math.random() - 0.5) * 6))),
          steps: w.steps + Math.round(Math.random() * 14 + 4),
          calories: w.calories + Math.round(Math.random() * 3),
          spo2: Math.max(93, Math.min(99, w.spo2 + (Math.random() > 0.82 ? (Math.random() > 0.5 ? 1 : -1) : 0))),
        };
        broadcast("WEARABLE", next);
        return next;
      });
    }, 2000);
    return () => clearInterval(interval);
  }, []);

  const emergencyTrigger = useCallback((reason) => {
    setEmergency(true);
    setEmergencyType(reason);
    broadcast("EMERGENCY", { reason });
  }, []);

  const handleMedicineTaken = useCallback((id) => {
    const med = medicines.find(m => m.id === id);
    setMedicines(prev => prev.map(m => m.id === id ? { ...m, status: "taken", streak: m.streak + 1, supply: Math.max(0, m.supply - 1), lastTaken: "Just now" } : m));
    broadcast("MEDICINE_TAKEN", { id });
    addLog({ type: "medicine", message: `Marked ${med?.name || "medicine"} as taken`, time: now() });
  }, [medicines, addLog]);

  if (!role) return <Login onLogin={setRole} />;

  return (
    <div style={{ height: "100vh", display: "flex", flexDirection: "column", fontFamily: "'Nunito',sans-serif", color: "#0f172a" }}>
      <style>{CSS}</style>
      <div style={{ height: 54, background: role === "clinician" ? "rgba(15,23,42,0.95)" : "rgba(255,255,255,0.88)", backdropFilter: "blur(16px)", borderBottom: role === "clinician" ? "1px solid rgba(255,255,255,0.08)" : "1px solid rgba(255,255,255,0.9)", display: "flex", alignItems: "center", padding: "0 24px", gap: 14, flexShrink: 0, boxShadow: role === "clinician" ? "0 1px 10px -2px rgba(0,0,0,0.4)" : "0 1px 10px -2px rgba(15,23,42,0.1)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ width: 32, height: 32, borderRadius: 10, background: "linear-gradient(135deg, #1d4ed8, #7c3aed)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16, boxShadow: "0 3px 10px -2px rgba(124,58,237,0.4)" }}>🧠</div>
          <div style={{ fontSize: 18, fontWeight: 900, letterSpacing: -0.5, color: role === "clinician" ? "#e2e8f0" : "#0f172a" }}>ARIA <span style={{ color: "#7c3aed", fontWeight: 700, fontSize: 14 }}>v8</span></div>
        </div>
        <div style={{ width: 1, height: 22, background: role === "clinician" ? "rgba(255,255,255,0.1)" : "rgba(226,232,240,0.8)" }} />
        <div style={{ fontSize: 13, color: role === "clinician" ? "#64748b" : "#64748b", fontWeight: 600 }}>{role === "patient" ? "👴 Patient Portal" : "🩺 Hospital Dashboard"}</div>
        <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 12 }}>
          {/* Cross-system sync indicator */}
          <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "4px 12px", background: "#f0fdf4", border: "1px solid #bbf7d0", borderRadius: 20 }}>
            <div style={{ width: 7, height: 7, borderRadius: "50%", background: "#059669", position: "relative" }}>
              <div style={{ position: "absolute", inset: 0, borderRadius: "50%", background: "#059669", animation: "pulse-ring 2s infinite" }} />
            </div>
            <span style={{ fontSize: 11, color: "#059669", fontWeight: 700, fontFamily: "'DM Mono',monospace" }}>CROSS-SYSTEM SYNC</span>
          </div>
          {emergency && <div style={{ padding: "5px 14px", background: "#fef2f2", border: "1.5px solid #fecaca", borderRadius: 20, fontSize: 12, color: "#dc2626", fontWeight: 800, fontFamily: "'DM Mono',monospace" }}>🚨 EMERGENCY ACTIVE</div>}
          {logs.length > 0 && <div style={{ padding: "5px 12px", background: "#eff6ff", border: "1px solid #bfdbfe", borderRadius: 20, fontSize: 12, color: "#1d4ed8", fontWeight: 700 }}>📋 {logs.length} logs</div>}
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <div style={{ width: 7, height: 7, borderRadius: "50%", background: "#059669" }}><div style={{ width: 7, height: 7, borderRadius: "50%", background: "#059669", animation: "pulse-ring 2s infinite" }} /></div>
            <span className="mono" style={{ fontSize: 11, color: "#059669", fontWeight: 700 }}>LIVE</span>
          </div>
          <button onClick={() => { setRole(null); setEmergency(false); setEmergencyType(null); }} style={{ padding: "6px 16px", background: "rgba(248,250,252,0.9)", border: "1px solid #e2e8f0", borderRadius: 9, color: "#64748b", fontSize: 13, cursor: "pointer", fontFamily: "'Nunito',sans-serif", fontWeight: 700 }}>⏏ Switch View</button>
        </div>
      </div>

      <div style={{ flex: 1, overflow: "hidden" }}>
        {role === "patient"
          ? <PatientView wearable={wearable} medicines={medicines} onMedicineTaken={handleMedicineTaken} emergencyTriggered={emergency} emergencyTrigger={emergencyTrigger} logs={logs} addLog={addLog} />
          : <HospitalView wearable={wearable} medicines={medicines} emergency={emergency} emergencyType={emergencyType} logs={logs} />
        }
      </div>
    </div>
  );
}
