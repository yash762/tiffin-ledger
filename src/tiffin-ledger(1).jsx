import React, { useState, useEffect, useMemo, useCallback } from "react";
import { Plus, Trash2, Users, UtensilsCrossed, CalendarDays, LogOut, Lock, X, ChevronRight, Pencil, Check } from "lucide-react";
import { supabase } from "./supabaseClient";

const PALETTE = [
  "#E8A33D", "#4A7A63", "#B0587D", "#6C8CBF",
  "#8B4A3B", "#7C9E45", "#C77B3D", "#5B7B8A",
];

// SESSION_KEY stays in localStorage on purpose: it's just "am I logged in
// on THIS device right now", which is fine to be per-device. Username,
// password, and all ledger data now live in Supabase so every device sees
// the same shared data.
const SESSION_KEY = "tiffin-ledger-session";
const CURRENT_USER_KEY = "tiffin-ledger-current-user";
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
  const [username, setUsername] = useState("");
  const [pw, setPw] = useState("");
  const [confirm, setConfirm] = useState("");
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!username.trim()) { setErr("Please enter your name."); return; }
    if (pw.length < 4) { setErr("Password should be at least 4 characters."); return; }
    if (pw !== confirm) { setErr("Passwords don't match."); return; }
    if (!question.trim()) { setErr("Please add a security question."); return; }
    if (!answer.trim()) { setErr("Please add an answer to your security question."); return; }
    setBusy(true);
    setErr("");
    const ok = await onSetup(username.trim(), pw, question.trim(), answer.trim());
    if (!ok) setErr("Something went wrong — try again.");
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
        This creates the first flatmate account (you). Everyone else gets their own name + password once you're in — nobody shares a login anymore.
      </p>
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <input className="tl-input" type="text" placeholder="Your name" autoFocus value={username} onChange={(e) => setUsername(e.target.value)} />
        <input className="tl-input" type="password" placeholder="Password" value={pw} onChange={(e) => setPw(e.target.value)} />
        <input className="tl-input" type="password" placeholder="Confirm password" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
        <div style={{ height: 1, background: "var(--line)", margin: "4px 0" }} />
        <span style={{ fontSize: 12, color: "var(--ink-dim)" }}>
          Security question — used to reset your password if you forget it.
        </span>
        <input className="tl-input" type="text" placeholder="e.g. What's your pet's name?" value={question} onChange={(e) => setQuestion(e.target.value)} />
        <input className="tl-input" type="text" placeholder="Answer" value={answer} onChange={(e) => setAnswer(e.target.value)} onKeyDown={(e) => e.key === "Enter" && submit()} />
        {err && <span style={{ color: "#E39A8F", fontSize: 12 }}>{err}</span>}
        <button className="tl-btn" onClick={submit} disabled={busy} style={{ background: "var(--accent)", color: "#24312A", borderRadius: 6, padding: "10px 16px", opacity: busy ? 0.6 : 1 }}>
          {busy ? "Setting up…" : "Create my account"}
        </button>
      </div>
    </div>
  );
}

function LoginScreen({ onLogin, onForgot }) {
  const [username, setUsername] = useState("");
  const [pw, setPw] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!username.trim()) { setErr("Please enter your name."); return; }
    setBusy(true);
    setErr("");
    const ok = await onLogin(username.trim(), pw);
    if (!ok) setErr("Wrong name or password.");
    setBusy(false);
  };

  return (
    <div style={{ background: "var(--panel)", border: "1px solid var(--line)", borderRadius: 10, padding: 22 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 14 }}>
        <Lock size={14} color="var(--accent)" />
        <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--ink-dim)" }}>
          Flatmate login
        </span>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <input className="tl-input" type="text" placeholder="Your name" autoFocus value={username} onChange={(e) => setUsername(e.target.value)} />
        <input className="tl-input" type="password" placeholder="Password" value={pw} onChange={(e) => setPw(e.target.value)} onKeyDown={(e) => e.key === "Enter" && submit()} />
        {err && <span style={{ color: "#E39A8F", fontSize: 12 }}>{err}</span>}
        <button className="tl-btn" onClick={submit} disabled={busy} style={{ background: "var(--accent)", color: "#24312A", borderRadius: 6, padding: "10px 16px", opacity: busy ? 0.6 : 1 }}>
          {busy ? "Checking…" : "Log in"}
        </button>
        <button
          type="button"
          onClick={onForgot}
          style={{ background: "transparent", border: "none", color: "var(--ink-dim)", fontSize: 12, cursor: "pointer", textDecoration: "underline", padding: 0, marginTop: 2 }}
        >
          Forgot username or password?
        </button>
      </div>
    </div>
  );
}

