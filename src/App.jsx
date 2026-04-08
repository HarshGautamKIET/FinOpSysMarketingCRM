import React, { useEffect, useMemo, useState } from "react";
import { createClient } from "@supabase/supabase-js";

// ─── Constants ────────────────────────────────────────────────────────────────
const pipelineStages = [
  "New Lead", "Contacted", "Discovery", "Proposal Sent", "Negotiation", "Won", "Lost",
];
const serviceCatalog = [
  "Bookkeeping", "Payroll", "Taxes", "CFO Services",
  "Bookkeeping + Payroll", "Tax + Bookkeeping", "Bookkeeping + AP",
];
const initialOwners  = ["Adarsh Yadav", "Anjali Soni", "Sahil Prajapati"];
const priorities     = ["High", "Medium", "Low"];
const leadSources    = ["Referral", "Website", "Cold Call", "LinkedIn", "Partner", "Other"];

// ─── Supabase ─────────────────────────────────────────────────────────────────
const SUPABASE_URL      = import.meta.env?.VITE_SUPABASE_URL      ?? "";
const SUPABASE_ANON_KEY = import.meta.env?.VITE_SUPABASE_ANON_KEY ?? "";
const supabase =
  SUPABASE_URL && SUPABASE_ANON_KEY
    ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
        auth: {
          persistSession: true,
          autoRefreshToken: true,
          detectSessionInUrl: true,
        },
      })
    : null;

const T = {
  owners:     "crm_owners",
  contacts:   "crm_contacts",
  tasks:      "crm_tasks",
  activities: "crm_activities",
};

// ─── Utilities ────────────────────────────────────────────────────────────────
function currency(v) {
  return new Intl.NumberFormat("en-US", {
    style: "currency", currency: "USD", maximumFractionDigits: 0,
  }).format(Number(v || 0));
}

function today() {
  return new Date().toISOString().split("T")[0];
}

function cls(...args) {
  return args.filter(Boolean).join(" ");
}

/** Computed lead score 0–100 based on data completeness + deal quality */
function scoreContact(c) {
  let s = 0;
  const v = Number(c.monthlyValue || 0);
  if (v >= 5000)       s += 40;
  else if (v >= 1000)  s += 25;
  else if (v > 0)      s += 10;
  if (c.email)         s += 15;
  if (c.phone)         s += 15;
  if (c.priority === "High")   s += 20;
  else if (c.priority === "Medium") s += 10;
  const stagePts = {
    "New Lead": 0, Contacted: 5, Discovery: 10,
    "Proposal Sent": 15, Negotiation: 20, Won: 25, Lost: 0,
  };
  s += stagePts[c.stage] || 0;
  if (c.nextFollowUp)  s += 10;
  return Math.min(100, s);
}

// ─── Data normalisation ───────────────────────────────────────────────────────
function normalizeContact(c) {
  return {
    id:           c.id,
    userId:       c.userId ?? c.user_id ?? null,
    company:      c.company      || "",
    contact:      c.contact      || "",
    email:        c.email        || "",
    phone:        c.phone        || "",
    stage:        c.stage        || "New Lead",
    status:       c.status       || "Lead",
    service:      c.service      || "Bookkeeping",
    source:       c.source       || "Referral",
    monthlyValue: Number(c.monthlyValue ?? c.monthlyvalue ?? 0),
    owner:        c.owner        || initialOwners[0],
    nextFollowUp: c.nextFollowUp ?? c.nextfollowup ?? "",
    priority:     c.priority     || "Medium",
    notes:        c.notes        || "",
    created_at:   c.created_at   || null,
  };
}

function normalizeTask(t) {
  return {
    id:         t.id,
    userId:     t.userId ?? t.user_id ?? null,
    title:      t.title  || "",
    due:        t.due    || "",
    owner:      t.owner  || initialOwners[0],
    type:       t.type   || "Task",
    status:     t.status || "Open",
    created_at: t.created_at || null,
  };
}

function normalizeActivity(a) {
  return {
    id:        a.id,
    userId:    a.userId ?? a.user_id ?? null,
    contactId: a.contactId ?? a.contact_id,
    company:   a.company  || "",
    type:      a.type     || "",
    subject:   a.subject  || "",
    note:      a.note     || "",
    date:      a.date     || today(),
    created_at: a.created_at || null,
  };
}

function toContactRow(c, userId) {
  return {
    user_id:      userId,
    company:      c.company,
    contact:      c.contact,
    email:        c.email,
    phone:        c.phone,
    stage:        c.stage,
    status:       c.status,
    service:      c.service,
    source:       c.source,
    monthlyvalue: Number(c.monthlyValue || 0),
    owner:        c.owner,
    nextfollowup: c.nextFollowUp || null,
    priority:     c.priority,
    notes:        c.notes,
  };
}

function toTaskRow(t, userId) {
  return {
    user_id: userId,
    title:   t.title,
    due:     t.due || null,
    owner:   t.owner,
    type:    t.type,
    status:  t.status,
  };
}

function toActivityRow(a, userId) {
  return {
    user_id:    userId,
    contact_id: a.contactId,
    company:    a.company,
    type:       a.type,
    subject:    a.subject,
    note:       a.note,
    date:       a.date,
  };
}

// ─── Email templates ──────────────────────────────────────────────────────────
function emailTemplates(c) {
  return [
    {
      label:   "Introduction",
      subject: `${c.service} Services – ${c.company}`,
      body:    `Hi ${c.contact || "there"},\n\nI wanted to reach out about our ${c.service} services. We help growing businesses like ${c.company} streamline their financial operations.\n\nWould you be open to a quick 15-minute call this week?\n\nBest regards,`,
    },
    {
      label:   "Follow-Up",
      subject: `Following up – ${c.company}`,
      body:    `Hi ${c.contact || "there"},\n\nJust following up on our earlier conversation about ${c.service}. Have you had a chance to review things?\n\nHappy to answer any questions.\n\nBest regards,`,
    },
    {
      label:   "Proposal",
      subject: `${c.service} Proposal – ${c.company}`,
      body:    `Hi ${c.contact || "there"},\n\nPlease find our ${c.service} proposal at ${currency(c.monthlyValue)}/month.\n\nLet me know if you'd like to discuss any aspect of it.\n\nBest regards,`,
    },
  ];
}

// ─── Default form state ───────────────────────────────────────────────────────
function blankLead(owners) {
  return {
    company: "", contact: "", email: "", phone: "",
    stage: "New Lead", status: "Lead",
    service: "Bookkeeping", source: "Referral",
    monthlyValue: "",
    owner: owners[0] || initialOwners[0],
    nextFollowUp: "", priority: "Medium", notes: "",
  };
}

function blankAction(owners) {
  return { type: "", subject: "", note: "", due: today(), owner: owners[0] || initialOwners[0] };
}

// ─── UI Primitives ────────────────────────────────────────────────────────────
function StatCard({ title, value, subtitle }) {
  return (
    <div className="rounded-3xl border border-[#7F56D9]/15 bg-white p-5 shadow-sm">
      <p className="text-[11px] font-semibold uppercase tracking-widest text-[#101010]/50">{title}</p>
      <h3 className="mt-2 text-2xl font-bold text-black">{value}</h3>
      <p className="mt-1 text-xs text-[#101010]/45">{subtitle}</p>
    </div>
  );
}

function Panel({ title, children, className }) {
  return (
    <div className={cls("rounded-3xl border border-[#7F56D9]/15 bg-white p-6 shadow-sm", className)}>
      {title && <h2 className="mb-5 text-base font-semibold text-black">{title}</h2>}
      {children}
    </div>
  );
}

function Overlay({ children }) {
  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-black/40 p-4 pt-10">
      <div className="flex min-h-full items-start justify-center">{children}</div>
    </div>
  );
}

function ModalBox({ title, onClose, children, wide = false }) {
  return (
    <Overlay>
      <div className={cls("mb-8 w-full rounded-3xl bg-white p-6 shadow-2xl", wide ? "max-w-4xl" : "max-w-lg")}>
        <div className="mb-5 flex items-center justify-between">
          <h2 className="text-lg font-semibold">{title}</h2>
          <button
            type="button" onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-full text-gray-400 transition hover:bg-gray-100 hover:text-gray-700"
          >
            ✕
          </button>
        </div>
        {children}
      </div>
    </Overlay>
  );
}

function TInput({ placeholder, value, onChange, type = "text" }) {
  return (
    <input
      type={type} placeholder={placeholder} value={value}
      onChange={(e) => onChange(e.target.value)}
      className="h-10 w-full rounded-2xl border border-[#7F56D9]/20 bg-white px-4 text-sm outline-none placeholder:text-[#101010]/35 focus:border-[#7F56D9]"
    />
  );
}

