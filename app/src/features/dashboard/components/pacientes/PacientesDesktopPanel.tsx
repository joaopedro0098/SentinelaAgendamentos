import { useEffect, useRef } from "react";
import { Loader2, MoreHorizontal } from "lucide-react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { MinimalFilterSelect } from "@/features/dashboard/components/agendamentos/MinimalFilterSelect";
import {
  PacienteNomeEditButton,
} from "@/features/dashboard/components/PacienteNomeEditModal";
import { PacienteCadastroTab } from "@/features/dashboard/components/pacientes/PacienteCadastroTab";
import { PacienteDocumentosTab } from "@/features/dashboard/components/pacientes/PacienteDocumentosTab";
import { PacientesSearchEmptyState } from "@/features/dashboard/components/pacientes/PacientesSearchEmptyState";
import { PacienteAvatar } from "@/features/dashboard/components/pacientes/PacienteAvatar";
import type { PacienteAnotacaoItem, PacientePainelItem } from "@/features/dashboard/lib/agendamentoAnotacao";
import type { PacienteDocumentoItem } from "@/features/dashboard/lib/pacienteDocumentos";
import {
  anotacaoSnippet,
  calcIdadeFromYmd,
  formatDataNascimentoShort,
  formatHistoricoDate,
  formatHoraPainel,
  formatWhatsAppDisplay,
} from "@/features/dashboard/lib/pacienteFormat";
import type { PacienteDetailTab } from "@/features/dashboard/hooks/usePacientesPanel";

type Props = {
  loading: boolean;
  loadingMore: boolean;
  hasMore: boolean;
  pacientes: PacientePainelItem[];
  search: string;
  onSearchChange: (v: string) => void;
  onLoadMore: () => void;
  selectedPaciente: PacientePainelItem | null;
  onSelectPaciente: (p: PacientePainelItem) => void;
  showProfFilter: boolean;
  profFilter: string;
  profFilterOptions: { id: string; label: string }[];
  onProfFilterChange: (v: string) => void;
  isCA: boolean;
  barbeariaId: string | null;
  detailTab: PacienteDetailTab;
  onDetailTabChange: (tab: PacienteDetailTab) => void;
  folderItems: PacienteAnotacaoItem[];
  folderLoading: boolean;
  documentosItems: PacienteDocumentoItem[];
  documentosLoading: boolean;
  onReloadDocumentos: () => void;
  onOpenAnotacao: (item: PacienteAnotacaoItem) => void;
  onOpenNomeEdit: (p: Pick<PacientePainelItem, "whatsapp_digits" | "cliente_nome">) => void;
  onDataNascimentoSaved: (whatsapp: string, data: string | null) => void;
  onAvatarSaved: (whatsapp: string, avatarUrl: string | null) => void;
  caLabel: (barbeariaId: string) => string;
  onOpenCreateCadastro: () => void;
};

const TABS: { id: PacienteDetailTab; label: string }[] = [
  { id: "historico", label: "Histórico" },
  { id: "documentos", label: "Documentos" },
  { id: "cadastro", label: "Dados cadastrais" },
];

function PacienteHeaderMeta({ paciente }: { paciente: PacientePainelItem }) {
  const idade = calcIdadeFromYmd(paciente.data_nascimento);
  const nasc = formatDataNascimentoShort(paciente.data_nascimento);
  const whats = formatWhatsAppDisplay(paciente.whatsapp_digits);
  const parts: string[] = [];
  if (idade != null) parts.push(`${idade}a`);
  parts.push(nasc);
  parts.push(whats);
  return (
    <p className="text-sm text-muted-foreground tabular-nums">
      {parts.join(" | ")}
    </p>
  );
}