function ForgotPasswordScreen({ members, onReset, onCancel }) {
  const [step, setStep] = useState("pick"); // "pick" | "answer"
  const [selectedId, setSelectedId] = useState(null);
  const [answer, setAnswer] = useState("");
  const [pw, setPw] = useState("");
  const [confirm, setConfirm] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  const selected = members.find((m) => m.id === selectedId) || null;

  const submit = async () => {
    if (!answer.trim()) { setErr("Please answer the security question."); return; }
    if (pw.length < 4) { setErr("New password should be at least 4 characters."); return; }
    if (pw !== confirm) { setErr("Passwords don't match."); return; }
    setBusy(true);
    setErr("");
    const ok = await onReset(selectedId, answer.trim(), pw);
    if (!ok) setErr("That answer doesn't match. Try again.");
    setBusy(false);
  };

  if (step === "pick") {
    return (
      <div style={{ background: "var(--panel)", border: "1px solid var(--line)", borderRadius: 10, padding: 22 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6 }}>
          <Lock size={14} color="var(--accent)" />
          <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--ink-dim)" }}>
            Who are you?
          </span>
        </div>
        <p style={{ fontSize: 13, color: "var(--ink-dim)", marginTop: 0, marginBottom: 16 }}>
          Pick your name from the flat's list.
        </p>
        <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 14 }}>
          {members.map((m) => (
            <button
              key={m.id}
              className="tl-btn"
              onClick={() => { setSelectedId(m.id); setStep("answer"); setErr(""); }}
              style={{ background: "var(--bg)", border: "1px solid var(--line)", borderRadius: 6, padding: "10px 14px", display: "flex", alignItems: "center", gap: 8, textAlign: "left" }}
            >
              <span style={{ width: 8, height: 8, borderRadius: "50%", background: m.color, flexShrink: 0 }} />
              {m.name}
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={onCancel}
          style={{ background: "transparent", border: "none", color: "var(--ink-dim)", fontSize: 12, cursor: "pointer", textDecoration: "underline", padding: 0 }}
        >
          Back to login
        </button>
      </div>
    );
  }

  return (
    <div style={{ background: "var(--panel)", border: "1px solid var(--line)", borderRadius: 10, padding: 22 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6 }}>
        <Lock size={14} color="var(--accent)" />
        <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--ink-dim)" }}>
          Reset password — {selected?.name}
        </span>
      </div>

      {!selected?.security_question ? (
        <p style={{ fontSize: 13, color: "var(--ink-dim)", marginTop: 0, marginBottom: 16 }}>
          No security question was set up for this account, so it can't be self-recovered. Ask whoever manages the flat to help, or clear this account and re-add it.
        </p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <p style={{ fontSize: 13, color: "var(--ink-dim)", marginTop: 0, marginBottom: 6 }}>
            {selected.security_question}
          </p>
          <input className="tl-input" type="text" placeholder="Your answer" autoFocus value={answer} onChange={(e) => setAnswer(e.target.value)} />
          <input className="tl-input" type="password" placeholder="New password" value={pw} onChange={(e) => setPw(e.target.value)} />
          <input className="tl-input" type="password" placeholder="Confirm new password" value={confirm} onChange={(e) => setConfirm(e.target.value)} onKeyDown={(e) => e.key === "Enter" && submit()} />
          {err && <span style={{ color: "#E39A8F", fontSize: 12 }}>{err}</span>}
          <button className="tl-btn" onClick={submit} disabled={busy} style={{ background: "var(--accent)", color: "#24312A", borderRadius: 6, padding: "10px 16px", opacity: busy ? 0.6 : 1 }}>
            {busy ? "Resetting…" : "Reset password & log in"}
          </button>
        </div>
      )}

      <button
        type="button"
        onClick={() => setStep("pick")}
        style={{ background: "transparent", border: "none", color: "var(--ink-dim)", fontSize: 12, cursor: "pointer", textDecoration: "underline", padding: 0, marginTop: 12 }}
      >
        Not you? Pick a different name
      </button>
    </div>
  );
}

