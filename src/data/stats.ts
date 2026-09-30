// Source: site-content.md 3.2, approved on 2026-09-30. The npm count and the skill count are read at build
// (ADR-0003; scripts/fetch-npm.ts, scripts/fetch-workbench.ts).
export default [
  {
    id: "npm-downloads",
    value: null,
    label: { en: "npm downloads last month", pt: "downloads no npm no último mês" },
    source: "api.npmjs.org, read at build (scripts/fetch-npm.ts)",
  },
  {
    id: "perfectui-size",
    value: "3.7 kB",
    label: { en: "Perfect UI, gzip, zero dependencies", pt: "Perfect UI, gzip, sem dependências" },
    source: "perfectui.dev: perfectui.css is 3,256 bytes gzip; the optional JavaScript loader is 493",
  },
  {
    id: "live-coding",
    value: "600+ hours",
    label: { en: "of live coding with an audience", pt: "de live coding com público" },
    source: "profile, citable proofs",
  },
  {
    id: "workbench-skills",
    value: null,
    label: { en: "skills in ai-workbench", pt: "skills no ai-workbench" },
    source: "api.github.com, tree of chrissgon/ai-workbench, read at build (scripts/fetch-workbench.ts)",
  },
];
