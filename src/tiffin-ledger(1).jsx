import React, { useState, useEffect, useMemo, useCallback } from "react";
import { Plus, Trash2, Users, UtensilsCrossed, CalendarDays, LogOut, Lock, X, ChevronRight } from "lucide-react";

const PALETTE = [
  "#E8A33D", "#4A7A63", "#B0587D", "#6C8CBF",
  "#8B4A3B", "#7C9E45", "#C77B3D", "#5B7B8A",
];

const DATA_KEY = "tiffin-ledger-data";
const AUTH_KEY = "tiffin-ledger-admin-auth";
const SESSION_KEY = "tiffin-ledger-session";
const MEALS = ["Lunch", "Dinner"];
const todayISO = () => new Date().toISOString().slice(0, 10);

function uid() {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}

async function sha256(text) {
  const enc = new TextEncoder().encode(text);
  const buf = await crypto.subtle.digest("SHA-256", enc);
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

function startOfWeek(d) {
  const date = new Date(d);
  const day = date.getDay();
  const diff = (day === 0 ? -6 : 1) - day;
  date.setDate(date.getDate() + diff);
  date.setHours(0, 0, 0, 0);
  return date;
}

function inPeriod(dateStr, period) {
  if (period === "all") return true;
  const d = new Date(dateStr + "T00:00:00");
  const now = new Date();
  if (period === "week") {
    const start = startOfWeek(now);
    const end = new Date(start);
    end.setDate(end.getDate() + 7);
    return d >= start && d < end;
  }
  if (period === "month") {
    return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
  }
  return true;
}

function TiffinStack({ count, color }) {
  const shown = Math.min(count, 5);
  const overflow = count - shown;
  const tinW = 46;
  const tinH = 15;
  const gap = 3;
  const h = shown * (tinH + gap) + 14;
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
      <svg width={tinW + 14} height={Math.max(h, 30)} viewBox={`0 0 ${tinW + 14} ${Math.max(h, 30)}`}>
        {count === 0 ? (
          <g opacity="0.35">
            <rect x="7" y={Math.max(h, 30) - 16} width={tinW} height="14" rx="3" fill="var(--steel)" />
            <ellipse cx={7 + tinW / 2} cy={Math.max(h, 30) - 16} rx={tinW / 2} ry="4" fill="var(--steel-light)" />
          </g>
        ) : (
          Array.from({ length: shown }).map((_, i) => {
            const y = h - 14 - i * (tinH + gap) - tinH;
            const isTop = i === shown - 1;
            return (
              <g key={i}>
                <rect x="7" y={y} width={tinW} height={tinH} rx="3" fill="url(#tinGrad)" stroke="rgba(0,0,0,0.18)" strokeWidth="0.6" />
                <rect x="7" y={y + tinH - 4} width={tinW} height="4" fill={color} opacity="0.85" />
                {isTop && (
                  <ellipse cx={7 + tinW / 2} cy={y} rx={tinW / 2} ry="4" fill="var(--steel-light)" stroke="rgba(0,0,0,0.15)" strokeWidth="0.6" />
                )}
              </g>
            );
          })
        )}
        <defs>
          <linearGradient id="tinGrad" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="var(--steel)" />
            <stop offset="50%" stopColor="var(--steel-light)" />
            <stop offset="100%" stopColor="var(--steel)" />
          </linearGradient>
        </defs>
      </svg>
      {overflow > 0 && (
        <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--ink-dim)" }}>
          +{overflow} more
        </span>
      )}
    </div>
  );
}

