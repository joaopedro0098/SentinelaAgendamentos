import { useEffect, useState, type ReactNode } from "react";
import {
  Ban,
  BarChart2,
  Calendar,
  CalendarCheck,
  ChevronLeft,
  ChevronRight,
  Clock,
  CreditCard,
  Headphones,
  Link2,
  LogOut,
  Plus,
  Search,
  Settings,
  User,
  UserCog,
  Users,
  Wallet,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useHorizontalSwipe } from "@/hooks/useHorizontalSwipe";
import { useMediaMdUp } from "@/hooks/useMediaMdUp";
import { cn } from "@/lib/utils";

type SlideId = "nav" | "agendar" | "agendamentos" | "pacientes" | "bloqueios" | "link-publico";

const DESKTOP_SLIDES: { id: Exclude<SlideId, "nav">; label: string }[] = [
  { id: "agendar", label: "Agendar" },
  { id: "agendamentos", label: "Agendamentos" },
  { id: "pacientes", label: "Pacientes" },
  { id: "bloqueios", label: "Bloqueios" },
  { id: "link-publico", label: "Link e cobrança" },
];

const MOBILE_SLIDES: { id: SlideId; label: string }[] = [
  { id: "nav", label: "Menu" },
  ...DESKTOP_SLIDES,
];

const PREVIEW_NAV_ITEMS = [
  { id: "agendar", label: "Agendar", icon: Calendar },
  { id: "agendamentos", label: "Agendamentos", icon: CalendarCheck },
  { id: "pacientes", label: "Pacientes", icon: Users },
  { id: "profissionais", label: "Profissionais", icon: UserCog },
  { id: "settings", label: "Configurações", icon: Settings },
  { id: "perfil", label: "Conta", icon: User },
  { id: "pagamentos", label: "Pagamentos", icon: Wallet },
  { id: "relatorios", label: "Relatórios", icon: BarChart2 },
  { id: "suporte", label: "Suporte", icon: Headphones },
] as const;

type PreviewNavId = (typeof PREVIEW_NAV_ITEMS)[number]["id"];

function PreviewSidebar({
  activeNav,
  className,
}: {
  activeNav: PreviewNavId;
  className?: string;
}) {
  return (
    <aside
      className={cn(
        "flex shrink-0 flex-col border-r border-border/60 bg-background min-h-0",
        className ?? "w-[9.25rem] sm:w-44 md:w-52",
      )}
    >
      <div className="px-2.5 py-3 border-b border-border/60 shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-secondary text-muted-foreground ring-1 ring-border/60">
            <User className="h-4 w-4" strokeWidth={2.25} aria-hidden />
          </div>
          <div className="min-w-0">
            <p className="text-[9px] font-medium uppercase tracking-wider text-muted-foreground leading-none">Painel</p>
            <p className="mt-1 text-xs font-semibold truncate leading-tight">Seu nome</p>
          </div>
        </div>
      </div>

      <nav className="flex flex-1 min-h-0 flex-col gap-1 overflow-y-auto overscroll-contain p-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {PREVIEW_NAV_ITEMS.map((item) => {
          const Icon = item.icon;
          const active = item.id === activeNav;
          return (
            <div
              key={item.id}
              className={cn(
                "flex items-center gap-2 rounded-xl px-2 py-2 text-[11px] sm:text-xs font-medium transition-colors",
                active ? "bg-accent text-accent-foreground shadow-sm" : "text-muted-foreground",
              )}
            >
              <Icon className="h-4 w-4 shrink-0" aria-hidden />
              <span className="truncate leading-tight">{item.label}</span>
            </div>
          );
        })}
      </nav>

      <div className="shrink-0 border-t border-border/60 p-2 space-y-1.5">
        <p className="text-[10px] text-muted-foreground truncate px-1">profissional@email.com</p>
        <div className="flex w-full items-center justify-center gap-1.5 rounded-full border border-border px-2 py-1.5 text-[10px] font-medium text-muted-foreground">
          <LogOut className="h-3 w-3" aria-hidden />
          Sair
        </div>
      </div>
    </aside>
  );
}

