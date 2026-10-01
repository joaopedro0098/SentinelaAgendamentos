export type ClienteTerminology = {
  isBeautyNiche: boolean;
  tabNavLabel: string;
  pageTitle: string;
  singular: string;
  plural: string;
  singularLower: string;
  pluralLower: string;
  establishmentLower: string;
};

export function applyClienteTerminologyToMessage(message: string, t: ClienteTerminology): string {
  if (!t.isBeautyNiche) return message;
  return message
    .replace(/\bPacientes\b/g, t.plural)
    .replace(/\bpacientes\b/g, t.pluralLower)
    .replace(/\bPaciente\b/g, t.singular)
    .replace(/\bpaciente\b/g, t.singularLower)
    .replace(/\bClínica\b/g, "Salão")
    .replace(/\bclínica\b/g, t.establishmentLower);
}

export function getClienteTerminology(isBeautyNiche: boolean): ClienteTerminology {
  if (isBeautyNiche) {
    return {
      isBeautyNiche: true,
      tabNavLabel: "Clientes",
      pageTitle: "Clientes — Sentinela Agendamentos",
      singular: "Cliente",
      plural: "Clientes",
      singularLower: "cliente",
      pluralLower: "clientes",
      establishmentLower: "salão",
    };
  }
  return {
    isBeautyNiche: false,
    tabNavLabel: "Pacientes",
    pageTitle: "Pacientes — Sentinela Agendamentos",
    singular: "Paciente",
    plural: "Pacientes",
    singularLower: "paciente",
    pluralLower: "pacientes",
    establishmentLower: "clínica",
  };
}