export default function PacientesDesktopPanel({
  loading,
  loadingMore,
  hasMore,
  pacientes,
  search,
  onSearchChange,
  onLoadMore,
  selectedPaciente,
  onSelectPaciente,
  showProfFilter,
  profFilter,
  profFilterOptions,
  onProfFilterChange,
  isCA,
  barbeariaId,
  detailTab,
  onDetailTabChange,
  folderItems,
  folderLoading,
  documentosItems,
  documentosLoading,
  onReloadDocumentos,
  onOpenAnotacao,
  onOpenNomeEdit,
  onDataNascimentoSaved,
  onAvatarSaved,
  caLabel,
  onOpenCreateCadastro,
}: Props) {
  const listRef = useRef<HTMLDivElement>(null);
  const selectedWhatsapp = selectedPaciente?.whatsapp_digits ?? null;

  useEffect(() => {
    if (loading || pacientes.length === 0 || selectedPaciente) return;
    onSelectPaciente(pacientes[0]);
  }, [loading, pacientes, selectedPaciente, onSelectPaciente]);

  function handleListScroll() {
    const el = listRef.current;
    if (!el || loading || loadingMore || !hasMore) return;
    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    if (distanceFromBottom < 120) onLoadMore();
  }

  const profOptions = profFilterOptions.map((o) => ({ value: o.id, label: o.label }));

  return (
    <div className="flex flex-1 min-h-0 w-full overflow-hidden">
      <aside className="flex w-[240px] shrink-0 flex-col min-h-0 border-r border-border/60 bg-panel-canvas">
        <div className="shrink-0 space-y-3 border-b border-border/60 p-3">
          <Input
            type="search"
            placeholder="Nome ou WhatsApp"
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            className="h-9 rounded-lg border-border/70 bg-panel-canvas text-sm placeholder:text-muted-foreground/70"
            aria-label="Pesquisar paciente por nome ou WhatsApp"
          />
          {showProfFilter && (
            <MinimalFilterSelect
              label="Profissional"
              value={profFilter}
              options={profOptions}
              onChange={onProfFilterChange}
            />
          )}
        </div>

        <div
          ref={listRef}
          onScroll={handleListScroll}
          className="min-h-0 flex-1 overflow-y-auto overscroll-contain"
        >
          {loading ? (
            <div className="flex justify-center py-12">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : pacientes.length === 0 ? (
            <PacientesSearchEmptyState search={search} onCreateClick={onOpenCreateCadastro} />
          ) : (
            <>
              <ul>
                {pacientes.map((p) => {
                  const active = p.whatsapp_digits === selectedWhatsapp;
                  return (
                    <li key={p.whatsapp_digits}>
                      <button
                        type="button"
                        onClick={() => onSelectPaciente(p)}
                        className={cn(
                          "flex w-full items-center gap-3 px-4 py-3 text-left text-sm transition-colors border-b border-border/30",
                          active
                            ? "bg-accent/10 text-foreground font-medium"
                            : "text-foreground/90 hover:bg-secondary/40",
                        )}
                      >
                        <PacienteAvatar
                          nome={p.cliente_nome}
                          avatarUrl={p.avatar_url}
                          className="h-8 w-8"
                          fallbackClassName="text-[10px]"
                        />
                        <span className="min-w-0 flex-1 truncate">{p.cliente_nome}</span>
                      </button>
                    </li>
                  );
                })}
              </ul>
              {loadingMore && (
                <div className="flex justify-center py-4">
                  <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                </div>
              )}
            </>
          )}
        </div>
      </aside>

      <section className="flex min-w-0 flex-1 flex-col min-h-0 overflow-hidden bg-background">
        {!selectedPaciente ? (
          <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
            Selecione um paciente na lista.
          </div>
        ) : (
          <>
            <header className="shrink-0 border-b border-border/60 bg-background px-6 py-5">
              <div className="flex items-start gap-4">
                <PacienteAvatar
                  nome={selectedPaciente.cliente_nome}
                  avatarUrl={selectedPaciente.avatar_url}
                  className="h-14 w-14"
                  fallbackClassName="text-base"
                />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <h1 className="text-xl font-semibold tracking-tight truncate">
                      {selectedPaciente.cliente_nome}
                    </h1>
                    {selectedPaciente.can_rename_nome === true && (
                      <PacienteNomeEditButton
                        onClick={(e) => {
                          e.stopPropagation();
                          onOpenNomeEdit(selectedPaciente);
                        }}
                      />
                    )}
                  </div>
                  <PacienteHeaderMeta paciente={selectedPaciente} />
                </div>
                {selectedPaciente.can_rename_nome === true && (
                  <button
                    type="button"
                    aria-label="Opções do paciente"
                    onClick={() => onOpenNomeEdit(selectedPaciente)}
                    className="shrink-0 rounded-lg p-2 text-muted-foreground hover:bg-secondary/60"
                  >
                    <MoreHorizontal className="h-5 w-5" />
                  </button>
                )}
              </div>

              <nav className="mt-5 flex gap-6 border-b border-transparent" aria-label="Seções do paciente">
                {TABS.map((tab) => (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => onDetailTabChange(tab.id)}
                    className={cn(
                      "pb-2.5 text-sm font-medium transition-colors -mb-px border-b-2",
                      detailTab === tab.id
                        ? "border-foreground text-foreground"
                        : "border-transparent text-muted-foreground hover:text-foreground",
                    )}
                  >
                    {tab.label}
                  </button>
                ))}
              </nav>
            </header>

            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-6 py-5">
              {detailTab === "historico" && (
                <HistoricoFeed
                  items={folderItems}
                  loading={folderLoading}
                  isCA={isCA}
                  barbeariaId={barbeariaId}
                  caLabel={caLabel}
                  onOpenAnotacao={onOpenAnotacao}
                />
              )}
              {detailTab === "documentos" && selectedPaciente ? (
                <PacienteDocumentosTab
                  paciente={selectedPaciente}
                  documentos={documentosItems}
                  loading={documentosLoading}
                  onRefresh={onReloadDocumentos}
                />
              ) : null}
              {detailTab === "cadastro" && (
                <PacienteCadastroTab
                  paciente={selectedPaciente}
                  onOpenNomeEdit={onOpenNomeEdit}
                  onDataNascimentoSaved={onDataNascimentoSaved}
                  onAvatarSaved={onAvatarSaved}
                />
              )}
            </div>
          </>
        )}
      </section>
    </div>
  );
}