function TArea({ placeholder, value, onChange, rows = 3 }) {
  return (
    <textarea
      placeholder={placeholder} value={value} rows={rows}
      onChange={(e) => onChange(e.target.value)}
      className="w-full rounded-2xl border border-[#7F56D9]/20 bg-white px-4 py-2.5 text-sm outline-none placeholder:text-[#101010]/35 focus:border-[#7F56D9] resize-none"
    />
  );
}

function Sel({ value, onChange, options }) {
  return (
    <select
      value={value} onChange={(e) => onChange(e.target.value)}
      className="h-10 w-full rounded-2xl border border-[#7F56D9]/20 bg-white px-4 text-sm outline-none focus:border-[#7F56D9]"
    >
      {options.map((o) =>
        typeof o === "string"
          ? <option key={o} value={o}>{o}</option>
          : <option key={o.value} value={o.value}>{o.label}</option>
      )}
    </select>
  );
}

function FilterSel({ label, value, onChange, options }) {
  return (
    <label className="flex items-center gap-1.5 text-xs text-[#101010]/55">
      {label}
      <select
        value={value} onChange={(e) => onChange(e.target.value)}
        className="rounded-xl border border-[#7F56D9]/20 bg-white px-2.5 py-1.5 text-xs outline-none focus:border-[#7F56D9]"
      >
        {options.map((o) => <option key={o} value={o}>{o}</option>)}
      </select>
    </label>
  );
}

const STAGE_CLR = {
  "New Lead":      "bg-blue-50 text-blue-700 border-blue-200",
  Contacted:       "bg-violet-50 text-violet-700 border-violet-200",
  Discovery:       "bg-amber-50 text-amber-700 border-amber-200",
  "Proposal Sent": "bg-orange-50 text-orange-700 border-orange-200",
  Negotiation:     "bg-pink-50 text-pink-700 border-pink-200",
  Won:             "bg-emerald-50 text-emerald-700 border-emerald-200",
  Lost:            "bg-red-50 text-red-700 border-red-200",
};

function StageBadge({ stage }) {
  return (
    <span className={cls("inline-flex rounded-full border px-2.5 py-0.5 text-xs font-medium", STAGE_CLR[stage] || "bg-gray-50 text-gray-600 border-gray-200")}>
      {stage}
    </span>
  );
}

const PRI_CLR = {
  High:   "bg-red-50 text-red-600 border-red-200",
  Medium: "bg-amber-50 text-amber-600 border-amber-200",
  Low:    "bg-gray-50 text-gray-500 border-gray-200",
};

function PriBadge({ priority }) {
  return (
    <span className={cls("inline-flex rounded-full border px-2.5 py-0.5 text-xs font-medium", PRI_CLR[priority] || "bg-gray-50 text-gray-500 border-gray-200")}>
      {priority}
    </span>
  );
}

function ScoreBadge({ score }) {
  const c = score >= 70 ? "text-emerald-600 bg-emerald-50 border-emerald-200"
          : score >= 40 ? "text-amber-600 bg-amber-50 border-amber-200"
          :               "text-gray-500 bg-gray-50 border-gray-200";
  return (
    <span className={cls("inline-flex rounded-full border px-2 py-0.5 text-xs font-semibold tabular-nums", c)} title="Lead Score">
      {score}
    </span>
  );
}

function Pill({ children, tone = "purple" }) {
  const t = {
    purple: "bg-[#7F56D9]/10 text-[#7F56D9]",
    green:  "bg-emerald-50 text-emerald-700",
    blue:   "bg-blue-50 text-blue-700",
    red:    "bg-red-50 text-red-700",
  };
  return (
    <span className={cls("inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium", t[tone] || t.purple)}>
      {children}
    </span>
  );
}

function Bar({ value }) {
  return (
    <div className="h-1.5 overflow-hidden rounded-full bg-[#7F56D9]/10">
      <div className="h-full rounded-full bg-[#7F56D9] transition-all" style={{ width: `${Math.min(100, Math.max(0, value))}%` }} />
    </div>
  );
}

function InfoRow({ label, value }) {
  return (
    <div className="flex items-start justify-between gap-3 border-b border-gray-50 py-1.5 last:border-0">
      <span className="shrink-0 text-xs text-[#101010]/50">{label}</span>
      <span className="text-right text-xs font-medium">{value || "—"}</span>
    </div>
  );
}

function Empty({ label }) {
  return <div className="col-span-full py-10 text-center text-sm text-[#101010]/40">{label}</div>;
}

function Btn({ children, onClick, variant = "secondary", className, type = "button", disabled }) {
  const v = {
    primary:   "bg-[#7F56D9] text-white shadow-sm hover:bg-[#6941C6] disabled:opacity-50",
    secondary: "border border-[#7F56D9]/25 bg-white text-[#101010] hover:bg-[#7F56D9]/8",
    danger:    "border border-red-200 bg-red-50 text-red-600 hover:bg-red-100",
    ghost:     "text-[#101010]/60 hover:text-black hover:bg-gray-100",
  };
  return (
    <button
      type={type} onClick={onClick} disabled={disabled}
      className={cls("inline-flex items-center gap-1.5 rounded-2xl px-4 py-2 text-sm font-medium transition", v[variant] || v.secondary, className)}
    >
      {children}
    </button>
  );
}

// ─── Shared lead form (used in Add + Edit) ────────────────────────────────────
function LeadForm({ form, setForm, ownersList }) {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      <TInput placeholder="Company name *" value={form.company}      onChange={(v) => setForm((f) => ({ ...f, company: v }))} />
      <TInput placeholder="Contact name *" value={form.contact}      onChange={(v) => setForm((f) => ({ ...f, contact: v }))} />
      <TInput placeholder="Email"          value={form.email}        onChange={(v) => setForm((f) => ({ ...f, email: v }))}   type="email" />
      <TInput placeholder="Phone"          value={form.phone}        onChange={(v) => setForm((f) => ({ ...f, phone: v }))} />
      <Sel value={form.stage}    onChange={(v) => setForm((f) => ({ ...f, stage: v }))}    options={pipelineStages} />
      <Sel value={form.status}   onChange={(v) => setForm((f) => ({ ...f, status: v }))}   options={["Lead", "Client", "Archived"]} />
      <Sel value={form.service}  onChange={(v) => setForm((f) => ({ ...f, service: v }))}  options={serviceCatalog} />
      <Sel value={form.source}   onChange={(v) => setForm((f) => ({ ...f, source: v }))}   options={leadSources} />
      <TInput placeholder="Monthly value ($)" value={form.monthlyValue} onChange={(v) => setForm((f) => ({ ...f, monthlyValue: v }))} type="number" />
      <Sel value={form.owner}    onChange={(v) => setForm((f) => ({ ...f, owner: v }))}    options={ownersList} />
      <TInput placeholder="Next follow-up" value={form.nextFollowUp}  onChange={(v) => setForm((f) => ({ ...f, nextFollowUp: v }))} type="date" />
      <Sel value={form.priority} onChange={(v) => setForm((f) => ({ ...f, priority: v }))} options={priorities} />
      <div className="sm:col-span-2">
        <TArea placeholder="Notes…" value={form.notes} onChange={(v) => setForm((f) => ({ ...f, notes: v }))} />
      </div>
    </div>
  );
}

