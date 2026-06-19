import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState, type ReactNode } from "react";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "JobLens — See a company before you apply." },
      {
        name: "description",
        content:
          "Paste a job link and get an evidence-based Apply / Near / Consider / Skip verdict.",
      },
      { property: "og:title", content: "JobLens" },
      { property: "og:description", content: "See a company before you apply." },
    ],
  }),
  component: JobLensApp,
});

// ---------- Config ----------
const API = (import.meta.env.VITE_API_URL ?? "http://3.128.164.130:8000").replace(/\/$/, "");
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
async function apiJson(path: string, init: RequestInit) {
  const res = await fetch(`${API}${path}`, init);
  const text = await res.text();
  const data = text ? (safeJson(text) as any) : {};
  if (!res.ok) throw new Error(data?.detail || text || `HTTP ${res.status}`);
  return data;
}

// ---------- Types ----------
interface Track {
  id: string;
  label: string;
  priority: number;
  example_titles: string[];
}
interface Profile {
  tracks: Track[];
  avoid_tracks: string[];
  locations: { summary: string; tier_1: string[]; tier_2: string[]; tier_3: string[] };
  trajectory: string;
  dealbreakers: string[];
  preferences: string;
  technical_penalties: string[];
  alumni_schools: string[];
  needs_sponsorship: boolean;
}
const EMPTY_PROFILE: Profile = {
  tracks: [],
  avoid_tracks: [],
  locations: { summary: "", tier_1: [], tier_2: [], tier_3: [] },
  trajectory: "",
  dealbreakers: [],
  preferences: "",
  technical_penalties: [],
  alumni_schools: [],
  needs_sponsorship: false,
};

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

