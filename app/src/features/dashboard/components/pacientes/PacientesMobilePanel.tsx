import { useEffect, useRef } from "react";
import { ChevronLeft, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { HorizontalScrollStrip } from "@agenda/components/agenda/HorizontalScrollStrip";
import { PacienteCadastroTab } from "@/features/dashboard/components/pacientes/PacienteCadastroTab";
import { PacienteDocumentosTab } from "@/features/dashboard/components/pacientes/PacienteDocumentosTab";
import { PacientesSearchEmptyState } from "@/features/dashboard/components/pacientes/PacientesSearchEmptyState";
import { PacienteAvatar } from "@/features/dashboard/components/pacientes/PacienteAvatar";
import {
  PacienteNomeEditButton,
} from "@/features/dashboard/components/PacienteNomeEditModal";
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
  onClearSelection: () => void;
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

export default function PacientesMobilePanel(props: Props) {
  const { selectedPaciente, onClearSelection } = props;

  if (selectedPaciente) {
    return <PacienteMobileDetail {...props} paciente={selectedPaciente} onBack={onClearSelection} />;
  }

  return <PacienteMobileList {...props} />;
}

function PacienteMobileList({
  loading,
  loadingMore,
  hasMore,
  pacientes,
  search,
  onSearchChange,
  onSelectPaciente,
  onLoadMore,
  showProfFilter,
  profFilter,
  profFilterOptions,
  onProfFilterChange,
  isCA,
  onOpenCreateCadastro,
}: Omit<
  Props,
  | "selectedPaciente"
  | "onClearSelection"
  | "detailTab"
  | "onDetailTabChange"
  | "folderItems"
  | "folderLoading"
  | "documentosItems"
  | "documentosLoading"
  | "onReloadDocumentos"
  | "onOpenAnotacao"
  | "onOpenNomeEdit"
  | "onDataNascimentoSaved"
  | "onAvatarSaved"
  | "caLabel"
  | "barbeariaId"
>) {
  const loadMoreRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const sentinel = loadMoreRef.current;
    if (!sentinel || loading || loadingMore || !hasMore) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) onLoadMore();
      },
      { root: null, rootMargin: "120px", threshold: 0 },
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [loading, loadingMore, hasMore, onLoadMore, pacientes.length]);

  return (
    <div className="p-4 space-y-4 max-w-3xl mx-auto w-full">
      <header>
        <h1 className="text-xl font-semibold tracking-tight">Pacientes</h1>
      </header>

      <Input
        type="search"
        placeholder="Nome ou WhatsApp"
        value={search}
        onChange={(e) => onSearchChange(e.target.value)}
        className="rounded-xl"
        aria-label="Pesquisar paciente por nome ou WhatsApp"
      />

      {showProfFilter && (
        <HorizontalScrollStrip className="pb-1">
          {profFilterOptions.map((opt) => (
            <button
              key={opt.id}
              type="button"
              disabled={isCA && profFilterOptions.length === 1}
              onClick={() => onProfFilterChange(opt.id)}
              className={cn(
                "shrink-0 rounded-full px-3.5 py-1.5 text-xs font-semibold transition-colors border",
                profFilter === opt.id
                  ? "bg-accent text-accent-foreground border-accent"
                  : "bg-card/60 text-muted-foreground border-border/70 hover:bg-secondary/50",
                isCA && profFilterOptions.length === 1 && "cursor-default",
              )}
            >
              {opt.label}
            </button>
          ))}
        </HorizontalScrollStrip>
      )}

      {loading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : pacientes.length === 0 ? (
        <div className="border border-dashed border-border rounded-xl">
          <PacientesSearchEmptyState search={search} onCreateClick={onOpenCreateCadastro} />
        </div>
      ) : (
        <>
          <ul className="divide-y divide-border/60 rounded-xl border border-border/70 overflow-hidden">
            {pacientes.map((p) => (
              <li key={p.whatsapp_digits}>
                <button
                  type="button"
                  onClick={() => onSelectPaciente(p)}
                  className="flex w-full items-center gap-3 px-4 py-3.5 text-left hover:bg-secondary/30 transition-colors"
                >
                  <PacienteAvatar
                    nome={p.cliente_nome}
                    avatarUrl={p.avatar_url}
                    className="h-9 w-9"
                    fallbackClassName="text-[10px]"
                  />
                  <div className="min-w-0 flex-1">
                    <p className="font-medium truncate">{p.cliente_nome}</p>
                    <p className="text-xs text-muted-foreground mt-0.5 truncate">
                      {formatWhatsAppDisplay(p.whatsapp_digits)}
                    </p>
                  </div>
                </button>
              </li>
            ))}
          </ul>
          {hasMore && <div ref={loadMoreRef} className="h-8" aria-hidden />}
          {loadingMore && (
            <div className="flex justify-center py-4">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          )}
        </>
      )}
    </div>
  );
}

