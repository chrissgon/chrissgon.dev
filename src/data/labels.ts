// Interface labels in EN and PT.
// `approved`: verbatim from site-content.md (sections 2, 3.5, 4, 7 and 8), approved on 2026-09-30, and the
// 24 labels the first build proposed, approved as they are by the owner on 2026-09-30 (design direction A).
// `provisional`: labels the design briefs (site-projects.md, site-writing.md, site-lab.md, OPEN-1) propose and
// the owner has not approved yet. Replace them with approved texts when he answers.
export const approved = {
  skipToContent: { en: "Skip to content", pt: "Pular para o conteúdo" },
  navProjects: { en: "Projects", pt: "Projetos" },
  navWriting: { en: "Writing", pt: "Escrita" },
  navLab: { en: "Lab", pt: "Laboratório" },
  navAgents: { en: "For agents", pt: "Para agentes" },
  typeAiAgents: { en: "AI & agents", pt: "IA e agentes" },
  typeWebUi: { en: "Web & UI", pt: "Web e UI" },
  typeDocsArchitecture: { en: "Docs & architecture", pt: "Documentação e arquitetura" },
  statusReady: { en: "Ready", pt: "Pronto" },
  statusInProgress: { en: "In progress", pt: "Em construção" },
  filterAll: { en: "All", pt: "Todos" },
  // For agents card: approved on 2026-09-29 (state.md; site-content.md section 2).
  connectAgent: { en: "Connect your agent to this site", pt: "Conecte seu agente a este site" },
  readLlms: { en: "Read the llms.txt", pt: "Leia o llms.txt" },
  // site-content.md sections 2, 3.5 and 7.
  viewAsAgent: { en: "view as agent", pt: "ver como agente" },
  langSwitch: { en: "EN / PT", pt: "EN / PT" },
  copy: { en: "Copy", pt: "Copiar" },
  copied: { en: "Copied", pt: "Copiado" },
  copyFallback: { en: "Press Ctrl+C to copy", pt: "Pressione Ctrl+C para copiar" },
  toolsList: { en: "tools/list", pt: "tools/list" },
  source: { en: "source", pt: "source" },
  // Approved by the owner on 2026-09-30 ("the 24 provisional labels are approved as they are").
  about: { en: "About", pt: "Sobre" },
  products: { en: "Products", pt: "Produtos" },
  numbers: { en: "Numbers", pt: "Números" },
  trajectory: { en: "Trajectory", pt: "Trajetória" },
  proofs: { en: "Proofs", pt: "Provas" },
  education: { en: "Education", pt: "Formação" },
  profiles: { en: "Profiles", pt: "Perfis" },
  latestWriting: { en: "Latest writing", pt: "Escrita recente" },
  allWriting: { en: "All writing", pt: "Toda a escrita" },
  allProjects: { en: "All projects", pt: "Todos os projetos" },
  byType: { en: "Type", pt: "Tipo" },
  byStatus: { en: "Status", pt: "Status" },
  byStack: { en: "Stack", pt: "Stack" },
  before: { en: "Before", pt: "Antes de" },
  now: { en: "now", pt: "hoje" },
  noPosts: { en: "No posts yet.", pt: "Nenhum post ainda." },
  sourcePending: { en: "source coming soon", pt: "código em breve" },
  // Words of the ai-workbench generated card: PT from site-content.md 3.4 ("43 skills ..., 3 agentes, 2
  // adaptadores").
  cardSkills: { en: "skills", pt: "skills" },
  cardAgents: { en: "agents", pt: "agentes" },
  cardAdapters: { en: "adapters", pt: "adaptadores" },
  langName: { en: "English", pt: "Português" },
  otherLang: { en: "PT", pt: "EN" },
  // The alt text of the portrait (round-2 prototype, personal-brand round-2/a-final/build.py).
  portraitAlt: {
    en: "Christopher Gonçalves at his computer, drawn in dots",
    pt: "Christopher Gonçalves no computador, desenhado em pontos",
  },
  homeDescription: {
    en: "Christopher Gonçalves: projects, writing and experiments.",
    pt: "Christopher Gonçalves: projetos, escrita e experimentos.",
  },
};

