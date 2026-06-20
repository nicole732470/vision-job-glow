import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState, type ReactNode } from "react";
import { JOB_TOKENS_CSS, STEP_LABELS } from "../lib/job-tokens";
import { ReportResults } from "../components/ReportResults";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "JobLens — Skip bad applications" },
      {
        name: "description",
        content:
          "Paste a job link. JobLens checks visa sponsorship first, then whether the role matches your profile and resume — before you spend time applying.",
      },
      { property: "og:title", content: "JobLens — Skip bad applications" },
      {
        property: "og:description",
        content: "Sponsorship check + role match in one pass. Save time before you apply.",
      },
      { property: "og:url", content: "https://job-lens-main.lovable.app/" },
    ],
    links: [{ rel: "canonical", href: "https://job-lens-main.lovable.app/" }],
    scripts: [
      {
        type: "application/ld+json",
        children: JSON.stringify({
          "@context": "https://schema.org",
          "@type": "SoftwareApplication",
          name: "JobLens",
          applicationCategory: "BusinessApplication",
          operatingSystem: "Web",
          description:
            "Paste a job link. JobLens checks visa sponsorship, then role and resume match, so you don't waste time on the wrong application.",
          url: "https://job-lens-main.lovable.app/",
          offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
        }),
      },
    ],
  }),
  component: JobLensApp,
});

// ---------- Config ----------
const BACKEND = (import.meta.env.VITE_API_URL ?? "https://3-128-164-130.sslip.io").replace(/\/$/, "");
/** Browser uses same-origin /api proxy (HTTPS Lovable → HTTP EC2 is blocked as mixed content). */
function apiBase() {
  if (typeof window !== "undefined") return "/api";
  return BACKEND;
}
const TOKEN_KEY = "joblens_token";
const EMAIL_KEY = "joblens_email";
const SANS =
  '"Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", "Helvetica Neue", Helvetica, Arial, sans-serif';

// ---------- API ----------
function headers(token?: string | null): Record<string, string> {
  const h: Record<string, string> = { "Content-Type": "application/json" };
  if (token) h.Authorization = `Bearer ${token}`;
  return h;
}
function safeJson(t: string) {
  try {
    return JSON.parse(t);
  } catch {
    return {};
  }
}
function parseApiError(text: string, status: number): string {
  const trimmed = text.trim();
  if (
    status === 504 ||
    trimmed.startsWith("<!DOCTYPE") ||
    trimmed.startsWith("<html") ||
    /Gateway time-out/i.test(trimmed)
  ) {
    return "Server timed out — analysis is still running on our side. Wait a moment and try the manual form again.";
  }
  if (trimmed.length > 280) return `Request failed (HTTP ${status}). Please try again.`;
  return trimmed;
}

