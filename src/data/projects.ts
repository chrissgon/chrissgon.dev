// Source: site-content.md section 4 (4.1 ready, 4.2 in progress), approved on 2026-09-30. Texts are verbatim.
import products from "./products.ts";

const [perfectui, workbench] = products;

export default [
  {
    id: "perfectui",
    name: "Perfect UI",
    types: ["web-ui"],
    status: "ready",
    stack: ["JavaScript", "TypeScript", "CSS"],
    summary: perfectui!.summary,
    // The README cover (.github/assets/thumbnail.webp in chrissgon/perfectui), docs/design/site/projects/.
    image: { kind: "file", src: "projects/perfectui.webp" },
    links: [
      { label: "perfectui.dev", url: "https://perfectui.dev" },
      { label: "GitHub", url: "https://github.com/chrissgon/perfectui" },
    ],
  },
  {
    id: "perfectui-doc",
    name: "perfectui.dev",
    types: ["web-ui"],
    status: "ready",
    stack: ["TypeScript", "Vue", "Nuxt"],
    summary: {
      en: "The documentation site of Perfect UI, built with Nuxt and Perfect UI itself.",
      pt: "O site de documentação da Perfect UI, feito com Nuxt e com a própria Perfect UI.",
    },
    image: { kind: "file", src: "projects/perfectui-doc.png" },
    links: [{ label: "perfectui.dev", url: "https://perfectui.dev" }],
  },
  {
    id: "ai-workbench",
    name: "ai-workbench",
    types: ["ai-agents"],
    status: "ready",
    stack: ["Python", "Shell"],
    summary: workbench!.summary,
    image: { kind: "generated" },
    links: [{ label: "GitHub", url: "https://github.com/chrissgon/ai-workbench" }],
  },
  {
    id: "goddd",
    name: "goddd",
    types: ["docs-architecture"],
    status: "ready",
    stack: ["Go"],
    summary: {
      en: "A Go REST API for users laid out with DDD and SOLID, one README per package.",
      pt: "O repositório é uma API com listagem e cadastro de usuários. Foram utilizados princípios SOLID e DDD para a arquitetura, com o objetivo de proporcionar maior adaptabilidade e manutenção do código.",
    },
    // The dependency diagram of the README (diagram.png in chrissgon/goddd), metadata stripped.
    image: { kind: "file", src: "projects/goddd.png" },
    links: [{ label: "GitHub", url: "https://github.com/chrissgon/goddd" }],
  },
  {
    id: "doc-github-workflow",
    name: "doc-github-workflow",
    types: ["docs-architecture"],
    status: "ready",
    stack: ["Go"],
    summary: {
      en: "A CI/CD workflow with GitHub Actions and SonarCloud, on a minimal Go example.",
      pt: "Workflow CI/CD com Github Actions e SonarCloud",
    },
    image: { kind: "generated" },
    links: [{ label: "GitHub", url: "https://github.com/chrissgon/doc-github-workflow" }],
  },
  {
    id: "doc-git-patterns",
    name: "doc-git-patterns",
    types: ["docs-architecture"],
    status: "ready",
    stack: ["Markdown"],
    summary: {
      en: "Commits and flow patterns for repositories",
      pt: "Padrões de commit e de fluxo para repositórios",
    },
    // The gitflow diagram of the README (gitflow.png in chrissgon/doc-git-patterns), metadata stripped.
    image: { kind: "file", src: "projects/doc-git-patterns.png" },
    links: [{ label: "GitHub", url: "https://github.com/chrissgon/doc-git-patterns" }],
  },
  {
    id: "perfectui-for-agents",
    name: "Perfect UI for agents",
    types: ["ai-agents", "web-ui"],
    status: "in-progress",
    stack: [],
    image: { kind: "generated" },
    summary: {
      en: "An MCP server and a skill that teach coding agents to build interfaces with Perfect UI.",
      pt: "Um servidor MCP e uma skill que ensinam agentes de código a montar interfaces com a Perfect UI.",
    },
    links: [],
  },
  {
    id: "agent-ready-kit",
    name: "Agent-ready kit",
    types: ["ai-agents"],
    status: "in-progress",
    stack: [],
    image: { kind: "generated" },
    summary: {
      en: "One data file in, llms.txt, schema.org data and a read-only MCP server out.",
      pt: "Um arquivo de dados entra; saem o llms.txt, os dados schema.org e um servidor MCP de leitura.",
    },
    links: [],
  },
  {
    id: "social-agent",
    name: "Social agent",
    types: ["ai-agents"],
    status: "in-progress",
    stack: [],
    image: { kind: "generated" },
    summary: {
      en: "The agent that answers comments on my posts within a policy, with a lock on sensitive topics, open source.",
      pt: "O agente que responde comentários nos meus posts dentro de uma política, com trava de temas sensíveis, em código aberto.",
    },
    links: [],
  },
  {
    id: "light-site-auditor",
    name: "Light-site auditor",
    types: ["ai-agents", "web-ui"],
    status: "in-progress",
    stack: [],
    image: { kind: "generated" },
    summary: {
      en: "An agent that checks a small business's site for weight, speed on 3G and accessibility, and explains the fixes in plain words.",
      pt: "Um agente que confere o site de um pequeno negócio (peso, velocidade em 3G, acessibilidade) e explica as correções em palavras simples.",
    },
    links: [],
  },
];