const GlobalStyle = () => (
  <style>{`
    @import url('https://fonts.googleapis.com/css2?family=Fjalla+One&family=Work+Sans:wght@400;500;600&family=JetBrains+Mono:wght@400;600&display=swap');
    :root {
      --bg: #24312A;
      --panel: #2C3A32;
      --panel-2: #33433A;
      --ink: #EFE9DA;
      --ink-dim: #A7B4A9;
      --steel: #B8C0BA;
      --steel-light: #E3E7E2;
      --accent: #E8A33D;
      --line: rgba(239,233,218,0.14);
      --font-display: 'Fjalla One', sans-serif;
      --font-body: 'Work Sans', sans-serif;
      --font-mono: 'JetBrains Mono', monospace;
    }
    .tl-btn { font-family: var(--font-body); font-weight: 600; border: none; cursor: pointer; transition: transform 0.08s ease, opacity 0.15s ease; }
    .tl-btn:active { transform: scale(0.97); }
    .tl-input, .tl-select {
      font-family: var(--font-body); background: var(--panel); border: 1px solid var(--line);
      color: var(--ink); border-radius: 6px; padding: 8px 10px; font-size: 14px; outline: none;
    }
    .tl-input:focus, .tl-select:focus { border-color: var(--accent); }
    .tl-input::placeholder { color: var(--ink-dim); }
    .tl-chip {
      font-family: var(--font-mono); font-size: 12px; padding: 6px 12px; border-radius: 999px;
      border: 1px solid var(--line); background: transparent; color: var(--ink-dim); cursor: pointer;
    }
    .tl-chip.active { background: var(--accent); color: #24312A; border-color: var(--accent); font-weight: 600; }
    .tl-row:hover { background: rgba(232,163,61,0.06); }
    .tl-card:hover { border-color: var(--accent) !important; cursor: pointer; }
    @media (max-width: 640px) {
      .tl-grid { grid-template-columns: 1fr 1fr !important; }
      .tl-form-row { flex-direction: column !important; align-items: stretch !important; }
    }
  `}</style>
);

function GateShell({ children }) {
  return (
    <div style={{ fontFamily: "var(--font-body)", background: "var(--bg)", color: "var(--ink)", minHeight: "100%", display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
      <GlobalStyle />
      <div style={{ width: 340, maxWidth: "100%" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 18, justifyContent: "center" }}>
          <UtensilsCrossed size={20} color="var(--accent)" />
          <span style={{ fontFamily: "var(--font-display)", fontSize: 22, textTransform: "uppercase", letterSpacing: "0.03em" }}>
            Tiffin Ledger
          </span>
        </div>
        {children}
      </div>
    </div>
  );
}

function SetupScreen({ onSetup }) {
  const [pw, setPw] = useState("");
  const [confirm, setConfirm] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (pw.length < 4) { setErr("Password should be at least 4 characters."); return; }
    if (pw !== confirm) { setErr("Passwords don't match."); return; }
    setBusy(true);
    setErr("");
    await onSetup(pw);
    setBusy(false);
  };

  return (
    <div style={{ background: "var(--panel)", border: "1px solid var(--line)", borderRadius: 10, padding: 22 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6 }}>
        <Lock size={14} color="var(--accent)" />
        <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--ink-dim)" }}>
          First-time setup
        </span>
      </div>
      <p style={{ fontSize: 13, color: "var(--ink-dim)", marginTop: 0, marginBottom: 16 }}>
        Set the admin password. Whoever has this password can open and manage the ledger.
      </p>
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <input className="tl-input" type="password" placeholder="Admin password" value={pw} onChange={(e) => setPw(e.target.value)} />
        <input className="tl-input" type="password" placeholder="Confirm password" value={confirm} onChange={(e) => setConfirm(e.target.value)} onKeyDown={(e) => e.key === "Enter" && submit()} />
        {err && <span style={{ color: "#E39A8F", fontSize: 12 }}>{err}</span>}
        <button className="tl-btn" onClick={submit} disabled={busy} style={{ background: "var(--accent)", color: "#24312A", borderRadius: 6, padding: "10px 16px", opacity: busy ? 0.6 : 1 }}>
          {busy ? "Setting up…" : "Set password & open ledger"}
        </button>
      </div>
    </div>
  );
}

