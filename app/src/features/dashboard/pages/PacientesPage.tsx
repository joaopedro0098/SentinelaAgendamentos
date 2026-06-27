import { useCallback, useEffect, useMemo, useState } from "react";
import { ChevronLeft, FolderOpen, Loader2, Phone, User } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { maskPhone } from "@agenda/lib/phone";
import { HorizontalScrollStrip } from "@agenda/components/agenda/HorizontalScrollStrip";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { toast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { useDashboardShop } from "@/providers/DashboardShopProvider";
import { useSubscription } from "@/hooks/useSubscription";
import { buildVisibleBarbeariaIds } from "@/features/dashboard/lib/agendamentosPanel";
import { usePainelPacientesBarbeariaIds } from "@/features/dashboard/hooks/usePainelPacientesBarbeariaIds";
import { usePanelPacientesRefresh } from "@/features/dashboard/hooks/usePanelPacientesRefresh";
import {
  parsePacienteAnotacoesRpc,
  parsePacientesRpc,
  type PacienteAnotacaoItem,
  type PacientePainelItem,
  type PacienteProfissional,
} from "@/features/dashboard/lib/agendamentoAnotacao";
import { AgendamentoAnotacaoModal } from "@/features/dashboard/components/agendamentos/AgendamentoAnotacaoModal";
import {
  PacienteNomeEditButton,
  PacienteNomeEditModal,
} from "@/features/dashboard/components/PacienteNomeEditModal";
import { useClienteNomeSyncListener } from "@/features/dashboard/hooks/usePainelClienteNomeBroadcast";
import { whatsappMatches, dispatchClienteNomeSync, isAgendamentoClienteNomeOnlyUpdate, clienteNomePayloadFromAgendamentoRow } from "@agenda/lib/panelClienteNomeSync";

function formatHora(hora: string) {
  return String(hora).slice(0, 5);
}

function formatDateYmd(ymd: string) {
  const [y, m, d] = ymd.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function formatWhatsAppDisplay(digits: string) {
  if (digits.length === 11) return maskPhone(digits);
  if (digits.length === 10) return maskPhone(`9${digits}`);
  return digits;
}

export default function PacientesPage() {
  const { caBarbearias, barbeariaId, permissionsRevision } = useDashboardShop();
  const { info: subscriptionInfo } = useSubscription();
  const isCA = subscriptionInfo?.account_type === "ca";

  const fallbackBarbeariaIds = useMemo(
    () => buildVisibleBarbeariaIds(barbeariaId, caBarbearias, isCA),
    [barbeariaId, caBarbearias, isCA],
  );
  const pacientesBarbeariaIds = usePainelPacientesBarbeariaIds(fallbackBarbeariaIds);

  const [loading, setLoading] = useState(true);
  const [pacientes, setPacientes] = useState<PacientePainelItem[]>([]);
  const [profissionais, setProfissionais] = useState<PacienteProfissional[]>([]);
  const [profFilter, setProfFilter] = useState<string>("todos");
  const [selectedPaciente, setSelectedPaciente] = useState<PacientePainelItem | null>(null);
  const [folderItems, setFolderItems] = useState<PacienteAnotacaoItem[]>([]);
  const [folderLoading, setFolderLoading] = useState(false);
  const [anotacaoAgendamentoId, setAnotacaoAgendamentoId] = useState<string | null>(null);
  const [anotacaoClienteNome, setAnotacaoClienteNome] = useState<string | undefined>();
  const [nomeEditTarget, setNomeEditTarget] = useState<{
    whatsapp_digits: string;
    cliente_nome: string;
  } | null>(null);

  useEffect(() => {
    document.title = "Pacientes — Sentinela Agendamentos";
  }, []);

  const loadPacientes = useCallback(async () => {
    setLoading(true);
    const barbeiroId = profFilter === "todos" ? undefined : profFilter;
    const { data, error } = await supabase.rpc("list_pacientes_painel", {
      p_barbeiro_id: barbeiroId ?? null,
    });
    setLoading(false);
    if (error) {
      setPacientes([]);
      setProfissionais([]);
      toast({
        title: "Não foi possível carregar pacientes",
        description: error.message,
        variant: "destructive",
      });
      return;
    }
    const parsed = parsePacientesRpc(data);
    if (!parsed) {
      const message =
        data && typeof data === "object" && "error" in data
          ? String((data as { error?: string }).error)
          : "Resposta inválida";
      toast({ title: "Não foi possível carregar pacientes", description: message, variant: "destructive" });
      return;
    }
    setPacientes(parsed.pacientes);
    setProfissionais(parsed.profissionais);
  }, [profFilter]);

  usePanelPacientesRefresh(loadPacientes);

  useEffect(() => {
    void loadPacientes();
  }, [loadPacientes, permissionsRevision]);

  const loadFolder = useCallback(async (paciente: PacientePainelItem) => {
    setFolderLoading(true);
    const barbeiroId = profFilter === "todos" ? undefined : profFilter;
    const { data, error } = await supabase.rpc("list_paciente_anotacoes", {
      p_whatsapp_digits: paciente.whatsapp_digits,
      p_barbeiro_id: barbeiroId ?? null,
    });
    setFolderLoading(false);
    if (error) {
      setFolderItems([]);
      return;
    }
    const items = parsePacienteAnotacoesRpc(data);
    setFolderItems(items ?? []);
  }, [profFilter]);

  function openPaciente(paciente: PacientePainelItem) {
    setSelectedPaciente(paciente);
    void loadFolder(paciente);
  }

  function closeFolder() {
    setSelectedPaciente(null);
    setFolderItems([]);
  }

  function caLabel(itemBarbeariaId: string) {
    return caBarbearias.find((ca) => ca.barbeariaId === itemBarbeariaId)?.shopName ?? "CA";
  }

  function openAnotacao(item: PacienteAnotacaoItem) {
    setAnotacaoAgendamentoId(item.agendamento_id);
    setAnotacaoClienteNome(item.cliente_nome);
  }

  function handleAnotacaoSaved() {
    if (selectedPaciente) void loadFolder(selectedPaciente);
    void loadPacientes();
  }

  function openNomeEdit(paciente: Pick<PacientePainelItem, "whatsapp_digits" | "cliente_nome">) {
    setNomeEditTarget({
      whatsapp_digits: paciente.whatsapp_digits,
      cliente_nome: paciente.cliente_nome,
    });
  }

  const applyClienteNomeSync = useCallback(
    (payload: { whatsapp_digits: string; nome: string }) => {
      setPacientes((prev) =>
        prev.map((p) =>
          p.whatsapp_digits === payload.whatsapp_digits ? { ...p, cliente_nome: payload.nome } : p,
        ),
      );
      setSelectedPaciente((prev) =>
        prev?.whatsapp_digits === payload.whatsapp_digits ? { ...prev, cliente_nome: payload.nome } : prev,
      );
      setFolderItems((prev) =>
        prev.map((item) =>
          whatsappMatches(item.cliente_whatsapp, payload.whatsapp_digits)
            ? { ...item, cliente_nome: payload.nome }
            : item,
        ),
      );
      if (selectedPaciente?.whatsapp_digits === payload.whatsapp_digits && anotacaoAgendamentoId) {
        setAnotacaoClienteNome(payload.nome);
      }
    },
    [selectedPaciente?.whatsapp_digits, anotacaoAgendamentoId],
  );

  useClienteNomeSyncListener(applyClienteNomeSync);

  useEffect(() => {
    if (!pacientesBarbeariaIds.length) return;

    const channels = pacientesBarbeariaIds.map((bid) =>
      supabase
        .channel(`painel-pacientes:${bid}`)
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "agendamentos", filter: `barbearia_id=eq.${bid}` },
          (payload) => {
            if (isAgendamentoClienteNomeOnlyUpdate(payload)) {
              const syncPayload = clienteNomePayloadFromAgendamentoRow(
                payload.new as Record<string, unknown>,
              );
              if (syncPayload) dispatchClienteNomeSync(syncPayload);
              return;
            }
            void loadPacientes();
            if (selectedPaciente) void loadFolder(selectedPaciente);
          },
        )
        .subscribe(),
    );

    const anotacoesChannel = supabase
      .channel("painel-pacientes:anotacoes")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "agendamento_anotacoes" },
        () => {
          void loadPacientes();
          if (selectedPaciente) void loadFolder(selectedPaciente);
        },
      )
      .subscribe();

    return () => {
      channels.forEach((ch) => void supabase.removeChannel(ch));
      void supabase.removeChannel(anotacoesChannel);
    };
  }, [pacientesBarbeariaIds, loadPacientes, loadFolder, selectedPaciente]);

  const profFilterOptions = useMemo(() => {
    if (isCA) {
      return profissionais.map((p) => ({ id: p.id, label: p.nome }));
    }
    const opts = [{ id: "todos", label: "Todos" }];
    for (const p of profissionais) {
      const caSuffix =
        barbeariaId && p.barbearia_id !== barbeariaId
          ? ` · ${caBarbearias.find((ca) => ca.barbeariaId === p.barbearia_id)?.shopName ?? "CA"}`
          : "";
      opts.push({ id: p.id, label: `${p.nome}${caSuffix}` });
    }
    return opts;
  }, [profissionais, isCA, barbeariaId, caBarbearias]);

  useEffect(() => {
    if (!isCA || profissionais.length === 0) return;
    setProfFilter((cur) =>
      cur === "todos" || !profissionais.some((p) => p.id === cur) ? profissionais[0].id : cur,
    );
  }, [isCA, profissionais]);

  const showProfFilter = isCA ? profissionais.length > 0 : profFilterOptions.length > 1;

  if (selectedPaciente) {
    return (
      <div className="p-4 md:p-6 max-w-3xl mx-auto w-full overflow-x-hidden space-y-4">
        <header className="flex items-center gap-3">
          <Button type="button" variant="ghost" size="icon" className="shrink-0" onClick={closeFolder}>
            <ChevronLeft className="h-5 w-5" />
          </Button>
          <div className="min-w-0 flex-1">
            <h1 className="text-xl font-semibold tracking-tight truncate flex items-center gap-1.5">
              <span className="truncate">{selectedPaciente.cliente_nome}</span>
              {selectedPaciente.can_rename_nome === true && (
                <PacienteNomeEditButton
                  onClick={(e) => {
                    e.stopPropagation();
                    openNomeEdit(selectedPaciente);
                  }}
                />
              )}
            </h1>
            <p className="text-sm text-muted-foreground flex items-center gap-1.5">
              <Phone className="h-3.5 w-3.5" />
              {formatWhatsAppDisplay(selectedPaciente.whatsapp_digits)}
            </p>
          </div>
        </header>

        {folderLoading ? (
          <div className="flex justify-center py-16">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : folderItems.length === 0 ? (
          <Card className="border-dashed">
            <CardContent className="py-12 text-center text-sm text-muted-foreground">
              Nenhum atendimento concluído encontrado.
            </CardContent>
          </Card>
        ) : (
          <ul className="space-y-3">
            {folderItems.map((item) => {
              const hasAnotacao = Boolean(item.anotacao_conteudo?.trim());
              return (
                <li key={item.agendamento_id}>
                  <Card className="border-border/80">
                    <CardContent className="p-4 space-y-2">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0 space-y-1">
                          <p className="text-sm font-semibold text-primary">
                            {formatDateYmd(item.data)} · {formatHora(item.hora)}
                          </p>
                          <p className="text-xs text-muted-foreground">{item.barbeiro_nome}</p>
                          {!isCA && barbeariaId && item.barbearia_id !== barbeariaId && (
                            <span className="inline-block text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-secondary text-muted-foreground">
                              {caLabel(item.barbearia_id)}
                            </span>
                          )}
                        </div>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="shrink-0 rounded-full"
                          onClick={() => openAnotacao(item)}
                        >
                          {item.can_write ? "Anotação" : "Ver anotação"}
                        </Button>
                      </div>
                      {item.servicos_nomes?.length > 0 && (
                        <p className="text-xs text-muted-foreground truncate">
                          {item.servicos_nomes.join(" · ")}
                        </p>
                      )}
                      {hasAnotacao ? (
                        <p className="text-sm text-foreground/90 whitespace-pre-wrap border-t border-border/60 pt-2">
                          {item.anotacao_conteudo}
                        </p>
                      ) : (
                        <p className="text-sm text-muted-foreground italic border-t border-border/60 pt-2">
                          Pasta vazia — nenhuma anotação registrada.
                        </p>
                      )}
                    </CardContent>
                  </Card>
                </li>
              );
            })}
          </ul>
        )}

        <AgendamentoAnotacaoModal
          open={!!anotacaoAgendamentoId}
          agendamentoId={anotacaoAgendamentoId}
          clienteNome={anotacaoClienteNome}
          onClose={() => {
            setAnotacaoAgendamentoId(null);
            setAnotacaoClienteNome(undefined);
          }}
          onSaved={handleAnotacaoSaved}
        />
        <PacienteNomeEditModal
          open={!!nomeEditTarget}
          whatsappDigits={nomeEditTarget?.whatsapp_digits ?? null}
          initialNome={nomeEditTarget?.cliente_nome ?? ""}
          onClose={() => setNomeEditTarget(null)}
          onSaved={() => undefined}
        />
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 max-w-3xl mx-auto w-full overflow-x-hidden space-y-5">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Pacientes</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Clientes com atendimentos concluídos. Toque na pasta para ver o histórico e anotações.
        </p>
      </header>

      {showProfFilter && (
        <HorizontalScrollStrip className="pb-1">
          {profFilterOptions.map((opt) => (
            <button
              key={opt.id}
              type="button"
              disabled={isCA && profFilterOptions.length === 1}
              onClick={() => setProfFilter(opt.id)}
              className={cn(
                "shrink-0 rounded-full px-3.5 py-1.5 text-xs font-semibold transition-colors border",
                profFilter === opt.id
                  ? "bg-primary text-primary-foreground border-primary"
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
        <Card className="border-dashed">
          <CardContent className="py-12 text-center text-sm text-muted-foreground">
            Nenhum paciente com atendimento concluído
            {!isCA && profFilter !== "todos" ? " para este profissional" : ""}.
          </CardContent>
        </Card>
      ) : (
        <ul className="space-y-2">
          {pacientes.map((p) => (
            <li key={p.whatsapp_digits}>
              <button
                type="button"
                onClick={() => openPaciente(p)}
                className={cn(
                  "w-full text-left rounded-xl border border-border/80 bg-card/40 p-4",
                  "hover:bg-secondary/30 transition-colors",
                )}
              >
                <div className="flex items-center gap-3 min-w-0">
                  <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-secondary/70 text-muted-foreground">
                    <FolderOpen className="h-5 w-5" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="font-medium truncate flex items-center gap-1.5">
                      <User className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                      <span className="truncate">{p.cliente_nome}</span>
                      {p.can_rename_nome === true && (
                        <PacienteNomeEditButton
                          onClick={(e) => {
                            e.stopPropagation();
                            e.preventDefault();
                            openNomeEdit(p);
                          }}
                        />
                      )}
                    </p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {formatWhatsAppDisplay(p.whatsapp_digits)}
                      {" · "}
                      Último: {formatDateYmd(p.ultimo_atendimento)}
                    </p>
                  </div>
                  <div className="shrink-0 text-right text-xs text-muted-foreground tabular-nums">
                    <p>{p.total_concluidos} atend.</p>
                    <p>{p.total_anotacoes} anot.</p>
                  </div>
                </div>
              </button>
            </li>
          ))}
        </ul>
      )}

      <PacienteNomeEditModal
        open={!!nomeEditTarget}
        whatsappDigits={nomeEditTarget?.whatsapp_digits ?? null}
        initialNome={nomeEditTarget?.cliente_nome ?? ""}
        onClose={() => setNomeEditTarget(null)}
        onSaved={() => undefined}
      />
    </div>
  );
}