function HistoricoFeed({
  items,
  loading,
  isCA,
  barbeariaId,
  caLabel,
  onOpenAnotacao,
}: {
  items: PacienteAnotacaoItem[];
  loading: boolean;
  isCA: boolean;
  barbeariaId: string | null;
  caLabel: (id: string) => string;
  onOpenAnotacao: (item: PacienteAnotacaoItem) => void;
}) {
  if (loading) {
    return (
      <div className="flex justify-center py-16">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <p className="py-12 text-center text-sm text-muted-foreground">
        Nenhum atendimento concluído encontrado.
      </p>
    );
  }

  return (
    <ul className="space-y-0 divide-y divide-border">
      {items.map((item) => {
        const profLine = item.servicos_nomes?.length
          ? `${item.barbeiro_nome} (${item.servicos_nomes.join(", ")})`
          : item.barbeiro_nome;
        const snippet = anotacaoSnippet(item.anotacao_conteudo);
        const hasMore = (item.anotacao_conteudo?.trim().length ?? 0) > 120;

        return (
          <li key={item.agendamento_id}>
            <button
              type="button"
              onClick={() => onOpenAnotacao(item)}
              className="w-full py-4 text-left transition-colors hover:bg-secondary/20 rounded-lg px-1 -mx-1"
            >
              <p className="text-sm font-semibold text-foreground">
                {formatHistoricoDate(item.data)}
                <span className="font-normal text-muted-foreground ml-2 tabular-nums">
                  {formatHoraPainel(item.hora)}
                </span>
              </p>
              <p className="mt-0.5 text-sm text-muted-foreground">{profLine}</p>
              {!isCA && barbeariaId && item.barbearia_id !== barbeariaId && (
                <span className="mt-1 inline-block text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-secondary text-muted-foreground">
                  {caLabel(item.barbearia_id)}
                </span>
              )}
              <p className="mt-2 text-sm text-foreground/85 leading-relaxed">
                {snippet}
                {hasMore && (
                  <span className="ml-1 text-primary font-medium">Ver mais</span>
                )}
              </p>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
