import { useEffect } from "react";
import { useMediaMdUp } from "@/hooks/useMediaMdUp";
import { usePacientesPanel } from "@/features/dashboard/hooks/usePacientesPanel";
import PacientesDesktopPanel from "@/features/dashboard/components/pacientes/PacientesDesktopPanel";
import PacientesMobilePanel from "@/features/dashboard/components/pacientes/PacientesMobilePanel";
import { AgendamentoAnotacaoModal } from "@/features/dashboard/components/agendamentos/AgendamentoAnotacaoModal";
import { PacienteNomeEditModal } from "@/features/dashboard/components/PacienteNomeEditModal";

export default function PacientesPage() {
  const isDesktop = useMediaMdUp();
  const panel = usePacientesPanel();

  useEffect(() => {
    document.title = "Pacientes — Sentinela Agendamentos";
  }, []);

  const sharedProps = {
    loading: panel.loading,
    loadingMore: panel.loadingMore,
    hasMore: panel.hasMore,
    pacientes: panel.pacientes,
    search: panel.search,
    onSearchChange: panel.setSearch,
    onLoadMore: () => void panel.loadMorePacientes(),
    selectedPaciente: panel.selectedPaciente,
    onSelectPaciente: panel.selectPaciente,
    showProfFilter: panel.showProfFilter,
    profFilter: panel.profFilter,
    profFilterOptions: panel.profFilterOptions,
    onProfFilterChange: panel.setProfFilter,
    isCA: panel.isCA,
    barbeariaId: panel.barbeariaId,
    detailTab: panel.detailTab,
    onDetailTabChange: panel.setDetailTab,
    folderItems: panel.folderItems,
    folderLoading: panel.folderLoading,
    onOpenAnotacao: panel.openAnotacao,
    onOpenNomeEdit: panel.openNomeEdit,
    onDataNascimentoSaved: panel.patchPacienteDataNascimento,
    onAvatarSaved: panel.patchPacienteAvatar,
    caLabel: panel.caLabel,
  };

  return (
    <>
      {isDesktop ? (
        <div className="flex flex-1 min-h-0 overflow-hidden">
          <PacientesDesktopPanel {...sharedProps} />
        </div>
      ) : (
        <div className="min-h-full">
        <PacientesMobilePanel
          {...sharedProps}
          onClearSelection={panel.clearSelection}
        />
        </div>
      )}

      <AgendamentoAnotacaoModal
        open={!!panel.anotacaoAgendamentoId}
        agendamentoId={panel.anotacaoAgendamentoId}
        clienteNome={panel.anotacaoClienteNome}
        onClose={() => {
          panel.setAnotacaoAgendamentoId(null);
          panel.setAnotacaoClienteNome(undefined);
        }}
        onSaved={panel.handleAnotacaoSaved}
      />

      <PacienteNomeEditModal
        open={!!panel.nomeEditTarget}
        whatsappDigits={panel.nomeEditTarget?.whatsapp_digits ?? null}
        initialNome={panel.nomeEditTarget?.cliente_nome ?? ""}
        onClose={() => panel.setNomeEditTarget(null)}
        onSaved={() => undefined}
      />
    </>
  );
}
