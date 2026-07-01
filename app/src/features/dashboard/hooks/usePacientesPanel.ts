import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { useDebouncedCallback } from "@/hooks/useDebouncedCallback";
import { useDashboardShop } from "@/providers/DashboardShopProvider";
import { useSubscription } from "@/hooks/useSubscription";
import { buildVisibleBarbeariaIds } from "@/features/dashboard/lib/agendamentosPanel";
import { usePainelPacientesBarbeariaIds } from "@/features/dashboard/hooks/usePainelPacientesBarbeariaIds";
import { usePanelPacientesRefresh } from "@/features/dashboard/hooks/usePanelPacientesRefresh";
import {
  PACIENTES_PAINEL_PAGE_LIMIT,
  parsePacienteAnotacoesRpc,
  parsePacientesRpc,
  type PacienteAnotacaoItem,
  type PacientePainelItem,
  type PacienteProfissional,
} from "@/features/dashboard/lib/agendamentoAnotacao";
import { useClienteNomeSyncListener } from "@/features/dashboard/hooks/usePainelClienteNomeBroadcast";
import {
  whatsappMatches,
  dispatchClienteNomeSync,
  isAgendamentoClienteNomeOnlyUpdate,
  clienteNomePayloadFromAgendamentoRow,
} from "@agenda/lib/panelClienteNomeSync";

export type PacienteDetailTab = "historico" | "documentos" | "cadastro";

function mergePacientesUnique(
  prev: PacientePainelItem[],
  next: PacientePainelItem[],
): PacientePainelItem[] {
  const seen = new Set(prev.map((p) => p.whatsapp_digits));
  const merged = [...prev];
  for (const p of next) {
    if (!seen.has(p.whatsapp_digits)) {
      merged.push(p);
      seen.add(p.whatsapp_digits);
    }
  }
  return merged;
}

function patchPacienteInList(
  list: PacientePainelItem[],
  whatsapp: string,
  patch: Partial<PacientePainelItem>,
): PacientePainelItem[] {
  return list.map((p) => (p.whatsapp_digits === whatsapp ? { ...p, ...patch } : p));
}

