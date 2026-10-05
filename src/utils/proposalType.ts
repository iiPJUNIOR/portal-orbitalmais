export type ProposalKind = "qualification" | "service";

/**
 * Identifica confiavelmente se um orcamento ou rascunho se refere a
 * Qualificacao (equipamentos/termica) ou a Prestacao de Servico.
 */
export function getProposalKind(dataOrQuote: any): ProposalKind {
  if (!dataOrQuote) return "qualification";

  // Extrai payload de configuracao caso seja um Quote ou DraftRecord
  const d = dataOrQuote.settings || dataOrQuote.data || dataOrQuote;

  if (d.proposalType === "service" || d.type === "service") {
    return "service";
  }
  if (d.proposalType === "qualification" || d.type === "qualification") {
    return "qualification";
  }

  // Heuristicas para orcamentos legados ou rascunhos parciais
  if (
    d.tipoServico ||
    d.tiposServico ||
    d.tipoJunta ||
    d.tipoMaterial ||
    d.responsabilidadesCliente ||
    d.responsabilidadesOrbital ||
    (typeof d.proposalNumber === "string" && d.proposalNumber.toUpperCase().startsWith("SER"))
  ) {
    return "service";
  }

  return "qualification";
}

export function getProposalKindBadgeInfo(kindOrObject: any) {
  const kind = typeof kindOrObject === "string" && (kindOrObject === "service" || kindOrObject === "qualification")
    ? (kindOrObject as ProposalKind)
    : getProposalKind(kindOrObject);

  if (kind === "service") {
    return {
      kind: "service" as const,
      label: "Serviço",
      fullLabel: "Prestação de Serviço",
      badgeClass: "bg-sky-500/10 text-sky-700 dark:text-sky-300 border-sky-300 dark:border-sky-800",
    };
  }

  return {
    kind: "qualification" as const,
    label: "Qualificação",
    fullLabel: "Qualificação Térmica",
    badgeClass: "bg-purple-500/10 text-purple-700 dark:text-purple-300 border-purple-300 dark:border-purple-800",
  };
}
