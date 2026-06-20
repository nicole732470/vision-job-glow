import { useEffect, useRef } from "react";
import "../lib/report-view.js";

const RV = globalThis.JobLensReportView;

/** Same HTML layout as the Chrome extension — no duplicate React metrics UI. */
export function ReportResults({ report }: { report: Record<string, unknown> }) {
  const ref = useRef<HTMLElement>(null);

  useEffect(() => {
    if (ref.current && RV?.wireMetricTips) RV.wireMetricTips(ref.current);
  }, [report]);

  if (!report || !RV?.renderUnifiedReport) return null;

  return (
    <section
      className="jl-report-shell"
      ref={ref}
      dangerouslySetInnerHTML={{ __html: RV.renderUnifiedReport(report) }}
    />
  );
}