function PreviewShell({
  activeNav,
  children,
  isMobile = false,
}: {
  activeNav: PreviewNavId;
  children: ReactNode;
  isMobile?: boolean;
}) {
  return (
    <div className="flex h-full min-h-[22rem] md:min-h-[26rem] bg-background text-foreground">
      <PreviewSidebar activeNav={activeNav} className="hidden md:flex w-52 shrink-0" />
      <div className={cn("flex-1 min-w-0 overflow-hidden", isMobile ? "p-4" : "p-3 sm:p-4")}>{children}</div>
    </div>
  );
}

function NavOnlySlide() {
  return (
    <div className="flex h-full min-h-[22rem] bg-background text-foreground md:hidden">
      <PreviewSidebar activeNav="agendar" className="w-full max-w-none flex-1 border-r-0" />
    </div>
  );
}

function PreviewStatusBadge({ label, tone }: { label: string; tone: "confirmado" | "concluido" | "nao_confirmado" }) {
  const toneClass =
    tone === "confirmado"
      ? "bg-[hsl(156_42%_40%_/0.25)] text-[hsl(156_42%_40%)] border-[hsl(156_42%_40%_/0.9)]"
      : tone === "concluido"
        ? "bg-[hsl(217_91%_60%_/0.25)] text-[hsl(217_91%_45%)] border-[hsl(217_91%_60%_/0.9)]"
        : "bg-yellow-400/25 text-yellow-950 border-yellow-500/90";

  return (
    <span className={cn("inline-flex rounded-full border px-2 py-0.5 text-[9px] font-semibold whitespace-nowrap", toneClass)}>
      {label}
    </span>
  );
}