function AddFlatmateModal({ onAdd, onClose, existingUsernames }) {
  const [name, setName] = useState("");
  const [pw, setPw] = useState("");
  const [confirm, setConfirm] = useState("");
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    const trimmed = name.trim();
    if (!trimmed) { setErr("Please enter a name."); return; }
    if (existingUsernames.some((u) => u.toLowerCase() === trimmed.toLowerCase())) {
      setErr("That name is already taken — try another."); return;
    }
    if (pw.length < 4) { setErr("Password should be at least 4 characters."); return; }
    if (pw !== confirm) { setErr("Passwords don't match."); return; }
    if (!question.trim()) { setErr("Please add a security question."); return; }
    if (!answer.trim()) { setErr("Please add an answer."); return; }
    setBusy(true);
    setErr("");
    await onAdd(trimmed, pw, question.trim(), answer.trim());
    setBusy(false);
  };

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 50, padding: 20 }}>
      <div style={{ background: "var(--panel)", border: "1px solid var(--line)", borderRadius: 10, padding: 22, width: 360, maxWidth: "100%" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <Lock size={14} color="var(--accent)" />
            <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--ink-dim)" }}>
              Add flatmate
            </span>
          </div>
          <button className="tl-btn" onClick={onClose} style={{ background: "transparent", color: "var(--ink-dim)", display: "flex", padding: 4 }}>
            <X size={16} />
          </button>
        </div>
        <p style={{ fontSize: 13, color: "var(--ink-dim)", marginTop: 0, marginBottom: 16 }}>
          Give this flatmate their own name, password, and a security question — they'll use these to log in and to reset their own password later if needed.
        </p>
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <input className="tl-input" type="text" placeholder="Name" autoFocus value={name} onChange={(e) => setName(e.target.value)} />
          <input className="tl-input" type="password" placeholder="Password" value={pw} onChange={(e) => setPw(e.target.value)} />
          <input className="tl-input" type="password" placeholder="Confirm password" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
          <div style={{ height: 1, background: "var(--line)", margin: "4px 0" }} />
          <span style={{ fontSize: 12, color: "var(--ink-dim)" }}>
            Security question — used to reset this password later.
          </span>
          <input className="tl-input" type="text" placeholder="e.g. What's your pet's name?" value={question} onChange={(e) => setQuestion(e.target.value)} />
          <input className="tl-input" type="text" placeholder="Answer" value={answer} onChange={(e) => setAnswer(e.target.value)} onKeyDown={(e) => e.key === "Enter" && submit()} />
          {err && <span style={{ color: "#E39A8F", fontSize: 12 }}>{err}</span>}
          <button className="tl-btn" onClick={submit} disabled={busy} style={{ background: "var(--accent)", color: "#24312A", borderRadius: 6, padding: "10px 16px", opacity: busy ? 0.6 : 1 }}>
            {busy ? "Adding…" : "Add flatmate"}
          </button>
        </div>
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
  // Each flatmate is now their own account, stored as a member with a
  // username + password_hash. There is no single shared admin anymore.
  const [authLoaded, setAuthLoaded] = useState(false);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [currentUserId, setCurrentUserId] = useState(null);

  // --- app data state ---
  const [data, setData] = useState({ members: [], entries: [] });
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState(null);
  const [period, setPeriod] = useState("week");
  const [showAddMember, setShowAddMember] = useState(false);
  const [showForgot, setShowForgot] = useState(false);
  const [selectedMemberId, setSelectedMemberId] = useState(null);

  const [formMeal, setFormMeal] = useState("Lunch");
  const [formQty, setFormQty] = useState(1);
  const [formDate, setFormDate] = useState(todayISO());
  const [formNote, setFormNote] = useState("");
  const [filterMember, setFilterMember] = useState("all");

  const currentUser = useMemo(
    () => data.members.find((m) => m.id === currentUserId) || null,
    [data.members, currentUserId]
  );

  // load the shared ledger row (members list is needed up front to know
  // whether to show Setup, Login, or the app, and to check login credentials)
  useEffect(() => {
    (async () => {
      try {
        const { data: row, error } = await supabase
          .from("ledger_state")
          .select("data")
          .eq("id", 1)
          .single();
        if (!error && row?.data) {
          const parsed = row.data;
          setData({ members: parsed.members || [], entries: parsed.entries || [] });
        }
      } catch (e) {
        // couldn't reach Supabase yet
      }
      try {
        const sessionRes = localStorage.getItem(SESSION_KEY);
        const savedUserId = localStorage.getItem(CURRENT_USER_KEY);
        if (sessionRes === "true" && savedUserId) {
          setCurrentUserId(savedUserId);
          setIsLoggedIn(true);
        }
      } catch (e) {
        // no session yet
      }
      setAuthLoaded(true);
      setLoaded(true);
    })();
  }, []);

  // stay in sync with other devices in real time
  useEffect(() => {
    const channel = supabase
      .channel("ledger_state_changes")
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "ledger_state", filter: "id=eq.1" },
        (payload) => {
          const parsed = payload.new?.data;
          if (parsed) {
            setData({ members: parsed.members || [], entries: parsed.entries || [] });
          }
        }
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  // if the logged-in user's account gets removed on another device, log out here too
  useEffect(() => {
    if (isLoggedIn && loaded && currentUserId && !currentUser) {
      handleLogout();
    }
  }, [isLoggedIn, loaded, currentUserId, currentUser]);

  const handleSetup = async (name, password, question, answer) => {
    const hash = await sha256(password);
    const answerHash = await sha256(answer.trim().toLowerCase());
    const color = PALETTE[0];
    const member = {
      id: uid(),
      name,
      color,
      username: name,
      password_hash: hash,
      security_question: question,
      security_answer_hash: answerHash,
    };
    const next = { members: [member], entries: [] };
    try {
      const { error } = await supabase
        .from("ledger_state")
        .update({ data: next, updated_at: new Date().toISOString() })
        .eq("id", 1);
      if (error) return false;
    } catch (e) {
      return false;
    }
    setData(next);
    localStorage.setItem(SESSION_KEY, "true");
    localStorage.setItem(CURRENT_USER_KEY, member.id);
    setCurrentUserId(member.id);
    setIsLoggedIn(true);
    return true;
  };

  const handleLogin = async (name, password) => {
    const hash = await sha256(password);
    const match = data.members.find(
      (m) => (m.username || "").toLowerCase() === name.toLowerCase() && m.password_hash === hash
    );
    if (match) {
      localStorage.setItem(SESSION_KEY, "true");
      localStorage.setItem(CURRENT_USER_KEY, match.id);
      setCurrentUserId(match.id);
      setIsLoggedIn(true);
      return true;
    }
    return false;
  };

  const handleResetPassword = async (memberId, answer, newPassword) => {
    const member = data.members.find((m) => m.id === memberId);
    if (!member || !member.security_answer_hash) return false;
    const answerHash = await sha256(answer.trim().toLowerCase());
    if (answerHash !== member.security_answer_hash) return false;
    const newHash = await sha256(newPassword);
    const next = {
      ...data,
      members: data.members.map((m) => (m.id === memberId ? { ...m, password_hash: newHash } : m)),
    };
    persist(next);
    localStorage.setItem(SESSION_KEY, "true");
    localStorage.setItem(CURRENT_USER_KEY, memberId);
    setCurrentUserId(memberId);
    setIsLoggedIn(true);
    setShowForgot(false);
    return true;
  };

  const handleLogout = async () => {
    localStorage.setItem(SESSION_KEY, "false");
    localStorage.removeItem(CURRENT_USER_KEY);
    setIsLoggedIn(false);
    setCurrentUserId(null);
  };

  const persist = useCallback((next) => {
    setData(next);
    (async () => {
      try {
        const { error } = await supabase
          .from("ledger_state")
          .update({ data: next, updated_at: new Date().toISOString() })
          .eq("id", 1);
        if (error) setError("Couldn't save — please try again.");
        else setError(null);
      } catch (e) {
        setError("Couldn't save — please try again.");
      }
    })();
  }, []);

  const addFlatmate = async (name, password, question, answer) => {
    const hash = await sha256(password);
    const answerHash = await sha256(answer.trim().toLowerCase());
    const color = PALETTE[data.members.length % PALETTE.length];
    const member = {
      id: uid(),
      name,
      color,
      username: name,
      password_hash: hash,
      security_question: question,
      security_answer_hash: answerHash,
    };
    const next = { ...data, members: [...data.members, member] };
    persist(next);
    setShowAddMember(false);
  };

  const removeMember = (id) => {
    if (id !== currentUserId) return; // you can only remove your own account
    const next = {
      members: data.members.filter((m) => m.id !== id),
      entries: data.entries.filter((e) => e.memberId !== id),
    };
    persist(next);
    if (selectedMemberId === id) setSelectedMemberId(null);
    handleLogout();
  };

  const logEntry = () => {
    if (!currentUserId) return;
    const entry = {
      id: uid(),
      memberId: currentUserId,
      date: formDate,
      meal: formMeal,
      qty: Math.max(0, Number(formQty) || 0),
      note: formNote.trim(),
      ts: Date.now(),
    };
    const next = { ...data, entries: [entry, ...data.entries] };
    persist(next);
    setFormQty(1);
    setFormNote("");
  };

  const deleteEntry = (id) => {
    const target = data.entries.find((e) => e.id === id);
    if (!target || target.memberId !== currentUserId) return; // only the owner can delete
    const next = { ...data, entries: data.entries.filter((e) => e.id !== id) };
    persist(next);
  };

  const [editingId, setEditingId] = useState(null);
  const [editQty, setEditQty] = useState(0);
  const [editNote, setEditNote] = useState("");

  const startEdit = (entry) => {
    if (entry.memberId !== currentUserId) return; // only the owner can edit
    setEditingId(entry.id);
    setEditQty(entry.qty);
    setEditNote(entry.note || "");
  };

  const cancelEdit = () => {
    setEditingId(null);
  };

  const saveEdit = (id) => {
    const target = data.entries.find((e) => e.id === id);
    if (!target || target.memberId !== currentUserId) return; // only the owner can save
    const next = {
      ...data,
      entries: data.entries.map((e) =>
        e.id === id ? { ...e, qty: Math.max(0, Number(editQty) || 0), note: editNote.trim() } : e
      ),
    };
    persist(next);
    setEditingId(null);
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
  if (!authLoaded || !loaded) {
    return (
      <GateShell>
        <p style={{ textAlign: "center", color: "var(--ink-dim)", fontSize: 13 }}>Loading…</p>
      </GateShell>
    );
  }

  if (data.members.length === 0) {
    return (
      <GateShell>
        <SetupScreen onSetup={handleSetup} />
      </GateShell>
    );
  }

  if (!isLoggedIn || !currentUser) {
    return (
      <GateShell>
        {showForgot ? (
          <ForgotPasswordScreen
            members={data.members}
            onReset={handleResetPassword}
            onCancel={() => setShowForgot(false)}
          />
        ) : (
          <LoginScreen onLogin={handleLogin} onForgot={() => setShowForgot(true)} />
        )}
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
            <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
              {currentUser && (
                <span style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--ink-dim)" }}>
                  {currentUser.name}
                </span>
              )}
              <button className="tl-btn" onClick={handleLogout} style={{ background: "transparent", color: "var(--ink-dim)", display: "flex", alignItems: "center", gap: 5, fontSize: 12 }}>
                <LogOut size={13} /> Log out
              </button>
            </div>
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
            <AddFlatmateModal
              onAdd={addFlatmate}
              onClose={() => setShowAddMember(false)}
              existingUsernames={data.members.map((m) => m.username || m.name)}
            />
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
                  {m.id === currentUserId && (
                    <button className="tl-btn" onClick={() => removeMember(m.id)} style={{ background: "transparent", color: "var(--ink-dim)", padding: 4, display: "flex" }} title="Remove my account">
                      <Trash2 size={12} />
                    </button>
                  )}
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
                <label style={{ fontSize: 11, color: "var(--ink-dim)", fontFamily: "var(--font-mono)" }}>LOGGING AS</label>
                <div className="tl-input" style={{ display: "flex", alignItems: "center", gap: 6, minWidth: 100, color: "var(--ink)" }}>
                  <span style={{ width: 8, height: 8, borderRadius: "50%", background: currentUser?.color, flexShrink: 0 }} />
                  {currentUser?.name}
                </div>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                <label style={{ fontSize: 11, color: "var(--ink-dim)", fontFamily: "var(--font-mono)" }}>MEAL</label>
                <select className="tl-select" value={formMeal} onChange={(e) => setFormMeal(e.target.value)}>
                  {MEALS.map((m) => <option key={m} value={m}>{m}</option>)}
                </select>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                <label style={{ fontSize: 11, color: "var(--ink-dim)", fontFamily: "var(--font-mono)" }}>QTY</label>
                <input className="tl-input" type="number" min="0" style={{ width: 64 }} value={formQty} onChange={(e) => setFormQty(e.target.value)} />
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
                const isEditing = editingId === e.id;
                return (
                  <div key={e.id} className="tl-row" style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 14px", borderTop: i === 0 ? "none" : "1px solid var(--line)", fontSize: 13 }}>
                    <span style={{ width: 8, height: 8, borderRadius: "50%", background: m?.color || "#666", flexShrink: 0 }} />
                    <span style={{ width: 100, fontWeight: 600, flexShrink: 0 }}>{m?.name || "(removed)"}</span>
                    <span style={{ width: 90, color: "var(--ink-dim)", fontFamily: "var(--font-mono)", fontSize: 12, flexShrink: 0 }}>{e.date}</span>
                    <span style={{ width: 70, color: "var(--ink-dim)", flexShrink: 0 }}>{e.meal}</span>
                    {isEditing ? (
                      <>
                        <input
                          className="tl-input"
                          type="number"
                          min="0"
                          autoFocus
                          value={editQty}
                          onChange={(ev) => setEditQty(ev.target.value)}
                          style={{ width: 50, flexShrink: 0, fontFamily: "var(--font-mono)" }}
                        />
                        <input
                          className="tl-input"
                          type="text"
                          placeholder="Note (optional)"
                          value={editNote}
                          onChange={(ev) => setEditNote(ev.target.value)}
                          onKeyDown={(ev) => ev.key === "Enter" && saveEdit(e.id)}
                          style={{ flex: 1, minWidth: 0 }}
                        />
                        <button className="tl-btn" onClick={() => saveEdit(e.id)} style={{ background: "transparent", color: "var(--accent)", padding: 4, display: "flex", flexShrink: 0 }} title="Save">
                          <Check size={14} />
                        </button>
                        <button className="tl-btn" onClick={cancelEdit} style={{ background: "transparent", color: "var(--ink-dim)", padding: 4, display: "flex", flexShrink: 0 }} title="Cancel">
                          <X size={14} />
                        </button>
                      </>
                    ) : (
                      <>
                        <span style={{ width: 40, fontFamily: "var(--font-mono)", fontWeight: 600, flexShrink: 0 }}>×{e.qty}</span>
                        <span style={{ flex: 1, color: "var(--ink-dim)", fontStyle: e.note ? "normal" : "italic", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {e.note || "—"}
                        </span>
                        {e.memberId === currentUserId ? (
                          <>
                            <button className="tl-btn" onClick={() => startEdit(e)} style={{ background: "transparent", color: "var(--ink-dim)", padding: 4, display: "flex", flexShrink: 0 }} title="Edit entry">
                              <Pencil size={13} />
                            </button>
                            <button className="tl-btn" onClick={() => deleteEntry(e.id)} style={{ background: "transparent", color: "var(--ink-dim)", padding: 4, display: "flex", flexShrink: 0 }} title="Remove entry">
                              <Trash2 size={13} />
                            </button>
                          </>
                        ) : (
                          <span style={{ width: 42, flexShrink: 0 }} />
                        )}
                      </>
                    )}
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