function LoginScreen({ onLogin }) {
  const [pw, setPw] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setBusy(true);
    setErr("");
    const ok = await onLogin(pw);
    if (!ok) setErr("Wrong password.");
    setBusy(false);
  };

  return (
    <div style={{ background: "var(--panel)", border: "1px solid var(--line)", borderRadius: 10, padding: 22 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 14 }}>
        <Lock size={14} color="var(--accent)" />
        <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--ink-dim)" }}>
          Admin login
        </span>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <input className="tl-input" type="password" placeholder="Password" autoFocus value={pw} onChange={(e) => setPw(e.target.value)} onKeyDown={(e) => e.key === "Enter" && submit()} />
        {err && <span style={{ color: "#E39A8F", fontSize: 12 }}>{err}</span>}
        <button className="tl-btn" onClick={submit} disabled={busy} style={{ background: "var(--accent)", color: "#24312A", borderRadius: 6, padding: "10px 16px", opacity: busy ? 0.6 : 1 }}>
          {busy ? "Checking…" : "Log in"}
        </button>
      </div>
    </div>
  );
}

function PersonDetail({ member, entries, onClose }) {
  const [period, setPeriod] = useState("all");

  const rows = useMemo(() => {
    const filtered = entries.filter((e) => e.memberId === member.id && inPeriod(e.date, period));
    const map = {};
    filtered.forEach((e) => {
      if (!map[e.date]) map[e.date] = { date: e.date, Lunch: 0, Dinner: 0, notes: [] };
      map[e.date][e.meal] = (map[e.date][e.meal] || 0) + e.qty;
      if (e.note) map[e.date].notes.push(e.note);
    });
    return Object.values(map).sort((a, b) => b.date.localeCompare(a.date));
  }, [entries, member.id, period]);

  const total = rows.reduce((s, r) => s + r.Lunch + r.Dinner, 0);

  return (
    <div style={{ background: "var(--panel)", border: "1px solid var(--accent)", borderRadius: 10, padding: 18, marginBottom: 32 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ width: 10, height: 10, borderRadius: "50%", background: member.color }} />
          <span style={{ fontFamily: "var(--font-display)", fontSize: 18, textTransform: "uppercase", letterSpacing: "0.02em" }}>
            {member.name}
          </span>
          <span style={{ fontFamily: "var(--font-mono)", fontSize: 13, color: "var(--ink-dim)" }}>
            · {total} tiffin{total === 1 ? "" : "s"}
          </span>
        </div>
        <button className="tl-btn" onClick={onClose} style={{ background: "transparent", color: "var(--ink-dim)", display: "flex", padding: 4 }}>
          <X size={16} />
        </button>
      </div>

      <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
        {[["week", "This week"], ["month", "This month"], ["all", "All time"]].map(([key, label]) => (
          <button key={key} className={`tl-chip ${period === key ? "active" : ""}`} onClick={() => setPeriod(key)}>
            {label}
          </button>
        ))}
      </div>

      {rows.length === 0 ? (
        <p style={{ color: "var(--ink-dim)", fontSize: 13, margin: 0 }}>No tiffins logged for {member.name} in this period.</p>
      ) : (
        <div style={{ border: "1px solid var(--line)", borderRadius: 8, overflow: "hidden" }}>
          <div style={{ display: "flex", padding: "8px 12px", background: "var(--panel-2)", fontSize: 11, fontFamily: "var(--font-mono)", color: "var(--ink-dim)", textTransform: "uppercase", letterSpacing: "0.05em" }}>
            <span style={{ width: 100 }}>Date</span>
            <span style={{ width: 70 }}>Lunch</span>
            <span style={{ width: 70 }}>Dinner</span>
            <span style={{ width: 60 }}>Total</span>
            <span style={{ flex: 1 }}>Notes</span>
          </div>
          {rows.map((r, i) => (
            <div key={r.date} className="tl-row" style={{ display: "flex", padding: "9px 12px", fontSize: 13, borderTop: i === 0 ? "none" : "1px solid var(--line)" }}>
              <span style={{ width: 100, fontFamily: "var(--font-mono)", fontSize: 12 }}>{r.date}</span>
              <span style={{ width: 70 }}>{r.Lunch || "—"}</span>
              <span style={{ width: 70 }}>{r.Dinner || "—"}</span>
              <span style={{ width: 60, fontWeight: 600 }}>{r.Lunch + r.Dinner}</span>
              <span style={{ flex: 1, color: "var(--ink-dim)", fontStyle: r.notes.length ? "normal" : "italic", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {r.notes.length ? r.notes.join("; ") : "—"}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function TiffinLedger() {
  // --- auth state ---
  const [authLoaded, setAuthLoaded] = useState(false);
  const [adminHash, setAdminHash] = useState(null); // null = not set yet
  const [isLoggedIn, setIsLoggedIn] = useState(false);

  // --- app data state ---
  const [data, setData] = useState({ members: [], entries: [] });
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState(null);
  const [period, setPeriod] = useState("week");
  const [newMemberName, setNewMemberName] = useState("");
  const [showAddMember, setShowAddMember] = useState(false);
  const [selectedMemberId, setSelectedMemberId] = useState(null);

  const [formMember, setFormMember] = useState("");
  const [formMeal, setFormMeal] = useState("Lunch");
  const [formQty, setFormQty] = useState(1);
  const [formDate, setFormDate] = useState(todayISO());
  const [formNote, setFormNote] = useState("");
  const [filterMember, setFilterMember] = useState("all");

  // load auth + session
  useEffect(() => {
    (async () => {
      try {
        const authRes = await localStorage.getItem(AUTH_KEY);
        if (authRes && authRes.value) {
          const parsed = JSON.parse(authRes.value);
          setAdminHash(parsed.hash || null);
        }
      } catch (e) {
        // no admin set yet
      }
      try {
        const sessionRes = await localStorage.getItem(SESSION_KEY);
        if (sessionRes === "true") setIsLoggedIn(true);
      } catch (e) {
        // no session yet
      }
      setAuthLoaded(true);
    })();
  }, []);

  // load app data once logged in
  useEffect(() => {
    if (!isLoggedIn) return;
    (async () => {
      try {
        const res = await localStorage.getItem(DATA_KEY);
        if (res) {
          const parsed = JSON.parse(res);
          setData({ members: parsed.members || [], entries: parsed.entries || [] });
          if (parsed.members && parsed.members.length) setFormMember(parsed.members[0].id);
        }
      } catch (e) {
        // fresh ledger
      } finally {
        setLoaded(true);
      }
    })();
  }, [isLoggedIn]);

  const handleSetup = async (password) => {
    const hash = await sha256(password);
    await localStorage.setItem(AUTH_KEY, JSON.stringify({ hash }));
    await localStorage.setItem(SESSION_KEY, "true");
    setAdminHash(hash);
    setIsLoggedIn(true);
  };

  const handleLogin = async (password) => {
    const hash = await sha256(password);
    if (hash === adminHash) {
      await localStorage.setItem(SESSION_KEY, "true");
      setIsLoggedIn(true);
      return true;
    }
    return false;
  };

  const handleLogout = async () => {
    await localStorage.setItem(SESSION_KEY, "false");
    setIsLoggedIn(false);
  };

  const persist = useCallback(async (next) => {
    setData(next);
    try {
      const res = await localStorage.setItem(DATA_KEY, JSON.stringify(next));
      if (!res) setError("Couldn't save — please try again.");
      else setError(null);
    } catch (e) {
      setError("Couldn't save — please try again.");
    }
  }, []);

  const addMember = () => {
    const name = newMemberName.trim();
    if (!name) return;
    const color = PALETTE[data.members.length % PALETTE.length];
    const member = { id: uid(), name, color };
    const next = { ...data, members: [...data.members, member] };
    persist(next);
    setNewMemberName("");
    setShowAddMember(false);
    if (!formMember) setFormMember(member.id);
  };

  const removeMember = (id) => {
    const next = {
      members: data.members.filter((m) => m.id !== id),
      entries: data.entries.filter((e) => e.memberId !== id),
    };
    persist(next);
    if (formMember === id) setFormMember(next.members[0]?.id || "");
    if (selectedMemberId === id) setSelectedMemberId(null);
  };

  const logEntry = () => {
    if (!formMember) return;
    const entry = {
      id: uid(),
      memberId: formMember,
      date: formDate,
      meal: formMeal,
      qty: Math.max(1, Number(formQty) || 1),
      note: formNote.trim(),
      ts: Date.now(),
    };
    const next = { ...data, entries: [entry, ...data.entries] };
    persist(next);
    setFormQty(1);
    setFormNote("");
  };

  const deleteEntry = (id) => {
    const next = { ...data, entries: data.entries.filter((e) => e.id !== id) };
    persist(next);
  };

  const periodEntries = useMemo(() => data.entries.filter((e) => inPeriod(e.date, period)), [data.entries, period]);

  const totals = useMemo(() => {
    const map = {};
    for (const m of data.members) map[m.id] = 0;
    for (const e of periodEntries) map[e.memberId] = (map[e.memberId] || 0) + e.qty;
    return map;
  }, [data.members, periodEntries]);

  const visibleLog = useMemo(() => {
    let list = periodEntries;
    if (filterMember !== "all") list = list.filter((e) => e.memberId === filterMember);
    return [...list].sort((a, b) => b.ts - a.ts);
  }, [periodEntries, filterMember]);

  const memberById = (id) => data.members.find((m) => m.id === id);
  const selectedMember = selectedMemberId ? memberById(selectedMemberId) : null;

  // --- render gates ---
  if (!authLoaded) {
    return (
      <GateShell>
        <p style={{ textAlign: "center", color: "var(--ink-dim)", fontSize: 13 }}>Loading…</p>
      </GateShell>
    );
  }

  if (!adminHash) {
    return (
      <GateShell>
        <SetupScreen onSetup={handleSetup} />
      </GateShell>
    );
  }

  if (!isLoggedIn) {
    return (
      <GateShell>
        <LoginScreen onLogin={handleLogin} />
      </GateShell>
    );
  }

  return (
    <div style={{ fontFamily: "var(--font-body)", background: "var(--bg)", color: "var(--ink)", minHeight: "100%" }}>
      <GlobalStyle />
      <div style={{ maxWidth: 880, margin: "0 auto", padding: "36px 20px 60px" }}>
        {/* Header */}
        <header style={{ marginBottom: 28, borderBottom: "2px solid var(--line)", paddingBottom: 20 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <UtensilsCrossed size={22} color="var(--accent)" />
              <span style={{ fontFamily: "var(--font-mono)", fontSize: 12, letterSpacing: "0.12em", color: "var(--ink-dim)", textTransform: "uppercase" }}>
                Flat register · no more guessing
              </span>
            </div>
            <button className="tl-btn" onClick={handleLogout} style={{ background: "transparent", color: "var(--ink-dim)", display: "flex", alignItems: "center", gap: 5, fontSize: 12 }}>
              <LogOut size={13} /> Log out
            </button>
          </div>
          <h1 style={{ fontFamily: "var(--font-display)", fontSize: "clamp(32px, 6vw, 46px)", letterSpacing: "0.02em", margin: 0, textTransform: "uppercase" }}>
            The Tiffin Ledger
          </h1>
          <p style={{ color: "var(--ink-dim)", marginTop: 8, fontSize: 15, maxWidth: 520 }}>
            Every tiffin, logged the moment it's taken. One shared record for the whole flat —
            so nobody has to remember, and nobody has to argue.
          </p>
        </header>

        {error && (
          <div style={{ background: "#5A2E2E", color: "#F4D6D0", padding: "10px 14px", borderRadius: 6, marginBottom: 20, fontSize: 13 }}>
            {error}
          </div>
        )}

        {/* Members management */}
        <section style={{ marginBottom: 28 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <Users size={16} color="var(--ink-dim)" />
              <span style={{ fontFamily: "var(--font-mono)", fontSize: 12, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--ink-dim)" }}>
                Flatmates
              </span>
            </div>
            <button className="tl-btn" onClick={() => setShowAddMember((s) => !s)} style={{ background: "transparent", color: "var(--accent)", fontSize: 13, display: "flex", alignItems: "center", gap: 4 }}>
              <Plus size={14} /> Add flatmate
            </button>
          </div>

          {showAddMember && (
            <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
              <input className="tl-input" style={{ flex: 1 }} placeholder="Name" value={newMemberName} onChange={(e) => setNewMemberName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && addMember()} autoFocus />
              <button className="tl-btn" onClick={addMember} style={{ background: "var(--accent)", color: "#24312A", borderRadius: 6, padding: "8px 16px" }}>
                Add
              </button>
            </div>
          )}

          {!loaded ? (
            <p style={{ color: "var(--ink-dim)", fontSize: 13 }}>Loading register…</p>
          ) : data.members.length === 0 ? (
            <p style={{ color: "var(--ink-dim)", fontSize: 13 }}>No flatmates yet — add the first one above.</p>
          ) : (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              {data.members.map((m) => (
                <div key={m.id} style={{ display: "flex", alignItems: "center", gap: 8, background: "var(--panel)", border: "1px solid var(--line)", borderRadius: 999, padding: "6px 6px 6px 12px", fontSize: 13 }}>
                  <span style={{ width: 8, height: 8, borderRadius: "50%", background: m.color, display: "inline-block" }} />
                  {m.name}
                  <button className="tl-btn" onClick={() => removeMember(m.id)} style={{ background: "transparent", color: "var(--ink-dim)", padding: 4, display: "flex" }} title="Remove flatmate">
                    <Trash2 size={12} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Log entry form */}
        {data.members.length > 0 && (
          <section style={{ background: "var(--panel)", border: "1px solid var(--line)", borderRadius: 10, padding: 18, marginBottom: 32 }}>
            <div className="tl-form-row" style={{ display: "flex", gap: 10, alignItems: "flex-end", flexWrap: "wrap" }}>
              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                <label style={{ fontSize: 11, color: "var(--ink-dim)", fontFamily: "var(--font-mono)" }}>WHO</label>
                <select className="tl-select" value={formMember} onChange={(e) => setFormMember(e.target.value)}>
                  {data.members.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
                </select>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                <label style={{ fontSize: 11, color: "var(--ink-dim)", fontFamily: "var(--font-mono)" }}>MEAL</label>
                <select className="tl-select" value={formMeal} onChange={(e) => setFormMeal(e.target.value)}>
                  {MEALS.map((m) => <option key={m} value={m}>{m}</option>)}
                </select>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                <label style={{ fontSize: 11, color: "var(--ink-dim)", fontFamily: "var(--font-mono)" }}>QTY</label>
                <input className="tl-input" type="number" min="1" style={{ width: 64 }} value={formQty} onChange={(e) => setFormQty(e.target.value)} />
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                <label style={{ fontSize: 11, color: "var(--ink-dim)", fontFamily: "var(--font-mono)" }}>DATE</label>
                <input className="tl-input" type="date" value={formDate} onChange={(e) => setFormDate(e.target.value)} />
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 4, flex: 1, minWidth: 140 }}>
                <label style={{ fontSize: 11, color: "var(--ink-dim)", fontFamily: "var(--font-mono)" }}>NOTE (optional)</label>
                <input className="tl-input" placeholder="e.g. extra for a guest" value={formNote} onChange={(e) => setFormNote(e.target.value)} onKeyDown={(e) => e.key === "Enter" && logEntry()} />
              </div>
              <button className="tl-btn" onClick={logEntry} style={{ background: "var(--accent)", color: "#24312A", borderRadius: 6, padding: "9px 18px", display: "flex", alignItems: "center", gap: 6, fontSize: 14 }}>
                <Plus size={15} /> Log it
              </button>
            </div>
          </section>
        )}

        {/* Period toggle */}
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 18 }}>
          <CalendarDays size={15} color="var(--ink-dim)" />
          {[["week", "This week"], ["month", "This month"], ["all", "All time"]].map(([key, label]) => (
            <button key={key} className={`tl-chip ${period === key ? "active" : ""}`} onClick={() => setPeriod(key)}>
              {label}
            </button>
          ))}
        </div>

        {/* Stacks / totals */}
        {data.members.length > 0 && (
          <>
            <p style={{ fontSize: 12, color: "var(--ink-dim)", marginBottom: 10, fontFamily: "var(--font-mono)" }}>
              Tap a flatmate for their day-by-day breakdown
            </p>
            <section className="tl-grid" style={{ display: "grid", gridTemplateColumns: `repeat(${Math.min(data.members.length, 4)}, 1fr)`, gap: 14, marginBottom: 24 }}>
              {data.members.map((m) => (
                <div
                  key={m.id}
                  className="tl-card"
                  onClick={() => setSelectedMemberId(selectedMemberId === m.id ? null : m.id)}
                  style={{
                    background: "var(--panel)",
                    border: selectedMemberId === m.id ? "1px solid var(--accent)" : "1px solid var(--line)",
                    borderRadius: 10, padding: "16px 10px", display: "flex", flexDirection: "column",
                    alignItems: "center", gap: 8,
                  }}
                >
                  <TiffinStack count={totals[m.id] || 0} color={m.color} />
                  <div style={{ textAlign: "center" }}>
                    <div style={{ fontFamily: "var(--font-mono)", fontSize: 22, fontWeight: 600, lineHeight: 1 }}>{totals[m.id] || 0}</div>
                    <div style={{ fontSize: 12, color: "var(--ink-dim)", marginTop: 2, display: "flex", alignItems: "center", gap: 2, justifyContent: "center" }}>
                      {m.name} <ChevronRight size={11} />
                    </div>
                  </div>
                </div>
              ))}
            </section>
          </>
        )}

        {selectedMember && (
          <PersonDetail member={selectedMember} entries={data.entries} onClose={() => setSelectedMemberId(null)} />
        )}

        {/* Log table */}
        <section>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12, flexWrap: "wrap", gap: 8 }}>
            <span style={{ fontFamily: "var(--font-mono)", fontSize: 12, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--ink-dim)" }}>
              Register — {visibleLog.length} {visibleLog.length === 1 ? "entry" : "entries"}
            </span>
            {data.members.length > 0 && (
              <select className="tl-select" style={{ fontSize: 12 }} value={filterMember} onChange={(e) => setFilterMember(e.target.value)}>
                <option value="all">All flatmates</option>
                {data.members.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
              </select>
            )}
          </div>

          {visibleLog.length === 0 ? (
            <div style={{ border: "1px dashed var(--line)", borderRadius: 10, padding: "36px 20px", textAlign: "center", color: "var(--ink-dim)", fontSize: 14 }}>
              Nothing logged for this period yet. Once someone takes a tiffin, it shows up here — for everyone to see.
            </div>
          ) : (
            <div style={{ border: "1px solid var(--line)", borderRadius: 10, overflow: "hidden" }}>
              {visibleLog.map((e, i) => {
                const m = memberById(e.memberId);
                return (
                  <div key={e.id} className="tl-row" style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 14px", borderTop: i === 0 ? "none" : "1px solid var(--line)", fontSize: 13 }}>
                    <span style={{ width: 8, height: 8, borderRadius: "50%", background: m?.color || "#666", flexShrink: 0 }} />
                    <span style={{ width: 100, fontWeight: 600, flexShrink: 0 }}>{m?.name || "(removed)"}</span>
                    <span style={{ width: 90, color: "var(--ink-dim)", fontFamily: "var(--font-mono)", fontSize: 12, flexShrink: 0 }}>{e.date}</span>
                    <span style={{ width: 70, color: "var(--ink-dim)", flexShrink: 0 }}>{e.meal}</span>
                    <span style={{ width: 40, fontFamily: "var(--font-mono)", fontWeight: 600, flexShrink: 0 }}>×{e.qty}</span>
                    <span style={{ flex: 1, color: "var(--ink-dim)", fontStyle: e.note ? "normal" : "italic", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {e.note || "—"}
                    </span>
                    <button className="tl-btn" onClick={() => deleteEntry(e.id)} style={{ background: "transparent", color: "var(--ink-dim)", padding: 4, display: "flex", flexShrink: 0 }} title="Remove entry">
                      <Trash2 size={13} />
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        <footer style={{ marginTop: 40, paddingTop: 16, borderTop: "1px solid var(--line)", fontSize: 12, color: "var(--ink-dim)" }}>
          Shared with everyone who logs in with the admin password.
        </footer>
      </div>
    </div>
  );
}
