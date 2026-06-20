/** Inlined from joblens/design/tokens.css — sync via scripts/sync-design-tokens.sh */
export const JOB_TOKENS_CSS = `
:root {
  --jn-bg: #ffffff;
  --jn-bg-page: #fafaf9;
  --jn-bg-subtle: #f5f5f4;
  --jn-bg-panel: #ffffff;
  --jn-bg-tool: #f5f5f4;
  --jn-text: #1c1917;
  --jn-text-secondary: #57534e;
  --jn-text-muted: #78716c;
  --jn-text-faint: #a8a29e;
  --jn-brand: #1c1917;
  --jn-border: #e7e5e4;
  --jn-border-input: #d6d3d1;
  --jn-cta: #1c1917;
  --jn-cta-hover: #292524;
  --jn-accent: #0d9488;
  --jn-accent-hover: #0f766e;
  --jn-accent-soft: rgba(13, 148, 136, 0.14);
  --jn-highlight: #b45309;
  --jn-radius: 6px;
  --jn-radius-lg: 10px;
  --jn-font: "Inter", ui-sans-serif, system-ui, sans-serif;
  --jn-font-mono: ui-monospace, "SF Mono", Menlo, Consolas, monospace;
  --jn-verdict-apply-bg: #dcfce7;
  --jn-verdict-apply-fg: #166534;
  --jn-verdict-apply-ring: #bbf7d0;
  --jn-verdict-near-bg: #e0f2fe;
  --jn-verdict-near-fg: #075985;
  --jn-verdict-near-ring: #bae6fd;
  --jn-verdict-consider-bg: #fef3c7;
  --jn-verdict-consider-fg: #92400e;
  --jn-verdict-consider-ring: #fde68a;
  --jn-verdict-skip-bg: #fee2e2;
  --jn-verdict-skip-fg: #991b1b;
  --jn-verdict-skip-ring: #fecaca;
}
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