function AgendamentosSlide({ isMobile }: { isMobile: boolean }) {
  const calendarDays = ["D", "S", "T", "Q", "Q", "S", "S"];
  const monthCells = [null, null, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31];
  const rows = [
    { time: "09:00", client: "Ana Silva", services: "Atendimento Clínico", status: "Confirmado" as const, tone: "confirmado" as const },
    { time: "10:30", client: "Carlos Mendes", services: "Atendimento Clínico", status: "Concluído" as const, tone: "concluido" as const },
    { time: "14:00", client: "Mariana Costa", services: "Atendimento Clínico", status: "Não confirmado" as const, tone: "nao_confirmado" as const },
  ];
  const mobileDays = [
    { label: "Ter", day: "7", month: "Jul", active: false },
    { label: "Qua", day: "8", month: "Jul", active: true },
    { label: "Qui", day: "9", month: "Jul", active: false },
    { label: "Sex", day: "10", month: "Jul", active: false },
  ];

  if (isMobile) {
    return (
      <PreviewShell activeNav="agendamentos" isMobile>
        <div className="space-y-4 min-h-[18rem]">
          <header className="flex items-center justify-between gap-2">
            <h2 className="text-lg font-semibold tracking-tight">Agendamentos</h2>
            <span className="inline-flex items-center gap-1 rounded-full bg-primary text-primary-foreground px-3 py-1.5 text-xs font-medium">
              <Plus className="h-3.5 w-3.5" aria-hidden />
              Novo
            </span>
          </header>

          <div className="flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {mobileDays.map((d) => (
              <span
                key={d.day}
                className={cn(
                  "shrink-0 w-16 h-[4.5rem] rounded-2xl flex flex-col items-center justify-center font-semibold",
                  d.active
                    ? "bg-accent text-accent-foreground ring-2 ring-accent ring-offset-2 ring-offset-background"
                    : "bg-secondary text-secondary-foreground",
                )}
              >
                <span className="text-[10px] opacity-90">{d.label}</span>
                <span className="text-lg leading-none my-0.5">{d.day}</span>
                <span className="text-[10px] opacity-80">{d.month}</span>
              </span>
            ))}
          </div>

          <p className="text-sm text-muted-foreground capitalize">Quarta, 8 de julho</p>

          <ul className="space-y-3">
            {rows.map((row) => (
              <li key={row.time} className="rounded-xl border border-border/80 bg-card/40 p-3 space-y-2">
                <PreviewStatusBadge label={row.status} tone={row.tone} />
                <div className="flex items-center gap-2 text-accent font-semibold tabular-nums">
                  <Clock className="h-4 w-4 shrink-0" aria-hidden />
                  <span className="text-base">{row.time}</span>
                </div>
                <p className="font-medium text-sm">{row.client}</p>
                <p className="text-xs text-muted-foreground">{row.services}</p>
              </li>
            ))}
          </ul>
        </div>
      </PreviewShell>
    );
  }

  return (
    <PreviewShell activeNav="agendamentos">
      <div className="flex min-h-[18rem] md:min-h-[22rem] md:-m-4">
        <aside className="hidden sm:flex w-[7.5rem] md:w-[8.75rem] shrink-0 flex-col border-r border-border/60 bg-background overflow-hidden">
          <div className="shrink-0 space-y-2 border-b border-border/60 p-2">
            <div className="rounded-xl border border-border/70 bg-card/50 p-2">
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-[10px] px-1 text-muted-foreground">‹</span>
                <span className="text-[10px] font-semibold capitalize">Julho 2026</span>
                <span className="text-[10px] px-1 text-muted-foreground">›</span>
              </div>
              <div className="grid grid-cols-7 gap-0.5 text-center text-[8px] text-muted-foreground mb-0.5">
                {calendarDays.map((d) => (
                  <span key={d}>{d}</span>
                ))}
              </div>
              <div className="grid grid-cols-7 gap-0.5">
                {monthCells.map((day, i) =>
                  day == null ? (
                    <span key={`e-${i}`} className="h-5" />
                  ) : (
                    <span
                      key={day}
                      className={cn(
                        "h-5 rounded-md flex items-center justify-center text-[9px] font-medium",
                        day === 8 ? "bg-accent text-accent-foreground" : "text-muted-foreground",
                      )}
                    >
                      {day}
                    </span>
                  ),
                )}
              </div>
            </div>
            <div className="flex rounded-lg border border-border/70 p-0.5 bg-card/40">
              {["Dia", "Semana", "Mês"].map((mode, i) => (
                <span
                  key={mode}
                  className={cn(
                    "flex-1 rounded-md py-1 text-[8px] font-semibold text-center",
                    i === 0 ? "bg-accent text-accent-foreground" : "text-muted-foreground",
                  )}
                >
                  {mode}
                </span>
              ))}
            </div>
            <p className="text-[10px] font-semibold text-accent text-center capitalize">Quarta, 8 de julho</p>
          </div>
          <div className="p-2 space-y-1.5">
            <div className="rounded-lg border border-border/70 bg-card/40 px-2 py-1.5">
              <p className="text-[8px] text-muted-foreground">Profissional</p>
              <p className="text-[10px] font-medium">Todos</p>
            </div>
            <div className="rounded-xl border border-border/70 bg-card/50 p-2 space-y-1 text-[9px]">
              <p className="font-semibold uppercase tracking-wide text-muted-foreground">Resumo</p>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Total</span>
                <span className="font-semibold">3</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Confirmados</span>
                <span className="font-semibold text-[hsl(156_42%_40%)]">1</span>
              </div>
            </div>
          </div>
        </aside>

        <section className="flex min-w-0 flex-1 flex-col overflow-hidden">
          <header className="flex items-center justify-between gap-2 px-2 md:px-3 py-2 border-b border-border/60 shrink-0">
            <h2 className="text-xs md:text-sm font-semibold tracking-tight">Agendamentos</h2>
            <span className="inline-flex items-center gap-1 rounded-full bg-primary text-primary-foreground px-2 py-1 text-[9px] font-medium">
              <Plus className="h-3 w-3" aria-hidden />
              Novo
            </span>
          </header>
          <div className="grid grid-cols-[2.25rem_minmax(0,1fr)_minmax(0,1fr)_4.25rem] gap-x-1.5 px-2 md:px-3 py-1.5 border-b border-border/40 bg-secondary/10 text-[8px] font-semibold uppercase tracking-wide text-muted-foreground shrink-0">
            <span>Hora</span>
            <span>Cliente</span>
            <span>Serviços</span>
            <span>Status</span>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto">
            {rows.map((row) => (
              <div
                key={row.time}
                className="grid grid-cols-[2.25rem_minmax(0,1fr)_minmax(0,1fr)_4.25rem] gap-x-1.5 items-center px-2 md:px-3 py-2 border-b border-border/50 text-[10px] md:text-xs hover:bg-secondary/20"
              >
                <span className="font-semibold tabular-nums text-accent">{row.time}</span>
                <span className="font-medium truncate">{row.client}</span>
                <span className="text-muted-foreground truncate">{row.services}</span>
                <PreviewStatusBadge label={row.status} tone={row.tone} />
              </div>
            ))}
          </div>
        </section>
      </div>
    </PreviewShell>
  );
}