function friendlyFetchError(e: unknown): string {
  const msg = String((e as Error)?.message || e);
  if (msg === "Failed to fetch" || /NetworkError|Load failed|AbortError/i.test(msg)) {
    return "Could not reach JobLens. Paste the job in the manual form below.";
  }
  if (/504|Gateway time-out|timed out/i.test(msg)) {
    return parseApiError(msg, 504);
  }
  return msg;
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function apiJson(path: string, init: RequestInit) {
  let res: Response;
  try {
    res = await fetch(`${apiBase()}${path}`, init);
  } catch (e) {
    throw new Error(friendlyFetchError(e));
  }
  const text = await res.text();
  if (!res.ok) {
    const data = text && !text.trimStart().startsWith("<") ? safeJson(text) : {};
    throw new Error((data as { detail?: string })?.detail || parseApiError(text, res.status));
  }
  if (!text) return {};
  if (text.trimStart().startsWith("<")) {
    throw new Error(parseApiError(text, res.status));
  }
  return safeJson(text) as Record<string, unknown>;
}

// ---------- Types ----------
interface Track {
  id: string;
  label: string;
  priority: number;
  example_titles: string[];
}
interface AvoidTrack {
  id: string;
  label: string;
  example_titles: string[];
}
interface Profile {
  tracks: Track[];
  avoid_tracks: AvoidTrack[];
  locations: {
    summary: string;
    tier_1: string[];
    tier_2: string[];
    tier_3: string[];
    remote_ok?: boolean;
    relocation_ok?: boolean;
  };
  trajectory: string[];
  dealbreakers: string[];
  preferences: string[];
  technical_penalties: string[];
  alumni_schools: string[];
  constraints: { needs_sponsorship: boolean };
}
const EMPTY_PROFILE: Profile = {
  tracks: [],
  avoid_tracks: [],
  locations: { summary: "", tier_1: [], tier_2: [], tier_3: [] },
  trajectory: [],
  dealbreakers: [],
  preferences: [],
  technical_penalties: [],
  alumni_schools: [],
  constraints: { needs_sponsorship: true },
};

function normalizeProfile(raw: Record<string, unknown> | null | undefined): Profile {
  const p = raw || {};
  const loc = (p.locations as Profile["locations"]) || {};
  const constraints = (p.constraints as Profile["constraints"]) || {};
  let avoid = p.avoid_tracks;
  if (Array.isArray(avoid) && avoid.length && typeof avoid[0] === "string") {
    avoid = (avoid as string[]).map((label, i) => ({
      id: `avoid_${i}`,
      label,
      example_titles: [],
    }));
  }
  return {
    ...EMPTY_PROFILE,
    ...p,
    avoid_tracks: (avoid as AvoidTrack[]) || [],
    locations: { ...EMPTY_PROFILE.locations, ...loc },
    trajectory: Array.isArray(p.trajectory)
      ? (p.trajectory as string[])
      : p.trajectory
        ? [String(p.trajectory)]
        : [],
    preferences: Array.isArray(p.preferences)
      ? (p.preferences as string[])
      : p.preferences
        ? [String(p.preferences)]
        : [],
    constraints: {
      needs_sponsorship:
        constraints.needs_sponsorship ??
        (p as { needs_sponsorship?: boolean }).needs_sponsorship ??
        true,
    },
  };
}

interface Report {
  recommendation?: { decision?: string; reasoning?: string; fit_ratio?: number };
  sponsorship?: {
    matched?: boolean;
    company?: { name?: string };
    total_lca_count?: number;
    reason?: string;
  };
  resume_fit?: {
    available?: boolean;
    strong_matches?: unknown[];
    partial_matches?: unknown[];
    missing?: unknown[];
  };
  company?: { company_label?: string; summary?: string };
}

type View = "analyze" | "onboarding" | "profile";

// ---------- Helpers ----------
const linesToArr = (s: string) => s.split("\n").map((x) => x.trim()).filter(Boolean);
const arrToLines = (a?: string[]) => (a ?? []).join("\n");
function isProfileFilled(p: Profile | null) {
  if (!p) return false;
  return (
    (p.tracks?.length ?? 0) > 0 ||
    (p.locations?.summary?.trim().length ?? 0) > 0 ||
    (p.dealbreakers?.length ?? 0) > 0
  );
}

// ============================================================
function JobLensApp() {
  const [token, setToken] = useState<string | null>(null);
  const [email, setEmail] = useState<string | null>(null);
  const [view, setView] = useState<View>("analyze");
  const [authModal, setAuthModal] = useState<null | "login" | "register">(null);
  const [profile, setProfile] = useState<Profile | null>(null);

  // analyze state
  const [jobUrl, setJobUrl] = useState("");
  const [showManual, setShowManual] = useState(false);
  const [manualCompany, setManualCompany] = useState("");
  const [manualTitle, setManualTitle] = useState("");
  const [manualLocation, setManualLocation] = useState("");
  const [manualJd, setManualJd] = useState("");
  const [report, setReport] = useState<Report | null>(null);
  const [analyzeSteps, setAnalyzeSteps] = useState<Array<{ step: string; duration_ms?: number }>>([]);
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<{ msg: string; err: boolean } | null>(null);

  // resume
  const [resumeFile, setResumeFile] = useState<File | null>(null);
  const [resumeUploaded, setResumeUploaded] = useState(false);
  const [resumeSummary, setResumeSummary] = useState("");
  const [resumeBusy, setResumeBusy] = useState(false);

  const isLoggedIn = Boolean(token);

  useEffect(() => {
    const t = localStorage.getItem(TOKEN_KEY);
    const e = localStorage.getItem(EMAIL_KEY);
    setToken(t);
    setEmail(e);
  }, []);

  // fetch profile + resume on login
  useEffect(() => {
    if (!token) {
      setProfile(null);
      setResumeUploaded(false);
      setResumeSummary("");
      return;
    }
    (async () => {
      try {
        const p = await apiJson("/me/profile", { headers: headers(token) });
        setProfile(normalizeProfile(p));
      } catch {
        setProfile({ ...EMPTY_PROFILE });
      }
      try {
        const r = (await apiJson("/me/resume", { headers: headers(token) })) as {
          uploaded?: boolean;
          summary?: string;
        };
        setResumeUploaded(Boolean(r.uploaded));
        setResumeSummary(r.summary || "");
      } catch {
        setResumeUploaded(false);
        setResumeSummary("");
      }
    })();
  }, [token]);

  function setSession(t: string, e: string) {
    setToken(t);
    setEmail(e);
    localStorage.setItem(TOKEN_KEY, t);
    localStorage.setItem(EMAIL_KEY, e);
  }
  function logout() {
    setToken(null);
    setEmail(null);
    setProfile(null);
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(EMAIL_KEY);
    setView("analyze");
    setReport(null);
  }
  const ok = (msg = "") => setStatus(msg ? { msg, err: false } : null);
  const err = (msg: string) => setStatus({ msg, err: true });

  async function runUrlAnalyze() {
    if (!jobUrl.trim()) {
      err("Paste a job URL to start.");
      return;
    }
    setLoading(true);
    setReport(null);
    setAnalyzeSteps([]);
    ok("");
    let parsed = false;
    try {
      ok("Fetching job page…");
      const data = (await apiJson("/jobs/parse-url", {
        method: "POST",
        headers: headers(),
        body: JSON.stringify({ url: jobUrl.trim() }),
      })) as { ok?: boolean; reason?: string; jd_text?: string; company?: string; title?: string };
      if (!data.ok) {
        setShowManual(true);
        if (data.company) setManualCompany(data.company);
        if (data.title) setManualTitle(data.title);
        if (data.jd_text) setManualJd(data.jd_text);
        throw new Error(data.reason || "Couldn't read this page — paste the job below.");
      }
      const _jd = data.jd_text || "";
      const _company = data.company || "";
      const _title = data.title || "";
      if (_jd.trim().length < 80) {
        setShowManual(true);
        if (_company) setManualCompany(_company);
        if (_title) setManualTitle(_title);
        throw new Error("Job text too short — paste the full description below.");
      }
      parsed = true;
      await runAnalyzeCore(_jd, _company, _title);
    } catch (e) {
      if (!parsed) setShowManual(true);
      err(friendlyFetchError(e));
    } finally {
      setLoading(false);
    }
  }

  async function runManualAnalyze() {
    if (manualJd.trim().length < 80) {
      err("Paste at least 80 characters in the job description.");
      return;
    }
    setLoading(true);
    setReport(null);
    setAnalyzeSteps([]);
    ok("");
    try {
      await runAnalyzeCore(manualJd, manualCompany, manualTitle, manualLocation || null);
    } catch (e) {
      err(friendlyFetchError(e));
    } finally {
      setLoading(false);
    }
  }

  async function runAnalyzeCore(
    _jd: string,
    _company: string,
    _title: string,
    _jobLocation: string | null = null,
  ) {
    ok("Starting analysis…");
    const body = {
      jd_text: _jd,
      company: _company || null,
      title: _title || null,
      job_url: jobUrl || null,
      job_location: _jobLocation,
    };
    const started = (await apiJson("/analyze/async", {
      method: "POST",
      headers: headers(token),
      body: JSON.stringify(body),
    })) as { job_id?: string; status?: string };

    const jobId = started.job_id;
    if (!jobId) throw new Error("Failed to start analysis");

    const t0 = performance.now();
    for (let i = 0; i < 120; i++) {
      await sleep(1500);
      const job = (await apiJson(`/analyze/jobs/${jobId}`, { headers: headers(token) })) as {
        status?: string;
        steps?: Array<{ step: string; duration_ms?: number }>;
        report?: Report;
        error?: string;
        message?: string;
      };
      if (job.steps?.length) setAnalyzeSteps(job.steps);
      if (job.message) ok(job.message);

      if (job.status === "done" && job.report) {
        setReport(job.report);
        ok(`Done in ${((performance.now() - t0) / 1000).toFixed(1)}s`);
        return;
      }
      if (job.status === "error") {
        throw new Error(job.error || "Analysis failed");
      }
    }
    throw new Error("Analysis is taking longer than expected — check back or retry.");
  }

  async function uploadResume(file: File) {
    if (!token) return;
    setResumeBusy(true);
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch(`${apiBase()}/resume/upload`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: form,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.detail || `HTTP ${res.status}`);
      setResumeUploaded(true);
      try {
        const r = (await apiJson("/me/resume", { headers: headers(token!) })) as {
          uploaded?: boolean;
          summary?: string;
        };
        setResumeSummary(r.summary || "");
      } catch {
        /* ignore */
      }
      ok("Resume saved.");
    } catch (e) {
      err(friendlyFetchError(e));
    } finally {
      setResumeBusy(false);
    }
  }

  async function handleAuthSubmit(mode: "login" | "register", e: string, p: string) {
    const path = mode === "register" ? "/auth/register" : "/auth/login";
    const data = await apiJson(path, {
      method: "POST",
      headers: headers(),
      body: JSON.stringify({ email: e, password: p }),
    });
    setSession(data.token as string, data.email as string);
    setAuthModal(null);

    if (mode === "register") {
      setProfile({ ...EMPTY_PROFILE });
      setView("onboarding");
      return;
    }
    // login: check profile
    try {
      const prof = await apiJson("/me/profile", { headers: headers(data.token as string) });
      const merged = normalizeProfile(prof);
      setProfile(merged);
      setView(isProfileFilled(merged) ? "analyze" : "onboarding");
    } catch {
      setProfile({ ...EMPTY_PROFILE });
      setView("onboarding");
    }
  }

  async function saveProfile(p: Profile) {
    if (!token) return;
    const saved = await apiJson("/me/profile", {
      method: "PUT",
      headers: headers(token),
      body: JSON.stringify(p),
    });
    setProfile(normalizeProfile(saved));
  }

  // ---------- Render ----------
  return (
    <div className="jn-page min-h-screen" style={{ fontFamily: "var(--jn-font)", color: "var(--jn-text)", background: "var(--jn-bg-page)" }}>
      <Header
        email={email}
        isLoggedIn={isLoggedIn}
        onSignIn={() => setAuthModal("login")}
        onSignUp={() => setAuthModal("register")}
        onProfile={() => setView("profile")}
        onLogo={() => setView("analyze")}
        onLogout={logout}
      />

      <main className="tool-shell px-5 pb-20 pt-6">
        {view === "analyze" && (
          <AnalyzeView
            jobUrl={jobUrl}
            setJobUrl={setJobUrl}
            showManual={showManual}
            manualCompany={manualCompany}
            setManualCompany={setManualCompany}
            manualTitle={manualTitle}
            setManualTitle={setManualTitle}
            manualLocation={manualLocation}
            setManualLocation={setManualLocation}
            manualJd={manualJd}
            setManualJd={setManualJd}
            analyzeSteps={analyzeSteps}
            loading={loading}
            onUrlAnalyze={runUrlAnalyze}
            onManualAnalyze={runManualAnalyze}
            status={status}
            report={report}
            isLoggedIn={isLoggedIn}
          />
        )}

        {view === "onboarding" && profile && (
          <ProfileEditor
            initial={profile}
            heading="Tell us what you're looking for"
            sub="One-time setup (~3 min). We use this like your candidate profile: target roles, locations, dealbreakers, and preferences — so verdicts match your goals, not generic keywords."
            primaryLabel="Save & continue"
            isOnboarding
            resumeUploaded={resumeUploaded}
            resumeSummary={resumeSummary}
            resumeBusy={resumeBusy}
            onResumePick={(f) => {
              setResumeFile(f);
              if (f) uploadResume(f);
            }}
            onSave={async (p) => {
              await saveProfile(p);
              setView("analyze");
              ok("Profile saved.");
            }}
            onSkip={() => setView("analyze")}
          />
        )}

        {view === "profile" && (
          <ProfileEditor
            initial={profile ?? EMPTY_PROFILE}
            heading="Your profile"
            sub="Same fields as your saved candidate profile. Changes apply to the next analysis."
            primaryLabel="Save changes"
            resumeUploaded={resumeUploaded}
            resumeSummary={resumeSummary}
            resumeBusy={resumeBusy}
            onResumePick={(f) => {
              setResumeFile(f);
              if (f) uploadResume(f);
            }}
            onSave={async (p) => {
              await saveProfile(p);
              setView("analyze");
              ok("Profile updated.");
            }}
            onSkip={() => setView("analyze")}
            skipLabel="Cancel"
          />
        )}
      </main>

      {authModal && (
        <AuthModal
          mode={authModal}
          onClose={() => setAuthModal(null)}
          onSwitch={(m) => setAuthModal(m)}
          onSubmit={handleAuthSubmit}
        />
      )}

      <style>{JOB_TOKENS_CSS + `
        body { background: var(--jn-bg-page); }
        .tool-shell { max-width: 720px; margin: 0 auto; }
        .jn-brand {
          color: var(--jn-brand); font-weight: 700; letter-spacing: -0.02em;
          font-family: var(--jn-font-mono);
        }
        .jn-brand::before {
          content: "◐ "; color: var(--jn-accent); margin-right: 2px;
        }
        .tool-panel {
          background: var(--jn-bg-panel);
          border: 1px solid var(--jn-border);
          border-radius: var(--jn-radius-lg);
          box-shadow: 0 1px 0 rgba(90, 70, 30, 0.04), 0 2px 12px -8px rgba(90, 70, 30, 0.12);
          overflow: hidden;
        }
        .tool-panel-hd {
          display: flex; align-items: center; justify-content: space-between;
          padding: 11px 16px; border-bottom: 1px solid var(--jn-border);
          background: var(--jn-bg-tool);
          font-family: var(--jn-font-mono);
          font-size: 11px; font-weight: 600;
          text-transform: uppercase; letter-spacing: 0.08em;
          color: var(--jn-text-secondary);
        }
        .tool-panel-hd h1, .tool-panel-hd h2 { font: inherit; color: inherit; letter-spacing: inherit; margin: 0; }
        .tool-panel-bd { padding: 16px; }
        .tool-row { display: flex; gap: 8px; align-items: stretch; }
        .tool-status {
          margin-top: 10px; padding: 10px 12px; border-radius: var(--jn-radius);
          background: var(--jn-bg-subtle); border: 1px dashed var(--jn-border-input);
          font-family: var(--jn-font-mono); font-size: 12px; color: var(--jn-text-secondary);
        }
        .step-list { margin-top: 10px; display: flex; flex-direction: column; gap: 6px; }
        .step-line {
          display: flex; align-items: center; gap: 10px; font-size: 12px;
          font-family: var(--jn-font-mono); color: var(--jn-text-secondary);
        }
        .step-dot {
          width: 8px; height: 8px; border-radius: 50%; background: var(--jn-accent); flex-shrink: 0;
          box-shadow: 0 0 0 3px var(--jn-accent-soft);
        }
        .step-dot.pending { background: var(--jn-border-input); box-shadow: none; }
        .ninput {
          width: 100%;
          border: 1px solid var(--jn-border-input);
          background: var(--jn-bg);
          border-radius: var(--jn-radius);
          padding: 10px 12px;
          font-size: 14px;
          color: var(--jn-text);
          outline: none;
          transition: border-color .15s, box-shadow .15s;
          font-family: var(--jn-font);
        }
        .ninput::placeholder { color: var(--jn-text-faint); }
        .ninput:focus { border-color: var(--jn-brand); box-shadow: 0 0 0 3px rgba(196, 101, 74, 0.15); }
        .nbtn {
          display: inline-flex; align-items: center; justify-content: center;
          border: 1px solid var(--jn-border-input); background: var(--jn-bg); color: var(--jn-text);
          border-radius: var(--jn-radius); padding: 9px 16px;
          font-family: var(--jn-font-mono); font-size: 12px; font-weight: 600;
          letter-spacing: 0.04em; text-transform: uppercase;
          cursor: pointer; transition: background .15s, border-color .15s, transform .05s;
        }
        .nbtn:hover { background: var(--jn-bg-subtle); border-color: var(--jn-text-faint); }
        .nbtn:active { transform: translateY(1px); }
        .nbtn:disabled { opacity: .5; cursor: not-allowed; }
        .nbtn-primary {
          background: var(--jn-cta); color: #fdfaf3; border-color: var(--jn-cta);
          box-shadow: 0 1px 0 rgba(0,0,0,.08), inset 0 1px 0 rgba(255,255,255,.18);
        }
        .nbtn-primary:hover { background: var(--jn-cta-hover); border-color: var(--jn-cta-hover); }
        .nbtn-ghost { background: transparent; border-color: transparent; color: var(--jn-text-muted); }
        .nbtn-ghost:hover { background: var(--jn-bg-subtle); }
        .card { background: var(--jn-bg-panel); border: 1px solid var(--jn-border); border-radius: var(--jn-radius-lg); }
        /* Hero overrides: bigger input, sage rule */
        .tool-panel.tool-hero {
          border-color: var(--jn-border);
          background:
            radial-gradient(circle at top right, rgba(196,101,74,0.06), transparent 60%),
            var(--jn-bg-panel);
        }
        .tool-hero .tool-panel-bd { padding: 20px; }
        .tool-hero .ninput { font-size: 15px; padding: 14px 14px; }
        .tool-hero .nbtn-primary { padding: 14px 22px; }
      `}</style>
    </div>
  );
}