function PacienteMobileDetail({
  paciente,
  onBack,
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
  isCA,
  barbeariaId,
  caLabel,
}: Props & { paciente: PacientePainelItem; onBack: () => void }) {
  const idade = calcIdadeFromYmd(paciente.data_nascimento);
  const metaParts: string[] = [];
  if (idade != null) metaParts.push(`${idade}a`);
  metaParts.push(formatDataNascimentoShort(paciente.data_nascimento));
  metaParts.push(formatWhatsAppDisplay(paciente.whatsapp_digits));

  return (
    <div className="flex flex-col min-h-0 w-full">
      <header className="sticky top-0 z-10 bg-background/95 backdrop-blur border-b border-border/60 px-4 py-3 space-y-3">
        <div className="flex items-center gap-2">
          <Button type="button" variant="ghost" size="icon" className="shrink-0 -ml-2" onClick={onBack}>
            <ChevronLeft className="h-5 w-5" />
          </Button>
          <div className="min-w-0 flex-1 flex items-center gap-3">
            <PacienteAvatar
              nome={paciente.cliente_nome}
              avatarUrl={paciente.avatar_url}
              className="h-10 w-10"
              fallbackClassName="text-xs"
            />
            <div className="min-w-0">
              <h1 className="text-lg font-semibold truncate flex items-center gap-1">
                <span className="truncate">{paciente.cliente_nome}</span>
                {paciente.can_rename_nome === true && (
                  <PacienteNomeEditButton onClick={() => onOpenNomeEdit(paciente)} />
                )}
              </h1>
              <p className="text-xs text-muted-foreground truncate">{metaParts.join(" | ")}</p>
            </div>
          </div>
        </div>

        <HorizontalScrollStrip className="pb-0.5">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => onDetailTabChange(tab.id)}
              className={cn(
                "shrink-0 px-3 py-1.5 text-sm font-medium border-b-2 transition-colors",
                detailTab === tab.id
                  ? "border-foreground text-foreground"
                  : "border-transparent text-muted-foreground",
              )}
            >
              {tab.label}
            </button>
          ))}
        </HorizontalScrollStrip>
      </header>

      <div className="flex-1 p-4 max-w-3xl mx-auto w-full">
        {detailTab === "historico" && (
          <>
            {folderLoading ? (
              <div className="flex justify-center py-16">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : folderItems.length === 0 ? (
              <p className="py-12 text-center text-sm text-muted-foreground">
                Nenhum atendimento concluído encontrado.
              </p>
            ) : (
              <ul className="space-y-3">
                {folderItems.map((item) => {
                  const snippet = anotacaoSnippet(item.anotacao_conteudo);
                  const hasMore = (item.anotacao_conteudo?.trim().length ?? 0) > 120;
                  return (
                    <li key={item.agendamento_id}>
                      <button
                        type="button"
                        onClick={() => onOpenAnotacao(item)}
                        className="w-full rounded-xl border border-border/70 bg-card/40 p-4 text-left hover:bg-secondary/20 transition-colors"
                      >
                        <p className="text-sm font-semibold">
                          {formatHistoricoDate(item.data)} · {formatHoraPainel(item.hora)}
                        </p>
                        <p className="text-xs text-muted-foreground mt-0.5">{item.barbeiro_nome}</p>
                        {!isCA && barbeariaId && item.barbearia_id !== barbeariaId && (
                          <span className="mt-1 inline-block text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-secondary text-muted-foreground">
                            {caLabel(item.barbearia_id)}
                          </span>
                        )}
                        <p className="mt-2 text-sm text-foreground/85">
                          {snippet}
                          {hasMore && <span className="ml-1 text-primary font-medium">Ver mais</span>}
                        </p>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </>
        )}
        {detailTab === "documentos" && (
          <PacienteDocumentosTab
            paciente={paciente}
            documentos={documentosItems}
            loading={documentosLoading}
            onRefresh={onReloadDocumentos}
          />
        )}
        {detailTab === "cadastro" && (
          <PacienteCadastroTab
            paciente={paciente}
            onOpenNomeEdit={onOpenNomeEdit}
            onDataNascimentoSaved={onDataNascimentoSaved}
            onAvatarSaved={onAvatarSaved}
          />
        )}
      </div>
    </div>
  );
}
