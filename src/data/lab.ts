// Source: site-content.md section 7, approved on 2026-09-30. Dates: site-lab.md (the round-2 prototypes and the
// MCP spike of 2026-09-29, the eval check of 2026-09-30). `source` links the code of each experiment in this
// repository. The eval runs are the one example site-content.md checked (ops-ci-pipeline, iteration 2); other
// skills come in when the script-generated summary exists.
const code = (path: string) => `https://github.com/chrissgon/chrissgon.dev/blob/main/${path}`;

export default [
  {
    id: "dot-portrait",
    date: "2026-09-29",
    description: {
      en: "A video drawn as brand dots on one canvas; the dots move away from your pointer.",
      pt: "Um vídeo desenhado com os pontos da marca num único canvas; os pontos fogem do seu cursor.",
    },
    source: code("src/components/Portrait.astro"),
  },
  {
    id: "view-as-agent",
    date: "2026-09-29",
    description: {
      en: "One switch turns every section into the text an agent reads.",
      pt: "Um switch transforma cada seção no texto que um agente lê.",
    },
    source: code("src/components/AgentSwitch.astro"),
  },
  {
    id: "mcp-live",
    date: "2026-09-29",
    description: {
      en: "Call this site's read-only MCP server from the page.",
      pt: "Chame o servidor MCP de leitura deste site pela própria página.",
    },
    source: code("netlify/functions/mcp.mts"),
  },
  {
    id: "perfectui-live",
    date: "2026-09-29",
    description: {
      en: "Perfect UI components working on the page, with their code.",
      pt: "Componentes da Perfect UI funcionando na página, com o código.",
    },
    source: code("src/components/Showcase.astro"),
  },
  {
    id: "workbench-evals",
    date: "2026-09-30",
    description: {
      en: "ai-workbench skills scored with and without the skill, on a strong and a cheap model.",
      pt: "Skills do ai-workbench avaliadas com e sem a skill, num modelo forte e num barato.",
    },
    source: code("src/components/EvalRuns.astro"),
    runs: [
      {
        skill: "ops-ci-pipeline",
        iteration: 2,
        model: "claude-haiku-4-5",
        role: { en: "floor model", pt: "modelo floor" },
        withSkill: 0.812,
        withoutSkill: 0.156,
      },
      {
        skill: "ops-ci-pipeline",
        iteration: 2,
        model: "claude-opus-5-5",
        role: { en: "strong model", pt: "modelo forte" },
        withSkill: 1.0,
        withoutSkill: 0.75,
      },
    ],
  },
];
