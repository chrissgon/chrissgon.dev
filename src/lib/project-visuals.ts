// The projects whose cover the site draws (src/components/ProjectVisual.astro). Every project with a generated
// image must be one of them (tests/data.test.ts): there is no placeholder cover.
export const DRAWN_PROJECTS = [
  "ai-workbench",
  "doc-github-workflow",
  "perfectui-for-agents",
  "agent-ready-kit",
  "social-agent",
  "light-site-auditor",
] as const;
