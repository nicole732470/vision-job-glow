import { useEffect, useRef } from "react";
import "../lib/report-view.js";
import "../styles/joblens-report-panel.css";

declare global {
  interface Window {
    JobLensReportView?: {
      renderUnifiedReport: (report: unknown, opts?: unknown) => string;
      wireMetricTips: (root: HTMLElement) => void;
    };
  }
}

const RV = globalThis.JobLensReportView;

/** Same HTML layout as the Chrome extension — no duplicate React metrics UI. */
export function ReportResults({ report }: { report: Record<string, unknown> }) {
  const ref = useRef<HTMLElement>(null);

  useEffect(() => {
    if (ref.current && RV?.wireMetricTips) RV.wireMetricTips(ref.current);
  }, [report]);

  if (!report) return null;

  if (!RV?.renderUnifiedReport) {
    return (
      <p className="text-sm" style={{ color: "var(--jn-text-muted)" }}>
        Report renderer failed to load — hard refresh (Cmd+Shift+R).
      </p>
    );
  }

  return (
    <section
      className="jl-report-shell"
      ref={ref}
      dangerouslySetInnerHTML={{ __html: RV.renderUnifiedReport(report) }}
    />
  );
}
