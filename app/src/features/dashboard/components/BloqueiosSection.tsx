import { useCallback, useEffect, useMemo, useState } from "react";
import { Ban, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { HorizontalScrollStrip } from "@agenda/components/agenda/HorizontalScrollStrip";
import { buildSlots, type Window } from "@agenda/lib/slots";
import { clearBookingStaticCache } from "@agenda/lib/bookingStaticCache";
import { useDashboardShop } from "@/providers/DashboardShopProvider";

type Props = {
  barbershopId: string;
  barbershopSlug: string;
};

type Disponibilidade = { dia_semana: number; hora_inicio: string; hora_fim: string };
type Profissional = {
  staff_id: string;
  nome: string;
  barbeiro_id: string;
  slot_minutos: number;
  disponibilidades: Disponibilidade[];
};
type Bloqueio = {
  id: string;
  barbeiro_id: string;
  nome?: string;
  data: string;
  hora_inicio: string | null;
  hora_fim: string | null;
  motivo: string | null;
  observacao?: string | null;
  is_ca?: boolean;
};
type BloqueioListItem = {
  id: string;
  barbeiro_id: string;
  nome: string;
  is_ca?: boolean;
  horario: string;
  observacao?: string | null;
};
type FeriasProgramada = {
  barbeiro_id: string;
  nome: string;
  data_inicio: string;
  data_fim: string;
  is_ca?: boolean;
};

type BlockMode = "parcial" | "total";

const BOOKING_MONTHS = 2;
const BLOQUEIOS_PAST_DAYS = 60;
const DIAS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
const MESES = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];

const CONFLICT_MSG =
  "Você tem agendamentos já feitos para este período, altere-os ou cancele para seguir com o bloqueio.";