// ============================================================
function Header({
  email,
  isLoggedIn,
  onSignIn,
  onSignUp,
  onProfile,
  onLogo,
  onLogout,
}: {
  email: string | null;
  isLoggedIn: boolean;
  onSignIn: () => void;
  onSignUp: () => void;
  onProfile: () => void;
  onLogo: () => void;
  onLogout: () => void;
}) {
  return (
    <header className="tool-shell flex items-center justify-between px-5 pt-4 pb-2">
      <button onClick={onLogo} className="jn-brand text-[17px]">
        JobLens
      </button>
      <div className="flex items-center gap-1.5 text-sm">
        {isLoggedIn ? (
          <>
            <button className="nbtn nbtn-ghost" onClick={onProfile}>Profile</button>
            <span className="hidden sm:inline" style={{ color: "var(--jn-text-muted)" }}>·</span>
            <span className="hidden sm:inline" style={{ color: "var(--jn-text-muted)" }}>{email}</span>
            <button className="nbtn nbtn-ghost" onClick={onLogout}>Sign out</button>
          </>
        ) : (
          <>
            <button className="nbtn nbtn-ghost" onClick={onSignIn}>Sign in</button>
            <button className="nbtn nbtn-primary" onClick={onSignUp}>Sign up</button>
          </>
        )}
      </div>
    </header>
  );
}

