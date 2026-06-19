import { createFileRoute } from "@tanstack/react-router";
import { useState, type FormEvent } from "react";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "JobLens — See a company before you apply." },
      {
        name: "description",
        content:
          "Paste a job description and get an evidence-based Apply / Near apply / Consider / Skip verdict.",
      },
      { property: "og:title", content: "JobLens — See a company before you apply." },
      {
        property: "og:description",
        content:
          "Paste a job description and get an evidence-based Apply / Near apply / Consider / Skip verdict.",
      },
    ],
  }),
  component: AnalyzePage,
});

const API_URL = import.meta.env.VITE_API_URL ?? "http://3.128.164.130:8000";

type Decision = "Apply" | "Near apply" | "Consider" | "Skip" | string;

interface AnalyzeResponse {
  recommendation?: {
    decision?: Decision;
    reasoning?: string;
    fit_ratio?: number;
  };
  sponsorship?: {
    matched?: boolean;
    company?: { name?: string };
    total_lca_count?: number;
  };
  company?: {
    company_label?: string;
    summary?: string;
  };
  resume_fit?: {
    strong_matches?: unknown[];
    partial_matches?: unknown[];
    missing?: unknown[];
    match_method?: string;
  };
}

function decisionStyles(decision?: Decision): string {
  switch (decision) {
    case "Apply":
      return "bg-emerald-500 text-white";
    case "Near apply":
      return "bg-cyan-500 text-white";
    case "Consider":
      return "bg-amber-500 text-white";
    case "Skip":
      return "bg-rose-500 text-white";
    default:
      return "bg-slate-500 text-white";
  }
}