function ymd(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function isPastDate(dateYmd: string) {
  return dateYmd < ymd(new Date());
}

/** Férias só podem ser encerradas se o último dia for hoje ou futuro. */
function canEncerrarFerias(dataFimYmd: string) {
  return dataFimYmd >= ymd(new Date());
}

function getBloqueiosDayRange() {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const first = new Date(today);
  first.setDate(today.getDate() - BLOQUEIOS_PAST_DAYS);
  const last = new Date(today.getFullYear(), today.getMonth() + BOOKING_MONTHS, 0);
  const days: Date[] = [];
  const cur = new Date(first);
  while (cur <= last) {
    days.push(new Date(cur));
    cur.setDate(cur.getDate() + 1);
  }
  return { first, last, days };
}

function formatDateBr(iso: string) {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("pt-BR");
}

function windowsForDay(prof: Profissional | undefined, dateYmd: string): Window[] {
  if (!prof) return [];
  const dow = new Date(`${dateYmd}T12:00:00`).getDay();
  return prof.disponibilidades
    .filter((d) => d.dia_semana === dow)
    .map((d) => ({ hora_inicio: d.hora_inicio.slice(0, 5), hora_fim: d.hora_fim.slice(0, 5) }));
}

function dayBlocksFromData(bloqueios: Bloqueio[], barbeiroId: string, dateYmd: string) {
  return bloqueios.filter(
    (b) => b.barbeiro_id === barbeiroId && b.data === dateYmd && b.motivo !== "ferias",
  );
}

function inferBlockState(dayBlocks: Bloqueio[]): { mode: BlockMode; slots: string[] } {
  if (dayBlocks.some((b) => !b.hora_inicio && !b.hora_fim)) {
    return { mode: "total", slots: [] };
  }
  const slots = dayBlocks.filter((b) => b.hora_inicio).map((b) => b.hora_inicio!.slice(0, 5));
  return { mode: "parcial", slots };
}

function isFeriasOnDate(bloqueios: Bloqueio[], barbeiroId: string, dateYmd: string) {
  return bloqueios.some(
    (b) =>
      b.barbeiro_id === barbeiroId &&
      b.data === dateYmd &&
      b.motivo === "ferias" &&
      !b.hora_inicio &&
      !b.hora_fim,
  );
}

function formatHoraCurta(time: string) {
  const [h, m] = time.slice(0, 5).split(":").map(Number);
  if (m > 0) return `${h}h${String(m).padStart(2, "0")}`;
  return `${h}h`;
}

function formatIntervaloBloqueio(horaInicio: string, horaFim: string) {
  return `Das ${formatHoraCurta(horaInicio)} às ${formatHoraCurta(horaFim)}`;
}

function resolveProfNome(bloqueios: Bloqueio[], profissionais: Profissional[], barbeiroId: string) {
  return (
    bloqueios.find((b) => b.barbeiro_id === barbeiroId)?.nome ??
    profissionais.find((p) => p.barbeiro_id === barbeiroId)?.nome ??
    "Profissional"
  );
}

function buildBloqueiosListForDay(
  bloqueios: Bloqueio[],
  profissionais: Profissional[],
  dateYmd: string,
): BloqueioListItem[] {
  const dayBlocks = bloqueios.filter((b) => b.data === dateYmd && b.motivo !== "ferias");
  const totals = new Map<string, Bloqueio>();
  const partials: Bloqueio[] = [];

  for (const b of dayBlocks) {
    if (!b.hora_inicio && !b.hora_fim) totals.set(b.barbeiro_id, b);
    else partials.push(b);
  }

  const items: BloqueioListItem[] = [];
  for (const b of totals.values()) {
    const nome = b.nome ?? resolveProfNome(bloqueios, profissionais, b.barbeiro_id);
    items.push({
      id: b.id,
      barbeiro_id: b.barbeiro_id,
      nome,
      is_ca: b.is_ca,
      horario: `${nome} — total`,
      observacao: b.observacao?.trim() || null,
    });
  }

  const partialBarbeiros = new Set(partials.map((b) => b.barbeiro_id));
  const showNomeOnPartial = partialBarbeiros.size > 1 || items.length > 0 || partials.some((b) => b.is_ca);

  for (const b of partials) {
    if (totals.has(b.barbeiro_id)) continue;
    const nome = b.nome ?? resolveProfNome(bloqueios, profissionais, b.barbeiro_id);
    const intervalo = formatIntervaloBloqueio(b.hora_inicio!, b.hora_fim!);
    const base = showNomeOnPartial ? `${nome} — ${intervalo}` : intervalo;
    items.push({
      id: b.id,
      barbeiro_id: b.barbeiro_id,
      nome,
      is_ca: b.is_ca,
      horario: base,
      observacao: b.observacao?.trim() || null,
    });
  }

  return items.sort((a, b) => {
    if (a.is_ca !== b.is_ca) return a.is_ca ? 1 : -1;
    const byName = a.nome.localeCompare(b.nome, "pt-BR");
    if (byName !== 0) return byName;
    return a.horario.localeCompare(b.horario, "pt-BR");
  });
}

function hasTotalBlockOnDate(bloqueios: Bloqueio[], barbeiroId: string, dateYmd: string) {
  return bloqueios.some(
    (b) =>
      b.barbeiro_id === barbeiroId &&
      b.data === dateYmd &&
      b.motivo !== "ferias" &&
      !b.hora_inicio &&
      !b.hora_fim,
  );
}

function savedPartialSlots(bloqueios: Bloqueio[], barbeiroId: string, dateYmd: string) {
  return dayBlocksFromData(bloqueios, barbeiroId, dateYmd)
    .filter((b) => b.hora_inicio)
    .map((b) => b.hora_inicio!.slice(0, 5));
}

function ModeToggle({
  value,
  onChange,
  options,
}: {
  value: string;
  onChange: (v: string) => void;
  options: { id: string; label: string }[];
}) {
  return (
    <div className="inline-flex items-center gap-0.5 rounded-full border border-border/60 bg-muted/30 p-0.5">
      {options.map((opt) => (
        <button
          key={opt.id}
          type="button"
          onClick={() => onChange(opt.id)}
          className={cn(
            "px-2.5 py-1 rounded-full text-xs font-medium transition-all",
            value === opt.id
              ? "bg-primary text-primary-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

function CheckboxRow({
  id,
  label,
  checked,
  onChange,
  disabled,
}: {
  id: string;
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <label
      htmlFor={id}
      className={cn(
        "flex items-center gap-2.5 rounded-lg border border-border/60 px-3 py-2 text-sm cursor-pointer hover:bg-muted/40",
        disabled && "opacity-60 cursor-not-allowed",
      )}
    >
      <input
        id={id}
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
        className="h-4 w-4 rounded border-border accent-primary"
      />
      <span>{label}</span>
    </label>
  );
}

export function BloqueiosSection({ barbershopId, barbershopSlug }: Props) {
  const { slotGridRevision, bumpSlotGridRevision } = useDashboardShop();
  const bookableRange = useMemo(() => getBloqueiosDayRange(), []);
  const hoje = useMemo(() => ymd(new Date()), []);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [encerrandoKey, setEncerrandoKey] = useState<string | null>(null);
  const [profissionais, setProfissionais] = useState<Profissional[]>([]);
  const [bloqueios, setBloqueios] = useState<Bloqueio[]>([]);
  const [feriasProgramadas, setFeriasProgramadas] = useState<FeriasProgramada[]>([]);

  const [modoFerias, setModoFerias] = useState(false);
  const [selectedDate, setSelectedDate] = useState(() => ymd(new Date()));
  const [selectedBarbeiroId, setSelectedBarbeiroId] = useState<string | null>(null);
  const [blockMode, setBlockMode] = useState<BlockMode>("parcial");
  const [selectedSlots, setSelectedSlots] = useState<string[]>([]);
  const [blockObservacao, setBlockObservacao] = useState("");

  const [feriasInicio, setFeriasInicio] = useState(() => ymd(new Date()));
  const [feriasFim, setFeriasFim] = useState(() => ymd(new Date()));
  const [feriasSelectedIds, setFeriasSelectedIds] = useState<Set<string>>(new Set());

  const selectedProf = useMemo(
    () => profissionais.find((p) => p.barbeiro_id === selectedBarbeiroId),
    [profissionais, selectedBarbeiroId],
  );

  const selectedProfOnFerias = useMemo(
    () => (selectedBarbeiroId ? isFeriasOnDate(bloqueios, selectedBarbeiroId, selectedDate) : false),
    [bloqueios, selectedBarbeiroId, selectedDate],
  );

  const bloqueiosPainel = useMemo(
    () => bloqueios.filter((b) => b.motivo !== "ferias"),
    [bloqueios],
  );

  const bloqueiosDoDia = useMemo(
    () => buildBloqueiosListForDay(bloqueios, profissionais, selectedDate),
    [bloqueios, profissionais, selectedDate],
  );

  const selectedProfTotalBlock = useMemo(
    () => (selectedBarbeiroId ? hasTotalBlockOnDate(bloqueios, selectedBarbeiroId, selectedDate) : false),
    [bloqueios, selectedBarbeiroId, selectedDate],
  );

  const savedSlotsForDay = useMemo(
    () => (selectedBarbeiroId ? savedPartialSlots(bloqueios, selectedBarbeiroId, selectedDate) : []),
    [bloqueios, selectedBarbeiroId, selectedDate],
  );

  const slotGrid = useMemo(() => {
    if (selectedProfOnFerias) return [];
    const windows = windowsForDay(selectedProf, selectedDate);
    if (!selectedProf || windows.length === 0) return [];
    return buildSlots(windows, selectedProf.slot_minutos);
  }, [selectedProf, selectedDate, selectedProfOnFerias]);

  const profWorksOnSelectedDay = useMemo(() => {
    if (!selectedProf || selectedProfOnFerias) return false;
    return windowsForDay(selectedProf, selectedDate).length > 0;
  }, [selectedProf, selectedDate, selectedProfOnFerias]);

  const selectedDateIsPast = useMemo(() => isPastDate(selectedDate), [selectedDate]);
  const canCreateOrEditBlocks = !selectedDateIsPast;

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    const { first, last } = bookableRange;
    const { data, error } = await supabase.rpc("get_bloqueios_painel", {
      p_barbershop_id: barbershopId,
      p_from: ymd(first),
      p_to: ymd(last),
    });
    setLoading(false);

    if (error) {
      setLoadError(error.message);
      toast({ title: "Erro ao carregar bloqueios", description: error.message, variant: "destructive" });
      return;
    }

    const payload = data as {
      error?: string;
      profissionais?: Profissional[];
      bloqueios?: Bloqueio[];
      ferias_programadas?: FeriasProgramada[];
    };

    if (payload.error) {
      setLoadError(payload.error);
      toast({ title: "Erro ao carregar bloqueios", description: payload.error, variant: "destructive" });
      return;
    }

    const profs = payload.profissionais ?? [];
    const loadedBloqueios = payload.bloqueios ?? [];
    setProfissionais(profs);
    setBloqueios(loadedBloqueios);
    setFeriasProgramadas(payload.ferias_programadas ?? []);
    setFeriasSelectedIds(new Set(profs.map((p) => p.barbeiro_id)));
  }, [barbershopId, bookableRange]);

  useEffect(() => {
    void load();
  }, [load, slotGridRevision]);

  useEffect(() => {
    if (profissionais.length === 0) {
      setSelectedBarbeiroId(null);
      return;
    }
    if (!selectedBarbeiroId || !profissionais.some((p) => p.barbeiro_id === selectedBarbeiroId)) {
      setSelectedBarbeiroId(profissionais[0].barbeiro_id);
    }
  }, [profissionais, selectedBarbeiroId]);

  useEffect(() => {
    if (!selectedBarbeiroId || selectedProfOnFerias) return;
    const dayBlocks = dayBlocksFromData(bloqueios, selectedBarbeiroId, selectedDate);
    const { mode, slots } = inferBlockState(dayBlocks);
    setBlockMode(mode);
    setSelectedSlots(slots);
    const savedObs = dayBlocks.find((b) => b.observacao?.trim())?.observacao?.trim() ?? "";
    setBlockObservacao(savedObs);
  }, [bloqueios, selectedBarbeiroId, selectedDate, selectedProfOnFerias]);

  function toggleSlot(slot: string) {
    if (!canCreateOrEditBlocks) return;
    setSelectedSlots((prev) => (prev.includes(slot) ? prev.filter((s) => s !== slot) : [...prev, slot]));
  }

  function toggleFeriasProf(barbeiroId: string, checked: boolean) {
    setFeriasSelectedIds((prev) => {
      const next = new Set(prev);
      if (checked) next.add(barbeiroId);
      else next.delete(barbeiroId);
      return next;
    });
  }

  async function handleEncerrarFeriasIndividual(barbeiroId: string) {
    const ferias = feriasProgramadas.find((f) => f.barbeiro_id === barbeiroId);
    if (ferias && !canEncerrarFerias(ferias.data_fim)) return;
    const key = `ferias-${barbeiroId}`;
    setEncerrandoKey(key);
    const { error } = await supabase.rpc("encerrar_bloqueios_ferias_painel", {
      p_barbeiro_ids: [barbeiroId],
    });
    setEncerrandoKey(null);
    if (error) {
      toast({ title: "Erro ao encerrar férias", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "Férias encerradas" });
    await afterSave();
  }

  async function handleEncerrarBloqueio(bloqueioId: string) {
    if (selectedDateIsPast) return;
    const key = `bloqueio-${bloqueioId}`;
    setEncerrandoKey(key);
    const { error } = await supabase.rpc("encerrar_bloqueio_painel", {
      p_bloqueio_id: bloqueioId,
    });
    setEncerrandoKey(null);
    if (error) {
      toast({ title: "Erro ao encerrar bloqueio", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "Bloqueio encerrado" });
    await afterSave();
  }

  function renderBloqueiosAtivosList() {
    if (bloqueiosDoDia.length === 0) return null;
    const podeEncerrar = canCreateOrEditBlocks;
    return (
      <div className="space-y-2.5 pt-2 border-t border-border/60">
        <p className="text-sm font-semibold">Bloqueios:</p>
        <ul className="space-y-2">
          {bloqueiosDoDia.map((item) => (
            <li
              key={item.id}
              className="flex flex-col gap-2 rounded-lg border border-border/60 px-3 py-2.5 sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="min-w-0 text-sm flex-1 flex items-center gap-2 min-w-0">
                <span className="font-medium shrink-0">{item.horario}</span>
                {item.is_ca && (
                  <span className="shrink-0 text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-secondary text-muted-foreground leading-none">
                    CA
                  </span>
                )}
                {item.observacao ? (
                  <>
                    <span className="shrink-0 text-muted-foreground">—</span>
                    <span className="truncate text-muted-foreground min-w-0">{item.observacao}</span>
                  </>
                ) : null}
              </div>
              {!item.is_ca && podeEncerrar && (
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  className="shrink-0 w-full sm:w-auto"
                  disabled={encerrandoKey === `bloqueio-${item.id}`}
                  onClick={() => void handleEncerrarBloqueio(item.id)}
                >
                  {encerrandoKey === `bloqueio-${item.id}` ? (
                    <>
                      <Loader2 className="h-3.5 w-3.5 animate-spin" /> Encerrando…
                    </>
                  ) : (
                    "Encerrar"
                  )}
                </Button>
              )}
            </li>
          ))}
        </ul>
      </div>
    );
  }

  function renderFeriasProgramadasList() {
    if (feriasProgramadas.length === 0) return null;
    return (
      <div className="space-y-2.5 pt-2 border-t border-border/60">
        <p className="text-sm font-semibold">Profissionais de férias:</p>
        <ul className="space-y-2">
          {feriasProgramadas.map((f) => (
            <li
              key={`${f.barbeiro_id}-${f.data_inicio}`}
              className="flex flex-col gap-2 rounded-lg border border-border/60 px-3 py-2.5 sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="min-w-0 text-sm flex-1">
                <p className="font-medium truncate flex items-center gap-1.5 flex-wrap">
                  <span className="truncate">{f.nome}</span>
                  {f.is_ca && (
                    <span className="shrink-0 text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-secondary text-muted-foreground leading-none">
                      CA
                    </span>
                  )}
                </p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {formatDateBr(f.data_inicio)} — {formatDateBr(f.data_fim)}
                </p>
              </div>
              {!f.is_ca && canEncerrarFerias(f.data_fim) && (
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  className="shrink-0 w-full sm:w-auto"
                  disabled={encerrandoKey === `ferias-${f.barbeiro_id}`}
                  onClick={() => void handleEncerrarFeriasIndividual(f.barbeiro_id)}
                >
                  {encerrandoKey === `ferias-${f.barbeiro_id}` ? (
                    <>
                      <Loader2 className="h-3.5 w-3.5 animate-spin" /> Encerrando…
                    </>
                  ) : (
                    "Encerrar férias"
                  )}
                </Button>
              )}
            </li>
          ))}
        </ul>
      </div>
    );
  }

  function renderProfissionalChip(p: Profissional, sel: boolean) {
    const onFerias = isFeriasOnDate(bloqueios, p.barbeiro_id, selectedDate);
    const onTotalBlock = !onFerias && hasTotalBlockOnDate(bloqueios, p.barbeiro_id, selectedDate);
    const unavailable = onFerias || onTotalBlock;
    return (
      <button
        key={p.barbeiro_id}
        type="button"
        data-barbeiro={p.barbeiro_id}
        onClick={() => setSelectedBarbeiroId(p.barbeiro_id)}
        className={cn(
          "snap-start shrink-0 min-w-[6.5rem] px-3 rounded-full text-sm font-semibold transition-all flex flex-col items-center justify-center",
          unavailable ? "py-1.5 min-h-[2.75rem]" : "h-10",
          unavailable
            ? sel
              ? "bg-unavailable text-unavailable-foreground ring-2 ring-unavailable/60 ring-offset-2 ring-offset-background"
              : "bg-unavailable text-unavailable-foreground opacity-90"
            : sel
              ? "bg-primary text-primary-foreground shadow-glow h-10"
              : "bg-secondary text-secondary-foreground hover:bg-secondary/80 h-10",
        )}
      >
        <span className="leading-tight">{p.nome}</span>
        {onFerias && <span className="text-[9px] font-medium leading-none mt-0.5 opacity-90">férias</span>}
        {onTotalBlock && (
          <span className="text-[9px] font-medium leading-none mt-0.5 opacity-90">bloqueado</span>
        )}
      </button>
    );
  }

  async function afterSave() {
    clearBookingStaticCache(barbershopSlug);
    bumpSlotGridRevision();
    await load();
  }

  function showRpcError(error: { message?: string }) {
    let msg = error.message ?? "Erro desconhecido";
    if (msg.includes("agendamentos já feitos")) msg = CONFLICT_MSG;
    toast({ title: "Não foi possível salvar", description: msg, variant: "destructive" });
  }

  async function handleSaveDay() {
    if (!selectedBarbeiroId || selectedProfOnFerias || !profWorksOnSelectedDay || selectedDateIsPast) return;
    setSaving(true);
    const { error } = await supabase.rpc("salvar_bloqueios_dia_painel", {
      p_barbeiro_id: selectedBarbeiroId,
      p_data: selectedDate,
      p_modo: blockMode,
      p_horarios: blockMode === "parcial" ? selectedSlots : [],
      p_observacao: blockObservacao.trim() || null,
    });
    setSaving(false);
    if (error) {
      showRpcError(error);
      return;
    }
    toast({ title: "Bloqueio salvo" });
    await afterSave();
  }

  async function handleSaveFerias() {
    const ids = [...feriasSelectedIds];
    if (ids.length === 0) {
      toast({ title: "Selecione ao menos um profissional", variant: "destructive" });
      return;
    }
    if (feriasFim < feriasInicio) {
      toast({ title: "Data final deve ser igual ou posterior à inicial", variant: "destructive" });
      return;
    }
    setSaving(true);
    const { error } = await supabase.rpc("salvar_bloqueios_ferias_painel", {
      p_barbeiro_ids: ids,
      p_data_inicio: feriasInicio,
      p_data_fim: feriasFim,
    });
    setSaving(false);
    if (error) {
      showRpcError(error);
      return;
    }
    toast({ title: "Férias registradas" });
    await afterSave();
  }

  const dataLabel = useMemo(() => {
    const [y, m, d] = selectedDate.split("-").map(Number);
    return new Date(y, m - 1, d).toLocaleDateString("pt-BR", {
      weekday: "long",
      day: "numeric",
      month: "long",
    });
  }, [selectedDate]);

  const showProfissionalStrip =
    profissionais.length > 1 ||
    (profissionais.length === 1 &&
      selectedBarbeiroId != null &&
      (isFeriasOnDate(bloqueios, profissionais[0].barbeiro_id, selectedDate) ||
        hasTotalBlockOnDate(bloqueios, profissionais[0].barbeiro_id, selectedDate)));

  const hasOwnProfissionais = profissionais.length > 0;
  const hasFeriasVisiveis = feriasProgramadas.length > 0;
  const hasPainelBloqueiosVisiveis = bloqueiosPainel.length > 0;
  const showSectionContent = hasOwnProfissionais || hasFeriasVisiveis || hasPainelBloqueiosVisiveis;

  return (
    <Card className="glass-panel border-border/80">
      <CardHeader className="pb-3">
        <CardTitle className="text-base font-semibold tracking-tight flex items-center gap-2">
          <Ban className="h-4 w-4 text-primary" />
          Bloqueios
        </CardTitle>
        <CardDescription>
          Bloqueie horários ou registre férias dos profissionais. Reflete imediatamente no link de agendamento.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        {loading ? (
          <div className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Carregando…
          </div>
        ) : loadError ? (
          <div className="space-y-3 py-2">
            <p className="text-sm text-destructive">Não foi possível carregar os bloqueios.</p>
            <Button type="button" variant="secondary" size="sm" onClick={() => void load()}>
              Tentar novamente
            </Button>
          </div>
        ) : !showSectionContent ? (
          <p className="text-sm text-muted-foreground py-2">
            Cadastre profissionais na equipe de atendimento para gerenciar bloqueios.
          </p>
        ) : (
          <>
            {(hasOwnProfissionais || hasFeriasVisiveis) && (
            <div className="flex flex-wrap items-center gap-2">
              <ModeToggle
                value={modoFerias ? "ferias" : "bloqueio"}
                onChange={(v) => setModoFerias(v === "ferias")}
                options={[
                  { id: "bloqueio", label: "Bloqueio" },
                  { id: "ferias", label: "Modo férias" },
                ]}
              />
            </div>
            )}

            {modoFerias ? (
              <div className="space-y-4">
                {hasOwnProfissionais && (
                  <>
                <div className="space-y-2">
                  <Label>Profissionais</Label>
                  <ul className="space-y-2">
                    {profissionais.map((p) => (
                      <li key={p.barbeiro_id}>
                        <CheckboxRow
                          id={`ferias-${p.barbeiro_id}`}
                          label={p.nome}
                          checked={feriasSelectedIds.has(p.barbeiro_id)}
                          onChange={(checked) => toggleFeriasProf(p.barbeiro_id, checked)}
                        />
                      </li>
                    ))}
                  </ul>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label htmlFor="ferias-inicio">Início</Label>
                    <Input
                      id="ferias-inicio"
                      type="date"
                      value={feriasInicio}
                      min={hoje}
                      max={ymd(bookableRange.last)}
                      onChange={(e) => setFeriasInicio(e.target.value)}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="ferias-fim">Fim</Label>
                    <Input
                      id="ferias-fim"
                      type="date"
                      value={feriasFim}
                      min={feriasInicio}
                      max={ymd(bookableRange.last)}
                      onChange={(e) => setFeriasFim(e.target.value)}
                    />
                  </div>
                </div>
                <Button type="button" className="w-full sm:w-auto" disabled={saving} onClick={() => void handleSaveFerias()}>
                  {saving ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" /> Salvando…
                    </>
                  ) : (
                    "Salvar férias"
                  )}
                </Button>
                  </>
                )}
                {renderFeriasProgramadasList()}
              </div>
            ) : hasOwnProfissionais || hasPainelBloqueiosVisiveis ? (
              <>
                <section>
                  <h3 className="text-sm font-semibold mb-2.5">Dia</h3>
                  <HorizontalScrollStrip centerOn={`[data-day="${selectedDate}"]`}>
                    {bookableRange.days.map((d) => {
                      const key = ymd(d);
                      const sel = key === selectedDate;
                      const isToday = key === ymd(new Date());
                      const dayTotalBlock =
                        selectedBarbeiroId != null &&
                        hasTotalBlockOnDate(bloqueios, selectedBarbeiroId, key);
                      return (
                        <button
                          key={key}
                          type="button"
                          data-day={key}
                          onClick={() => setSelectedDate(key)}
                          className={cn(
                            "snap-start shrink-0 w-[60px] h-[4.5rem] rounded-xl flex flex-col items-center justify-center font-semibold transition-all active:scale-95",
                            sel && dayTotalBlock
                              ? "bg-unavailable text-unavailable-foreground ring-2 ring-unavailable/60 ring-offset-2 ring-offset-background"
                              : sel
                                ? "bg-primary text-primary-foreground shadow-glow ring-2 ring-primary ring-offset-2 ring-offset-background"
                                : dayTotalBlock
                                  ? "bg-unavailable/80 text-unavailable-foreground opacity-90"
                                  : "bg-secondary text-secondary-foreground hover:bg-secondary/80",
                          )}
                        >
                          <span className="text-[10px] opacity-90 font-medium">{DIAS[d.getDay()]}</span>
                          <span className="font-display text-lg leading-none my-0.5">{d.getDate()}</span>
                          <span className="text-[9px] opacity-80">{MESES[d.getMonth()]}</span>
                          {isToday && !sel && (
                            <span className="text-[8px] mt-0.5 font-medium text-primary">Hoje</span>
                          )}
                        </button>
                      );
                    })}
                  </HorizontalScrollStrip>
                  <p className="mt-2 text-xs text-muted-foreground capitalize">{dataLabel}</p>
                </section>

                {hasOwnProfissionais && showProfissionalStrip && (
                  <section>
                    <h3 className="text-sm font-semibold mb-2.5">Profissional</h3>
                    <HorizontalScrollStrip centerOn={selectedBarbeiroId ? `[data-barbeiro="${selectedBarbeiroId}"]` : null}>
                      {profissionais.map((p) => renderProfissionalChip(p, p.barbeiro_id === selectedBarbeiroId))}
                    </HorizontalScrollStrip>
                  </section>
                )}

                {hasOwnProfissionais && selectedProfOnFerias ? (
                  <p className="text-sm text-muted-foreground">
                    {selectedProf?.nome} está de férias neste dia — bloqueios parciais ou totais não se aplicam.
                  </p>
                ) : hasOwnProfissionais && selectedDateIsPast ? (
                  <p className="text-sm text-muted-foreground">
                    Não é possível criar ou alterar bloqueios em dias passados.
                  </p>
                ) : hasOwnProfissionais ? (
                  <>
                    <div className="flex flex-wrap items-center gap-2">
                      <ModeToggle
                        value={blockMode}
                        onChange={(v) => setBlockMode(v as BlockMode)}
                        options={[
                          { id: "parcial", label: "Parcial" },
                          { id: "total", label: "Total" },
                        ]}
                      />
                    </div>

                    {blockMode === "parcial" && (
                      <section>
                        <h3 className="text-sm font-semibold mb-2.5">Horários bloqueados</h3>
                        {slotGrid.length === 0 ? (
                          <p className="text-sm text-muted-foreground">
                            Este profissional não trabalha neste dia.
                          </p>
                        ) : (
                          <>
                            <HorizontalScrollStrip centerOn={selectedSlots[0] ? `[data-slot="${selectedSlots[0]}"]` : null}>
                              {slotGrid.map((slot) => {
                                const persisted = savedSlotsForDay.includes(slot);
                                const draft = selectedSlots.includes(slot);
                                const blocked = persisted || draft;
                                return (
                                  <button
                                    key={slot}
                                    type="button"
                                    data-slot={slot}
                                    onClick={() => toggleSlot(slot)}
                                    className={cn(
                                      "snap-start shrink-0 min-w-[3.25rem] px-2.5 h-9 rounded-lg text-xs font-semibold tabular-nums transition-all",
                                      blocked
                                        ? "bg-unavailable text-unavailable-foreground"
                                        : "bg-secondary text-secondary-foreground hover:bg-secondary/80",
                                    )}
                                  >
                                    {slot}
                                  </button>
                                );
                              })}
                            </HorizontalScrollStrip>
                            <p className="mt-2 text-xs text-muted-foreground">
                              Toque nos horários para marcar ou desmarcar. Salvar sem nenhum horário remove os bloqueios do dia.
                            </p>
                          </>
                        )}
                      </section>
                    )}

                    {blockMode === "total" && (
                      <p className="text-sm text-muted-foreground">
                        {selectedProfTotalBlock
                          ? `O dia inteiro está bloqueado para ${selectedProf?.nome ?? "este profissional"}.`
                          : "O dia inteiro ficará bloqueado para agendamentos (férias já registradas não são alteradas)."}
                      </p>
                    )}

                    <div className="space-y-1.5">
                      <Label htmlFor="bloqueio-motivo">Motivo (opcional)</Label>
                      <Input
                        id="bloqueio-motivo"
                        value={blockObservacao}
                        maxLength={120}
                        placeholder="Ex.: consulta médica, evento…"
                        onChange={(e) => setBlockObservacao(e.target.value)}
                      />
                    </div>

                    <Button
                      type="button"
                      className="w-full sm:w-auto"
                      disabled={saving || !profWorksOnSelectedDay}
                      onClick={() => void handleSaveDay()}
                    >
                      {saving ? (
                        <>
                          <Loader2 className="h-4 w-4 animate-spin" /> Salvando…
                        </>
                      ) : (
                        "Salvar"
                      )}
                    </Button>
                  </>
                ) : null}

                {renderBloqueiosAtivosList()}
              </>
            ) : (
              <p className="text-sm text-muted-foreground">
                Use o modo férias para ver os profissionais de contas agregadas (CA).
              </p>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
