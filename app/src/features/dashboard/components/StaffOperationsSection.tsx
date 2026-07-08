import { useCallback, useEffect, useRef, useState } from "react";
import { CalendarCheck, ChevronDown, ChevronUp, Clock, Loader2, Plus, Trash2, UserPlus } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { syncAgendaFromSlug } from "@/features/agenda/lib/syncAgenda";
import { formatPriceInput, parsePriceInput } from "@agenda/lib/servicePrice";

type Props = {
  barbershopId: string;
  barbershopSlug?: string;
  /** CA agregada: no máximo 1 colaborador ativo (reforço visual da trava no banco). */
  maxActiveStaff?: number;
};

type StaffRow = { id: string; name: string; sort_order: number };
type ServiceRow = { id: string; staff_id: string; name: string; duration_minutes: number; price_cents: number };
type ScheduleRow = { id: string; staff_id: string; day_of_week: number; start_time: string; end_time: string };
type ServiceDraft = { id: string; name: string; duration_minutes: number; price_cents: number };

function isNewServiceDraft(id: string) {
  return id.startsWith("new-");
}

function normalizeServiceName(name: string) {
  return name.trim();
}

function findDuplicateServiceName(drafts: ServiceDraft[]) {
  const seen = new Set<string>();
  for (const draft of drafts) {
    const name = normalizeServiceName(draft.name);
    if (!name) continue;
    const key = name.toLocaleLowerCase("pt-BR");
    if (seen.has(key)) return name;
    seen.add(key);
  }
  return null;
}

function isDuplicateServiceError(error: { code?: string; message?: string }) {
  return error.code === "23505" || error.message?.includes("staff_services_staff_id_name_key") === true;
}

type ScheduleDraft = { day_of_week: number; start_time: string; end_time: string; enabled: boolean };

const DAYS: { value: number; label: string }[] = [
  { value: 0, label: "Domingo" },
  { value: 1, label: "Segunda" },
  { value: 2, label: "Terça" },
  { value: 3, label: "Quarta" },
  { value: 4, label: "Quinta" },
  { value: 5, label: "Sexta" },
  { value: 6, label: "Sábado" },
];

function timeToInput(t: string) {
  return t?.slice(0, 5) ?? "09:00";
}

function isValidTime(value: string) {
  const match = value.match(/^(\d{2}):(\d{2})$/);
  if (!match) return false;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  return hours >= 0 && hours <= 23 && minutes >= 0 && minutes <= 59;
}

function normalizeTimeOnBlur(value: string, fallback: string) {
  const trimmed = value.trim();
  if (!trimmed) return fallback;

  if (isValidTime(trimmed)) return trimmed;

  const digits = trimmed.replace(/\D/g, "");
  if (digits.length === 3) {
    const candidate = `${digits[0].padStart(2, "0")}:${digits.slice(1).padStart(2, "0")}`;
    if (isValidTime(candidate)) return candidate;
  }
  if (digits.length === 4) {
    const candidate = `${digits.slice(0, 2)}:${digits.slice(2)}`;
    if (isValidTime(candidate)) return candidate;
  }

  return fallback;
}

function TimeTextInput({
  value,
  onChange,
  disabled,
  className,
}: {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  className?: string;
}) {
  const lastValid = useRef(value);

  useEffect(() => {
    if (isValidTime(value)) lastValid.current = value;
  }, [value]);

  return (
    <Input
      type="text"
      inputMode="numeric"
      autoComplete="off"
      spellCheck={false}
      placeholder="09:00"
      className={className}
      value={value}
      disabled={disabled}
      maxLength={5}
      onChange={(e) => onChange(e.target.value.replace(/[^\d:]/g, "").slice(0, 5))}
      onBlur={() => {
        const next = normalizeTimeOnBlur(value, lastValid.current);
        onChange(next);
        lastValid.current = next;
      }}
    />
  );
}

function buildScheduleDraft(existing: ScheduleRow[]): ScheduleDraft[] {
  const neverSaved = existing.length === 0;
  return DAYS.map((d) => {
    const row = existing.find((s) => s.day_of_week === d.value);
    if (row) {
      return {
        day_of_week: d.value,
        start_time: timeToInput(row.start_time),
        end_time: timeToInput(row.end_time),
        enabled: true,
      };
    }
    return {
      day_of_week: d.value,
      start_time: "09:00",
      end_time: "18:00",
      // Sem registro no banco = desmarcado. Só sugere seg–sex na primeira vez (nunca salvou).
      enabled: neverSaved && d.value >= 1 && d.value <= 5,
    };
  });
}

