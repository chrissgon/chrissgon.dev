// Source: site-content.md section 6, approved on 2026-09-30. Only roles, years and focus: no company names, no birth year.
export default {
  entries: [
    {
      to: 2020,
      role: null,
      focus: {
        en: "First computer at 6 or 7; 4+ years of study before the first job.",
        pt: "Primeiro computador aos 6 ou 7 anos; mais de 4 anos de estudo antes do primeiro emprego.",
      },
    },
    {
      from: 2020,
      to: 2021,
      role: "Software Engineer",
      focus: {
        en: "A platform for NGOs: PHP, dashboards, e-mail alerts.",
        pt: "plataforma para ONGs (PHP, dashboards, alertas por e-mail)",
      },
    },
    {
      from: 2021,
      to: 2021,
      role: "JavaScript Instructor",
      focus: {
        en: "A bootcamp: 120+ students, 600+ hours of live coding.",
        pt: "bootcamp; mais de 120 alunos, mais de 600 h de live coding",
      },
    },
    {
      from: 2021,
      to: 2024,
      role: "Senior Frontend Engineer",
      focus: {
        en: "A company design system, an in-house lightweight CSS framework, a Vue 2 → Nuxt 3 migration.",
        pt: "design system da empresa, framework CSS próprio e leve, migração Vue 2 → Nuxt 3",
      },
    },
    {
      from: 2024,
      to: 2026,
      role: "Senior Software Engineer",
      focus: {
        en: "The frontend of a Web3 trading platform: architecture, design system, performance, accessibility, pipelines.",
        pt: "frontend de uma plataforma de trading Web3: arquitetura, design system, performance, acessibilidade, pipelines",
      },
    },
    {
      from: 2023,
      to: null,
      role: null,
      // The PT column of the source says "idem": the same text.
      focus: {
        en: "\"How to create your own Bootstrap\" (2023), Perfect UI 1.0 and ai-workbench (2026).",
        pt: "\"How to create your own Bootstrap\" (2023), Perfect UI 1.0 and ai-workbench (2026).",
      },
    },
  ],
  // EN and PT verbatim from site-content.md section 6 ("Provas em PT", added on 2026-09-30).
  proofs: [
    { en: "~28× smaller in-house CSS framework (~5 KB vs ~144 KB gzip)", pt: "Framework CSS próprio ~28× menor (~5 KB vs ~144 KB gzip)" },
    { en: "Vue 2 → Vue 3: bundle −38%, TTI −42%, test coverage 7% → 87%", pt: "Migração Vue 2 → Vue 3: bundle −38%, TTI −42%, cobertura de testes de 7% para 87%" },
    { en: "~10 s to under 3 s load on slow 3G (−70%)", pt: "Carregamento de ~10 s para menos de 3 s em 3G lento (−70%)" },
    { en: "300+ WebSocket messages per second under 100 ms", pt: "Dashboards com mais de 300 mensagens WebSocket por segundo, latência abaixo de 100 ms" },
    { en: "600+ hours of live coding", pt: "600+ horas de live coding" },
  ],
  // PT from the source ("entra sem os anos"). Assumption: the EN wording is a translation made here.
  education: {
    en: "Bachelor's degree in Information Systems",
    pt: "Bacharelado em Sistemas de Informação",
  },
};
