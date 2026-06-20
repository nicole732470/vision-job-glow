/**
 * Web-only ESM wrapper. Core logic lives in report-view-core.js (synced from joblens/shared).
 * Extension loads report-view-core directly as a classic script — no export syntax.
 */
import "./report-view-core.js";

const RV = globalThis.JobLensReportView;

export const renderUnifiedReport = (...args) => RV.renderUnifiedReport(...args);
export const wireMetricTips = (...args) => RV.wireMetricTips(...args);
export const JobLensReportView = RV;
