import { useEffect, useRef, useState } from "react";
import "../styles/joblens-report-panel.css";

/** Same HTML layout as the Chrome extension — client-only (report-view uses document). */
export function ReportResults({ report }: { report: Record<string, unknown> }) {
  const ref = useRef<HTMLElement>(null);
  const [html, setHtml] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [wireTips, setWireTips] = useState<((root: HTMLElement) => void) | null>(null);

  useEffect(() => {
    let cancelled = false;
    setHtml(null);
    setLoadError(null);
    setWireTips(null);

    (async () => {
      try {
        const mod = await import("../lib/report-view.js");
        if (cancelled) return;
        const render = mod.renderUnifiedReport || mod.JobLensReportView?.renderUnifiedReport;
        const wire = mod.wireMetricTips || mod.JobLensReportView?.wireMetricTips;
        if (!render) {
          setLoadError("Report renderer failed to load — hard refresh (Cmd+Shift+R).");
          return;
        }
        const out = render(report);
        if (!out || !String(out).trim()) {
          setLoadError("Analysis finished but the report was empty. Try again or check the API.");
          return;
        }
        setHtml(out);
        if (wire) setWireTips(() => wire);
      } catch (e) {
        if (!cancelled) setLoadError(String((e as Error).message || e));
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [report]);

  useEffect(() => {
    if (ref.current && html && wireTips) {
      wireTips(ref.current);
    }
  }, [html, wireTips]);

  if (loadError) {
    return (
      <div className="tool-panel">
        <div className="tool-panel-bd">
          <p className="text-sm" style={{ color: "#8a1f1c" }}>{loadError}</p>
        </div>
      </div>
    );
  }

  if (!html) {
    return (
      <div className="tool-panel">
        <div className="tool-panel-bd">
          <p className="text-sm" style={{ color: "var(--jn-text-muted)" }}>Rendering results…</p>
        </div>
      </div>
    );
  }

  return (
    <section
      className="jl-report-shell"
      ref={ref}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
