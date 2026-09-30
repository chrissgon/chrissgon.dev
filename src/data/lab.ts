// Source: site-content.md section 7, approved on 2026-09-30. An experiment gets a `source` link once it is
// built in this repository and runs on the lab page (mcp-live: netlify/functions/mcp.mts and McpDemo.astro).
export default [
  {
    id: "dot-portrait",
    description: {
      en: "A video drawn as brand dots on one canvas; the dots move away from your pointer.",
      pt: "Um vídeo desenhado com os pontos da marca num único canvas; os pontos fogem do seu cursor.",
    },
  },
  {
    id: "view-as-agent",
    description: {
      en: "One switch turns every section into the text an agent reads.",
      pt: "Um switch transforma cada seção no texto que um agente lê.",
    },
  },
  {
    id: "mcp-live",
    description: {
      en: "Call this site's read-only MCP server from the page.",
      pt: "Chame o servidor MCP de leitura deste site pela própria página.",
    },
    source: "https://github.com/chrissgon/chrissgon.dev/blob/main/netlify/functions/mcp.mts",
  },
  {
    id: "perfectui-live",
    description: {
      en: "Perfect UI components working on the page, with their code.",
      pt: "Componentes da Perfect UI funcionando na página, com o código.",
    },
  },
  {
    id: "workbench-evals",
    description: {
      en: "ai-workbench skills scored with and without the skill, on a strong and a cheap model.",
      pt: "Skills do ai-workbench avaliadas com e sem a skill, num modelo forte e num barato.",
    },
  },
];
