/** JobLens design tokens — warm paper, terracotta + sage, mono headings. */
export const JOB_TOKENS_CSS = `
:root {
  --jn-bg: #fbf6ee;
  --jn-bg-page: #f7f1e6;
  --jn-bg-subtle: #f0e9da;
  --jn-bg-panel: #fdfaf3;
  --jn-bg-tool: #f3ecdc;
  --jn-text: #2a2418;
  --jn-text-secondary: #5b5240;
  --jn-text-muted: #857a64;
  --jn-text-faint: #b3a892;
  --jn-brand: #c4654a;
  --jn-border: #e6dcc6;
  --jn-border-input: #d6c9ac;
  --jn-cta: #c4654a;
  --jn-cta-hover: #a8503a;
  --jn-accent: #4a6741;
  --jn-accent-hover: #3a5234;
  --jn-accent-soft: rgba(135, 168, 120, 0.22);
  --jn-highlight: #c4654a;
  --jn-radius: 10px;
  --jn-radius-lg: 16px;
  --jn-font: "Work Sans", ui-sans-serif, system-ui, sans-serif;
  --jn-font-mono: "JetBrains Mono", ui-monospace, "SF Mono", Menlo, Consolas, monospace;
  --jn-verdict-apply-bg: #d9e6ce;
  --jn-verdict-apply-fg: #2f4a25;
  --jn-verdict-apply-ring: #b6cda4;
  --jn-verdict-near-bg: #f1e6c8;
  --jn-verdict-near-fg: #6b5418;
  --jn-verdict-near-ring: #d9c98e;
  --jn-verdict-consider-bg: #f3d9c4;
  --jn-verdict-consider-fg: #7a3e1f;
  --jn-verdict-consider-ring: #e0b08a;
  --jn-verdict-skip-bg: #ecc8be;
  --jn-verdict-skip-fg: #6b2418;
  --jn-verdict-skip-ring: #d59c8c;
}
body { font-family: var(--jn-font); }
`;

export const STEP_LABELS: Record<string, string> = {
  prepare: "Load profile & resume",
  sponsorship_lookup: "H-1B employer lookup",
  parse_jd: "Parse job description",
  join_prefetch: "Merge prefetch",
  react_agent: "Score fit (LLM)",
  fill_gaps: "Fill missing signals",
  langgraph_invoke: "Build verdict",
};
