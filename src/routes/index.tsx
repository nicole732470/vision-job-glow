import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState, type ReactNode } from "react";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "JobLens — See a company before you apply." },
      {
        name: "description",
        content:
          "Sign in, set preferences, paste a job URL, upload your resume, and get an Apply / Near / Consider / Skip verdict.",
      },
      { property: "og:title", content: "JobLens" },
      {
        property: "og:description",
        content: "See a company before you apply.",
      },
    ],
  }),
  component: JobLensApp,
});

const API = (import.meta.env.VITE_API_URL ?? "http://3.128.164.130:8000").replace(/\/$/, "");
const TOKEN_KEY = "joblens_token";
const EMAIL_KEY = "joblens_email";

const TRACK_OPTIONS = [
  { id: "pm_eng", label: "Product / TPM" },
  { id: "ai_eng", label: "AI Engineer" },
  { id: "data_eng", label: "Data Engineer" },
  { id: "swe", label: "Software Engineer" },
];

const STEPS = ["Account", "Preferences", "Job link", "Resume", "Results"];

// ---------- API ----------
function headers(token?: string | null): Record<string, string> {
  const h: Record<string, string> = { "Content-Type": "application/json" };
  if (token) h.Authorization = `Bearer ${token}`;
  return h;
}
async function apiJson(path: string, init: RequestInit) {
  const res = await fetch(`${API}${path}`, init);
  const text = await res.text();
  const data = text ? safeJson(text) : {};
  if (!res.ok) throw new Error((data as any)?.detail || text || `HTTP ${res.status}`);
  return data as any;
}
function safeJson(t: string) {
  try {
    return JSON.parse(t);
  } catch {
    return {};
  }
}

// ---------- Types ----------
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

function verdictStyle(d?: string): string {
  const x = (d || "").toLowerCase();
  if (x === "apply") return "bg-[#dcf5e3] text-[#1c5b2e]";
  if (x.includes("near")) return "bg-[#dbeafe] text-[#1e3a8a]";
  if (x === "consider") return "bg-[#fff3c4] text-[#7a5b00]";
  if (x === "skip") return "bg-[#fde2e1] text-[#8a1f1c]";
  return "bg-[#ececea] text-[#37352f]";
}

