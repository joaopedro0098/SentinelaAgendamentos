const STORAGE_KEY = "sentinela_agendamentos_observacao_vista";

function readIds(): Set<string> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return new Set();
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return new Set();
    return new Set(parsed.filter((id): id is string => typeof id === "string" && id.length > 0));
  } catch {
    return new Set();
  }
}

export function isAgendamentoObservacaoVista(agendamentoId: string): boolean {
  return readIds().has(agendamentoId);
}

export function markAgendamentoObservacaoVista(agendamentoId: string): void {
  const ids = readIds();
  ids.add(agendamentoId);
  localStorage.setItem(STORAGE_KEY, JSON.stringify([...ids]));
}
