/**
 * Web-only ESM wrapper. Core logic lives in report-view-core.js (synced from joblens/shared).
 */
import "./report-view-core.js";

function rv() {
  return globalThis.JobLensReportView;
}

export function renderUnifiedReport(...args) {
  const RV = rv();
  if (!RV?.renderUnifiedReport) {
    throw new Error("Report UI not loaded — hard refresh (Cmd+Shift+R).");
  }
  return RV.renderUnifiedReport(...args);
}

export function wireMetricTips(...args) {
  const RV = rv();
  if (!RV?.wireMetricTips) return;
  return RV.wireMetricTips(...args);
}

export const JobLensReportView = new Proxy(
  {},
  {
    get(_t, prop) {
      return rv()?.[prop];
    },
  }
);
