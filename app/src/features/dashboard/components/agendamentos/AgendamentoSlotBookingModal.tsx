import { useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { Check, Loader2, Search, X } from "lucide-react";
import { ServicosCarousel } from "@agenda/components/agenda/ServicosCarousel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "@/hooks/use-toast";
import { useDebouncedCallback } from "@/hooks/useDebouncedCallback";
import { cn } from "@/lib/utils";
import {
  type ClienteCadastroPainelItem,
  searchClientesCadastroPainel,
} from "@/features/dashboard/lib/agendamentoAnotacao";
import {
  createPanelSlotBooking,
  type SlotBookingServico,
} from "@/features/dashboard/lib/agendamentoSlotBooking";
import { formatWhatsAppDisplay } from "@/features/dashboard/lib/pacienteFormat";
import { formatTotalServiceMinutes } from "@agenda/lib/formatDuration";

export type SlotBookingTarget = {
  data: string;
  hora: string;
  barbeiroId: string;
  barbeiroNome: string;
  barbeariaId: string;
  slotMinutos: number;
  servicos: SlotBookingServico[];
};

type Props = {
  open: boolean;
  target: SlotBookingTarget | null;
  onClose: () => void;
  onCreated: () => void;
};

type Step = "form" | "confirm";

export function AgendamentoSlotBookingModal({ open, target, onClose, onCreated }: Props) {
  const [step, setStep] = useState<Step>("form");
  const [servSel, setServSel] = useState<string[]>([]);
  const [search, setSearch] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchResults, setSearchResults] = useState<ClienteCadastroPainelItem[]>([]);
  const [selectedPaciente, setSelectedPaciente] = useState<ClienteCadastroPainelItem | null>(null);
  const [observacao, setObservacao] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const servicos = target?.servicos ?? [];
  const requiresService = servicos.length > 0;

  const duracaoTotal = useMemo(() => {
    if (!target) return 0;
    const selected = servicos.filter((s) => servSel.includes(s.id));
    if (selected.length > 0) {
      return selected.reduce((sum, s) => sum + s.duracao_minutos, 0);
    }
    return target.slotMinutos;
  }, [target, servicos, servSel]);

  const servicosNomes = useMemo(
    () => servicos.filter((s) => servSel.includes(s.id)).map((s) => s.nome),
    [servicos, servSel],
  );

  const resetState = useCallback(() => {
    setStep("form");
    setServSel([]);
    setSearch("");
    setSearchQuery("");
    setSearchResults([]);
    setSelectedPaciente(null);
    setObservacao("");
    setSubmitting(false);
  }, []);

  useEffect(() => {
    if (!open) resetState();
  }, [open, resetState]);

  const debouncedSetSearchQuery = useDebouncedCallback((value: string) => {
    setSearchQuery(value);
  }, 300);

  const handleSearchChange = useCallback(
    (value: string) => {
      setSearch(value);
      if (selectedPaciente) setSelectedPaciente(null);
      debouncedSetSearchQuery(value);
    },
    [debouncedSetSearchQuery, selectedPaciente],
  );

  useEffect(() => {
    if (!open || !target || step !== "form") return;
    const q = searchQuery.trim();
    if (q.length < 2) {
      setSearchResults([]);
      setSearchLoading(false);
      return;
    }

    let cancelled = false;
    setSearchLoading(true);
    void searchClientesCadastroPainel(target.barbeariaId, q, 50).then((result) => {
      if (cancelled) return;
      setSearchLoading(false);
      if ("error" in result) {
        setSearchResults([]);
        if (result.error !== "forbidden") {
          toast({
            title: "Não foi possível buscar clientes",
            description: result.error,
            variant: "destructive",
          });
        }
        return;
      }
      setSearchResults(result.clientes);
    });

    return () => {
      cancelled = true;
    };
  }, [open, target, searchQuery, step]);

  const toggleServico = useCallback((id: string) => {
    setServSel((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }, []);

  const canContinue = useMemo(() => {
    if (!selectedPaciente) return false;
    if (requiresService && servSel.length === 0) return false;
    return true;
  }, [selectedPaciente, requiresService, servSel.length]);

  const handleContinue = () => {
    if (!canContinue) {
      if (!selectedPaciente) {
        toast({ title: "Selecione um cliente", variant: "destructive" });
        return;
      }
      if (requiresService && servSel.length === 0) {
        toast({ title: "Selecione pelo menos um serviço", variant: "destructive" });
        return;
      }
    }
    setStep("confirm");
  };

  const handleConfirm = async () => {
    if (!target || !selectedPaciente) return;
    setSubmitting(true);
    const result = await createPanelSlotBooking({
      barbeariaId: target.barbeariaId,
      barbeiroId: target.barbeiroId,
      data: target.data,
      hora: target.hora,
      clienteWhatsappDigits: selectedPaciente.whatsapp_digits,
      clienteNome: selectedPaciente.cliente_nome,
      servicosNomes,
      duracaoMinutos: duracaoTotal,
      observacao: observacao.trim() || null,
    });
    setSubmitting(false);

    if (!result.ok) {
      toast({
        title: result.slotTaken ? "Horário indisponível" : "Não foi possível agendar",
        description: result.error,
        variant: "destructive",
      });
      if (result.slotTaken) onClose();
      return;
    }

    toast({ title: "Agendamento criado" });
    onCreated();
    onClose();
  };

  if (!open || !target) return null;

  const atendimentoDescricao =
    servicosNomes.length > 0
      ? servicosNomes.join(" · ")
      : "Atendimento";

  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <button
        type="button"
        aria-label="Fechar"
        className="absolute inset-0 bg-black/60"
        onClick={() => !submitting && onClose()}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="slot-booking-title"
        className={cn(
          "relative z-10 w-full max-w-md rounded-xl border border-border/80 bg-background p-5 shadow-xl",
          "animate-in fade-in-0 zoom-in-95 duration-150",
        )}
      >
        <div className="flex items-start justify-between gap-3 mb-4">
          <div className="min-w-0">
            <h2 id="slot-booking-title" className="text-lg font-semibold tracking-tight">
              {step === "form" ? "Novo agendamento" : "Confirmar agendamento"}
            </h2>
            {step === "form" ? (
              <p className="text-sm text-muted-foreground">
                Selecione o serviço e o cliente.
              </p>
            ) : (
              <p className="text-sm text-muted-foreground">
                Revise os dados antes de salvar.
              </p>
            )}
          </div>
          <button
            type="button"
            aria-label="Fechar"
            disabled={submitting}
            onClick={onClose}
            className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-muted-foreground hover:bg-secondary/70 hover:text-foreground disabled:opacity-50"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {step === "form" ? (
          <div className="space-y-5">
            {servicos.length > 0 ? (
              <div>
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Serviços
                </p>
                <ServicosCarousel
                  servicos={servicos}
                  selecionados={servSel}
                  onToggle={toggleServico}
                  vertical={servicos.length >= 3}
                />
              </div>
            ) : null}

            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Cliente
              </p>
              {selectedPaciente ? (
                <div className="flex items-center justify-between gap-2 rounded-xl border border-border/70 bg-secondary/20 px-3 py-2.5">
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">{selectedPaciente.cliente_nome}</p>
                    <p className="text-xs text-muted-foreground">
                      {formatWhatsAppDisplay(selectedPaciente.whatsapp_digits)}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedPaciente(null);
                      setSearch("");
                      setSearchQuery("");
                    }}
                    className="shrink-0 text-xs font-medium text-muted-foreground hover:text-foreground"
                  >
                    Alterar
                  </button>
                </div>
              ) : (
                <div className="relative">
                  <div className="relative">
                    <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      type="search"
                      placeholder="Buscar cliente cadastrado…"
                      value={search}
                      onChange={(e) => handleSearchChange(e.target.value)}
                      className="pl-9"
                      autoFocus
                    />
                  </div>
                  {searchQuery.trim().length >= 2 && (
                    <div className="absolute left-0 right-0 top-full z-20 mt-1 max-h-48 overflow-y-auto rounded-xl border border-border/80 bg-background shadow-lg">
                      {searchLoading ? (
                        <div className="flex items-center justify-center py-6">
                          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                        </div>
                      ) : searchResults.length === 0 ? (
                        <p className="px-3 py-4 text-sm text-muted-foreground text-center">
                          Nenhum cliente encontrado.
                        </p>
                      ) : (
                        <ul>
                          {searchResults.map((p) => (
                            <li key={p.whatsapp_digits}>
                              <button
                                type="button"
                                onClick={() => {
                                  setSelectedPaciente(p);
                                  setSearch("");
                                  setSearchQuery("");
                                  setSearchResults([]);
                                }}
                                className="flex w-full flex-col items-start gap-0.5 px-3 py-2.5 text-left hover:bg-secondary/50 transition-colors"
                              >
                                <span className="text-sm font-medium truncate w-full">{p.cliente_nome}</span>
                                <span className="text-xs text-muted-foreground">
                                  {formatWhatsAppDisplay(p.whatsapp_digits)}
                                </span>
                              </button>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>

            <div>
              <label className="mb-2 block text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Observação <span className="font-normal normal-case tracking-normal">(opcional)</span>
              </label>
              <textarea
                value={observacao}
                onChange={(e) => setObservacao(e.target.value)}
                maxLength={500}
                rows={3}
                placeholder="Preferência, alergia, pedido especial…"
                className="flex w-full resize-none rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
              />
            </div>

            <Button
              type="button"
              className="w-full rounded-full"
              disabled={!canContinue}
              onClick={handleContinue}
            >
              Continuar
            </Button>
          </div>
        ) : (
          <div>
            <div className="rounded-2xl border border-border/70 bg-secondary/15 px-4 py-4">
              <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-full bg-gradient-brand shadow-glow">
                <Check className="h-5 w-5 text-white" strokeWidth={2.5} />
              </div>
              <p className="mt-3 text-center text-sm font-semibold">{selectedPaciente?.cliente_nome}</p>
              <p className="mt-1 text-center text-xs text-muted-foreground">
                {selectedPaciente ? formatWhatsAppDisplay(selectedPaciente.whatsapp_digits) : ""}
              </p>
              <p className="mt-3 text-center text-sm text-foreground">{atendimentoDescricao}</p>
              {duracaoTotal > 0 && (
                <p className="mt-1 text-center text-xs text-muted-foreground">
                  Duração: {formatTotalServiceMinutes(duracaoTotal)}
                </p>
              )}
              {observacao.trim() && (
                <p className="mt-3 border-t border-border/60 pt-3 text-center text-xs text-muted-foreground">
                  <span className="block font-medium text-foreground">Observação</span>
                  <span className="mt-1 block">{observacao.trim()}</span>
                </p>
              )}
            </div>

            <div className="mt-5 flex gap-2">
              <Button
                type="button"
                variant="outline"
                className="flex-1 rounded-full"
                disabled={submitting}
                onClick={() => setStep("form")}
              >
                Alterar
              </Button>
              <Button
                type="button"
                className="flex-1 rounded-full"
                disabled={submitting}
                onClick={() => void handleConfirm()}
              >
                {submitting ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Confirmando…
                  </>
                ) : (
                  "Confirmar"
                )}
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}