function AnalyzePage() {
  const [company, setCompany] = useState("");
  const [title, setTitle] = useState("");
  const [jd, setJd] = useState("");
  const [resume, setResume] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<AnalyzeResponse | null>(null);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setResult(null);
    if (!jd.trim()) {
      setError("Job description is required.");
      return;
    }
    setLoading(true);
    try {
      const body: Record<string, unknown> = {
        jd_text: jd.trim(),
        company: company.trim() || null,
        title: title.trim() || null,
      };
      if (resume.trim()) body.resume_text = resume.trim();

      const res = await fetch(`${API_URL}/analyze`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        throw new Error(`Server responded ${res.status}`);
      }
      const data = (await res.json()) as AnalyzeResponse;
      setResult(data);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      setError(
        `Couldn't reach the analyzer (${msg}). If you're on https, mixed-content rules may block the http API — try locally.`,
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <header className="bg-slate-900 text-slate-50">
        <div className="mx-auto flex max-w-5xl items-center gap-3 px-6 py-5">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-cyan-500 font-bold text-slate-900">
            JL
          </div>
          <div>
            <h1 className="text-lg font-semibold leading-tight">JobLens</h1>
            <p className="text-xs text-slate-300">See a company before you apply.</p>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-6 py-8">
        <section className="rounded-xl bg-white p-6 shadow-sm ring-1 ring-slate-200">
          <h2 className="text-xl font-semibold">Analyze a job</h2>
          <p className="mt-1 text-sm text-slate-600">
            Paste a job description. Get a verdict, fit grid, and reasoning.
          </p>

          <form onSubmit={onSubmit} className="mt-6 grid gap-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Company">
                <input
                  type="text"
                  value={company}
                  onChange={(e) => setCompany(e.target.value)}
                  placeholder="Acme Corp"
                  className="input"
                />
              </Field>
              <Field label="Job title">
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Senior Software Engineer"
                  className="input"
                />
              </Field>
            </div>

            <Field label="Job description" required>
              <textarea
                value={jd}
                onChange={(e) => setJd(e.target.value)}
                rows={10}
                required
                placeholder="Paste the full JD here…"
                className="input font-mono text-sm"
              />
            </Field>

            <Field label="Resume (optional — server uses default if empty)">
              <textarea
                value={resume}
                onChange={(e) => setResume(e.target.value)}
                rows={6}
                placeholder="Paste resume text, or leave empty…"
                className="input font-mono text-sm"
              />
            </Field>

            <div className="flex items-center gap-3">
              <button
                type="submit"
                disabled={loading}
                className="inline-flex items-center justify-center rounded-md bg-cyan-500 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-cyan-600 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {loading ? "Analyzing… (20–90s)" : "Analyze"}
              </button>
              {loading && (
                <span className="text-sm text-slate-500">
                  Free LLM tier can take a bit — hang tight.
                </span>
              )}
            </div>
          </form>

          {error && (
            <div className="mt-4 rounded-md border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">
              {error}
            </div>
          )}
        </section>

        {result && <Results data={result} />}
      </main>

      <style>{`
        .input {
          width: 100%;
          border-radius: 0.5rem;
          border: 1px solid rgb(203 213 225);
          background: white;
          padding: 0.625rem 0.75rem;
          font-size: 0.875rem;
          color: rgb(15 23 42);
          outline: none;
        }
        .input:focus {
          border-color: rgb(14 165 233);
          box-shadow: 0 0 0 3px rgba(14, 165, 233, 0.2);
        }
      `}</style>
    </div>
  );
}

function Field({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-medium text-slate-700">
        {label}
        {required && <span className="ml-0.5 text-rose-500">*</span>}
      </span>
      {children}
    </label>
  );
}

function Results({ data }: { data: AnalyzeResponse }) {
  const rec = data.recommendation ?? {};
  const sp = data.sponsorship;
  const co = data.company;
  const rf = data.resume_fit;
  const fitPct =
    typeof rec.fit_ratio === "number"
      ? `${Math.round((rec.fit_ratio <= 1 ? rec.fit_ratio * 100 : rec.fit_ratio))}%`
      : null;

  return (
    <section className="mt-8 grid gap-4">
      <div className="rounded-xl bg-white p-6 shadow-sm ring-1 ring-slate-200">
        <div className="flex flex-wrap items-center gap-3">
          <span
            className={`inline-flex items-center rounded-full px-4 py-1.5 text-sm font-semibold ${decisionStyles(
              rec.decision,
            )}`}
          >
            {rec.decision ?? "No decision"}
          </span>
          {fitPct && (
            <span className="text-sm text-slate-600">
              Fit ratio: <strong className="text-slate-900">{fitPct}</strong>
            </span>
          )}
        </div>
        {rec.reasoning && (
          <p className="mt-4 whitespace-pre-wrap text-sm leading-relaxed text-slate-700">
            {rec.reasoning}
          </p>
        )}
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card title="H-1B sponsorship">
          {sp ? (
            <ul className="space-y-1 text-sm text-slate-700">
              <li>
                Matched: <strong>{sp.matched ? "Yes" : "No"}</strong>
              </li>
              {sp.company?.name && (
                <li>
                  Company: <strong>{sp.company.name}</strong>
                </li>
              )}
              {typeof sp.total_lca_count === "number" && (
                <li>
                  Total LCA filings: <strong>{sp.total_lca_count}</strong>
                </li>
              )}
            </ul>
          ) : (
            <p className="text-sm text-slate-500">No sponsorship data.</p>
          )}
        </Card>

        <Card title="Company fit">
          {co ? (
            <div className="space-y-1 text-sm text-slate-700">
              {co.company_label && (
                <div>
                  Label: <strong>{co.company_label}</strong>
                </div>
              )}
              {co.summary && <p className="text-slate-600">{co.summary}</p>}
            </div>
          ) : (
            <p className="text-sm text-slate-500">No company data.</p>
          )}
        </Card>

        <Card title="Resume fit">
          {rf ? (
            <ul className="space-y-1 text-sm text-slate-700">
              <li>
                Strong: <strong>{rf.strong_matches?.length ?? 0}</strong>
              </li>
              <li>
                Partial: <strong>{rf.partial_matches?.length ?? 0}</strong>
              </li>
              <li>
                Missing: <strong>{rf.missing?.length ?? 0}</strong>
              </li>
              {rf.match_method && (
                <li className="text-slate-500">
                  Method: <code className="text-xs">{rf.match_method}</code>
                </li>
              )}
            </ul>
          ) : (
            <p className="text-sm text-slate-500">No resume fit data.</p>
          )}
        </Card>
      </div>

      <details className="rounded-xl bg-white p-4 text-sm shadow-sm ring-1 ring-slate-200">
        <summary className="cursor-pointer font-medium text-slate-700">
          Raw response JSON
        </summary>
        <pre className="mt-3 max-h-96 overflow-auto rounded-md bg-slate-900 p-4 text-xs text-slate-100">
          {JSON.stringify(data, null, 2)}
        </pre>
      </details>
    </section>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
      <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">
        {title}
      </h3>
      {children}
    </div>
  );
}