function AuthScreen({
  mode,
  email,
  password,
  busy,
  error,
  notice,
  onEmailChange,
  onPasswordChange,
  onModeChange,
  onSubmit,
}) {
  const signingIn = mode === "signin";
  return (
    <div className="min-h-screen bg-[#f8f7ff] px-4 py-10 text-black">
      <div className="mx-auto grid w-full max-w-5xl gap-5 rounded-3xl border border-[#7F56D9]/20 bg-white/90 p-4 shadow-xl backdrop-blur md:grid-cols-[1.1fr_1fr] md:p-8">
        <div className="rounded-3xl bg-gradient-to-br from-[#7F56D9] via-[#6941C6] to-[#3b2c77] p-7 text-white shadow-lg">
          <p className="inline-flex rounded-full border border-white/30 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.2em]">FinOpSys</p>
          <h1 className="mt-4 text-3xl font-bold leading-tight">CRM Workspace Access</h1>
          <p className="mt-3 text-sm text-white/85">Sign in with Supabase authentication. Your dashboard loads only your own records.</p>
          <div className="mt-5 space-y-2 text-xs text-white/80">
            <p>• Secure session-based login</p>
            <p>• Data isolation per authenticated user</p>
            <p>• Direct read/write against Supabase tables</p>
          </div>
        </div>

        <div className="rounded-3xl border border-[#7F56D9]/15 bg-white p-6 shadow-sm">
          <h2 className="text-xl font-semibold">{signingIn ? "Welcome back" : "Create your account"}</h2>
          <p className="mt-1 text-sm text-[#101010]/55">{signingIn ? "Log in to continue to your dashboard." : "Use email and password to get started."}</p>

          <form className="mt-5 space-y-3" onSubmit={onSubmit}>
            <input
              type="email"
              value={email}
              onChange={(e) => onEmailChange(e.target.value)}
              placeholder="Email"
              autoComplete="email"
              className="h-11 w-full rounded-2xl border border-[#7F56D9]/20 bg-white px-4 text-sm outline-none placeholder:text-[#101010]/35 focus:border-[#7F56D9]"
            />
            <input
              type="password"
              value={password}
              onChange={(e) => onPasswordChange(e.target.value)}
              placeholder="Password"
              autoComplete={signingIn ? "current-password" : "new-password"}
              className="h-11 w-full rounded-2xl border border-[#7F56D9]/20 bg-white px-4 text-sm outline-none placeholder:text-[#101010]/35 focus:border-[#7F56D9]"
            />

            {error && <p className="rounded-2xl border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">{error}</p>}
            {notice && <p className="rounded-2xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-700">{notice}</p>}

            <button
              type="submit"
              disabled={busy}
              className="h-11 w-full rounded-2xl bg-[#7F56D9] text-sm font-semibold text-white transition hover:bg-[#6941C6] disabled:opacity-60"
            >
              {busy ? "Please wait..." : signingIn ? "Sign In" : "Create Account"}
            </button>
          </form>

          <button
            type="button"
            onClick={() => onModeChange(signingIn ? "signup" : "signin")}
            className="mt-4 text-sm font-medium text-[#7F56D9] hover:underline"
          >
            {signingIn ? "Need an account? Sign up" : "Already have an account? Sign in"}
          </button>
        </div>
      </div>
    </div>
  );
}

function LoadingScreen({ label }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-[#f8f7ff] px-4">
      <div className="rounded-3xl border border-[#7F56D9]/20 bg-white px-6 py-5 text-sm text-[#101010]/65 shadow-sm">
        {label}
      </div>
    </div>
  );
}

function MissingSupabaseScreen() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-[#f8f7ff] px-4">
      <div className="max-w-xl rounded-3xl border border-red-200 bg-white p-6 shadow-sm">
        <h1 className="text-xl font-semibold text-black">Supabase is not configured</h1>
        <p className="mt-2 text-sm text-[#101010]/65">Set `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` in `.env`, then restart the Vite server.</p>
      </div>
    </div>
  );
}

// ─── Activity icon ────────────────────────────────────────────────────────────
function activityIcon(type) {
  return { Call: "📞", Email: "✉️", Proposal: "📋", Task: "✓" }[type] || "•";
}