export const provisional = {
  // site-projects.md OPEN-1.
  noProjectMatch: { en: "No project matches these filters.", pt: "Nenhum projeto com esses filtros." },
  // site-writing.md OPEN-1 (singular and plural).
  comment: { en: "comment", pt: "comentário" },
  comments: { en: "comments", pt: "comentários" },
  reaction: { en: "reaction", pt: "reação" },
  reactions: { en: "reactions", pt: "reações" },
  // site-lab.md OPEN-1.
  mcpDown: {
    en: "The MCP server did not answer. Try the address in your own MCP client.",
    pt: "O servidor MCP não respondeu. Tente o endereço no seu próprio cliente MCP.",
  },
  mcpRateLimit: {
    en: "Rate limit: 30 calls per minute. Try again in a minute.",
    pt: "Limite de 30 chamadas por minuto. Tente de novo em um minuto.",
  },
  evalSkill: { en: "Skill", pt: "Skill" },
  evalModel: { en: "Model", pt: "Modelo" },
  evalRun: { en: "Run", pt: "Rodada" },
  evalWith: { en: "With the skill", pt: "Com a skill" },
  evalWithout: { en: "Without", pt: "Sem" },
  // site-home.md, content assumptions: "43 skills in 9 prefixes" (PT from site-content.md 3.4).
  cardPrefixes: { en: "in {n} prefixes", pt: "em {n} prefixos" },
  // The close button of an opened lab experiment ("Esc or × closes it", site-lab.md); its accessible name.
  close: { en: "Close", pt: "Fechar" },
  // The Claude Design home (personal-brand docs/design/results/site-home/claude-design/home-full.webp): the EN
  // texts are approved by the owner (state.md, 2026-09-30, "Ajuste o site atual com base nesse design"); the PT
  // texts are proposals that follow the approved PT labels, awaiting the owner.
  sectionIndex: { en: "Index", pt: "Índice" },
  projectsTitle: { en: "Shipped and in progress", pt: "Entregues e em construção" },
  writingTitle: { en: "Posts on LinkedIn", pt: "Posts no LinkedIn" },
  // "Pick the next post" (src/lib/pick.ts): the EN texts are the published ones of the profile README
  // (chrissgon/chrissgon, scripts/readme.py, approved by the owner on 2026-09-29 and 2026-09-30); the README
  // has no PT, so the PT texts are proposals awaiting the owner. {pillar}, {date} and {topic} are filled in.
  pickIndex: { en: "GitHub", pt: "GitHub" },
  pickTitle: { en: "Pick the next post", pt: "Escolha o próximo post" },
  pickLead: {
    en: "This week's slot is {pillar}. Pick the topic I write next: one pick per GitHub account, which you can change until the round closes on {date}.",
    pt: "O post desta semana é do pilar {pillar}. Escolha o tema que eu escrevo a seguir: uma escolha por conta do GitHub, que você pode trocar até a rodada fechar em {date}.",
  },
  pickButton: { en: "Pick", pt: "Escolher" },
  pickClosed: { en: "The next round opens on a Monday.", pt: "A próxima rodada abre numa segunda-feira." },
  pickClosedLast: { en: "Until then, the last result is below.", pt: "Até lá, o último resultado fica abaixo." },
  pickLast: { en: "Last round you picked {topic}.", pt: "Na última rodada, vocês escolheram {topic}." },
  pickWrote: { en: "I wrote it", pt: "Escrevi o post" },
  pickWriting: { en: "I'm writing it now.", pt: "Estou escrevendo agora." },
  // The perfectui-live playground (the owner's request of 2026-09-30, "deixe que a pessoa possa escrever o
  // código pra testar a lib"): the editor's accessible name, its keyboard hint, the Reset button and the
  // preview's title.
  playgroundEdit: { en: "Edit the markup", pt: "Edite o markup" },
  playgroundHint: { en: "Tab indents. Esc, then Tab, leaves the editor.", pt: "Tab indenta. Esc e depois Tab sai do editor." },
  playgroundReset: { en: "Reset", pt: "Restaurar" },
  playgroundPreview: { en: "Preview of the markup", pt: "Prévia do markup" },
};

export default { ...approved, ...provisional };
