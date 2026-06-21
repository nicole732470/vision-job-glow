import { useMemo, useState } from "react";

const LABELS: Record<string, string> = {
  role: "Role",
  location: "Location",
  preferences_dealbreakers: "Preferences & Dealbreakers",
  resume: "Resume",
  company: "Company",
  final_verdict: "Final Verdict",
};

function JsonBlock({ value }: { value: unknown }) {
  return <pre className="jd-json">{JSON.stringify(value ?? null, null, 2)}</pre>;
}

function DecisionCard({ name, record }: { name: string; record: Record<string, any> }) {
  const error = record.validation_error || record.fallback_reason;
  return (
    <section className="jd-decision-card">
      <div className="jd-card-head">
        <h3>{LABELS[name] || name}</h3>
        <span className={`jd-method jd-method--${String(record.method || "unknown").replace(/[^a-z]/g, "-")}`}>
          {record.method || "unknown"}
        </span>
      </div>
      <div className="jd-meta-grid">
        <div><span>Model</span><strong>{record.model || "—"}</strong></div>
        <div><span>Prompt</span><strong>{record.prompt_version || "—"}</strong></div>
      </div>
      {error && <div className="jd-error"><strong>Fallback / validation</strong><br />{error}</div>}
      <details open><summary>Validated result</summary><JsonBlock value={record.validated_output} /></details>
      <details><summary>Evidence</summary><JsonBlock value={record.evidence || []} /></details>
      <details><summary>Actual inputs</summary><JsonBlock value={record.inputs || {}} /></details>
      <details><summary>Raw structured output</summary><JsonBlock value={record.raw_output} /></details>
      {record.rule_override && <div className="jd-rule"><strong>Rule override:</strong> {record.rule_override}</div>}
    </section>
  );
}

export function DebugDrawer({ report, defaultOpen = false }: { report: Record<string, any>; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  const data = useMemo(() => {
    const debug = report?.recommendation?.debug_decisions || {};
    const decisions = { ...(debug.decisions || {}) };
    decisions.resume = {
      dimension: "resume", ...(report?.resume_fit?.debug || {}),
      validated_output: {
        method: report?.resume_fit?.match_method,
        strong: report?.resume_fit?.strong_matches?.length || 0,
        partial: report?.resume_fit?.partial_matches?.length || 0,
        weak_or_gap: report?.resume_fit?.missing?.length || 0,
      },
      evidence: [
        ...(report?.resume_fit?.strong_matches || []),
        ...(report?.resume_fit?.partial_matches || []),
        ...(report?.resume_fit?.missing || []),
      ],
    };
    decisions.company = {
      dimension: "company",
      method: report?.company?.score_breakdown?.method,
      model: report?.company?.score_breakdown?.model,
      prompt_version: report?.company?.score_breakdown?.prompt_version,
      inputs: { sources: report?.company?.sources, applicable: report?.company?.score_breakdown?.applicable },
      raw_output: report?.company?.score_breakdown?.raw_output,
      validated_output: {
        tier: report?.company?.company_tier,
        score: report?.company?.company_score,
        dimensions: report?.company?.score_breakdown?.dimensions,
      },
      evidence: report?.company?.sources || [],
      fallback_reason: report?.company?.reason,
    };
    decisions.final_verdict = debug.final_verdict || {};
    return { debug, decisions };
  }, [report]);

  const runId = report?.explain?.observability?.run_id || "—";
  return (
    <div className="jd-shell">
      <button className="jd-toggle" type="button" onClick={() => setOpen(!open)}>
        <span><b>DEBUG CONSOLE</b><small>run_id {runId}</small></span>
        <span>{open ? "Close ↑" : "Inspect →"}</span>
      </button>
      {open && (
        <div className="jd-panel">
          <header className="jd-header">
            <div><span className="jd-kicker">TEST ACCOUNT ONLY</span><h2>Decision trace</h2></div>
            <div className="jd-run"><span>Profile version</span><code>{data.debug.profile_version || "—"}</code></div>
          </header>
          <div className="jd-flow">Role + Location + Profile signals run in parallel → Resume + Company → Final rules / boundary LLM</div>
          <div className="jd-grid">
            {Object.entries(data.decisions).map(([name, record]) => (
              <DecisionCard key={name} name={name} record={(record || {}) as Record<string, any>} />
            ))}
          </div>
          <details className="jd-report"><summary>Full report JSON</summary><JsonBlock value={report} /></details>
        </div>
      )}
    </div>
  );
}