// ═══════════════════════════════════════════════════════════════════════════════
//  Main CRM Component
// ═══════════════════════════════════════════════════════════════════════════════
export default function AccountingServicesCRM() {
  // ── State ──────────────────────────────────────────────────────────────────
  const [session,   setSession]   = useState(null);
  const [authReady, setAuthReady] = useState(false);
  const [authMode,  setAuthMode]  = useState("signin");
  const [authEmail, setAuthEmail] = useState("");
  const [authPass,  setAuthPass]  = useState("");
  const [authBusy,  setAuthBusy]  = useState(false);
  const [authError, setAuthError] = useState("");
  const [authNotice, setAuthNotice] = useState("");

  const userId = session?.user?.id || "";
  const userEmail = session?.user?.email || "";

  const [contacts,   setContacts]   = useState([]);
  const [tasks,      setTasks]      = useState([]);
  const [activities, setActivities] = useState([]);
  const [ownersList, setOwnersList] = useState(initialOwners);

  const [appLoaded,     setAppLoaded]     = useState(false);
  const [syncBusy,      setSyncBusy]      = useState(false);
  const [syncError,     setSyncError]     = useState("");
  const [ownersSaving,  setOwnersSaving]  = useState(false);
  const [ownersError,   setOwnersError]   = useState("");

  const [view,          setView]          = useState("pipeline");
  const [query,         setQuery]         = useState("");
  const [stageFilter,   setStageFilter]   = useState("All");
  const [serviceFilter, setServiceFilter] = useState("All");
  const [ownerFilter,   setOwnerFilter]   = useState("All");

  const [showForm,         setShowForm]         = useState(false);
  const [selectedContact,  setSelectedContact]  = useState(null);
  const [isEditingLead,    setIsEditingLead]    = useState(false);
  const [activeAction,     setActiveAction]     = useState(null);
  const [showOwnersModal,  setShowOwnersModal]  = useState(false);
  const [draftOwners,      setDraftOwners]      = useState(initialOwners);
  const [dupWarning,       setDupWarning]       = useState("");

  const [confirmState, setConfirmState] = useState({
    open: false, title: "", message: "", onConfirm: null,
  });

  const [form,       setForm]       = useState(() => blankLead(initialOwners));
  const [actionForm, setActionForm] = useState(() => blankAction(initialOwners));

  // ── Derived lists ─────────────────────────────────────────────────────────
  const serviceOptions = useMemo(
    () => ["All", ...Array.from(new Set(contacts.map((c) => c.service).filter(Boolean)))],
    [contacts]
  );
  const ownerOptions = useMemo(() => ["All", ...ownersList.filter(Boolean)], [ownersList]);

  const filteredContacts = useMemo(() => {
    const q = (query || "").toLowerCase().trim();
    return contacts.filter((c) => {
      const matchQ =
        !q ||
        (c.company || "").toLowerCase().includes(q) ||
        (c.contact || "").toLowerCase().includes(q) ||
        (c.email   || "").toLowerCase().includes(q) ||
        (c.service || "").toLowerCase().includes(q);
      const matchStage   = stageFilter   === "All" || c.stage   === stageFilter;
      const matchService = serviceFilter === "All" || c.service === serviceFilter;
      const matchOwner   = ownerFilter   === "All" || c.owner   === ownerFilter;
      return matchQ && matchStage && matchService && matchOwner;
    });
  }, [contacts, query, stageFilter, serviceFilter, ownerFilter]);

  const stats = useMemo(() => {
    const t = today();
    const activeLeads  = filteredContacts.filter((c) => !["Won", "Lost"].includes(c.stage));
    const clients      = filteredContacts.filter((c) => c.status === "Client" || c.stage === "Won");
    const pipelineVal  = filteredContacts.filter((c) => c.stage !== "Lost").reduce((s, c) => s + Number(c.monthlyValue || 0), 0);
    const proposalVal  = filteredContacts.filter((c) => ["Proposal Sent", "Negotiation"].includes(c.stage)).reduce((s, c) => s + Number(c.monthlyValue || 0), 0);
    const wonVal       = filteredContacts.filter((c) => c.stage === "Won").reduce((s, c) => s + Number(c.monthlyValue || 0), 0);
    const dueToday     = filteredContacts.filter((c) => c.nextFollowUp && c.nextFollowUp <= t && !["Won", "Lost"].includes(c.stage)).length;
    return { activeLeads, clients, pipelineVal, proposalVal, wonVal, dueToday };
  }, [filteredContacts]);

  const stageCounts = useMemo(() =>
    pipelineStages.map((stage) => ({
      stage,
      count: filteredContacts.filter((c) => c.stage === stage).length,
      value: filteredContacts.filter((c) => c.stage === stage).reduce((s, c) => s + Number(c.monthlyValue || 0), 0),
    })),
    [filteredContacts]
  );

  const followUpQueue = useMemo(() =>
    filteredContacts
      .filter((c) => !["Won", "Lost"].includes(c.stage))
      .sort((a, b) => (a.nextFollowUp || "9999").localeCompare(b.nextFollowUp || "9999"))
      .slice(0, 5),
    [filteredContacts]
  );

  const clientPortfolio = useMemo(() =>
    filteredContacts.filter((c) => c.status === "Client" || c.stage === "Won"),
    [filteredContacts]
  );

  const contactActivities = useMemo(() => {
    if (!selectedContact) return [];
    return activities
      .filter((a) => a.contactId === selectedContact.id)
      .sort((a, b) => (b.date || "").localeCompare(a.date || ""));
  }, [activities, selectedContact]);

  const overdueFollowUps = useMemo(() =>
    contacts.filter(
      (c) => c.nextFollowUp && c.nextFollowUp < today() && !["Won", "Lost"].includes(c.stage)
    ).length,
    [contacts]
  );

  useEffect(() => {
    if (!supabase) {
      setAuthReady(true);
      return;
    }

    let alive = true;
    supabase.auth.getSession()
      .then(({ data, error }) => {
        if (!alive) return;
        if (error) setAuthError(error.message || "Could not read auth session.");
        setSession(data.session ?? null);
        setAuthReady(true);
      })
      .catch((error) => {
        if (!alive) return;
        setAuthError(error?.message || "Could not initialize Supabase auth.");
        setAuthReady(true);
      });

    const { data } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      setAuthError("");
      setAuthNotice("");
    });

    return () => {
      alive = false;
      data.subscription.unsubscribe();
    };
  }, []);

  // ── Initial Supabase load ────────────────────────────────────────────────
  useEffect(() => {
    let alive = true;

    async function load() {
      if (!supabase || !userId) {
        setContacts([]);
        setTasks([]);
        setActivities([]);
        setOwnersList(initialOwners);
        setDraftOwners(initialOwners);
        setSelectedContact(null);
        setIsEditingLead(false);
        setShowForm(false);
        setActiveAction(null);
        setSyncBusy(false);
        setSyncError("");
        setAppLoaded(false);
        return;
      }

      setAppLoaded(false);
      setSyncBusy(true);
      setSyncError("");

      const [ownersRes, contactsRes, tasksRes, activitiesRes] = await Promise.all([
        supabase.from(T.owners).select("id,name,sort_order").eq("user_id", userId).order("sort_order").order("name"),
        supabase.from(T.contacts).select("*").eq("user_id", userId).order("created_at", { ascending: false }),
        supabase.from(T.tasks).select("*").eq("user_id", userId).order("created_at", { ascending: false }),
        supabase.from(T.activities).select("*").eq("user_id", userId).order("created_at", { ascending: false }),
      ]);

      if (!alive) return;

      const err = ownersRes.error || contactsRes.error || tasksRes.error || activitiesRes.error;
      if (err) {
        setSyncError(toSyncErrorMessage(err, "Failed to load from Supabase."));
        setSyncBusy(false);
        setAppLoaded(true);
        return;
      }

      const ownerNames = (ownersRes.data || []).map((r) => r.name).filter(Boolean);
      const nextOwners = ownerNames.length ? ownerNames : initialOwners;

      setOwnersList(nextOwners);
      setDraftOwners(nextOwners);
      setContacts((contactsRes.data || []).map(normalizeContact));
      setTasks((tasksRes.data || []).map(normalizeTask));
      setActivities((activitiesRes.data || []).map(normalizeActivity));
      setSyncBusy(false);
      setAppLoaded(true);
    }

    load();
    return () => { alive = false; };
  }, [userId]);

  // ── Helpers ──────────────────────────────────────────────────────────────
  function toSyncErrorMessage(err, fallback = "Sync error.") {
    const msg = err?.message || fallback;
    return msg.toLowerCase().includes("user_id")
      ? "Database schema is outdated. Run supabase/schema.sql, then reload the app."
      : msg;
  }

  function resetForm()    { setForm(blankLead(ownersList)); setDupWarning(""); }
  function closeConfirm() { setConfirmState({ open: false, title: "", message: "", onConfirm: null }); }
  function openConfirm(title, message, onConfirm) {
    setConfirmState({ open: true, title, message, onConfirm });
  }

  async function withSync(fn) {
    setSyncBusy(true);
    setSyncError("");
    try { await fn(); }
    catch (e) { setSyncError(toSyncErrorMessage(e)); }
    finally   { setSyncBusy(false); }
  }

  function requireUserId() {
    if (!userId) throw new Error("Your session expired. Please sign in again.");
    return userId;
  }

  async function submitAuth(e) {
    e.preventDefault();
    if (!supabase) return;

    const email = authEmail.trim().toLowerCase();
    if (!email || !authPass) {
      setAuthError("Enter both email and password.");
      return;
    }

    setAuthBusy(true);
    setAuthError("");
    setAuthNotice("");

    try {
      if (authMode === "signin") {
        const { error } = await supabase.auth.signInWithPassword({ email, password: authPass });
        if (error) throw error;
      } else {
        const { data, error } = await supabase.auth.signUp({ email, password: authPass });
        if (error) throw error;
        if (!data.session) {
          setAuthNotice("Account created. Confirm your email if confirmation is enabled, then sign in.");
        } else {
          setAuthNotice("Account created and signed in.");
        }
      }
      setAuthPass("");
    } catch (err) {
      setAuthError(err?.message || "Authentication failed.");
    } finally {
      setAuthBusy(false);
    }
  }

  async function signOut() {
    if (!supabase) return;
    const { error } = await supabase.auth.signOut();
    if (error) setSyncError(error.message || "Could not sign out.");
  }

  function checkDuplicate(email, phone, excludeId = null) {
    const emailDup = email && contacts.some((c) => c.id !== excludeId && c.email && c.email.toLowerCase() === email.toLowerCase());
    const phoneDup = phone && contacts.some((c) => c.id !== excludeId && c.phone && c.phone.replace(/\D/g, "") === phone.replace(/\D/g, "") && phone.replace(/\D/g, "").length > 5);
    if (emailDup) return `A contact with email "${email}" already exists.`;
    if (phoneDup) return `A contact with phone "${phone}" already exists.`;
    return "";
  }

  // ── Owners CRUD ──────────────────────────────────────────────────────────
  function openOwnersModal() {
    setDraftOwners(ownersList.length ? [...ownersList] : [...initialOwners]);
    setShowOwnersModal(true);
  }

  function closeOwnersModal() {
    setShowOwnersModal(false);
    setOwnersError("");
  }

  async function saveOwners() {
    const clean  = draftOwners.map((o) => o.trim()).filter(Boolean);
    const unique = [...new Set(clean)];
    if (!unique.length) return;

    const prev = ownersList;
    const map  = new Map();
    prev.forEach((old, i) => { if (draftOwners[i]?.trim()) map.set(old, draftOwners[i].trim()); });
    const resolve = (o) => map.get(o) || (unique.includes(o) ? o : unique[0]);

    setOwnersSaving(true);
    setOwnersError("");
    try {
      if (supabase) {
        const uid = requireUserId();
        const { error: de } = await supabase.from(T.owners).delete().eq("user_id", uid);
        if (de) throw de;
        const { error: ie } = await supabase
          .from(T.owners)
          .insert(unique.map((name, i) => ({ user_id: uid, name, sort_order: i + 1 })));
        if (ie) throw ie;
      }
      setOwnersList(unique);
      setContacts((prev) => prev.map((c) => ({ ...c, owner: resolve(c.owner) })));
      setTasks((prev)    => prev.map((t) => ({ ...t, owner: resolve(t.owner) })));
      setSelectedContact((prev) => prev ? { ...prev, owner: resolve(prev.owner) } : prev);
      setForm((f) => ({ ...f, owner: resolve(f.owner) }));
      setActionForm((f) => ({ ...f, owner: resolve(f.owner) }));
      if (ownerFilter !== "All") {
        const next = resolve(ownerFilter);
        setOwnerFilter(unique.includes(next) ? next : "All");
      }
      setDraftOwners(unique);
      setShowOwnersModal(false);
    } catch (e) {
      setOwnersError(e?.message || "Could not save owners.");
    } finally {
      setOwnersSaving(false);
    }
  }

  // ── Contact CRUD ─────────────────────────────────────────────────────────
  async function addContact() {
    if (!form.company.trim() || !form.contact.trim()) return;
    const dup = checkDuplicate(form.email.trim(), form.phone.trim());
    if (dup) { setDupWarning(dup + " Save anyway?"); }

    const draft = normalizeContact({
      ...form,
      company:      form.company.trim(),
      contact:      form.contact.trim(),
      email:        form.email.trim(),
      phone:        form.phone.trim(),
      monthlyValue: Number(form.monthlyValue || 0),
      id:           crypto.randomUUID(),
    });

    await withSync(async () => {
      if (supabase) {
        const uid = requireUserId();
        const { data, error } = await supabase.from(T.contacts).insert(toContactRow(draft, uid)).select("*").single();
        if (error) throw error;
        setContacts((prev) => [normalizeContact(data), ...prev]);
      } else {
        setContacts((prev) => [draft, ...prev]);
      }
      resetForm();
      setShowForm(false);
    });
  }

  async function updateContact() {
    if (!selectedContact || !form.company.trim() || !form.contact.trim()) return;
    const updated = normalizeContact({
      ...selectedContact, ...form,
      company:      form.company.trim(),
      contact:      form.contact.trim(),
      email:        form.email.trim(),
      phone:        form.phone.trim(),
      monthlyValue: Number(form.monthlyValue || 0),
    });

    await withSync(async () => {
      if (supabase) {
        const uid = requireUserId();
        const { data, error } = await supabase
          .from(T.contacts)
          .update(toContactRow(updated, uid))
          .eq("id", selectedContact.id)
          .eq("user_id", uid)
          .select("*")
          .single();
        if (error) throw error;
        const n = normalizeContact(data);
        setContacts((prev) => prev.map((c) => c.id === selectedContact.id ? n : c));
        setSelectedContact(n);
      } else {
        setContacts((prev) => prev.map((c) => c.id === selectedContact.id ? updated : c));
        setSelectedContact(updated);
      }
      setIsEditingLead(false);
      resetForm();
    });
  }

  function startEditingLead(c) {
    setForm({
      company: c.company, contact: c.contact, email: c.email, phone: c.phone,
      stage: c.stage, status: c.status, service: c.service, source: c.source,
      monthlyValue: String(c.monthlyValue ?? ""),
      owner: c.owner, nextFollowUp: c.nextFollowUp || "", priority: c.priority, notes: c.notes,
    });
    setIsEditingLead(true);
  }

  function cancelEditingLead() {
    setIsEditingLead(false);
    resetForm();
  }

  async function deleteLead(c) {
    openConfirm(
      "Delete Lead",
      `Permanently delete "${c.company}"? This will also remove all related activity history.`,
      async () => {
        closeConfirm();
        await withSync(async () => {
          if (supabase) {
            const uid = requireUserId();
            await supabase.from(T.activities).delete().eq("contact_id", c.id).eq("user_id", uid);
            const { error } = await supabase.from(T.contacts).delete().eq("id", c.id).eq("user_id", uid);
            if (error) throw error;
          }
          setContacts((prev)    => prev.filter((x) => x.id !== c.id));
          setActivities((prev)  => prev.filter((a) => a.contactId !== c.id));
          setSelectedContact(null);
          setIsEditingLead(false);
        });
      }
    );
  }

  async function archiveLead(c) {
    openConfirm(
      "Archive Lead",
      `Archive "${c.company}"? Moves it out of the active pipeline — data is preserved.`,
      async () => {
        closeConfirm();
        const updated = normalizeContact({ ...c, stage: "Lost", status: "Archived", priority: "Low" });
        await withSync(async () => {
          if (supabase) {
            const uid = requireUserId();
            const { data, error } = await supabase
              .from(T.contacts)
              .update(toContactRow(updated, uid))
              .eq("id", c.id)
              .eq("user_id", uid)
              .select("*")
              .single();
            if (error) throw error;
            const n = normalizeContact(data);
            setContacts((prev) => prev.map((x) => x.id === c.id ? n : x));
            setSelectedContact(n);
          } else {
            setContacts((prev) => prev.map((x) => x.id === c.id ? updated : x));
            setSelectedContact(updated);
          }
        });
      }
    );
  }

  // ── Task CRUD ────────────────────────────────────────────────────────────
  async function toggleTask(id) {
    const t = tasks.find((x) => x.id === id);
    if (!t) return;
    const updated = normalizeTask({ ...t, status: t.status === "Completed" ? "Open" : "Completed" });
    await withSync(async () => {
      if (supabase) {
        const uid = requireUserId();
        const { data, error } = await supabase
          .from(T.tasks)
          .update(toTaskRow(updated, uid))
          .eq("id", id)
          .eq("user_id", uid)
          .select("*")
          .single();
        if (error) throw error;
        setTasks((prev) => prev.map((x) => x.id === id ? normalizeTask(data) : x));
      } else {
        setTasks((prev) => prev.map((x) => x.id === id ? updated : x));
      }
    });
  }

  // ── Activity / Action helpers ────────────────────────────────────────────
  async function persistActivity(a) {
    if (supabase) {
      const uid = requireUserId();
      const { data, error } = await supabase.from(T.activities).insert(toActivityRow(a, uid)).select("*").single();
      if (error) throw error;
      return normalizeActivity(data);
    }
    return a;
  }

  async function persistTask(t) {
    if (supabase) {
      const uid = requireUserId();
      const { data, error } = await supabase.from(T.tasks).insert(toTaskRow(t, uid)).select("*").single();
      if (error) throw error;
      return normalizeTask(data);
    }
    return t;
  }

  function openAction(type, c) {
    const defaults = {
      Call: {
        type: "Call",
        subject: `Call with ${c.company}`,
        note: "",
        due: c.nextFollowUp || today(),
        owner: c.owner,
      },
      Email: {
        type: "Email",
        subject: `Email to ${c.contact || c.company}`,
        note: "",
        due: c.nextFollowUp || today(),
        owner: c.owner,
      },
      Proposal: {
        type: "Proposal",
        subject: `${c.service} Proposal for ${c.company}`,
        note: `Scope: ${c.service}\nMonthly value: ${currency(c.monthlyValue)}`,
        due: c.nextFollowUp || today(),
        owner: c.owner,
      },
      Task: {
        type: "Task",
        subject: `Follow up with ${c.company}`,
        note: "",
        due: c.nextFollowUp || today(),
        owner: c.owner,
      },
    };
    setActionForm(defaults[type] || blankAction(ownersList));
    setActiveAction(type);
  }

  function closeAction() {
    setActiveAction(null);
    setActionForm(blankAction(ownersList));
  }

  async function submitAction() {
    if (!selectedContact || !activeAction) return;

    await withSync(async () => {
      if (activeAction === "Call" || activeAction === "Email") {
        const a = await persistActivity({
          contactId: selectedContact.id,
          company:   selectedContact.company,
          type:      activeAction,
          subject:   actionForm.subject.trim(),
          note:      actionForm.note.trim() || `${activeAction} logged.`,
          date:      today(),
        });
        setActivities((prev) => [a, ...prev]);
      }

      if (activeAction === "Proposal") {
        const a = await persistActivity({
          contactId: selectedContact.id,
          company:   selectedContact.company,
          type:      "Proposal",
          subject:   actionForm.subject.trim(),
          note:      actionForm.note.trim() || "Proposal created.",
          date:      today(),
        });
        setActivities((prev) => [a, ...prev]);

        // Auto-advance stage to Proposal Sent
        const updated = normalizeContact({ ...selectedContact, stage: "Proposal Sent" });
        if (supabase) {
          const uid = requireUserId();
          const { data, error } = await supabase
            .from(T.contacts)
            .update(toContactRow(updated, uid))
            .eq("id", selectedContact.id)
            .eq("user_id", uid)
            .select("*")
            .single();
          if (error) throw error;
          const n = normalizeContact(data);
          setContacts((prev) => prev.map((c) => c.id === selectedContact.id ? n : c));
          setSelectedContact(n);
        } else {
          setContacts((prev) => prev.map((c) => c.id === selectedContact.id ? updated : c));
          setSelectedContact(updated);
        }
      }

      if (activeAction === "Task") {
        const t = await persistTask({
          id:     crypto.randomUUID(),
          title:  actionForm.subject.trim() || `Follow up with ${selectedContact.company}`,
          due:    actionForm.due,
          owner:  actionForm.owner,
          type:   "Task",
          status: "Open",
        });
        setTasks((prev) => [t, ...prev]);

        const a = await persistActivity({
          contactId: selectedContact.id,
          company:   selectedContact.company,
          type:      "Task",
          subject:   actionForm.subject.trim(),
          note:      actionForm.note.trim() || "Task created.",
          date:      today(),
        });
        setActivities((prev) => [a, ...prev]);
      }

      closeAction();
    });
  }

  // ── Bulk operations ──────────────────────────────────────────────────────
  async function bulkDeleteLost() {
    openConfirm(
      "Clear Lost Leads",
      "Permanently delete all leads marked as Lost? Activity history will also be removed.",
      async () => {
        closeConfirm();
        await withSync(async () => {
          const ids = contacts.filter((c) => c.stage === "Lost").map((c) => c.id);
          if (supabase && ids.length) {
            const uid = requireUserId();
            await supabase.from(T.activities).delete().eq("user_id", uid).in("contact_id", ids);
            const { error } = await supabase.from(T.contacts).delete().eq("user_id", uid).in("id", ids);
            if (error) throw error;
          }
          setContacts((prev)   => prev.filter((c) => c.stage !== "Lost"));
          setActivities((prev) => prev.filter((a) => !ids.includes(a.contactId)));
          if (selectedContact && ids.includes(selectedContact.id)) {
            setSelectedContact(null); setIsEditingLead(false);
          }
        });
      }
    );
  }

  async function bulkDeleteCompletedTasks() {
    openConfirm(
      "Clear Completed Tasks",
      "Delete all tasks marked as Completed?",
      async () => {
        closeConfirm();
        await withSync(async () => {
          const ids = tasks.filter((t) => t.status === "Completed").map((t) => t.id);
          if (supabase && ids.length) {
            const uid = requireUserId();
            const { error } = await supabase.from(T.tasks).delete().eq("user_id", uid).in("id", ids);
            if (error) throw error;
          }
          setTasks((prev) => prev.filter((t) => t.status !== "Completed"));
        });
      }
    );
  }

  async function clearAll() {
    openConfirm(
      "Clear All My Data",
      "This will remove all leads, tasks, and activities in your workspace. This cannot be undone.",
      async () => {
        closeConfirm();
        await withSync(async () => {
          if (supabase) {
            const uid = requireUserId();
            await supabase.from(T.activities).delete().eq("user_id", uid);
            await supabase.from(T.tasks).delete().eq("user_id", uid);
            const { error } = await supabase.from(T.contacts).delete().eq("user_id", uid);
            if (error) throw error;
          }
          setContacts([]); setTasks([]); setActivities([]);
          setSelectedContact(null); setIsEditingLead(false);
        });
      }
    );
  }

  // ── Status label ─────────────────────────────────────────────────────────
  const statusLabel = supabase
    ? appLoaded
      ? syncBusy ? "Syncing…" : "Personal workspace · Supabase connected"
      : "Loading your workspace…"
    : "Supabase is not configured";

  // ═════════════════════════════════════════════════════════════════════════
  //  Render
  // ═════════════════════════════════════════════════════════════════════════
  if (!supabase) {
    return <MissingSupabaseScreen />;
  }

  if (!authReady) {
    return <LoadingScreen label="Checking authentication..." />;
  }

  if (!session) {
    return (
      <AuthScreen
        mode={authMode}
        email={authEmail}
        password={authPass}
        busy={authBusy}
        error={authError}
        notice={authNotice}
        onEmailChange={setAuthEmail}
        onPasswordChange={setAuthPass}
        onModeChange={(mode) => {
          setAuthMode(mode);
          setAuthError("");
          setAuthNotice("");
        }}
        onSubmit={submitAuth}
      />
    );
  }

  return (
    <div className="min-h-screen bg-[#f8f7ff] p-4 md:p-8 text-black">
      <div className="mx-auto max-w-7xl space-y-5">

        {/* ── Status banner ─────────────────────────────────────────────── */}
        <div className={cls(
          "rounded-2xl border px-4 py-2.5 text-xs",
          supabase && appLoaded && !syncError
            ? "border-emerald-200 bg-emerald-50 text-emerald-700"
            : syncError
              ? "border-red-200 bg-red-50 text-red-600"
              : "border-[#7F56D9]/20 bg-white text-[#101010]/60"
        )}>
          {syncBusy ? "⟳ Syncing…" : supabase && appLoaded && !syncError ? "● " : "○ "}
          {statusLabel}
          {syncError ? ` — ${syncError}` : ""}
        </div>

        {/* ── Overdue follow-up alert ───────────────────────────────────── */}
        {overdueFollowUps > 0 && (
          <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-2.5 text-xs text-amber-700">
            ⚠ {overdueFollowUps} follow-up{overdueFollowUps > 1 ? "s are" : " is"} overdue — check your pipeline.
          </div>
        )}

        {/* ── Header ───────────────────────────────────────────────────── */}
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className="inline-flex items-center rounded-full bg-[#7F56D9] px-4 py-1 text-[10px] font-bold uppercase tracking-[0.2em] text-white shadow">
              FinOpSys Workspace
            </div>
            <h1 className="mt-3 text-4xl font-bold tracking-tight">FinOpSys CRM</h1>
            <p className="mt-1 text-sm text-[#101010]/55">
              {contacts.length} contacts · {tasks.filter((t) => t.status === "Open").length} open tasks
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Pill tone="blue">{userEmail}</Pill>
            <Btn onClick={signOut}>Sign Out</Btn>

            {/* View tabs */}
            <div className="inline-flex rounded-2xl border border-[#7F56D9]/20 bg-white p-1 shadow-sm">
              {[["pipeline", "Pipeline"], ["clients", "Clients"], ["tasks", "Tasks"]].map(([k, l]) => (
                <button
                  key={k} type="button" onClick={() => setView(k)}
                  className={cls(
                    "rounded-xl px-4 py-2 text-sm font-medium transition",
                    view === k ? "bg-[#7F56D9] text-white shadow" : "text-[#101010] hover:bg-[#7F56D9]/10"
                  )}
                >
                  {l}
                </button>
              ))}
            </div>

            <Btn onClick={openOwnersModal}>Edit Owners</Btn>
            <Btn onClick={bulkDeleteLost}>Clear Lost</Btn>
            <Btn onClick={bulkDeleteCompletedTasks}>Clear Tasks</Btn>
            <Btn onClick={clearAll} variant="danger">Clear All</Btn>
            <Btn onClick={() => { resetForm(); setShowForm(true); }} variant="primary">+ Add Lead</Btn>
          </div>
        </div>

        {/* ── Stats ─────────────────────────────────────────────────────── */}
        <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-6">
          <StatCard title="Active Leads"   value={stats.activeLeads.length}      subtitle="Open opportunities" />
          <StatCard title="Clients"        value={stats.clients.length}          subtitle="Won + onboarded" />
          <StatCard title="Pipeline Value" value={currency(stats.pipelineVal)}   subtitle="Monthly recurring" />
          <StatCard title="Proposal Value" value={currency(stats.proposalVal)}   subtitle="In proposal / nego" />
          <StatCard title="Won Value"      value={currency(stats.wonVal)}        subtitle="Current MRR" />
          <StatCard title="Follow-ups Due" value={stats.dueToday}               subtitle="Due today or overdue" />
        </div>

        {/* ── Search & filter ────────────────────────────────────────────── */}
        <Panel>
          <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
            <input
              value={query} onChange={(e) => setQuery(e.target.value)}
              placeholder="Search company, contact, email, or service…"
              className="h-10 w-full rounded-2xl border border-[#7F56D9]/20 bg-white px-4 text-sm outline-none placeholder:text-[#101010]/35 focus:border-[#7F56D9] xl:max-w-sm"
            />
            <div className="flex flex-wrap gap-3">
              <FilterSel label="Stage"   value={stageFilter}   onChange={setStageFilter}   options={["All", ...pipelineStages]} />
              <FilterSel label="Service" value={serviceFilter} onChange={setServiceFilter} options={serviceOptions} />
              <FilterSel label="Owner"   value={ownerFilter}   onChange={setOwnerFilter}   options={ownerOptions} />
            </div>
          </div>
        </Panel>

        {/* ══════════════════════════════════════════════════════════════════
             PIPELINE VIEW
        ═══════════════════════════════════════════════════════════════════ */}
        {view === "pipeline" && (
          <div className="grid grid-cols-1 gap-5 xl:grid-cols-[1.8fr_1fr]">
            <Panel title="Pipeline Overview">
              {/* Stage summary cards */}
              <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-4">
                {stageCounts.map((item) => {
                  const pct = filteredContacts.length
                    ? Math.round((item.count / filteredContacts.length) * 100) : 0;
                  return (
                    <div key={item.stage} className="rounded-2xl border border-[#7F56D9]/15 bg-[#f8f7ff] p-3">
                      <p className="text-xs text-[#101010]/55">{item.stage}</p>
                      <p className="mt-1 text-xl font-bold">{item.count}</p>
                      <p className="text-xs text-[#101010]/45">{currency(item.value)}</p>
                      <div className="mt-2"><Bar value={pct} /></div>
                    </div>
                  );
                })}
              </div>

              {/* Contacts table */}
              <div className="overflow-x-auto">
                <table className="w-full min-w-[900px] text-left text-sm">
                  <thead>
                    <tr className="border-b border-[#7F56D9]/10 text-xs text-[#101010]/50">
                      {["Company", "Contact", "Service", "Stage", "Owner", "Value/mo", "Follow-up", "Priority", "Score", ""].map((h) => (
                        <th key={h} className="pb-3 pr-4 font-medium">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {filteredContacts.map((c) => (
                      <tr key={c.id} className="border-b border-[#7F56D9]/8 last:border-0 hover:bg-[#7F56D9]/5">
                        <td className="py-3 pr-4 font-medium">{c.company}</td>
                        <td className="py-3 pr-4">
                          <div className="font-medium">{c.contact}</div>
                          <div className="text-xs text-[#101010]/45">{c.email || "No email"}</div>
                        </td>
                        <td className="py-3 pr-4 text-[#101010]/70">{c.service}</td>
                        <td className="py-3 pr-4"><StageBadge stage={c.stage} /></td>
                        <td className="py-3 pr-4 text-[#101010]/70">{c.owner}</td>
                        <td className="py-3 pr-4 font-medium">{currency(c.monthlyValue)}</td>
                        <td className="py-3 pr-4 text-[#101010]/70">
                          {c.nextFollowUp
                            ? <span className={c.nextFollowUp < today() ? "text-red-600 font-medium" : ""}>{c.nextFollowUp}</span>
                            : "—"}
                        </td>
                        <td className="py-3 pr-4"><PriBadge priority={c.priority} /></td>
                        <td className="py-3 pr-4"><ScoreBadge score={scoreContact(c)} /></td>
                        <td className="py-3">
                          <button
                            type="button"
                            onClick={() => { setSelectedContact(c); setIsEditingLead(false); }}
                            className="rounded-xl border border-[#7F56D9]/20 bg-white px-3 py-1 text-xs font-medium text-[#7F56D9] hover:bg-[#7F56D9]/10"
                          >
                            Open
                          </button>
                        </td>
                      </tr>
                    ))}
                    {filteredContacts.length === 0 && (
                      <tr><td colSpan={10} className="py-10 text-center text-sm text-[#101010]/40">No contacts match the current filters.</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </Panel>

            <div className="space-y-5">
              {/* Follow-up queue */}
              <Panel title="Follow-up Queue">
                <div className="space-y-3">
                  {followUpQueue.map((c) => (
                    <button
                      key={c.id} type="button"
                      onClick={() => { setSelectedContact(c); setIsEditingLead(false); }}
                      className="w-full rounded-2xl border border-[#7F56D9]/15 bg-[#f8f7ff] p-3 text-left hover:border-[#7F56D9]/40 transition"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <p className="text-sm font-medium">{c.company}</p>
                          <p className="text-xs text-[#101010]/55">{c.contact} · {c.service}</p>
                        </div>
                        <PriBadge priority={c.priority} />
                      </div>
                      <div className="mt-2 flex items-center justify-between">
                        <span className={cls("text-xs", c.nextFollowUp && c.nextFollowUp < today() ? "text-red-600 font-medium" : "text-[#101010]/55")}>
                          {c.nextFollowUp || "No date"}
                        </span>
                        <StageBadge stage={c.stage} />
                      </div>
                    </button>
                  ))}
                  {followUpQueue.length === 0 && <Empty label="No pending follow-ups." />}
                </div>
              </Panel>

              {/* Service mix */}
              <Panel title="Service Mix">
                <div className="space-y-3">
                  {serviceOptions.filter((s) => s !== "All").map((service) => {
                    const count = filteredContacts.filter((c) => c.service === service).length;
                    const pct   = filteredContacts.length ? Math.round((count / filteredContacts.length) * 100) : 0;
                    return (
                      <div key={service}>
                        <div className="mb-1 flex items-center justify-between text-xs">
                          <span className="text-[#101010]/70">{service}</span>
                          <span className="font-medium">{count}</span>
                        </div>
                        <Bar value={pct} />
                      </div>
                    );
                  })}
                </div>
              </Panel>
            </div>
          </div>
        )}

        {/* ══════════════════════════════════════════════════════════════════
             CLIENTS VIEW
        ═══════════════════════════════════════════════════════════════════ */}
        {view === "clients" && (
          <Panel title="Client Portfolio">
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
              {clientPortfolio.map((c) => (
                <div key={c.id} className="rounded-3xl border border-[#7F56D9]/15 bg-[#f8f7ff] p-5 shadow-sm">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h3 className="font-semibold">{c.company}</h3>
                      <p className="text-xs text-[#101010]/55">{c.contact}</p>
                    </div>
                    <Pill tone="green">Client</Pill>
                  </div>
                  <div className="mt-4 space-y-0.5">
                    <InfoRow label="Service"    value={c.service} />
                    <InfoRow label="Value/mo"   value={currency(c.monthlyValue)} />
                    <InfoRow label="Email"       value={c.email} />
                    <InfoRow label="Phone"       value={c.phone} />
                    <InfoRow label="Owner"       value={c.owner} />
                    <InfoRow label="Next review" value={c.nextFollowUp} />
                  </div>
                  {c.notes && (
                    <div className="mt-3 rounded-2xl bg-white p-3 text-xs text-[#101010]/70">{c.notes}</div>
                  )}
                  <button
                    type="button"
                    onClick={() => { setSelectedContact(c); setIsEditingLead(false); }}
                    className="mt-3 w-full rounded-2xl border border-[#7F56D9]/20 py-2 text-xs font-medium text-[#7F56D9] hover:bg-[#7F56D9]/10 transition"
                  >
                    Open
                  </button>
                </div>
              ))}
              {clientPortfolio.length === 0 && <Empty label="No clients in this filter." />}
            </div>
          </Panel>
        )}

        {/* ══════════════════════════════════════════════════════════════════
             TASKS VIEW
        ═══════════════════════════════════════════════════════════════════ */}
        {view === "tasks" && (
          <Panel title="Task Centre">
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
              {tasks.map((t) => (
                <div key={t.id} className="rounded-3xl border border-[#7F56D9]/15 bg-[#f8f7ff] p-5 shadow-sm">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-medium">{t.title}</p>
                      <p className="mt-0.5 text-xs text-[#101010]/55">{t.type}</p>
                    </div>
                    <div className="flex flex-col items-end gap-1.5">
                      <Pill>{t.owner}</Pill>
                      <Pill tone={t.status === "Completed" ? "green" : "purple"}>{t.status}</Pill>
                    </div>
                  </div>
                  <div className="mt-4 flex items-center justify-between text-xs">
                    <span className={cls("font-medium", t.due && t.due < today() && t.status !== "Completed" ? "text-red-600" : "text-[#101010]/60")}>
                      {t.due || "No due date"}
                    </span>
                    <button
                      type="button" onClick={() => toggleTask(t.id)}
                      className="rounded-xl border border-gray-200 bg-white px-3 py-1 hover:bg-gray-50 transition"
                    >
                      Mark {t.status === "Completed" ? "Open" : "Done"}
                    </button>
                  </div>
                </div>
              ))}
              {tasks.length === 0 && <Empty label="No tasks yet. Use 'Create Task' on any lead." />}
            </div>
          </Panel>
        )}

        {/* ══════════════════════════════════════════════════════════════════
             CONTACT DETAIL MODAL
        ═══════════════════════════════════════════════════════════════════ */}
        {selectedContact && !activeAction && (
          <Overlay>
            <div className="mb-8 w-full max-w-4xl rounded-3xl bg-white p-6 shadow-2xl">
              {/* Header */}
              <div className="mb-5 flex items-start justify-between gap-4">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="text-xl font-bold">{selectedContact.company}</h2>
                    <StageBadge stage={selectedContact.stage} />
                    <PriBadge priority={selectedContact.priority} />
                    <ScoreBadge score={scoreContact(selectedContact)} />
                  </div>
                  <p className="mt-1 text-sm text-[#101010]/55">
                    {selectedContact.contact} · {selectedContact.owner} · {selectedContact.service}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => { setSelectedContact(null); setIsEditingLead(false); resetForm(); }}
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-gray-400 hover:bg-gray-100 hover:text-gray-700 transition"
                >
                  ✕
                </button>
              </div>

              {isEditingLead ? (
                /* ── Edit form ── */
                <div>
                  <LeadForm form={form} setForm={setForm} ownersList={ownersList} />
                  {syncError && <p className="mt-2 text-sm text-red-600">{syncError}</p>}
                  <div className="mt-5 flex items-center justify-between">
                    <div className="flex gap-2">
                      <Btn onClick={() => deleteLead(selectedContact)} variant="danger">Delete</Btn>
                      <Btn onClick={() => archiveLead(selectedContact)}>Archive</Btn>
                    </div>
                    <div className="flex gap-2">
                      <Btn onClick={cancelEditingLead}>Cancel</Btn>
                      <Btn onClick={updateContact} variant="primary" disabled={syncBusy}>
                        {syncBusy ? "Saving…" : "Save Changes"}
                      </Btn>
                    </div>
                  </div>
                </div>
              ) : (
                /* ── View mode ── */
                <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_1.6fr]">
                  {/* Left: info + actions */}
                  <div className="space-y-4">
                    {/* Quick actions */}
                    <div className="grid grid-cols-2 gap-2">
                      {["Call", "Email", "Proposal", "Task"].map((type) => (
                        <button
                          key={type} type="button"
                          onClick={() => openAction(type, selectedContact)}
                          className="flex items-center gap-2 rounded-2xl border border-[#7F56D9]/20 bg-[#f8f7ff] px-3 py-2 text-sm font-medium text-[#7F56D9] hover:bg-[#7F56D9]/10 transition"
                        >
                          <span>{activityIcon(type)}</span> {type}
                        </button>
                      ))}
                    </div>

                    {/* WhatsApp */}
                    {selectedContact.phone && (
                      <a
                        href={`https://wa.me/${selectedContact.phone.replace(/\D/g, "")}`}
                        target="_blank" rel="noopener noreferrer"
                        className="flex w-full items-center justify-center gap-2 rounded-2xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-700 hover:bg-emerald-100 transition"
                      >
                        <span>💬</span> WhatsApp {selectedContact.contact}
                      </a>
                    )}

                    {/* Contact info */}
                    <div className="rounded-2xl border border-[#7F56D9]/15 p-4">
                      <InfoRow label="Email"       value={selectedContact.email} />
                      <InfoRow label="Phone"       value={selectedContact.phone} />
                      <InfoRow label="Service"     value={selectedContact.service} />
                      <InfoRow label="Source"      value={selectedContact.source} />
                      <InfoRow label="Value/mo"    value={currency(selectedContact.monthlyValue)} />
                      <InfoRow label="Owner"       value={selectedContact.owner} />
                      <InfoRow label="Follow-up"   value={selectedContact.nextFollowUp} />
                      <InfoRow label="Status"      value={selectedContact.status} />
                      <InfoRow label="Lead score"  value={`${scoreContact(selectedContact)} / 100`} />
                    </div>

                    {/* Notes */}
                    {selectedContact.notes && (
                      <div className="rounded-2xl border border-amber-100 bg-amber-50 p-4 text-xs text-amber-800 leading-relaxed whitespace-pre-wrap">
                        {selectedContact.notes}
                      </div>
                    )}

                    {/* Edit button */}
                    <Btn onClick={() => startEditingLead(selectedContact)} className="w-full justify-center">
                      Edit Lead
                    </Btn>
                  </div>

                  {/* Right: activity timeline */}
                  <div>
                    <h3 className="mb-3 text-sm font-semibold text-[#101010]/60">Activity History</h3>
                    <div className="max-h-[520px] space-y-3 overflow-y-auto pr-1">
                      {contactActivities.map((a) => (
                        <div key={a.id} className="rounded-2xl border border-[#7F56D9]/10 bg-[#f8f7ff] p-4">
                          <div className="flex items-center justify-between gap-2">
                            <div className="flex items-center gap-2">
                              <span className="text-base">{activityIcon(a.type)}</span>
                              <Pill>{a.type}</Pill>
                            </div>
                            <span className="text-xs text-[#101010]/45">{a.date}</span>
                          </div>
                          <p className="mt-2 text-sm font-medium">{a.subject}</p>
                          {a.note && <p className="mt-1 text-xs text-[#101010]/60 whitespace-pre-wrap">{a.note}</p>}
                        </div>
                      ))}
                      {contactActivities.length === 0 && (
                        <p className="py-10 text-center text-sm text-[#101010]/40">No activities yet. Use the action buttons above.</p>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </Overlay>
        )}

        {/* ══════════════════════════════════════════════════════════════════
             ACTION MODAL  (Call / Email / Proposal / Task)
        ═══════════════════════════════════════════════════════════════════ */}
        {activeAction && selectedContact && (
          <ModalBox title={`${activeAction}: ${selectedContact.company}`} onClose={closeAction}>
            <div className="space-y-3">
              {/* Email template selector */}
              {activeAction === "Email" && (
                <div>
                  <label className="mb-1 block text-xs text-[#101010]/55">Template</label>
                  <select
                    defaultValue=""
                    onChange={(e) => {
                      if (!e.target.value) return;
                      const tpl = emailTemplates(selectedContact)[Number(e.target.value)];
                      if (tpl) setActionForm((f) => ({ ...f, subject: tpl.subject, note: tpl.body }));
                    }}
                    className="h-10 w-full rounded-2xl border border-[#7F56D9]/20 bg-white px-4 text-sm outline-none focus:border-[#7F56D9]"
                  >
                    <option value="">Select a template (optional)…</option>
                    {emailTemplates(selectedContact).map((t, i) => (
                      <option key={i} value={i}>{t.label}</option>
                    ))}
                  </select>
                </div>
              )}

              <TInput
                placeholder="Subject"
                value={actionForm.subject}
                onChange={(v) => setActionForm((f) => ({ ...f, subject: v }))}
              />
              <TArea
                placeholder={activeAction === "Email" ? "Email body…" : "Notes…"}
                value={actionForm.note}
                onChange={(v) => setActionForm((f) => ({ ...f, note: v }))}
                rows={activeAction === "Email" ? 6 : 3}
              />

              {activeAction === "Task" && (
                <div className="grid grid-cols-2 gap-3">
                  <TInput
                    type="date" placeholder="Due date"
                    value={actionForm.due}
                    onChange={(v) => setActionForm((f) => ({ ...f, due: v }))}
                  />
                  <Sel
                    value={actionForm.owner}
                    onChange={(v) => setActionForm((f) => ({ ...f, owner: v }))}
                    options={ownersList}
                  />
                </div>
              )}

              {syncError && <p className="text-sm text-red-600">{syncError}</p>}

              <div className="flex justify-end gap-2 pt-1">
                <Btn onClick={closeAction}>Cancel</Btn>
                <Btn onClick={submitAction} variant="primary" disabled={syncBusy}>
                  {syncBusy ? "Saving…" : `Log ${activeAction}`}
                </Btn>
              </div>
            </div>
          </ModalBox>
        )}

        {/* ══════════════════════════════════════════════════════════════════
             ADD LEAD MODAL
        ═══════════════════════════════════════════════════════════════════ */}
        {showForm && (
          <ModalBox title="Add New Lead" onClose={() => { setShowForm(false); resetForm(); }} wide>
            <LeadForm form={form} setForm={setForm} ownersList={ownersList} />
            {dupWarning && (
              <div className="mt-3 rounded-2xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-700">
                ⚠ {dupWarning}
              </div>
            )}
            {syncError && <p className="mt-2 text-sm text-red-600">{syncError}</p>}
            <div className="mt-5 flex justify-end gap-2">
              <Btn onClick={() => { setShowForm(false); resetForm(); }}>Cancel</Btn>
              <Btn
                onClick={async () => {
                  const dup = checkDuplicate(form.email.trim(), form.phone.trim());
                  if (dup && !dupWarning) { setDupWarning(dup + " Click Save again to proceed."); return; }
                  await addContact();
                }}
                variant="primary" disabled={syncBusy}
              >
                {syncBusy ? "Saving…" : "Save Lead"}
              </Btn>
            </div>
          </ModalBox>
        )}

        {/* ══════════════════════════════════════════════════════════════════
             OWNERS MODAL
        ═══════════════════════════════════════════════════════════════════ */}
        {showOwnersModal && (
          <ModalBox title="Manage Owners" onClose={closeOwnersModal}>
            <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
              {draftOwners.map((owner, i) => (
                <div key={i} className="flex items-center gap-2">
                  <TInput
                    placeholder={`Owner ${i + 1}`}
                    value={owner}
                    onChange={(v) => setDraftOwners((prev) => prev.map((o, idx) => idx === i ? v : o))}
                  />
                  <button
                    type="button"
                    onClick={() => setDraftOwners((prev) => prev.filter((_, idx) => idx !== i))}
                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-gray-400 hover:bg-red-50 hover:text-red-600 transition"
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>
            <button
              type="button"
              onClick={() => setDraftOwners((prev) => [...prev, ""])}
              className="mt-3 text-sm font-medium text-[#7F56D9] hover:underline"
            >
              + Add Owner
            </button>
            {ownersError && <p className="mt-2 text-sm text-red-600">{ownersError}</p>}
            <div className="mt-5 flex justify-end gap-2">
              <Btn onClick={closeOwnersModal}>Cancel</Btn>
              <Btn onClick={saveOwners} variant="primary" disabled={ownersSaving}>
                {ownersSaving ? "Saving…" : "Save Owners"}
              </Btn>
            </div>
          </ModalBox>
        )}

        {/* ══════════════════════════════════════════════════════════════════
             CONFIRM DIALOG
        ═══════════════════════════════════════════════════════════════════ */}
        {confirmState.open && (
          <ModalBox title={confirmState.title} onClose={closeConfirm}>
            <p className="mb-5 text-sm text-[#101010]/70">{confirmState.message}</p>
            <div className="flex justify-end gap-2">
              <Btn onClick={closeConfirm}>Cancel</Btn>
              <Btn onClick={confirmState.onConfirm} variant="danger">Confirm</Btn>
            </div>
          </ModalBox>
        )}

      </div>
    </div>
  );
}