function PacientesSlide({ isMobile }: { isMobile: boolean }) {
  const pacientes = [
    { nome: "Ana Silva", active: true },
    { nome: "Carlos Mendes", active: false },
    { nome: "Mariana Costa", active: false },
  ];

  if (isMobile) {
    return (
      <PreviewShell activeNav="pacientes" isMobile>
        <div className="flex flex-col min-h-[18rem] -mx-1">
          <header className="space-y-3 border-b border-border/60 pb-3">
            <div className="flex items-center gap-2">
              <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-muted-foreground">
                <ChevronLeft className="h-5 w-5" aria-hidden />
              </span>
              <div className="flex min-w-0 flex-1 items-center gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-secondary text-xs font-semibold text-muted-foreground">
                  AS
                </div>
                <div className="min-w-0">
                  <h2 className="text-lg font-semibold tracking-tight truncate">Ana Silva</h2>
                  <p className="text-xs text-muted-foreground truncate">32a | 12/04/1994 | (11) 91234-5678</p>
                </div>
              </div>
            </div>
            <div className="flex gap-2 overflow-x-auto pb-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              {["Histórico", "Documentos", "Dados cadastrais"].map((tab, i) => (
                <span
                  key={tab}
                  className={cn(
                    "shrink-0 px-3 py-1.5 text-sm font-medium border-b-2",
                    i === 0 ? "border-foreground text-foreground" : "border-transparent text-muted-foreground",
                  )}
                >
                  {tab}
                </span>
              ))}
            </div>
          </header>

          <div className="pt-3 space-y-3">
            <div className="rounded-xl border border-border/70 bg-card/40 p-3">
              <p className="text-sm font-semibold">
                05/07/2026 · <span className="tabular-nums">09:00</span>
              </p>
              <p className="mt-0.5 text-xs text-muted-foreground">Você</p>
              <p className="mt-2 text-sm text-foreground/85 leading-relaxed">
                Paciente relatou melhora nos sintomas. Retorno em 15 dias.
              </p>
            </div>
            <div className="rounded-xl border border-border/70 bg-card/40 p-3">
              <p className="text-sm font-semibold">
                20/06/2026 · <span className="tabular-nums">14:30</span>
              </p>
              <p className="mt-0.5 text-xs text-muted-foreground">Você</p>
              <p className="mt-2 text-sm text-foreground/85 leading-relaxed">
                Primeira consulta. Anamnese completa registrada.
              </p>
            </div>
          </div>
        </div>
      </PreviewShell>
    );
  }

  return (
    <PreviewShell activeNav="pacientes">
      <div className="flex min-h-[18rem] md:min-h-[22rem] md:-m-4">
        <aside className="flex w-[6.5rem] sm:w-[7.5rem] shrink-0 flex-col border-r border-border/60 bg-background min-h-0">
          <div className="shrink-0 border-b border-border/60 p-2 space-y-2">
            <div className="flex h-8 items-center gap-1.5 rounded-lg border border-border/70 bg-card/40 px-2 text-muted-foreground">
              <Search className="h-3 w-3 shrink-0" aria-hidden />
              <span className="text-[9px]">Pesquisar</span>
            </div>
          </div>
          <ul className="min-h-0 flex-1 overflow-y-auto">
            {pacientes.map((p) => (
              <li key={p.nome}>
                <div
                  className={cn(
                    "flex items-center gap-2 px-2 py-2 border-b border-border/30 text-[10px]",
                    p.active ? "bg-accent/10 font-medium" : "text-foreground/90",
                  )}
                >
                  <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-secondary text-[8px] font-semibold text-muted-foreground">
                    {p.nome.slice(0, 2).toUpperCase()}
                  </div>
                  <span className="truncate">{p.nome}</span>
                </div>
              </li>
            ))}
          </ul>
        </aside>

        <section className="flex min-w-0 flex-1 flex-col min-h-0 overflow-hidden">
          <header className="shrink-0 border-b border-border/60 px-3 py-3">
            <div className="flex items-start gap-2">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-secondary text-xs font-semibold text-muted-foreground">
                AS
              </div>
              <div className="min-w-0 flex-1">
                <h2 className="text-sm font-semibold tracking-tight truncate">Ana Silva</h2>
                <p className="text-[10px] text-muted-foreground tabular-nums mt-0.5">32a | 12/04/1994 | (11) 91234-5678</p>
              </div>
            </div>
            <nav className="mt-3 flex gap-3 border-b border-transparent">
              {["Histórico", "Documentos", "Dados cadastrais"].map((tab, i) => (
                <span
                  key={tab}
                  className={cn(
                    "pb-1.5 text-[10px] font-medium border-b-2 -mb-px",
                    i === 0 ? "border-foreground text-foreground" : "border-transparent text-muted-foreground",
                  )}
                >
                  {tab}
                </span>
              ))}
            </nav>
          </header>
          <div className="min-h-0 flex-1 overflow-y-auto px-3 py-3">
            <div className="py-2 border-b border-border/50">
              <p className="text-[11px] font-semibold">
                05/07/2026
                <span className="font-normal text-muted-foreground ml-1.5 tabular-nums">09:00</span>
              </p>
              <p className="mt-0.5 text-[10px] text-muted-foreground">Você (Atendimento Clínico)</p>
              <p className="mt-1.5 text-[10px] text-foreground/85 leading-relaxed">
                Paciente relatou melhora nos sintomas. Retorno em 15 dias.
              </p>
            </div>
            <div className="py-2 border-b border-border/50">
              <p className="text-[11px] font-semibold">
                20/06/2026
                <span className="font-normal text-muted-foreground ml-1.5 tabular-nums">14:30</span>
              </p>
              <p className="mt-0.5 text-[10px] text-muted-foreground">Você (Atendimento Clínico)</p>
              <p className="mt-1.5 text-[10px] text-foreground/85 leading-relaxed">
                Primeira consulta. Anamnese completa registrada.
              </p>
            </div>
          </div>
        </section>
      </div>
    </PreviewShell>
  );
}

