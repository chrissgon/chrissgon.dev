// Source: site-content.md 3.2, approved on 2026-09-30. The npm count is read at build (ADR-0003).
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
    value: "43",
    label: { en: "skills in ai-workbench", pt: "skills no ai-workbench" },
    source: "chrissgon/ai-workbench tree at commit f761781, 2026-09-30",
  },
];