// ---------- Component ----------
function JobLensApp() {
  const [token, setToken] = useState<string | null>(null);
  const [email, setEmail] = useState<string | null>(null);
  const [step, setStep] = useState(0);
  const [status, setStatus] = useState("");
  const [loading, setLoading] = useState(false);
  const [isError, setIsError] = useState(false);

  // Auth
  const [authEmail, setAuthEmail] = useState("");
  const [authPassword, setAuthPassword] = useState("");

  // Profile
  const [selectedTracks, setSelectedTracks] = useState<string[]>([]);
  const [dealbreakers, setDealbreakers] = useState("");
  const [locations, setLocations] = useState("");

  // Job
  const [jobUrl, setJobUrl] = useState("");
  const [jdText, setJdText] = useState("");
  const [company, setCompany] = useState("");
  const [title, setTitle] = useState("");

  // Resume
  const [resumeFile, setResumeFile] = useState<File | null>(null);

  // Result
  const [report, setReport] = useState<Report | null>(null);

  const isLoggedIn = Boolean(token);

  useEffect(() => {
    setToken(localStorage.getItem(TOKEN_KEY));
    setEmail(localStorage.getItem(EMAIL_KEY));
  }, []);

  function setSession(t: string, e: string) {
    setToken(t);
    setEmail(e);
    localStorage.setItem(TOKEN_KEY, t);
    localStorage.setItem(EMAIL_KEY, e);
  }
  function logout() {
    setToken(null);
    setEmail(null);
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(EMAIL_KEY);
    setStep(0);
    setReport(null);
  }
  function setOk(msg = "") {
    setStatus(msg);
    setIsError(false);
  }
  function setErr(msg: string) {
    setStatus(msg);
    setIsError(true);
  }

  async function handleRegister() {
    try {
      const data = await apiJson("/auth/register", {
        method: "POST",
        headers: headers(),
        body: JSON.stringify({ email: authEmail, password: authPassword }),
      });
      setSession(data.token, data.email);
      setOk();
      setStep(1);
    } catch (e) {
      setErr(String((e as Error).message));
    }
  }
  async function handleLogin() {
    try {
      const data = await apiJson("/auth/login", {
        method: "POST",
        headers: headers(),
        body: JSON.stringify({ email: authEmail, password: authPassword }),
      });
      setSession(data.token, data.email);
      setOk();
      setStep(1);
    } catch (e) {
      setErr(String((e as Error).message));
    }
  }
  async function savePreferences() {
    if (!isLoggedIn) {
      setStep(2);
      return;
    }
    try {
      let profile: any = {};
      try {
        profile = await apiJson("/me/profile", { headers: headers(token) });
      } catch {
        profile = { tracks: [], dealbreakers: [], locations: { summary: "" } };
      }
      profile.tracks = selectedTracks.map((id) => {
        const t = TRACK_OPTIONS.find((o) => o.id === id);
        return { id, label: t?.label || id, priority: 1, example_titles: [] };
      });
      profile.dealbreakers = dealbreakers
        .split("\n")
        .map((s) => s.trim())
        .filter(Boolean);
      profile.locations = { ...(profile.locations || {}), summary: locations };
      await apiJson("/me/profile", {
        method: "PUT",
        headers: headers(token),
        body: JSON.stringify(profile),
      });
      setOk();
      setStep(2);
    } catch (e) {
      setErr(String((e as Error).message));
    }
  }
  async function fetchJob() {
    setLoading(true);
    setOk("Fetching job page…");
    try {
      const data = await apiJson("/jobs/parse-url", {
        method: "POST",
        headers: headers(),
        body: JSON.stringify({ url: jobUrl }),
      });
      if (!data.ok) {
        setErr(data.reason || "Could not parse URL");
        return;
      }
      setJdText(data.jd_text || "");
      setCompany(data.company || "");
      setTitle(data.title || "");
      setOk("Job details loaded.");
      setStep(3);
    } catch (e) {
      setErr(String((e as Error).message));
    } finally {
      setLoading(false);
    }
  }
  async function uploadResume() {
    if (!isLoggedIn || !resumeFile) {
      setStep(4);
      setOk(isLoggedIn ? "" : "Using default resume");
      return;
    }
    setLoading(true);
    setOk("Uploading resume…");
    try {
      const form = new FormData();
      form.append("file", resumeFile);
      const res = await fetch(`${API}/resume/upload`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: form,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.detail || `HTTP ${res.status}`);
      setOk("Resume saved.");
      setStep(4);
    } catch (e) {
      setErr(String((e as Error).message));
    } finally {
      setLoading(false);
    }
  }
  async function runAnalyze() {
    setLoading(true);
    setOk("Analyzing… (20–90s on free LLM)");
    setReport(null);
    const t0 = performance.now();
    try {
      const body = {
        jd_text: jdText,
        company: company || null,
        title: title || null,
        job_url: jobUrl || null,
      };
      const data = await apiJson("/analyze", {
        method: "POST",
        headers: headers(token),
        body: JSON.stringify(body),
      });
      setReport(data);
      setOk(`Done in ${((performance.now() - t0) / 1000).toFixed(1)}s`);
    } catch (e) {
      setErr(String((e as Error).message));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-white text-[#37352f]" style={{ fontFamily: notionFont }}>
      <header className="border-b border-[#ececea]">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-6 py-4">
          <div className="flex items-baseline gap-3">
            <span className="text-base font-semibold">JobLens</span>
            <span className="text-sm text-[#787774]">See a company before you apply</span>
          </div>
          {isLoggedIn && (
            <button onClick={logout} className="nbtn">
              {email} · Sign out
            </button>
          )}
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-6 py-10">
        <ol className="mb-8 flex flex-wrap gap-2 text-sm">
          {STEPS.map((s, i) => (
            <li
              key={s}
              className={
                "rounded-md px-2.5 py-1 " +
                (i === step
                  ? "bg-[#37352f] text-white"
                  : i < step
                  ? "bg-[#ececea] text-[#37352f]"
                  : "text-[#9b9a97]")
              }
            >
              {i + 1}. {s}
            </li>
          ))}
        </ol>

        <section>
          {step === 0 && (
            <Block title="Account" sub="Save your job preferences and resume across sessions.">
              <Field label="Email">
                <input
                  type="email"
                  className="ninput"
                  value={authEmail}
                  onChange={(e) => setAuthEmail(e.target.value)}
                  autoComplete="email"
                />
              </Field>
              <Field label="Password">
                <input
                  type="password"
                  className="ninput"
                  value={authPassword}
                  onChange={(e) => setAuthPassword(e.target.value)}
                  autoComplete="current-password"
                />
              </Field>
              <Row>
                <button className="nbtn nbtn-primary" onClick={handleRegister}>
                  Create account
                </button>
                <button className="nbtn" onClick={handleLogin}>
                  Sign in
                </button>
                <button className="nbtn" onClick={() => setStep(1)}>
                  Continue as guest
                </button>
              </Row>
            </Block>
          )}

          {step === 1 && (
            <Block title="Job preferences" sub="What roles and locations are you targeting?">
              <Field label="Tracks you want">
                <div className="flex flex-wrap gap-2">
                  {TRACK_OPTIONS.map((t) => {
                    const on = selectedTracks.includes(t.id);
                    return (
                      <button
                        key={t.id}
                        onClick={() =>
                          setSelectedTracks((prev) =>
                            prev.includes(t.id) ? prev.filter((x) => x !== t.id) : [...prev, t.id]
                          )
                        }
                        className={
                          "rounded-md border px-3 py-1.5 text-sm transition " +
                          (on
                            ? "border-[#37352f] bg-[#37352f] text-white"
                            : "border-[#e3e2e0] bg-white text-[#37352f] hover:bg-[#f7f7f5]")
                        }
                      >
                        {t.label}
                      </button>
                    );
                  })}
                </div>
              </Field>
              <Field label="Locations (summary)">
                <input
                  className="ninput"
                  value={locations}
                  onChange={(e) => setLocations(e.target.value)}
                  placeholder="e.g. Chicago, remote OK"
                />
              </Field>
              <Field label="Dealbreakers (one per line)">
                <textarea
                  rows={3}
                  className="ninput"
                  value={dealbreakers}
                  onChange={(e) => setDealbreakers(e.target.value)}
                  placeholder="e.g. no sponsorship, onsite only Bay Area"
                />
              </Field>
              <Row>
                <button className="nbtn" onClick={() => setStep(0)}>
                  Back
                </button>
                <button className="nbtn nbtn-primary" onClick={savePreferences}>
                  Continue
                </button>
              </Row>
            </Block>
          )}

          {step === 2 && (
            <Block title="Job posting" sub="Paste the job URL — we fetch title, company, and description.">
              <Field label="Job URL">
                <input
                  type="url"
                  className="ninput"
                  value={jobUrl}
                  onChange={(e) => setJobUrl(e.target.value)}
                  placeholder="https://boards.greenhouse.io/…"
                />
              </Field>
              <p className="-mt-2 text-sm text-[#787774]">
                LinkedIn URLs often fail server-side — paste the JD below instead.
              </p>
              <Field label="Or paste JD manually">
                <textarea
                  rows={6}
                  className="ninput font-mono text-sm"
                  value={jdText}
                  onChange={(e) => setJdText(e.target.value)}
                  placeholder="Full job description…"
                />
              </Field>
              <Row>
                <button className="nbtn" onClick={() => setStep(1)}>
                  Back
                </button>
                <button
                  className="nbtn nbtn-primary"
                  disabled={loading}
                  onClick={() => {
                    if (jdText.trim().length >= 80) {
                      setStep(3);
                      setOk();
                    } else if (jobUrl.trim()) {
                      fetchJob();
                    } else {
                      setErr("Enter a job URL or paste the JD");
                    }
                  }}
                >
                  {loading ? "Fetching…" : "Continue"}
                </button>
              </Row>
            </Block>
          )}

          {step === 3 && (
            <Block title="Resume" sub="Upload PDF for personalized fit analysis.">
              <div className="rounded-md border border-dashed border-[#e3e2e0] bg-[#fbfbfa] p-6">
                <input
                  type="file"
                  accept="application/pdf"
                  onChange={(e) => setResumeFile(e.target.files?.[0] || null)}
                  className="block w-full text-sm"
                />
                <p className="mt-2 text-sm text-[#787774]">
                  {resumeFile ? resumeFile.name : "PDF only, max 5MB"}
                </p>
              </div>
              {!isLoggedIn && (
                <p className="text-sm text-[#787774]">
                  Guests use the server default resume. Sign in to use your PDF.
                </p>
              )}
              <Row>
                <button className="nbtn" onClick={() => setStep(2)}>
                  Back
                </button>
                <button
                  className="nbtn nbtn-primary"
                  disabled={loading}
                  onClick={uploadResume}
                >
                  {loading ? "Uploading…" : "Continue"}
                </button>
              </Row>
            </Block>
          )}

          {step === 4 && (
            <Block title="Analysis" sub={`${company || "—"} · ${title || "—"}`}>
              {!report && (
                <Row>
                  <button className="nbtn" onClick={() => setStep(3)}>
                    Back
                  </button>
                  <button
                    className="nbtn nbtn-primary"
                    disabled={loading}
                    onClick={runAnalyze}
                  >
                    {loading ? "Analyzing…" : "Run analysis"}
                  </button>
                </Row>
              )}
              {report && (
                <div className="space-y-5">
                  <div>
                    <span
                      className={
                        "inline-block rounded-md px-3 py-1 text-sm font-medium " +
                        verdictStyle(report.recommendation?.decision)
                      }
                    >
                      {report.recommendation?.decision || "—"}
                    </span>
                    {report.recommendation?.reasoning && (
                      <p className="mt-3 whitespace-pre-wrap text-[15px] leading-relaxed text-[#37352f]">
                        {report.recommendation.reasoning}
                      </p>
                    )}
                  </div>
                  {report.sponsorship && (
                    <Section title="H-1B">
                      <p>
                        {report.sponsorship.matched
                          ? `${report.sponsorship.company?.name || company} · ${report.sponsorship.total_lca_count || 0} LCAs`
                          : report.sponsorship.reason || "No match"}
                      </p>
                    </Section>
                  )}
                  {report.resume_fit?.available && (
                    <Section title="Resume fit">
                      <p>
                        {report.resume_fit.strong_matches?.length || 0} strong ·{" "}
                        {report.resume_fit.partial_matches?.length || 0} partial ·{" "}
                        {report.resume_fit.missing?.length || 0} gaps
                      </p>
                    </Section>
                  )}
                  <details className="text-sm">
                    <summary className="cursor-pointer text-[#787774]">Raw JSON</summary>
                    <pre className="mt-2 max-h-96 overflow-auto rounded-md bg-[#f7f7f5] p-3 text-xs">
                      {JSON.stringify(report, null, 2)}
                    </pre>
                  </details>
                  <Row>
                    <button
                      className="nbtn"
                      onClick={() => {
                        setReport(null);
                        setStep(2);
                      }}
                    >
                      Analyze another
                    </button>
                  </Row>
                </div>
              )}
            </Block>
          )}

          {status && (
            <p
              className={
                "mt-4 text-sm " + (isError ? "text-[#8a1f1c]" : "text-[#787774]")
              }
            >
              {status}
            </p>
          )}
        </section>
      </main>

      <footer className="mx-auto max-w-3xl px-6 pb-10 text-xs text-[#9b9a97]">
        API: {API}
      </footer>

      <style>{`
        .ninput {
          width: 100%;
          border: 1px solid #e3e2e0;
          background: #fbfbfa;
          border-radius: 6px;
          padding: 8px 10px;
          font-size: 14px;
          color: #37352f;
          outline: none;
          transition: background 120ms, border-color 120ms;
        }
        .ninput:focus {
          background: #fff;
          border-color: #b9b9b6;
          box-shadow: 0 0 0 3px rgba(35,131,226,0.18);
          border-color: #2383e2;
        }
        .nbtn {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          border: 1px solid #e3e2e0;
          background: #fff;
          color: #37352f;
          border-radius: 6px;
          padding: 6px 12px;
          font-size: 14px;
          line-height: 1.2;
          cursor: pointer;
          transition: background 120ms;
        }
        .nbtn:hover { background: #f7f7f5; }
        .nbtn:disabled { opacity: .55; cursor: not-allowed; }
        .nbtn-primary {
          background: #37352f;
          color: #fff;
          border-color: #37352f;
        }
        .nbtn-primary:hover { background: #2f2d28; }
      `}</style>
    </div>
  );
}

const notionFont =
  '-apple-system, BlinkMacSystemFont, "Segoe UI", "Helvetica Neue", Helvetica, Arial, sans-serif';

function Block({
  title,
  sub,
  children,
}: {
  title: string;
  sub?: string;
  children: ReactNode;
}) {
  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-[28px] font-bold leading-tight text-[#37352f]">{title}</h1>
        {sub && <p className="mt-1 text-sm text-[#787774]">{sub}</p>}
      </div>
      <div className="space-y-4">{children}</div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm font-medium text-[#37352f]">{label}</span>
      {children}
    </label>
  );
}

function Row({ children }: { children: ReactNode }) {
  return <div className="flex flex-wrap gap-2 pt-2">{children}</div>;
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="border-t border-[#ececea] pt-4">
      <h3 className="mb-1.5 text-sm font-semibold uppercase tracking-wide text-[#787774]">
        {title}
      </h3>
      <div className="text-[15px] text-[#37352f]">{children}</div>
    </div>
  );
}