function PreviewSlotLegend({ className }: { className?: string }) {
  return (
    <div className={cn("flex items-center gap-3 text-[10px] md:text-xs text-muted-foreground", className)}>
      <span className="inline-flex items-center gap-1.5">
        <span className="h-2.5 w-2.5 rounded-sm bg-[hsl(156_42%_40%)]" aria-hidden />
        Disponível
      </span>
      <span className="inline-flex items-center gap-1.5">
        <span className="h-2.5 w-2.5 rounded-sm bg-[hsl(0_65%_55%)]" aria-hidden />
        Indisponível
      </span>
    </div>
  );
}

function previewHorarioChipClass(livre: boolean, selected: boolean, compact = false) {
  return cn(
    "shrink-0 rounded-xl flex items-center justify-center font-semibold transition-all",
    compact ? "w-14 h-9 text-[11px]" : "w-[4.25rem] h-10 text-xs",
    livre ? "bg-[hsl(156_42%_40%)] text-white" : "bg-[hsl(0_65%_55%)] text-white opacity-90",
    selected && livre && "ring-2 ring-foreground ring-offset-1 ring-offset-background",
  );
}

function AgendarSlide({ isMobile }: { isMobile: boolean }) {
  const slots: { time: string; livre: boolean; selected?: boolean }[] = [
    { time: "09:00", livre: true },
    { time: "09:30", livre: true },
    { time: "10:00", livre: true },
    { time: "10:30", livre: false },
    { time: "11:00", livre: true, selected: true },
    { time: "11:30", livre: true },
    { time: "14:00", livre: false },
    { time: "14:30", livre: true },
    { time: "15:00", livre: true },
    { time: "15:30", livre: true },
  ];

  return (
    <PreviewShell activeNav="agendar" isMobile={isMobile}>
      <div className="space-y-3">
        <div>
          <p className={cn("font-semibold tracking-tight", isMobile ? "text-lg" : "text-base md:text-lg")}>Agendar</p>
          <p className={cn("text-muted-foreground mt-0.5", isMobile ? "text-sm" : "text-xs md:text-sm")}>
            Escolha serviço e horário
          </p>
        </div>
        <div className="rounded-xl border border-border/70 p-3 space-y-3">
          <div>
            <p className="text-xs font-semibold mb-2">Serviços</p>
            <span className="inline-flex min-w-[8.5rem] min-h-12 px-3 py-2 rounded-2xl flex-col items-center justify-center font-semibold bg-background border border-border text-foreground shadow-sm">
              <span className="text-sm leading-snug text-center">Atendimento Clínico</span>
            </span>
          </div>
          <div>
            <p className="text-xs font-semibold mb-2">Selecione o horário</p>
            <div
              className={cn(
                isMobile
                  ? "flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
                  : "flex flex-wrap gap-1.5",
              )}
            >
              {slots.map((slot) => (
                <span key={slot.time} className={previewHorarioChipClass(slot.livre, Boolean(slot.selected), isMobile)}>
                  {slot.time}
                </span>
              ))}
            </div>
            <PreviewSlotLegend className="mt-2.5" />
          </div>
          <Button type="button" size="sm" className="w-full rounded-full bg-primary hover:bg-primary/90 text-primary-foreground border-0 h-9 text-xs">
            Confirmar agendamento
          </Button>
        </div>
      </div>
    </PreviewShell>
  );
}