const DEFAULT_WEEKDAYS = [1, 2, 3, 4, 5] as const;

function defaultScheduleRows(staffId: string) {
  return DEFAULT_WEEKDAYS.map((day_of_week) => ({
    staff_id: staffId,
    day_of_week,
    start_time: "09:00:00",
    end_time: "18:00:00",
  }));
}

async function syncAgendaQuiet(slug: string | undefined) {
  const { error } = await syncAgendaFromSlug(slug);
  if (error) {
    console.warn("[staff] falha ao sincronizar agenda:", error.message);
  }
}

function showQuickSavedToast(title: string) {
  toast({ title, duration: 2000 });
}

export function StaffOperationsSection({ barbershopId, barbershopSlug, maxActiveStaff }: Props) {
  const [staff, setStaff] = useState<StaffRow[]>([]);
  const [services, setServices] = useState<ServiceRow[]>([]);
  const [schedules, setSchedules] = useState<ScheduleRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [newName, setNewName] = useState("");
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async (options?: { silent?: boolean }) => {
    const silent = options?.silent ?? false;
    if (!silent) setLoading(true);
    try {
      const { data: staffRows, error: staffErr } = await supabase
        .from("staff")
        .select("id, name, sort_order")
        .eq("barbershop_id", barbershopId)
        .eq("is_active", true)
        .order("sort_order")
        .order("name");
      if (staffErr) {
        toast({ title: "Erro ao carregar colaboradores", description: staffErr.message, variant: "destructive" });
        return;
      }
      const list = (staffRows ?? []) as StaffRow[];
      setStaff(list);

      if (list.length === 0) {
        setServices([]);
        setSchedules([]);
        return;
      }

      const ids = list.map((s) => s.id);
      const [{ data: svc }, { data: sch }] = await Promise.all([
        supabase
          .from("staff_services")
          .select("id, staff_id, name, duration_minutes, price_cents")
          .in("staff_id", ids)
          .order("sort_order")
          .order("name"),
        supabase.from("staff_schedules").select("id, staff_id, day_of_week, start_time, end_time").in("staff_id", ids),
      ]);
      setServices((svc ?? []) as ServiceRow[]);
      setSchedules((sch ?? []) as ScheduleRow[]);
    } finally {
      if (!silent) setLoading(false);
    }
  }, [barbershopId]);

  useEffect(() => {
    load();
  }, [load]);

  async function addStaff() {
    const name = newName.trim();
    if (!name) return;
    setBusy("add-staff");
    const { data: created, error } = await supabase
      .from("staff")
      .insert({ barbershop_id: barbershopId, name, sort_order: staff.length })
      .select("id")
      .single();
    if (error) {
      setBusy(null);
      const isCaLimit = error.message?.includes("ca_staff_limit");
      toast({
        title: isCaLimit ? "Limite de colaboradores" : "Erro ao adicionar",
        description: isCaLimit
          ? "Contas agregadas (CA) podem ter no máximo 1 colaborador."
          : error.message,
        variant: "destructive",
      });
      return;
    }

    // Horários seg–sex 09:00–18:00 são gravados pelo trigger no banco (seed_default_staff_schedules).
    // Fallback no app caso a migration ainda não tenha sido aplicada.
    const { count: scheduleCount } = await supabase
      .from("staff_schedules")
      .select("id", { count: "exact", head: true })
      .eq("staff_id", created.id);

    if (!scheduleCount) {
      const { error: scheduleError } = await supabase.from("staff_schedules").insert(defaultScheduleRows(created.id));
      if (scheduleError) {
        setBusy(null);
        toast({
          title: "Colaborador criado, mas horários não foram salvos",
          description: scheduleError.message,
          variant: "destructive",
        });
        await load();
        return;
      }
    }

    await syncAgendaQuiet(barbershopSlug);
    setBusy(null);
    setNewName("");
    toast({ title: "Colaborador adicionado", description: "Já disponível para agendamento (seg–sex, 09:00–18:00)." });
    await load();
  }

  async function updateStaffNameIfNeeded(staffId: string, name: string): Promise<boolean> {
    const trimmed = name.trim();
    if (!trimmed) {
      toast({
        title: "Nome obrigatório",
        description: "Informe o nome do colaborador antes de salvar.",
        variant: "destructive",
      });
      return false;
    }

    const current = staff.find((s) => s.id === staffId)?.name;
    if (trimmed === current) return true;

    setBusy(`staff-${staffId}`);
    const { error } = await supabase.from("staff").update({ name: trimmed }).eq("id", staffId);
    setBusy(null);
    if (error) {
      toast({ title: "Erro ao salvar nome", description: error.message, variant: "destructive" });
      return false;
    }
    await syncAgendaQuiet(barbershopSlug);
    return true;
  }

  async function removeStaff(id: string) {
    if (!confirm("Excluir este colaborador e todos os serviços e horários vinculados?")) return;
    setBusy(`del-staff-${id}`);
    const { error } = await supabase.from("staff").delete().eq("id", id);
    setBusy(null);
    if (error) {
      toast({ title: "Erro ao excluir", description: error.message, variant: "destructive" });
      return;
    }
    if (expandedId === id) setExpandedId(null);
    toast({ title: "Colaborador removido" });
    await syncAgendaQuiet(barbershopSlug);
    await load();
  }

  async function saveStaffMember(
    staffId: string,
    drafts: ServiceDraft[],
    original: ServiceRow[],
    rows: ScheduleDraft[],
    staffName?: string,
  ) {
    if (staffName !== undefined) {
      const nameSaved = await updateStaffNameIfNeeded(staffId, staffName);
      if (!nameSaved) return;
    }

    const existingDrafts = drafts.filter((d) => !isNewServiceDraft(d.id));
    const newDrafts = drafts.filter((d) => isNewServiceDraft(d.id) && normalizeServiceName(d.name));

    const invalidDraft = existingDrafts.find((d) => !normalizeServiceName(d.name));
    if (invalidDraft) {
      toast({
        title: "Nome obrigatório",
        description: "Preencha o nome de todos os serviços antes de salvar.",
        variant: "destructive",
      });
      return;
    }

    const duplicateName = findDuplicateServiceName([
      ...existingDrafts.map((d) => ({ ...d, name: normalizeServiceName(d.name) })),
      ...newDrafts,
    ]);
    if (duplicateName) {
      toast({
        title: "Nome duplicado",
        description: `Já existe um serviço chamado "${duplicateName}" para este colaborador.`,
        variant: "destructive",
      });
      return;
    }

    const enabledRows = rows.filter((r) => r.enabled);
    const invalidRow = enabledRows.find((r) => !isValidTime(r.start_time) || !isValidTime(r.end_time));
    if (invalidRow) {
      const day = DAYS.find((d) => d.value === invalidRow.day_of_week)?.label ?? "dia";
      toast({
        title: "Horário inválido",
        description: `Use o formato HH:MM (ex.: 09:00) em ${day}.`,
        variant: "destructive",
      });
      return;
    }

    setBusy(`save-${staffId}`);

    const updates = existingDrafts.filter((d) => {
      const orig = original.find((o) => o.id === d.id);
      if (!orig) return false;
      const name = normalizeServiceName(d.name);
      return orig.name !== name || orig.duration_minutes !== d.duration_minutes || orig.price_cents !== d.price_cents;
    });

    for (const item of updates) {
      const { error } = await supabase
        .from("staff_services")
        .update({
          name: normalizeServiceName(item.name),
          duration_minutes: item.duration_minutes,
          price_cents: item.price_cents,
        })
        .eq("id", item.id);
      if (error) {
        setBusy(null);
        toast({
          title: isDuplicateServiceError(error) ? "Nome duplicado" : "Erro ao salvar serviços",
          description: isDuplicateServiceError(error)
            ? "Já existe um serviço com esse nome para este colaborador."
            : error.message,
          variant: "destructive",
        });
        return;
      }
    }

    for (const item of newDrafts) {
      const { error } = await supabase.from("staff_services").insert({
        staff_id: staffId,
        name: normalizeServiceName(item.name),
        duration_minutes: item.duration_minutes,
        price_cents: item.price_cents,
      });
      if (error) {
        setBusy(null);
        toast({
          title: isDuplicateServiceError(error) ? "Nome duplicado" : "Erro ao adicionar serviço",
          description: isDuplicateServiceError(error)
            ? "Já existe um serviço com esse nome para este colaborador."
            : error.message,
          variant: "destructive",
        });
        return;
      }
    }

    const { error: delErr } = await supabase.from("staff_schedules").delete().eq("staff_id", staffId);
    if (delErr) {
      setBusy(null);
      toast({ title: "Erro ao salvar horários", description: delErr.message, variant: "destructive" });
      return;
    }

    const toInsert = enabledRows.map((r) => ({
      staff_id: staffId,
      day_of_week: r.day_of_week,
      start_time: `${r.start_time}:00`,
      end_time: `${r.end_time}:00`,
    }));
    if (toInsert.length > 0) {
      const { error } = await supabase.from("staff_schedules").insert(toInsert);
      if (error) {
        setBusy(null);
        toast({ title: "Erro ao salvar horários", description: error.message, variant: "destructive" });
        return;
      }
    }

    setBusy(null);
    showQuickSavedToast("Alterações salvas");
    await syncAgendaQuiet(barbershopSlug);
    await load({ silent: true });
  }

  async function removeService(id: string) {
    setBusy(`svc-del-${id}`);
    const { error } = await supabase.from("staff_services").delete().eq("id", id);
    setBusy(null);
    if (error) {
      toast({ title: "Erro ao excluir serviço", description: error.message, variant: "destructive" });
      return;
    }
    await load({ silent: true });
  }

  const staffAtLimit = maxActiveStaff !== undefined && staff.length >= maxActiveStaff;

  return (
    <Card className="glass-panel border-border/80">
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <CalendarCheck className="h-4 w-4 text-accent" />
          Equipe de atendimento
        </CardTitle>
        <CardDescription>
          {maxActiveStaff === 1
            ? "Conta agregada: apenas 1 colaborador"
            : "Adicione colaboradores, serviços e horários"}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {staffAtLimit ? (
          <p className="text-sm text-muted-foreground rounded-lg border border-dashed border-border p-4">
            Você já atingiu o limite de {maxActiveStaff} colaborador enquanto a conta estiver agregada.
          </p>
        ) : (
          <AddStaffForm newName={newName} setNewName={setNewName} onAdd={addStaff} busy={busy === "add-staff"} />
        )}

        {loading ? (
          <p className="text-sm text-muted-foreground flex items-center gap-2">
            <Loader2 className="h-4 w-4 animate-spin" /> Carregando equipe…
          </p>
        ) : staff.length === 0 ? (
          <p className="text-sm text-muted-foreground rounded-lg border border-dashed border-border p-4 text-center">
            Nenhum colaborador ainda. Adicione o primeiro nome acima.
          </p>
        ) : (
          <ul className="space-y-3">
            {staff.map((member) => (
              <StaffCard
                key={member.id}
                member={member}
                services={services.filter((s) => s.staff_id === member.id)}
                schedules={schedules.filter((s) => s.staff_id === member.id)}
                expanded={expandedId === member.id}
                onToggle={() => setExpandedId((id) => (id === member.id ? null : member.id))}
                busy={busy}
                onRemove={() => removeStaff(member.id)}
                onRemoveService={removeService}
                onSaveStaffMember={(drafts, rows, staffName) =>
                  saveStaffMember(
                    member.id,
                    drafts,
                    services.filter((s) => s.staff_id === member.id),
                    rows,
                    staffName,
                  )
                }
              />
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

function AddStaffForm({
  newName,
  setNewName,
  onAdd,
  busy,
}: {
  newName: string;
  setNewName: (v: string) => void;
  onAdd: () => void;
  busy: boolean;
}) {
  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
      <div className="flex-1 space-y-1.5">
        <Label htmlFor="new-staff">Novo colaborador</Label>
        <Input
          id="new-staff"
          placeholder="Nome do colaborador"
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          maxLength={80}
          onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), onAdd())}
        />
      </div>
      <Button type="button" onClick={onAdd} disabled={busy || !newName.trim()} className="shrink-0">
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserPlus className="h-4 w-4" />}
        Adicionar colaborador
      </Button>
    </div>
  );
}

function StaffCard({
  member,
  services,
  schedules,
  expanded,
  onToggle,
  busy,
  onRemove,
  onSaveStaffMember,
  onRemoveService,
}: {
  member: StaffRow;
  services: ServiceRow[];
  schedules: ScheduleRow[];
  expanded: boolean;
  onToggle: () => void;
  busy: string | null;
  onRemove: () => void;
  onSaveStaffMember: (drafts: ServiceDraft[], rows: ScheduleDraft[], staffName: string) => Promise<void>;
  onRemoveService: (id: string) => void;
}) {
  const [editName, setEditName] = useState(member.name);
  const [scheduleDraft, setScheduleDraft] = useState<ScheduleDraft[]>(() => buildScheduleDraft(schedules));

  useEffect(() => {
    setEditName(member.name);
  }, [member.name]);

  useEffect(() => {
    if (expanded) {
      setEditName(member.name);
      setScheduleDraft(buildScheduleDraft(schedules));
    }
  }, [expanded, member.id, member.name, schedules]);

  return (
    <li className="rounded-lg border border-border bg-card/50 overflow-hidden">
      <div className="flex items-center gap-2 px-3 py-2.5">
        {expanded ? (
          <Input
            className="h-8 flex-1"
            value={editName}
            onChange={(e) => setEditName(e.target.value)}
            maxLength={80}
            aria-label="Nome do colaborador"
          />
        ) : (
          <span className="flex-1 font-medium truncate">{member.name}</span>
        )}
        <Button type="button" variant="ghost" size="icon" className="h-8 w-8 shrink-0 text-muted-foreground hover:text-foreground" onClick={onRemove} aria-label="Excluir">
          <Trash2 className="h-4 w-4" />
        </Button>
        <Button type="button" variant="ghost" size="icon" className="h-8 w-8 shrink-0" onClick={onToggle} aria-label={expanded ? "Recolher" : "Expandir"}>
          {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </Button>
      </div>

      {expanded && (
        <StaffExpanded
          member={member}
          services={services}
          busy={busy}
          onSaveStaffMember={(drafts, rows) => onSaveStaffMember(drafts, rows, editName)}
          onRemoveService={onRemoveService}
          scheduleDraft={scheduleDraft}
          setScheduleDraft={setScheduleDraft}
        />
      )}
    </li>
  );
}

function StaffExpanded(props: {
  member: StaffRow;
  services: ServiceRow[];
  busy: string | null;
  onSaveStaffMember: (drafts: ServiceDraft[], rows: ScheduleDraft[]) => Promise<void>;
  onRemoveService: (id: string) => void;
  scheduleDraft: ScheduleDraft[];
  setScheduleDraft: React.Dispatch<React.SetStateAction<ScheduleDraft[]>>;
}) {
  const { member, services, busy, onSaveStaffMember, onRemoveService, scheduleDraft, setScheduleDraft } = props;

  const [serviceDrafts, setServiceDrafts] = useState<Array<{ id: string; name: string; duration: string; price: string }>>([]);

  useEffect(() => {
    setServiceDrafts((prev) => {
      const fromDb = services.map((s) => ({
        id: s.id,
        name: s.name,
        duration: String(s.duration_minutes),
        price: formatPriceInput(s.price_cents ?? 0),
      }));
      const dbNames = new Set(fromDb.map((s) => s.name.trim().toLocaleLowerCase("pt-BR")));
      const pendingNew = prev.filter(
        (d) => isNewServiceDraft(d.id) && !dbNames.has(d.name.trim().toLocaleLowerCase("pt-BR")),
      );
      return [...pendingNew, ...fromDb];
    });
  }, [services]);

  function handleCreateService() {
    setServiceDrafts((prev) => [{ id: `new-${Date.now()}`, name: "", duration: "30", price: "" }, ...prev]);
  }

  function handleRemoveService(id: string) {
    if (isNewServiceDraft(id)) {
      setServiceDrafts((prev) => prev.filter((d) => d.id !== id));
      return;
    }
    onRemoveService(id);
  }

  async function handleSaveAll() {
    const drafts: ServiceDraft[] = serviceDrafts.map((d) => ({
      id: d.id,
      name: d.name.trim(),
      duration_minutes: parseInt(d.duration, 10) || 30,
      price_cents: parsePriceInput(d.price),
    }));
    await onSaveStaffMember(drafts, scheduleDraft);
  }

  return (
    <div className="border-t border-border px-3 py-4 space-y-5 bg-muted/20">
      <section className="space-y-3">
        <Button type="button" variant="outline" size="sm" onClick={handleCreateService}>
          <Plus className="h-4 w-4" /> Criar serviço
        </Button>
        {serviceDrafts.length > 0 && (
          <ul className="space-y-2">
            {serviceDrafts.map((draft, idx) => (
              <ServiceRowEditor
                key={draft.id}
                name={draft.name}
                duration={draft.duration}
                price={draft.price}
                isNew={isNewServiceDraft(draft.id)}
                onNameChange={(name) => {
                  const next = [...serviceDrafts];
                  next[idx] = { ...draft, name };
                  setServiceDrafts(next);
                }}
                onDurationChange={(duration) => {
                  const next = [...serviceDrafts];
                  next[idx] = { ...draft, duration };
                  setServiceDrafts(next);
                }}
                onPriceChange={(price) => {
                  const next = [...serviceDrafts];
                  next[idx] = { ...draft, price };
                  setServiceDrafts(next);
                }}
                onRemove={() => handleRemoveService(draft.id)}
              />
            ))}
          </ul>
        )}
      </section>

      <section className="space-y-3 pt-3">
        <h4 className="text-sm font-medium flex items-center gap-1.5">
          <Clock className="h-4 w-4" /> Horário de atendimento
        </h4>
        <ul className="space-y-2">
          {scheduleDraft.map((row, idx) => {
            const label = DAYS.find((d) => d.value === row.day_of_week)?.label ?? "";
            return (
              <li
                key={row.day_of_week}
                className={cn(
                  "grid grid-cols-[1fr_auto_1fr] items-center gap-2 rounded-md border border-border/60 p-2 text-sm sm:grid-cols-[7rem_7rem_auto_7rem]",
                  !row.enabled && "opacity-60",
                )}
              >
                <label className="col-span-3 flex items-center gap-2 sm:col-span-1">
                  <input
                    type="checkbox"
                    checked={row.enabled}
                    onChange={(e) => {
                      const next = [...scheduleDraft];
                      next[idx] = { ...row, enabled: e.target.checked };
                      setScheduleDraft(next);
                    }}
                  />
                  {label}
                </label>
                <TimeTextInput
                  className="h-8 w-full text-center tabular-nums"
                  value={row.start_time}
                  disabled={!row.enabled}
                  onChange={(start_time) => {
                    const next = [...scheduleDraft];
                    next[idx] = { ...row, start_time };
                    setScheduleDraft(next);
                  }}
                />
                <span className="text-center text-muted-foreground text-xs">até</span>
                <TimeTextInput
                  className="h-8 w-full text-center tabular-nums"
                  value={row.end_time}
                  disabled={!row.enabled}
                  onChange={(end_time) => {
                    const next = [...scheduleDraft];
                    next[idx] = { ...row, end_time };
                    setScheduleDraft(next);
                  }}
                />
              </li>
            );
          })}
        </ul>
        <Button type="button" size="sm" disabled={busy === `save-${member.id}`} onClick={() => void handleSaveAll()}>
          {busy === `save-${member.id}` ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          Salvar horários
        </Button>
      </section>
    </div>
  );
}

function ServiceRowEditor({
  name,
  duration,
  price,
  isNew,
  onNameChange,
  onDurationChange,
  onPriceChange,
  onRemove,
}: {
  name: string;
  duration: string;
  price: string;
  isNew?: boolean;
  onNameChange: (value: string) => void;
  onDurationChange: (value: string) => void;
  onPriceChange: (value: string) => void;
  onRemove: () => void;
}) {
  return (
    <li className="flex flex-wrap items-center gap-2 rounded-md border border-border/60 p-2">
      <Input
        className="h-8 flex-1 min-w-[120px]"
        placeholder={isNew ? "Ex.: Corte, Barba…" : undefined}
        value={name}
        onChange={(e) => onNameChange(e.target.value)}
        maxLength={120}
        autoFocus={isNew}
      />
      <Input
        type="number"
        className="h-8 w-20"
        min={5}
        max={480}
        step={5}
        value={duration}
        onChange={(e) => onDurationChange(e.target.value)}
      />
      <span className="text-xs text-muted-foreground">min</span>
      <Input
        className="h-8 w-24"
        inputMode="decimal"
        placeholder="Preço"
        value={price}
        onChange={(e) => onPriceChange(e.target.value)}
      />
      <Button type="button" variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-foreground" onClick={onRemove}>
        <Trash2 className="h-4 w-4" />
      </Button>
    </li>
  );
}