// ============================================================
function AnalyzeView(props: {
  jobUrl: string;
  setJobUrl: (s: string) => void;
  showManual: boolean;
  manualCompany: string;
  setManualCompany: (s: string) => void;
  manualTitle: string;
  setManualTitle: (s: string) => void;
  manualLocation: string;
  setManualLocation: (s: string) => void;
  manualJd: string;
  setManualJd: (s: string) => void;
  analyzeSteps: Array<{ step: string; duration_ms?: number }>;
  loading: boolean;
  onUrlAnalyze: () => void;
  onManualAnalyze: () => void;
  status: { msg: string; err: boolean } | null;
  report: Report | null;
  isLoggedIn: boolean;
}) {
  const {
    jobUrl, setJobUrl, showManual,
    manualCompany, setManualCompany, manualTitle, setManualTitle,
    manualLocation, setManualLocation, manualJd, setManualJd,
    analyzeSteps, loading, onUrlAnalyze, onManualAnalyze, status, report,
    isLoggedIn,
  } = props;

  const pipeline = [
    "prepare",
    "sponsorship_lookup",
    "parse_jd",
    "join_prefetch",
    "react_agent",
    "fill_gaps",
    "langgraph_invoke",
  ];
  const doneSteps = new Set(analyzeSteps.map((s) => s.step));

  return (
    <div className="space-y-5">
      <div className="pt-2 pb-1">
        <div
          style={{
            fontFamily: "var(--jn-font-mono)",
            fontSize: 11,
            letterSpacing: "0.14em",
            textTransform: "uppercase",
            color: "var(--jn-accent)",
            marginBottom: 10,
          }}
        >
          // save time before you apply
        </div>
        <h1
          style={{
            fontFamily: "var(--jn-font-mono)",
            fontSize: "clamp(28px, 4.4vw, 38px)",
            lineHeight: 1.15,
            fontWeight: 700,
            letterSpacing: "-0.02em",
            color: "var(--jn-text)",
            margin: 0,
          }}
        >
          Worth applying?
          <br />
          <span style={{ color: "var(--jn-brand)" }}>Visa check + role fit.</span>
        </h1>
        <p
          style={{
            marginTop: 10,
            fontSize: 15,
            lineHeight: 1.55,
            color: "var(--jn-text-secondary)",
            maxWidth: 560,
          }}
        >
          Paste a job link. We check <strong style={{ fontWeight: 700 }}>visa sponsorship</strong> and{" "}
          <strong style={{ fontWeight: 700 }}>role fit</strong> against your profile and resume — then give you a plain verdict.
        </p>
      </div>

      <div className="tool-panel tool-hero">
        <div className="tool-panel-hd">
          <span>Check a posting</span>
        </div>
        <div className="tool-panel-bd space-y-3">
          <form onSubmit={(e) => { e.preventDefault(); onUrlAnalyze(); }} className="tool-row">
            <input
              type="url"
              value={jobUrl}
              onChange={(e) => setJobUrl(e.target.value)}
              placeholder="https://… LinkedIn, Indeed, Handshake, careers page"
              className="ninput flex-1"
            />
            <button type="submit" disabled={loading} className="nbtn nbtn-primary shrink-0">
              {loading ? "Running…" : "Analyze"}
            </button>
          </form>

          {(loading || status) && (
            <div className="tool-status">
              {status && (
                <div style={{ color: status.err ? "#b91c1c" : "var(--jn-text-muted)" }}>
                  {status.msg}
                </div>
              )}
              {loading && (
                <div className="step-list">
                  {pipeline.map((key) => {
                    const done = doneSteps.has(key);
                    const live = analyzeSteps.find((s) => s.step === key);
                    return (
                      <div key={key} className="step-line">
                        <span className={"step-dot" + (done ? "" : " pending")} />
                        <span>{STEP_LABELS[key] || key}</span>
                        {live?.duration_ms != null && (
                          <span style={{ color: "var(--jn-text-faint)" }}>{live.duration_ms}ms</span>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {showManual && (
        <div className="tool-panel">
          <div className="tool-panel-hd">Manual input</div>
          <div className="tool-panel-bd space-y-3">
            <p className="text-xs" style={{ color: "var(--jn-text-muted)" }}>
              Page couldn&apos;t be fetched — paste company, title, and full JD below.
            </p>
            <input className="ninput" placeholder="Company" value={manualCompany} onChange={(e) => setManualCompany(e.target.value)} />
            <input className="ninput" placeholder="Job title" value={manualTitle} onChange={(e) => setManualTitle(e.target.value)} />
            <input
              className="ninput"
              placeholder="Location (e.g. Chicago, IL — under title on LinkedIn)"
              value={manualLocation}
              onChange={(e) => setManualLocation(e.target.value)}
            />
            <textarea
              value={manualJd}
              onChange={(e) => setManualJd(e.target.value)}
              rows={8}
              placeholder="Job description (80+ characters)"
              className="ninput"
              style={{ fontFamily: "var(--jn-font-mono)", fontSize: 12 }}
            />
            <button type="button" disabled={loading} onClick={onManualAnalyze} className="nbtn nbtn-primary">
              {loading ? "Running…" : "Run analysis"}
            </button>
          </div>
        </div>
      )}

      {report && <ReportResults report={report as unknown as Record<string, unknown>} />}
    </div>
  );
}

// ============================================================
function AuthModal({
  mode,
  onClose,
  onSwitch,
  onSubmit,
}: {
  mode: "login" | "register";
  onClose: () => void;
  onSwitch: (m: "login" | "register") => void;
  onSubmit: (m: "login" | "register", email: string, pw: string) => Promise<void>;
}) {
  const [email, setEmail] = useState("");
  const [pw, setPw] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    setBusy(true);
    try {
      await onSubmit(mode, email, pw);
    } catch (e2) {
      setErr(String((e2 as Error).message));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-[#37352f]/40 px-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="card fadein w-full max-w-sm p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-xl font-semibold" style={{ fontFamily: "var(--jn-font-mono)", color: "var(--jn-text)" }}>
          {mode === "register" ? "Sign up" : "Sign in"}
        </h2>
        <p className="mt-1 text-sm" style={{ color: "var(--jn-text-muted)" }}>
          {mode === "register"
            ? "Next you'll set target roles, locations, and dealbreakers — plus optional resume upload."
            : "Pick up where you left off."}
        </p>
        <form onSubmit={submit} className="mt-5 space-y-3">
          <label className="block">
            <span className="mb-1 block text-sm font-medium">Email</span>
            <input
              autoFocus
              required
              type="email"
              className="ninput"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-sm font-medium">Password</span>
            <input
              required
              type="password"
              className="ninput"
              value={pw}
              onChange={(e) => setPw(e.target.value)}
              autoComplete={mode === "register" ? "new-password" : "current-password"}
            />
          </label>
          {err && <p className="text-sm text-[#8a1f1c]">{err}</p>}
          <button type="submit" disabled={busy} className="nbtn nbtn-primary w-full">
            {busy ? "…" : mode === "register" ? "Sign up" : "Sign in"}
          </button>
        </form>
        <div className="mt-4 flex items-center justify-between text-sm">
          <button
            type="button"
            className="text-[#787774] hover:text-[#37352f]"
            onClick={() => onSwitch(mode === "register" ? "login" : "register")}
          >
            {mode === "register" ? "Have an account? Sign in" : "New here? Sign up"}
          </button>
          <button type="button" className="text-[#9b9a97] hover:text-[#37352f]" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

// ============================================================
function ProfileEditor({
  initial,
  heading,
  sub,
  primaryLabel,
  onSave,
  onSkip,
  skipLabel = "Skip for now",
  isOnboarding = false,
  resumeUploaded = false,
  resumeSummary = "",
  resumeBusy = false,
  onResumePick,
}: {
  initial: Profile;
  heading: string;
  sub: string;
  primaryLabel: string;
  onSave: (p: Profile) => Promise<void>;
  onSkip: () => void;
  skipLabel?: string;
  isOnboarding?: boolean;
  resumeUploaded?: boolean;
  resumeSummary?: string;
  resumeBusy?: boolean;
  onResumePick?: (f: File) => void;
}) {
  const [tracks, setTracks] = useState<Track[]>(initial.tracks ?? []);
  const [avoid, setAvoid] = useState(
    arrToLines((initial.avoid_tracks || []).map((t) => t.label))
  );
  const [locSummary, setLocSummary] = useState(initial.locations?.summary ?? "");
  const [tier1, setTier1] = useState(arrToLines(initial.locations?.tier_1));
  const [tier2, setTier2] = useState(arrToLines(initial.locations?.tier_2));
  const [tier3, setTier3] = useState(arrToLines(initial.locations?.tier_3));
  const [trajectory, setTrajectory] = useState(arrToLines(initial.trajectory));
  const [dealbreakers, setDealbreakers] = useState(arrToLines(initial.dealbreakers));
  const [prefs, setPrefs] = useState(arrToLines(initial.preferences));
  const [penalties, setPenalties] = useState(arrToLines(initial.technical_penalties));
  const [schools, setSchools] = useState(arrToLines(initial.alumni_schools));
  const [needsSponsor, setNeedsSponsor] = useState(
    Boolean(initial.constraints?.needs_sponsorship)
  );
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  function addTrack() {
    setTracks((t) => [
      ...t,
      { id: `t_${Date.now()}`, label: "", priority: 3, example_titles: [] },
    ]);
  }
  function updateTrack(i: number, patch: Partial<Track>) {
    setTracks((t) => t.map((tr, idx) => (idx === i ? { ...tr, ...patch } : tr)));
  }
  function removeTrack(i: number) {
    setTracks((t) => t.filter((_, idx) => idx !== i));
  }

  async function handleSave() {
    setErr(null);
    setBusy(true);
    try {
      const p: Profile = {
        tracks: tracks
          .filter((t) => t.label.trim())
          .map((t) => ({
            ...t,
            label: t.label.trim(),
            id: t.id || t.label.trim().toLowerCase().replace(/\s+/g, "_"),
            priority: Math.max(1, Math.min(5, Number(t.priority) || 3)),
            example_titles: t.example_titles || [],
          })),
        avoid_tracks: linesToArr(avoid).map((label, i) => ({
          id: `avoid_${i}_${label.toLowerCase().replace(/\s+/g, "_").slice(0, 24)}`,
          label,
          example_titles: [],
        })),
        locations: {
          summary: locSummary.trim(),
          tier_1: linesToArr(tier1),
          tier_2: linesToArr(tier2),
          tier_3: linesToArr(tier3),
          remote_ok: true,
          relocation_ok: true,
        },
        trajectory: linesToArr(trajectory),
        dealbreakers: linesToArr(dealbreakers),
        preferences: linesToArr(prefs),
        technical_penalties: linesToArr(penalties),
        alumni_schools: linesToArr(schools),
        constraints: { needs_sponsorship: needsSponsor },
      };
      await onSave(p);
    } catch (e) {
      setErr(String((e as Error).message));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fadein space-y-6">
      <header>
        <h1 className="text-[28px] font-bold leading-tight" style={{ fontFamily: "var(--jn-font-mono)", color: "var(--jn-text)" }}>{heading}</h1>
        <p className="mt-1 text-sm" style={{ color: "var(--jn-text-muted)" }}>{sub}</p>
      </header>

      {onResumePick && (
        <Section title="Resume (PDF)" hint="Upload once — we compare each job's requirements to your experience.">
          <div className="flex flex-col gap-2">
            {resumeSummary && (
              <p className="text-sm leading-relaxed" style={{ color: "var(--jn-text-secondary)" }}>
                {resumeSummary}
              </p>
            )}
            <div className="flex flex-wrap items-center gap-3">
              <label className="nbtn cursor-pointer">
                {resumeBusy ? "Uploading…" : resumeUploaded ? "Replace PDF" : "Upload resume"}
                <input
                  type="file"
                  accept="application/pdf"
                  hidden
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) onResumePick(f);
                  }}
                />
              </label>
              <span className="text-xs" style={{ color: "var(--jn-text-faint)" }}>
                {resumeUploaded ? "Saved — used when scoring jobs." : "Optional; improves resume match."}
              </span>
            </div>
          </div>
        </Section>
      )}

      <Section title="Target roles (tracks)" hint="Role categories you want. Priority 1 = most wanted. Example titles help us match LinkedIn wording.">
        <div className="space-y-3">
          {tracks.length === 0 && (
            <p className="text-sm text-[#9b9a97]">No tracks yet. Add your first below.</p>
          )}
          {tracks.map((t, i) => (
            <div key={t.id || i} className="card space-y-3 p-4">
              <div className="grid gap-3 sm:grid-cols-[1fr_120px_auto]">
                <FieldInline label="Label">
                  <input
                    className="ninput"
                    placeholder="e.g. AI Engineer, Product Manager…"
                    value={t.label}
                    onChange={(e) => updateTrack(i, { label: e.target.value })}
                  />
                </FieldInline>
                <FieldInline label="Priority (1–5)">
                  <input
                    type="number"
                    min={1}
                    max={5}
                    className="ninput"
                    value={t.priority}
                    onChange={(e) => updateTrack(i, { priority: Number(e.target.value) })}
                  />
                </FieldInline>
                <div className="flex items-end">
                  <button type="button" className="nbtn nbtn-ghost" onClick={() => removeTrack(i)}>
                    Remove
                  </button>
                </div>
              </div>
              <FieldInline label="Example titles (one per line)">
                <textarea
                  rows={3}
                  className="ninput font-mono text-[13px]"
                  placeholder={"Senior AI Engineer\nML Platform Engineer\nLLM Application Engineer"}
                  value={arrToLines(t.example_titles)}
                  onChange={(e) => updateTrack(i, { example_titles: linesToArr(e.target.value) })}
                />
              </FieldInline>
            </div>
          ))}
          <button type="button" className="nbtn" onClick={addTrack}>+ Add track</button>
        </div>
      </Section>

      <Section title="Roles to avoid" hint="If a posting looks like these, we lean Skip even when keywords overlap.">
        <textarea rows={3} className="ninput font-mono text-[13px]" value={avoid} onChange={(e) => setAvoid(e.target.value)} />
      </Section>

      <Section title="Locations" hint="Summary in plain English, or tier lists: Tier 1 = want most, Tier 3 = hard no.">
        <FieldInline label="Summary">
          <input className="ninput" placeholder="e.g. Chicago preferred, remote OK" value={locSummary} onChange={(e) => setLocSummary(e.target.value)} />
        </FieldInline>
        <div className="mt-3 grid gap-3 sm:grid-cols-3">
          <FieldInline label="Tier 1 (one per line)">
            <textarea rows={4} className="ninput font-mono text-[13px]" value={tier1} onChange={(e) => setTier1(e.target.value)} />
          </FieldInline>
          <FieldInline label="Tier 2">
            <textarea rows={4} className="ninput font-mono text-[13px]" value={tier2} onChange={(e) => setTier2(e.target.value)} />
          </FieldInline>
          <FieldInline label="Tier 3">
            <textarea rows={4} className="ninput font-mono text-[13px]" value={tier3} onChange={(e) => setTier3(e.target.value)} />
          </FieldInline>
        </div>
      </Section>

      <Section title="Career trajectory" hint="One line per item — projects in progress, direction, etc.">
        <textarea rows={3} className="ninput font-mono text-[13px]" value={trajectory} onChange={(e) => setTrajectory(e.target.value)} placeholder={"Building LLM agents\nMoving into applied AI roles"} />
      </Section>

      <Section title="Dealbreakers" hint="Hard nos — any match in the JD can veto the verdict (e.g. no sponsorship stated, unpaid internship).">
        <textarea rows={3} className="ninput font-mono text-[13px]" value={dealbreakers} onChange={(e) => setDealbreakers(e.target.value)} placeholder={"no sponsorship\nstrictly onsite Bay Area"} />
      </Section>

      <Section title="Preferences" hint="Nice-to-haves — nudge the score, never a veto.">
        <textarea rows={3} className="ninput font-mono text-[13px]" value={prefs} onChange={(e) => setPrefs(e.target.value)} />
      </Section>

      <Section title="Stacks you won't do" hint="JD mentions these → role priority drops (e.g. legacy PHP, hardware-only).">
        <textarea rows={3} className="ninput font-mono text-[13px]" value={penalties} onChange={(e) => setPenalties(e.target.value)} placeholder={"PHP\nlegacy SOAP"} />
      </Section>

      <Section title="Alumni schools" hint="Schools you have ties to (one per line).">
        <textarea rows={2} className="ninput font-mono text-[13px]" value={schools} onChange={(e) => setSchools(e.target.value)} />
      </Section>

      <Section title="Visa">
        <label className="inline-flex items-center gap-2 text-sm" style={{ color: "var(--jn-text-secondary)" }}>
          <input type="checkbox" checked={needsSponsor} onChange={(e) => setNeedsSponsor(e.target.checked)} />
          I need employer visa sponsorship (used when the JD is silent or says no sponsorship)
        </label>
      </Section>

      {err && <p className="text-sm text-[#8a1f1c]">{err}</p>}

      <div className="flex flex-wrap gap-2 pt-2">
        <button className="nbtn nbtn-primary" disabled={busy} onClick={handleSave}>
          {busy ? "Saving…" : primaryLabel}
        </button>
        <button className="nbtn" onClick={onSkip}>{skipLabel}</button>
      </div>
    </div>
  );
}

function Section({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) {
  return (
    <section>
      <h2 className="text-[15px] font-semibold text-[#37352f]">{title}</h2>
      {hint && <p className="mb-3 text-xs text-[#9b9a97]">{hint}</p>}
      {!hint && <div className="mb-2" />}
      {children}
    </section>
  );
}

function FieldInline({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-[#9b9a97]">
        {label}
      </span>
      {children}
    </label>
  );
}