function BloqueiosSlide({ isMobile }: { isMobile: boolean }) {
  const days = [
    { label: "Seg", day: "7", month: "Jul", active: false },
    { label: "Ter", day: "8", month: "Jul", active: true },
    { label: "Qua", day: "9", month: "Jul", active: false },
    { label: "Qui", day: "10", month: "Jul", active: false },
  ];
  const slots = ["09:00", "09:30", "10:00", "10:30", "11:00", "11:30", "14:00", "14:30"];
  const blocked = new Set(["10:00", "10:30"]);

  return (
    <PreviewShell activeNav="profissionais" isMobile={isMobile}>
      <div className={cn("space-y-3 overflow-y-auto pr-1", isMobile ? "max-h-[18rem]" : "max-h-[18rem] md:max-h-[22rem]")}>
        <div className="rounded-xl border border-border/80 bg-card/40 p-3 space-y-3">
          <div>
            <p className="text-xs md:text-sm font-semibold tracking-tight flex items-center gap-1.5">
              <Ban className="h-3.5 w-3.5 text-primary" aria-hidden />
              Bloqueios
            </p>
            <p className="text-[10px] text-muted-foreground mt-1 leading-relaxed">
              Bloqueie horários ou registre férias. Reflete no link de agendamento.
            </p>
          </div>

          <div className="inline-flex rounded-lg border border-border/70 p-0.5 bg-background">
            <span className="rounded-md bg-accent text-accent-foreground px-2.5 py-1 text-[10px] font-semibold">Bloqueio</span>
            <span className="rounded-md px-2.5 py-1 text-[10px] font-medium text-muted-foreground">Modo férias</span>
          </div>

          <div>
            <p className="text-[10px] font-semibold mb-2">Dia</p>
            <div className="flex gap-1.5 overflow-x-auto pb-1">
              {days.map((d) => (
                <span
                  key={d.day}
                  className={cn(
                    "shrink-0 w-12 h-14 rounded-xl flex flex-col items-center justify-center font-semibold",
                    d.active
                      ? "bg-accent text-accent-foreground ring-2 ring-accent ring-offset-1 ring-offset-background"
                      : "bg-secondary text-secondary-foreground",
                  )}
                >
                  <span className="text-[8px] opacity-90">{d.label}</span>
                  <span className="text-sm leading-none">{d.day}</span>
                  <span className="text-[8px] opacity-80">{d.month}</span>
                </span>
              ))}
            </div>
          </div>

          <div className="inline-flex rounded-lg border border-border/70 p-0.5 bg-background">
            <span className="rounded-md bg-accent text-accent-foreground px-2.5 py-1 text-[10px] font-semibold">Parcial</span>
            <span className="rounded-md px-2.5 py-1 text-[10px] font-medium text-muted-foreground">Total</span>
          </div>

          <div>
            <p className="text-[10px] font-semibold mb-2">Horários bloqueados</p>
            <div
              className={cn(
                isMobile
                  ? "flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
                  : "flex flex-wrap gap-1.5",
              )}
            >
              {slots.map((slot) => (
                <span
                  key={slot}
                  className={cn(
                    "shrink-0 rounded-lg flex items-center justify-center font-semibold tabular-nums",
                    isMobile ? "min-w-[3.25rem] px-2 h-8 text-[10px]" : "min-w-[3rem] px-2 h-8 text-[10px]",
                    blocked.has(slot)
                      ? "bg-[hsl(0_65%_55%)] text-white"
                      : "bg-secondary text-secondary-foreground",
                  )}
                >
                  {slot}
                </span>
              ))}
            </div>
          </div>

          <Button type="button" size="sm" className="w-full sm:w-auto rounded-md h-8 px-4 text-[10px]">
            Salvar bloqueio
          </Button>
        </div>
      </div>
    </PreviewShell>
  );
}

