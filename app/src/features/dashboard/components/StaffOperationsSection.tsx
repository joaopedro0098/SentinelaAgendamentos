import { useCallback, useEffect, useRef, useState } from "react";
import { CalendarCheck, ChevronDown, ChevronUp, Clock, Loader2, Pencil, Plus, Trash2, UserPlus } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

type StaffRow = { id: string; name: string; sort_order: number };
type ServiceRow = { id: string; staff_id: string; name: string; duration_minutes: number };
type ScheduleRow = { id: string; staff_id: string; day_of_week: number; start_time: string; end_time: string };
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

type Props = { barbershopId: string };

export function StaffOperationsSection({ barbershopId }: Props) {
  const [staff, setStaff] = useState<StaffRow[]>([]);
  const [services, setServices] = useState<ServiceRow[]>([]);
  const [schedules, setSchedules] = useState<ScheduleRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [newName, setNewName] = useState("");
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const { data: staffRows, error: staffErr } = await supabase
      .from("staff")
      .select("id, name, sort_order")
      .eq("barbershop_id", barbershopId)
      .eq("is_active", true)
      .order("sort_order")
      .order("name");
    if (staffErr) {
      toast({ title: "Erro ao carregar colaboradores", description: staffErr.message, variant: "destructive" });
      setLoading(false);
      return;
    }
    const list = (staffRows ?? []) as StaffRow[];
    setStaff(list);

    if (list.length === 0) {
      setServices([]);
      setSchedules([]);
      setLoading(false);
      return;
    }

    const ids = list.map((s) => s.id);
    const [{ data: svc }, { data: sch }] = await Promise.all([
      supabase
        .from("staff_services")
        .select("id, staff_id, name, duration_minutes")
        .in("staff_id", ids)
        .order("sort_order")
        .order("name"),
      supabase.from("staff_schedules").select("id, staff_id, day_of_week, start_time, end_time").in("staff_id", ids),
    ]);
    setServices((svc ?? []) as ServiceRow[]);
    setSchedules((sch ?? []) as ScheduleRow[]);
    setLoading(false);
  }, [barbershopId]);

  useEffect(() => {
    load();
  }, [load]);

  async function addStaff() {
    const name = newName.trim();
    if (!name) return;
    setBusy("add-staff");
    const { error } = await supabase.from("staff").insert({ barbershop_id: barbershopId, name, sort_order: staff.length });
    setBusy(null);
    if (error) {
      toast({ title: "Erro ao adicionar", description: error.message, variant: "destructive" });
      return;
    }
    setNewName("");
    toast({ title: "Colaborador adicionado" });
    await load();
  }

  async function renameStaff(id: string, name: string) {
    const trimmed = name.trim();
    if (!trimmed) return;
    setBusy(`staff-${id}`);
    const { error } = await supabase.from("staff").update({ name: trimmed }).eq("id", id);
    setBusy(null);
    if (error) {
      toast({ title: "Erro ao renomear", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "Nome atualizado" });
    await load();
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
    await load();
  }

  async function addService(staffId: string, name: string, duration: number) {
    const trimmed = name.trim();
    if (!trimmed) return;
    setBusy(`svc-add-${staffId}`);
    const { error } = await supabase.from("staff_services").insert({
      staff_id: staffId,
      name: trimmed,
      duration_minutes: duration,
    });
    setBusy(null);
    if (error) {
      toast({ title: "Erro ao adicionar serviço", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "Serviço adicionado" });
    await load();
  }

  async function updateService(id: string, patch: { name?: string; duration_minutes?: number }) {
    setBusy(`svc-${id}`);
    const { error } = await supabase.from("staff_services").update(patch).eq("id", id);
    setBusy(null);
    if (error) {
      toast({ title: "Erro ao salvar serviço", description: error.message, variant: "destructive" });
      return;
    }
    await load();
  }

  async function removeService(id: string) {
    setBusy(`svc-del-${id}`);
    const { error } = await supabase.from("staff_services").delete().eq("id", id);
    setBusy(null);
    if (error) {
      toast({ title: "Erro ao excluir serviço", description: error.message, variant: "destructive" });
      return;
    }
    await load();
  }

  async function saveSchedules(staffId: string, rows: ScheduleDraft[]) {
    setBusy(`sch-${staffId}`);
    const { error: delErr } = await supabase.from("staff_schedules").delete().eq("staff_id", staffId);
    if (delErr) {
      setBusy(null);
      toast({ title: "Erro ao salvar horários", description: delErr.message, variant: "destructive" });
      return;
    }
    const enabledRows = rows.filter((r) => r.enabled);
    const invalidRow = enabledRows.find((r) => !isValidTime(r.start_time) || !isValidTime(r.end_time));
    if (invalidRow) {
      setBusy(null);
      const day = DAYS.find((d) => d.value === invalidRow.day_of_week)?.label ?? "dia";
      toast({
        title: "Horário inválido",
        description: `Use o formato HH:MM (ex.: 09:00) em ${day}.`,
        variant: "destructive",
      });
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
    toast({ title: "Horários salvos" });
    await load();
  }

  return (
    <Card className="glass-panel border-border/80">
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <CalendarCheck className="h-4 w-4 text-primary" />
          Equipe e atendimento
        </CardTitle>
        <CardDescription>
          Cadastre colaboradores, os serviços que cada um realiza, a duração de cada serviço e o horário de atendimento.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <AddStaffForm newName={newName} setNewName={setNewName} onAdd={addStaff} busy={busy === "add-staff"} />

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
                onRename={(name) => renameStaff(member.id, name)}
                onRemove={() => removeStaff(member.id)}
                onAddService={(name, dur) => addService(member.id, name, dur)}
                onUpdateService={updateService}
                onRemoveService={removeService}
                onSaveSchedules={(rows) => saveSchedules(member.id, rows)}
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
  onRename,
  onRemove,
  onAddService,
  onUpdateService,
  onRemoveService,
  onSaveSchedules,
}: {
  member: StaffRow;
  services: ServiceRow[];
  schedules: ScheduleRow[];
  expanded: boolean;
  onToggle: () => void;
  busy: string | null;
  onRename: (name: string) => void;
  onRemove: () => void;
  onAddService: (name: string, duration: number) => void;
  onUpdateService: (id: string, patch: { name?: string; duration_minutes?: number }) => void;
  onRemoveService: (id: string) => void;
  onSaveSchedules: (rows: ScheduleDraft[]) => void;
}) {
  const [editName, setEditName] = useState(member.name);
  const [editingName, setEditingName] = useState(false);
  const [newSvcName, setNewSvcName] = useState("");
  const [newSvcDuration, setNewSvcDuration] = useState("30");
  const [scheduleDraft, setScheduleDraft] = useState<ScheduleDraft[]>(() => buildScheduleDraft(schedules));

  useEffect(() => {
    setEditName(member.name);
  }, [member.name]);

  useEffect(() => {
    if (expanded) setScheduleDraft(buildScheduleDraft(schedules));
  }, [expanded, schedules]);

  return (
    <li className="rounded-lg border border-border bg-card/50 overflow-hidden">
      <div className="flex items-center gap-2 px-3 py-2.5">
        {editingName ? (
          <Input
            className="h-8 flex-1"
            value={editName}
            onChange={(e) => setEditName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                onRename(editName);
                setEditingName(false);
              }
              if (e.key === "Escape") {
                setEditName(member.name);
                setEditingName(false);
              }
            }}
            autoFocus
          />
        ) : (
          <button type="button" className="flex-1 text-left font-medium truncate" onClick={onToggle}>
            {member.name}
          </button>
        )}
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-8 w-8 shrink-0"
          onClick={() => {
            if (editingName) {
              onRename(editName);
              setEditingName(false);
            } else {
              setEditingName(true);
            }
          }}
          disabled={busy === `staff-${member.id}`}
          aria-label="Editar nome"
        >
          <Pencil className="h-4 w-4" />
        </Button>
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
          newSvcName={newSvcName}
          setNewSvcName={setNewSvcName}
          newSvcDuration={newSvcDuration}
          setNewSvcDuration={setNewSvcDuration}
          onAddService={onAddService}
          onUpdateService={onUpdateService}
          onRemoveService={onRemoveService}
          scheduleDraft={scheduleDraft}
          setScheduleDraft={setScheduleDraft}
          onSaveSchedules={onSaveSchedules}
        />
      )}
    </li>
  );
}