export function usePacientesPanel() {
  const { caBarbearias, barbeariaId, permissionsRevision } = useDashboardShop();
  const { info: subscriptionInfo } = useSubscription();
  const isCA = subscriptionInfo?.account_type === "ca";

  const fallbackBarbeariaIds = useMemo(
    () => buildVisibleBarbeariaIds(barbeariaId, caBarbearias, isCA),
    [barbeariaId, caBarbearias, isCA],
  );
  const pacientesBarbeariaIds = usePainelPacientesBarbeariaIds(fallbackBarbeariaIds);

  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [pacientes, setPacientes] = useState<PacientePainelItem[]>([]);
  const [profissionais, setProfissionais] = useState<PacienteProfissional[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [profFilter, setProfFilter] = useState<string>("todos");
  const [search, setSearch] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedPaciente, setSelectedPaciente] = useState<PacientePainelItem | null>(null);
  const [detailTab, setDetailTab] = useState<PacienteDetailTab>("historico");
  const [folderItems, setFolderItems] = useState<PacienteAnotacaoItem[]>([]);
  const [folderLoading, setFolderLoading] = useState(false);
  const [anotacaoAgendamentoId, setAnotacaoAgendamentoId] = useState<string | null>(null);
  const [anotacaoClienteNome, setAnotacaoClienteNome] = useState<string | undefined>();
  const [nomeEditTarget, setNomeEditTarget] = useState<{
    whatsapp_digits: string;
    cliente_nome: string;
  } | null>(null);

  const profFilterRef = useRef(profFilter);
  const searchQueryRef = useRef(searchQuery);
  profFilterRef.current = profFilter;
  searchQueryRef.current = searchQuery;

  const fetchPacientesPage = useCallback(async (offset: number) => {
    const barbeiroId = profFilterRef.current === "todos" ? null : profFilterRef.current;
    const q = searchQueryRef.current.trim() || null;
    const { data, error } = await supabase.rpc("list_pacientes_painel", {
      p_barbeiro_id: barbeiroId,
      p_search: q,
      p_limit: PACIENTES_PAINEL_PAGE_LIMIT,
      p_offset: offset,
    });
    if (error) {
      return { error: error.message as string };
    }
    const parsed = parsePacientesRpc(data);
    if (!parsed) {
      const message =
        data && typeof data === "object" && "error" in data
          ? String((data as { error?: string }).error)
          : "Resposta inválida";
      return { error: message };
    }
    return { data: parsed };
  }, []);

  const reloadFirstPage = useCallback(async () => {
    setLoading(true);
    const result = await fetchPacientesPage(0);
    setLoading(false);
    if ("error" in result && result.error) {
      setPacientes([]);
      setProfissionais([]);
      setTotalCount(0);
      setHasMore(false);
      toast({
        title: "Não foi possível carregar pacientes",
        description: result.error,
        variant: "destructive",
      });
      return;
    }
    const page = result.data!;
    setPacientes(page.pacientes);
    setProfissionais(page.profissionais);
    setTotalCount(page.total_count);
    setHasMore(page.has_more);
  }, [fetchPacientesPage]);

  const loadMorePacientes = useCallback(async () => {
    if (loading || loadingMore || !hasMore) return;
    setLoadingMore(true);
    const result = await fetchPacientesPage(pacientes.length);
    setLoadingMore(false);
    if ("error" in result && result.error) {
      toast({
        title: "Não foi possível carregar mais pacientes",
        description: result.error,
        variant: "destructive",
      });
      return;
    }
    const page = result.data!;
    setPacientes((prev) => mergePacientesUnique(prev, page.pacientes));
    setTotalCount(page.total_count);
    setHasMore(page.has_more);
    if (page.profissionais.length > 0) {
      setProfissionais(page.profissionais);
    }
  }, [loading, loadingMore, hasMore, pacientes.length, fetchPacientesPage]);

  usePanelPacientesRefresh(reloadFirstPage);

  const debouncedSetSearchQuery = useDebouncedCallback((value: string) => {
    setSearchQuery(value);
  }, 300);

  const handleSearchChange = useCallback(
    (value: string) => {
      setSearch(value);
      debouncedSetSearchQuery(value);
    },
    [debouncedSetSearchQuery],
  );

  useEffect(() => {
    void reloadFirstPage();
  }, [reloadFirstPage, searchQuery, profFilter, permissionsRevision]);

  const loadFolder = useCallback(
    async (paciente: PacientePainelItem) => {
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
    },
    [profFilter],
  );

  const selectPaciente = useCallback((paciente: PacientePainelItem) => {
    setSelectedPaciente(paciente);
    setDetailTab("historico");
  }, []);

  const clearSelection = useCallback(() => {
    setSelectedPaciente(null);
    setFolderItems([]);
  }, []);

  useEffect(() => {
    if (!selectedPaciente) {
      setFolderItems([]);
      return;
    }
    void loadFolder(selectedPaciente);
  }, [selectedPaciente, profFilter, loadFolder]);

  function openAnotacao(item: PacienteAnotacaoItem) {
    setAnotacaoAgendamentoId(item.agendamento_id);
    setAnotacaoClienteNome(item.cliente_nome);
  }

  function handleAnotacaoSaved() {
    if (selectedPaciente) void loadFolder(selectedPaciente);
    void reloadFirstPage();
  }

  function openNomeEdit(paciente: Pick<PacientePainelItem, "whatsapp_digits" | "cliente_nome">) {
    setNomeEditTarget({
      whatsapp_digits: paciente.whatsapp_digits,
      cliente_nome: paciente.cliente_nome,
    });
  }

  const applyClienteNomeSync = useCallback(
    (payload: { whatsapp_digits: string; nome: string }) => {
      setPacientes((prev) => patchPacienteInList(prev, payload.whatsapp_digits, { cliente_nome: payload.nome }));
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
            void reloadFirstPage();
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
          void reloadFirstPage();
          if (selectedPaciente) void loadFolder(selectedPaciente);
        },
      )
      .subscribe();

    return () => {
      channels.forEach((ch) => void supabase.removeChannel(ch));
      void supabase.removeChannel(anotacoesChannel);
    };
  }, [pacientesBarbeariaIds, reloadFirstPage, loadFolder, selectedPaciente]);

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

  function caLabel(itemBarbeariaId: string) {
    return caBarbearias.find((ca) => ca.barbeariaId === itemBarbeariaId)?.shopName ?? "CA";
  }

  function patchPacienteDataNascimento(whatsapp: string, dataNascimento: string | null) {
    setPacientes((prev) => patchPacienteInList(prev, whatsapp, { data_nascimento: dataNascimento }));
    setSelectedPaciente((prev) =>
      prev?.whatsapp_digits === whatsapp ? { ...prev, data_nascimento: dataNascimento } : prev,
    );
  }

  function patchPacienteAvatar(whatsapp: string, avatarUrl: string | null) {
    setPacientes((prev) => patchPacienteInList(prev, whatsapp, { avatar_url: avatarUrl }));
    setSelectedPaciente((prev) =>
      prev?.whatsapp_digits === whatsapp ? { ...prev, avatar_url: avatarUrl } : prev,
    );
  }

  return {
    isCA,
    barbeariaId,
    caBarbearias,
    loading,
    loadingMore,
    pacientes,
    totalCount,
    hasMore,
    search,
    setSearch: handleSearchChange,
    selectedPaciente,
    selectPaciente,
    clearSelection,
    loadMorePacientes,
    profFilter,
    setProfFilter,
    profFilterOptions,
    showProfFilter,
    detailTab,
    setDetailTab,
    folderItems,
    folderLoading,
    anotacaoAgendamentoId,
    setAnotacaoAgendamentoId,
    anotacaoClienteNome,
    setAnotacaoClienteNome,
    nomeEditTarget,
    setNomeEditTarget,
    openAnotacao,
    handleAnotacaoSaved,
    openNomeEdit,
    caLabel,
    patchPacienteDataNascimento,
    patchPacienteAvatar,
    reloadFirstPage,
  };
}