function verdictStyle(d?: string): string {
  const x = (d || "").toLowerCase();
  if (x === "apply") return "bg-[#d8f1de] text-[#1c5b2e] ring-1 ring-[#bfe3c9]";
  if (x.includes("near")) return "bg-[#dbeafe] text-[#1e3a8a] ring-1 ring-[#c7daf6]";
  if (x === "consider") return "bg-[#fff1c2] text-[#7a5b00] ring-1 ring-[#f3e2a0]";
  if (x === "skip") return "bg-[#fde1df] text-[#8a1f1c] ring-1 ring-[#f3c8c5]";
  return "bg-[#ececea] text-[#37352f]";
}

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
  const [jdText, setJdText] = useState("");
  const [showPaste, setShowPaste] = useState(false);
  const [company, setCompany] = useState("");
  const [title, setTitle] = useState("");
  const [report, setReport] = useState<Report | null>(null);
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<{ msg: string; err: boolean } | null>(null);

  // resume
  const [resumeFile, setResumeFile] = useState<File | null>(null);
  const [resumeUploaded, setResumeUploaded] = useState(false);
  const [resumeBusy, setResumeBusy] = useState(false);

  const isLoggedIn = Boolean(token);

  useEffect(() => {
    const t = localStorage.getItem(TOKEN_KEY);
    const e = localStorage.getItem(EMAIL_KEY);
    setToken(t);
    setEmail(e);
  }, []);

  // fetch profile on login
  useEffect(() => {
    if (!token) {
      setProfile(null);
      return;
    }
    (async () => {
      try {
        const p = await apiJson("/me/profile", { headers: headers(token) });
        const merged: Profile = { ...EMPTY_PROFILE, ...p, locations: { ...EMPTY_PROFILE.locations, ...(p?.locations || {}) } };
        setProfile(merged);
      } catch {
        setProfile({ ...EMPTY_PROFILE });
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

  async function runAnalyze() {
    if (!jobUrl.trim() && jdText.trim().length < 80) {
      err("Paste a job URL or at least 80 characters of the JD.");
      return;
    }
    setLoading(true);
    setReport(null);
    ok("");
    try {
      let _jd = jdText;
      let _company = company;
      let _title = title;

      if (jobUrl.trim() && _jd.trim().length < 80) {
        ok("Fetching job page…");
        const data = await apiJson("/jobs/parse-url", {
          method: "POST",
          headers: headers(),
          body: JSON.stringify({ url: jobUrl.trim() }),
        });
        if (!data.ok) throw new Error(data.reason || "Could not parse URL");
        _jd = data.jd_text || "";
        _company = data.company || "";
        _title = data.title || "";
        setJdText(_jd);
        setCompany(_company);
        setTitle(_title);
      }

      ok("Analyzing… (20–90s on free LLM)");
      const t0 = performance.now();
      const body = {
        jd_text: _jd,
        company: _company || null,
        title: _title || null,
        job_url: jobUrl || null,
      };
      const r = await apiJson("/analyze", {
        method: "POST",
        headers: headers(token),
        body: JSON.stringify(body),
      });
      setReport(r);
      ok(`Done in ${((performance.now() - t0) / 1000).toFixed(1)}s`);
    } catch (e) {
      err(String((e as Error).message));
    } finally {
      setLoading(false);
    }
  }

  async function uploadResume(file: File) {
    if (!token) return;
    setResumeBusy(true);
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch(`${API}/resume/upload`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: form,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.detail || `HTTP ${res.status}`);
      setResumeUploaded(true);
      ok("Resume saved.");
    } catch (e) {
      err(String((e as Error).message));
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
    setSession(data.token, data.email);
    setAuthModal(null);

    if (mode === "register") {
      setProfile({ ...EMPTY_PROFILE });
      setView("onboarding");
      return;
    }
    // login: check profile
    try {
      const prof = await apiJson("/me/profile", { headers: headers(data.token) });
      const merged: Profile = { ...EMPTY_PROFILE, ...prof, locations: { ...EMPTY_PROFILE.locations, ...(prof?.locations || {}) } };
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
    const merged: Profile = { ...EMPTY_PROFILE, ...saved, locations: { ...EMPTY_PROFILE.locations, ...(saved?.locations || {}) } };
    setProfile(merged);
  }

  // ---------- Render ----------
  return (
    <div
      className="min-h-screen text-[#37352f]"
      style={{
        fontFamily: SANS,
        background:
          "radial-gradient(1200px 600px at 20% -10%, #fef3e0 0%, transparent 60%), radial-gradient(900px 500px at 100% 10%, #f0eaff 0%, transparent 55%), linear-gradient(180deg, #fbf9f5 0%, #f7f5f0 100%)",
      }}
    >
      <Header
        email={email}
        isLoggedIn={isLoggedIn}
        onSignIn={() => setAuthModal("login")}
        onSignUp={() => setAuthModal("register")}
        onProfile={() => setView("profile")}
        onLogo={() => setView("analyze")}
        onLogout={logout}
      />

      <main className="mx-auto w-full max-w-3xl px-5 pb-24 pt-10 sm:pt-16">
        {view === "analyze" && (
          <AnalyzeView
            jobUrl={jobUrl}
            setJobUrl={setJobUrl}
            jdText={jdText}
            setJdText={setJdText}
            showPaste={showPaste}
            setShowPaste={setShowPaste}
            loading={loading}
            onAnalyze={runAnalyze}
            status={status}
            report={report}
            company={company}
            title={title}
            isLoggedIn={isLoggedIn}
            resumeFile={resumeFile}
            setResumeFile={(f) => {
              setResumeFile(f);
              if (f) uploadResume(f);
            }}
            resumeUploaded={resumeUploaded}
            resumeBusy={resumeBusy}
          />
        )}

        {view === "onboarding" && profile && (
          <ProfileEditor
            initial={profile}
            heading="Set up your JobLens profile"
            sub="A one-time setup so verdicts match what you actually care about. Edit anytime from the header."
            primaryLabel="Save and continue"
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
            sub="JobLens uses this to weight the verdict and explain its reasoning."
            primaryLabel="Save changes"
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

      <style>{`
        .ninput {
          width: 100%;
          border: 1px solid #e6e3dc;
          background: #ffffff;
          border-radius: 8px;
          padding: 9px 12px;
          font-size: 14px;
          color: #37352f;
          outline: none;
          transition: box-shadow 120ms, border-color 120ms, background 120ms;
        }
        .ninput:focus {
          border-color: #2383e2;
          box-shadow: 0 0 0 3px rgba(35,131,226,0.18);
        }
        .nbtn {
          display: inline-flex; align-items: center; justify-content: center;
          border: 1px solid #e6e3dc; background: #ffffff; color: #37352f;
          border-radius: 8px; padding: 7px 14px; font-size: 14px; line-height: 1.2;
          cursor: pointer; transition: background 120ms, transform 120ms, box-shadow 120ms;
        }
        .nbtn:hover { background: #f5f3ee; }
        .nbtn:active { transform: translateY(1px); }
        .nbtn:disabled { opacity: .55; cursor: not-allowed; }
        .nbtn-primary {
          background: #37352f; color: #fff; border-color: #37352f;
          box-shadow: 0 1px 2px rgba(15,15,15,.12);
        }
        .nbtn-primary:hover { background: #2f2d28; }
        .nbtn-ghost { background: transparent; border-color: transparent; color: #6f6c66; }
        .nbtn-ghost:hover { background: rgba(55,53,47,.06); }
        .card {
          background: #ffffff;
          border: 1px solid #ece9e1;
          border-radius: 14px;
          box-shadow: 0 1px 2px rgba(15,15,15,.04), 0 8px 24px -12px rgba(15,15,15,.08);
        }
        .fadein { animation: fadein .35s ease both; }
        @keyframes fadein { from { opacity: 0; transform: translateY(6px);} to { opacity: 1; transform: none; } }
        .heroBar {
          background: #ffffff;
          border: 1px solid #ece9e1;
          border-radius: 16px;
          box-shadow: 0 1px 2px rgba(15,15,15,.04), 0 18px 40px -20px rgba(15,15,15,.18);
          transition: box-shadow 200ms, border-color 200ms;
        }
        .heroBar:focus-within {
          border-color: #cfc9bd;
          box-shadow: 0 1px 2px rgba(15,15,15,.06), 0 22px 50px -18px rgba(15,15,15,.22);
        }
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
    <header className="mx-auto flex w-full max-w-5xl items-center justify-between px-5 pt-5">
      <button onClick={onLogo} className="text-[17px] font-semibold tracking-tight text-[#37352f]">
        JobLens
      </button>
      <div className="flex items-center gap-1.5 text-sm">
        {isLoggedIn ? (
          <>
            <button className="nbtn nbtn-ghost" onClick={onProfile}>Profile</button>
            <span className="hidden text-[#9b9a97] sm:inline">·</span>
            <span className="hidden text-[#787774] sm:inline">{email}</span>
            <button className="nbtn nbtn-ghost" onClick={onLogout}>Sign out</button>
          </>
        ) : (
          <>
            <button className="nbtn nbtn-ghost" onClick={onSignIn}>Sign in</button>
            <button className="nbtn nbtn-primary" onClick={onSignUp}>Create account</button>
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
  jdText: string;
  setJdText: (s: string) => void;
  showPaste: boolean;
  setShowPaste: (b: boolean) => void;
  loading: boolean;
  onAnalyze: () => void;
  status: { msg: string; err: boolean } | null;
  report: Report | null;
  company: string;
  title: string;
  isLoggedIn: boolean;
  resumeFile: File | null;
  setResumeFile: (f: File | null) => void;
  resumeUploaded: boolean;
  resumeBusy: boolean;
}) {
  const {
    jobUrl, setJobUrl, jdText, setJdText, showPaste, setShowPaste,
    loading, onAnalyze, status, report, company, title,
    isLoggedIn, resumeFile, setResumeFile, resumeUploaded, resumeBusy,
  } = props;

  return (
    <div className="space-y-10">
      <section className="fadein space-y-6 text-center">
        <div>
          <h1 className="text-[34px] font-bold leading-tight tracking-tight text-[#37352f] sm:text-[44px]">
            See a company before you apply.
          </h1>
          <p className="mx-auto mt-3 max-w-xl text-[15px] text-[#6f6c66]">
            Paste a job link. JobLens reads the posting, checks H-1B history, and tells you whether to apply.
          </p>
        </div>

        <form
          onSubmit={(e) => { e.preventDefault(); onAnalyze(); }}
          className="heroBar mx-auto flex w-full items-center gap-2 px-2 py-2 sm:gap-3"
        >
          <input
            type="url"
            value={jobUrl}
            onChange={(e) => setJobUrl(e.target.value)}
            placeholder="Paste a job URL — Greenhouse, Lever, Ashby…"
            className="flex-1 bg-transparent px-3 py-2 text-[15px] text-[#37352f] outline-none placeholder:text-[#9b9a97]"
          />
          <button
            type="submit"
            disabled={loading}
            className="nbtn nbtn-primary !px-4 !py-2"
          >
            {loading ? "Working…" : "Analyze"}
          </button>
        </form>

        <div className="text-sm">
          <button
            type="button"
            onClick={() => setShowPaste(!showPaste)}
            className="text-[#787774] underline-offset-4 hover:underline"
          >
            {showPaste ? "Hide JD paste box" : "LinkedIn or blocked? Paste the JD instead"}
          </button>
        </div>

        {showPaste && (
          <textarea
            value={jdText}
            onChange={(e) => setJdText(e.target.value)}
            rows={8}
            placeholder="Paste the full job description…"
            className="ninput fadein mx-auto block max-w-2xl text-left font-mono text-[13px]"
          />
        )}

        {status && (
          <p className={"text-sm " + (status.err ? "text-[#8a1f1c]" : "text-[#787774]")}>
            {status.msg}
          </p>
        )}
      </section>

      {isLoggedIn && (
        <section className="card fadein mx-auto max-w-2xl p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="text-sm font-semibold text-[#37352f]">Resume (optional)</h3>
              <p className="text-xs text-[#787774]">
                {resumeUploaded ? "Saved. Will be used for personalized fit." : "PDF only. Used to score your fit per role."}
              </p>
            </div>
            <label className="nbtn cursor-pointer">
              {resumeBusy ? "Uploading…" : resumeFile ? "Replace PDF" : "Upload PDF"}
              <input
                type="file"
                accept="application/pdf"
                hidden
                onChange={(e) => setResumeFile(e.target.files?.[0] || null)}
              />
            </label>
          </div>
          {resumeFile && (
            <p className="mt-2 text-xs text-[#787774]">{resumeFile.name}</p>
          )}
        </section>
      )}

      {report && (
        <section className="fadein space-y-5">
          <div className="card p-6">
            <div className="flex flex-wrap items-center gap-3">
              <span
                className={
                  "inline-flex items-center rounded-full px-3.5 py-1 text-sm font-semibold " +
                  verdictStyle(report.recommendation?.decision)
                }
              >
                {report.recommendation?.decision || "—"}
              </span>
              {(company || title) && (
                <span className="text-sm text-[#787774]">
                  {company || "—"} · {title || "—"}
                </span>
              )}
              {typeof report.recommendation?.fit_ratio === "number" && (
                <span className="text-sm text-[#787774]">
                  Fit{" "}
                  <strong className="text-[#37352f]">
                    {Math.round(
                      (report.recommendation.fit_ratio <= 1
                        ? report.recommendation.fit_ratio * 100
                        : report.recommendation.fit_ratio)
                    )}
                    %
                  </strong>
                </span>
              )}
            </div>
            {report.recommendation?.reasoning && (
              <p className="mt-4 whitespace-pre-wrap text-[15px] leading-relaxed text-[#37352f]">
                {report.recommendation.reasoning}
              </p>
            )}
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            {report.sponsorship && (
              <ResultCard title="H-1B sponsorship">
                {report.sponsorship.matched ? (
                  <p>
                    <strong>{report.sponsorship.company?.name || company || "Match"}</strong>
                    {" · "}
                    {report.sponsorship.total_lca_count ?? 0} LCAs
                  </p>
                ) : (
                  <p className="text-[#6f6c66]">{report.sponsorship.reason || "No match."}</p>
                )}
              </ResultCard>
            )}
            {report.resume_fit?.available && (
              <ResultCard title="Resume fit">
                <p>
                  <strong>{report.resume_fit.strong_matches?.length ?? 0}</strong> strong ·{" "}
                  <strong>{report.resume_fit.partial_matches?.length ?? 0}</strong> partial ·{" "}
                  <strong>{report.resume_fit.missing?.length ?? 0}</strong> gaps
                </p>
              </ResultCard>
            )}
            {report.company && (
              <ResultCard title="Company">
                {report.company.company_label && (
                  <p className="mb-1"><strong>{report.company.company_label}</strong></p>
                )}
                {report.company.summary && (
                  <p className="text-[#6f6c66]">{report.company.summary}</p>
                )}
              </ResultCard>
            )}
          </div>

          <details className="text-sm text-[#787774]">
            <summary className="cursor-pointer">Raw JSON</summary>
            <pre className="mt-2 max-h-96 overflow-auto rounded-lg bg-[#fbfaf6] p-3 text-xs text-[#37352f] ring-1 ring-[#ece9e1]">
              {JSON.stringify(report, null, 2)}
            </pre>
          </details>
        </section>
      )}
    </div>
  );
}

function ResultCard({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="card p-5">
      <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-[#9b9a97]">{title}</h3>
      <div className="text-[14px] text-[#37352f]">{children}</div>
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
        <h2 className="text-xl font-semibold">
          {mode === "register" ? "Create your account" : "Welcome back"}
        </h2>
        <p className="mt-1 text-sm text-[#787774]">
          {mode === "register"
            ? "Save your preferences and resume across sessions."
            : "Sign in to keep your profile and resume in sync."}
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
            {busy ? "…" : mode === "register" ? "Create account" : "Sign in"}
          </button>
        </form>
        <div className="mt-4 flex items-center justify-between text-sm">
          <button
            type="button"
            className="text-[#787774] hover:text-[#37352f]"
            onClick={() => onSwitch(mode === "register" ? "login" : "register")}
          >
            {mode === "register" ? "Have an account? Sign in" : "New here? Create account"}
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
}: {
  initial: Profile;
  heading: string;
  sub: string;
  primaryLabel: string;
  onSave: (p: Profile) => Promise<void>;
  onSkip: () => void;
  skipLabel?: string;
}) {
  const [tracks, setTracks] = useState<Track[]>(initial.tracks ?? []);
  const [avoid, setAvoid] = useState(arrToLines(initial.avoid_tracks));
  const [locSummary, setLocSummary] = useState(initial.locations?.summary ?? "");
  const [tier1, setTier1] = useState(arrToLines(initial.locations?.tier_1));
  const [tier2, setTier2] = useState(arrToLines(initial.locations?.tier_2));
  const [tier3, setTier3] = useState(arrToLines(initial.locations?.tier_3));
  const [trajectory, setTrajectory] = useState(initial.trajectory ?? "");
  const [dealbreakers, setDealbreakers] = useState(arrToLines(initial.dealbreakers));
  const [prefs, setPrefs] = useState(initial.preferences ?? "");
  const [penalties, setPenalties] = useState(arrToLines(initial.technical_penalties));
  const [schools, setSchools] = useState(arrToLines(initial.alumni_schools));
  const [needsSponsor, setNeedsSponsor] = useState(Boolean(initial.needs_sponsorship));
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
          })),
        avoid_tracks: linesToArr(avoid),
        locations: {
          summary: locSummary.trim(),
          tier_1: linesToArr(tier1),
          tier_2: linesToArr(tier2),
          tier_3: linesToArr(tier3),
        },
        trajectory: trajectory.trim(),
        dealbreakers: linesToArr(dealbreakers),
        preferences: prefs.trim(),
        technical_penalties: linesToArr(penalties),
        alumni_schools: linesToArr(schools),
        needs_sponsorship: needsSponsor,
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
        <h1 className="text-[28px] font-bold leading-tight">{heading}</h1>
        <p className="mt-1 text-sm text-[#787774]">{sub}</p>
      </header>

      <Section title="Tracks you want" hint="Add the kinds of roles you're targeting. Priority 1 = highest.">
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

      <Section title="Avoid tracks" hint="Roles you don't want, one per line.">
        <textarea rows={3} className="ninput font-mono text-[13px]" value={avoid} onChange={(e) => setAvoid(e.target.value)} />
      </Section>

      <Section title="Locations">
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

      <Section title="Career trajectory" hint="A sentence or two on where you're going.">
        <textarea rows={3} className="ninput" value={trajectory} onChange={(e) => setTrajectory(e.target.value)} placeholder="e.g. moving from data engineering into applied AI / LLM systems" />
      </Section>

      <Section title="Dealbreakers" hint="Hard nos, one per line.">
        <textarea rows={3} className="ninput font-mono text-[13px]" value={dealbreakers} onChange={(e) => setDealbreakers(e.target.value)} placeholder={"no sponsorship\nstrictly onsite Bay Area"} />
      </Section>

      <Section title="Preferences" hint="Free-form. Company size, culture, comp expectations, etc.">
        <textarea rows={3} className="ninput" value={prefs} onChange={(e) => setPrefs(e.target.value)} />
      </Section>

      <Section title="Technical penalties" hint="Stacks/tools that count against a posting (one per line).">
        <textarea rows={3} className="ninput font-mono text-[13px]" value={penalties} onChange={(e) => setPenalties(e.target.value)} placeholder={"PHP\nlegacy SOAP"} />
      </Section>

      <Section title="Alumni schools" hint="Schools you have ties to (one per line).">
        <textarea rows={2} className="ninput font-mono text-[13px]" value={schools} onChange={(e) => setSchools(e.target.value)} />
      </Section>

      <Section title="Sponsorship">
        <label className="inline-flex items-center gap-2 text-sm">
          <input type="checkbox" checked={needsSponsor} onChange={(e) => setNeedsSponsor(e.target.checked)} />
          I need H-1B / visa sponsorship
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