function LinkPublicoSlide() {
  return (
    <div className="flex h-full min-h-[22rem] md:min-h-[26rem] items-center justify-center p-4 md:p-8 bg-gradient-to-br from-primary/5 via-background to-secondary/30">
      <div className="max-w-sm text-center space-y-4">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/12 text-primary">
          <Link2 className="h-7 w-7" aria-hidden />
        </div>
        <div className="space-y-2">
          <p className="text-lg md:text-xl font-display font-bold tracking-tight">Link público e cobrança</p>
          <p className="text-sm md:text-base text-muted-foreground leading-relaxed">
            Compartilhe um link para o cliente agendar sozinho — e, no plano Pro, receba pagamentos direto pelo
            sistema.
          </p>
        </div>
        <div className="flex flex-col gap-2 text-left rounded-xl border border-border/70 bg-card/80 p-4 text-sm">
          <p className="flex items-center gap-2 font-medium">
            <Link2 className="h-4 w-4 text-primary shrink-0" aria-hidden />
            Link personalizado 24h
          </p>
          <p className="flex items-center gap-2 font-medium">
            <CreditCard className="h-4 w-4 text-primary shrink-0" aria-hidden />
            Cobrança automática (opcional)
          </p>
        </div>
      </div>
    </div>
  );
}

function SlideContent({ id, isMobile }: { id: SlideId; isMobile: boolean }) {
  if (id === "nav") return <NavOnlySlide />;
  if (id === "agendar") return <AgendarSlide isMobile={isMobile} />;
  if (id === "agendamentos") return <AgendamentosSlide isMobile={isMobile} />;
  if (id === "pacientes") return <PacientesSlide isMobile={isMobile} />;
  if (id === "bloqueios") return <BloqueiosSlide isMobile={isMobile} />;
  return <LinkPublicoSlide />;
}

export function LandingPanelPreview() {
  const isMdUp = useMediaMdUp();
  const slides = isMdUp ? DESKTOP_SLIDES : MOBILE_SLIDES;
  const [index, setIndex] = useState(0);

  useEffect(() => {
    setIndex(0);
  }, [isMdUp]);

  useEffect(() => {
    setIndex((current) => Math.min(current, slides.length - 1));
  }, [slides.length]);

  function goPrev() {
    setIndex((i) => (i === 0 ? slides.length - 1 : i - 1));
  }

  function goNext() {
    setIndex((i) => (i === slides.length - 1 ? 0 : i + 1));
  }

  const swipeHandlers = useHorizontalSwipe(goNext, goPrev);

  const navButtonClass =
    "h-11 w-11 rounded-full border-0 bg-primary text-primary-foreground shadow-elevated hover:bg-primary/90";

  return (
    <div className="mx-auto w-full min-w-0 max-w-xl lg:max-w-none">
      <div
        className="rounded-2xl border border-border/70 bg-card shadow-elevated overflow-hidden touch-pan-y"
        {...swipeHandlers}
      >
        <SlideContent id={slides[index].id} isMobile={!isMdUp} />
      </div>

      <div className="mt-3 flex items-center justify-center gap-2">
        <Button
          type="button"
          size="icon"
          onClick={goPrev}
          aria-label="Visual anterior"
          className={navButtonClass}
        >
          <ChevronLeft className="h-6 w-6" />
        </Button>

        <Button
          type="button"
          size="icon"
          onClick={goNext}
          aria-label="Próxima visual"
          className={navButtonClass}
        >
          <ChevronRight className="h-6 w-6" />
        </Button>
      </div>
    </div>
  );
}