function StaffExpanded(props: {
  member: StaffRow;
  services: ServiceRow[];
  busy: string | null;
  newSvcName: string;
  setNewSvcName: (v: string) => void;
  newSvcDuration: string;
  setNewSvcDuration: (v: string) => void;
  onAddService: (name: string, duration: number) => void;
  onUpdateService: (id: string, patch: { name?: string; duration_minutes?: number }) => void;
  onRemoveService: (id: string) => void;
  scheduleDraft: ScheduleDraft[];
  setScheduleDraft: React.Dispatch<React.SetStateAction<ScheduleDraft[]>>;
  onSaveSchedules: (rows: ScheduleDraft[]) => void;
}) {
  const {
    member,
    services,
    busy,
    newSvcName,
    setNewSvcName,
    newSvcDuration,
    setNewSvcDuration,
    onAddService,
    onUpdateService,
    onRemoveService,
    scheduleDraft,
    setScheduleDraft,
    onSaveSchedules,
  } = props;

  return (
    <div className="border-t border-border px-3 py-4 space-y-5 bg-muted/20">
      <section className="space-y-3">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
          <ServiceNameField newSvcName={newSvcName} setNewSvcName={setNewSvcName} onAdd={() => onAddService(newSvcName, parseInt(newSvcDuration, 10) || 30)} />
          <div className="space-y-1.5 w-full sm:w-28">
            <Label htmlFor={`dur-${member.id}`}>Minutos</Label>
            <Input
              id={`dur-${member.id}`}
              type="number"
              min={5}
              max={480}
              step={5}
              value={newSvcDuration}
              onChange={(e) => setNewSvcDuration(e.target.value)}
            />
          </div>
          <Button
            type="button"
            variant="outline"
            className="shrink-0"
            disabled={busy === `svc-add-${member.id}` || !newSvcName.trim()}
            onClick={() => {
              onAddService(newSvcName, parseInt(newSvcDuration, 10) || 30);
              setNewSvcName("");
            }}
          >
            <Plus className="h-4 w-4" /> Serviço
          </Button>
        </div>
        {services.length > 0 && (
          <ul className="space-y-2">
            {services.map((svc) => (
              <ServiceRowEditor
                key={svc.id}
                svc={svc}
                busy={busy}
                onUpdate={onUpdateService}
                onRemove={onRemoveService}
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
        <Button type="button" size="sm" disabled={busy === `sch-${member.id}`} onClick={() => onSaveSchedules(scheduleDraft)}>
          {busy === `sch-${member.id}` ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          Salvar horários
        </Button>
      </section>
    </div>
  );
}

function ServiceNameField({
  newSvcName,
  setNewSvcName,
  onAdd,
}: {
  newSvcName: string;
  setNewSvcName: (v: string) => void;
  onAdd: () => void;
}) {
  return (
    <div className="flex-1 space-y-1.5">
      <Label>Adicionar serviços</Label>
      <Input
        placeholder="Ex.: Corte, Barba…"
        value={newSvcName}
        onChange={(e) => setNewSvcName(e.target.value)}
        maxLength={120}
        onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), onAdd())}
      />
    </div>
  );
}

function ServiceRowEditor({
  svc,
  busy,
  onUpdate,
  onRemove,
}: {
  svc: ServiceRow;
  busy: string | null;
  onUpdate: (id: string, patch: { name?: string; duration_minutes?: number }) => void;
  onRemove: (id: string) => void;
}) {
  const [name, setName] = useState(svc.name);
  const [duration, setDuration] = useState(String(svc.duration_minutes));

  useEffect(() => {
    setName(svc.name);
    setDuration(String(svc.duration_minutes));
  }, [svc.name, svc.duration_minutes]);

  return (
    <li className="flex flex-wrap items-center gap-2 rounded-md border border-border/60 p-2">
      <Input className="h-8 flex-1 min-w-[120px]" value={name} onChange={(e) => setName(e.target.value)} maxLength={120} />
      <Input
        type="number"
        className="h-8 w-20"
        min={5}
        max={480}
        value={duration}
        onChange={(e) => setDuration(e.target.value)}
      />
      <span className="text-xs text-muted-foreground">min</span>
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={busy === `svc-${svc.id}`}
        onClick={() =>
          onUpdate(svc.id, {
            name: name.trim(),
            duration_minutes: parseInt(duration, 10) || svc.duration_minutes,
          })
        }
      >
        Salvar
      </Button>
      <Button type="button" variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-foreground" onClick={() => onRemove(svc.id)}>
        <Trash2 className="h-4 w-4" />
      </Button>
    </li>
  );
}
