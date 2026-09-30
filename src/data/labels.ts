// Interface labels in EN and PT.
// `approved`: verbatim from site-content.md (sections 2, 4 and 8), approved on 2026-09-30.
// `provisional`: headings the minimal pages need that site-content.md does not define yet. They are
// placeholders until the visual design; replace them with approved texts.
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
};

export const provisional = {
  // EN "Read the llms.txt" is approved; the PT text is provisional.
  readLlms: { en: "Read the llms.txt", pt: "Leia o llms.txt" },
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
  linkPending: { en: "link coming soon", pt: "link em breve" },
  sourcePending: { en: "source coming soon", pt: "código em breve" },
  imageGenerated: { en: "image: generated card (coming soon)", pt: "imagem: cartão gerado (em breve)" },
  imagePending: { en: "image coming soon", pt: "imagem em breve" },
  langName: { en: "English", pt: "Português" },
  otherLang: { en: "PT", pt: "EN" },
  homeDescription: {
    en: "Christopher Gonçalves: projects, writing and experiments.",
    pt: "Christopher Gonçalves: projetos, escrita e experimentos.",
  },
};

export default { ...approved, ...provisional };
