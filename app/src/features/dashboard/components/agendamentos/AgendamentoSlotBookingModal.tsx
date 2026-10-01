import { useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { Check, Loader2, Search, X } from "lucide-react";
import { ServicosCarousel } from "@agenda/components/agenda/ServicosCarousel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "@/hooks/use-toast";
import { useDebouncedCallback } from "@/hooks/useDebouncedCallback";
import { useSubscription } from "@/hooks/useSubscription";
import { cn } from "@/lib/utils";
import {
  type ClienteCadastroPainelItem,
  searchClientesCadastroPainel,
} from "@/features/dashboard/lib/agendamentoAnotacao";
import {
  createPanelSlotBooking,
  createPanelSlotBookingWithPaymentHold,
  type SlotBookingServico,
} from "@/features/dashboard/lib/agendamentoSlotBooking";
import { formatWhatsAppDisplay } from "@/features/dashboard/lib/pacienteFormat";
import { formatTotalServiceMinutes } from "@agenda/lib/formatDuration";
import {
  AppointmentChargeSettingsForm,
  defaultChargeFormFromPanelSettings,
  parseChargeFormDepositValue,
  PaymentLinkCopyRow,
  type AppointmentChargeFormState,
} from "@/features/dashboard/components/pagamentos/AppointmentChargeSettingsForm";
import { ManualPixKeyCopyField } from "@/features/dashboard/components/pagamentos/ManualPixKeyCopyField";
import {
  fetchClientePagamentoPrefs,
  fetchPaymentPanelSettings,
  paymentModeLabel,
  savePaymentPanelSettings,
  upsertClientePagamentoPrefs,
} from "@/lib/paymentsApi";
import { getAppointmentPaymentPageUrl } from "@/lib/appointmentConfirmationMessage";
import { supabase } from "@/integrations/supabase/client";
import { saveAgendamentoPanelPaymentSnapshot } from "@/features/dashboard/lib/agendamentoPanelPayment";
import { useClienteTerminology } from "@/features/dashboard/hooks/useClienteTerminology";
import { subscribePaymentsConfigChanged } from "@agenda/lib/paymentsConfigSync";
import { sanitizeManualPixKeyInput } from "@/lib/manualPixKeyInput";

export type SlotBookingTarget = {
  data: string;
  hora: string;
  barbeiroId: string;
  barbeiroNome: string;
  barbeariaId: string;
  shopSlug: string | null;
  slotMinutos: number;
  servicos: SlotBookingServico[];
};

type Props = {
  open: boolean;
  target: SlotBookingTarget | null;
  onClose: () => void;
  onCreated: () => void;
};

type Step = "form" | "confirm" | "success";
type ChargeKind = "automatic" | "manual" | "none";

function formatMoney(centavos: number) {
  return (centavos / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export function AgendamentoSlotBookingModal({ open, target, onClose, onCreated }: Props) {
  const t = useClienteTerminology();
  const { info: subscriptionInfo } = useSubscription();
  const canChargeFeature =
    subscriptionInfo?.is_admin === true || subscriptionInfo?.can_use_appointment_payments === true;

  const [step, setStep] = useState<Step>("form");
  const [servSel, setServSel] = useState<string[]>([]);
  const [search, setSearch] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchResults, setSearchResults] = useState<ClienteCadastroPainelItem[]>([]);
  const [selectedPaciente, setSelectedPaciente] = useState<ClienteCadastroPainelItem | null>(null);
  const [observacao, setObservacao] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const [mpConnected, setMpConnected] = useState(false);
  const [chargeForm, setChargeForm] = useState<AppointmentChargeFormState>(() =>
    defaultChargeFormFromPanelSettings({ appointment_payment_mode: "deposit" }),
  );
  const [chargeKind, setChargeKind] = useState<ChargeKind>("none");
  const [manualPixKey, setManualPixKey] = useState("");
  const [prefsLoading, setPrefsLoading] = useState(false);

  const [confirmChargePreview, setConfirmChargePreview] = useState<{
    chargeCentavos: number;
    totalCentavos: number;
    remainingCentavos: number;
  } | null>(null);
  const [createdPaymentLink, setCreatedPaymentLink] = useState<string | null>(null);

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
    setChargeKind("none");
    setManualPixKey("");
    setConfirmChargePreview(null);
    setCreatedPaymentLink(null);
    setChargeForm(defaultChargeFormFromPanelSettings({ appointment_payment_mode: "deposit" }));
  }, []);

  useEffect(() => {
    if (!open) resetState();
  }, [open, resetState]);

  const reloadPaymentPanelSettings = useCallback(() => {
    if (!canChargeFeature) return;
    void fetchPaymentPanelSettings()
      .then((data) => {
        setMpConnected(data.mp_connected === true);
        setManualPixKey(sanitizeManualPixKeyInput(data.manual_pix_key?.trim() ?? ""));
        setChargeForm(defaultChargeFormFromPanelSettings(data));
      })
      .catch(() => {
        /* ignore */
      });
  }, [canChargeFeature]);

  useEffect(() => {
    if (!open || !canChargeFeature) return;
    reloadPaymentPanelSettings();
  }, [open, canChargeFeature, reloadPaymentPanelSettings]);

  useEffect(() => {
    if (!open || !canChargeFeature) return;
    const slug = target?.shopSlug?.trim();
    if (!slug) return;
    return subscribePaymentsConfigChanged(slug, reloadPaymentPanelSettings);
  }, [open, canChargeFeature, target?.shopSlug, reloadPaymentPanelSettings]);

  useEffect(() => {
    if (!open || !target || !selectedPaciente || !canChargeFeature) return;
    let cancelled = false;
    setPrefsLoading(true);
    void fetchClientePagamentoPrefs(target.barbeariaId, selectedPaciente.whatsapp_digits)
      .then((prefs) => {
        if (cancelled) return;
        if (prefs.found && prefs.appointment_payment_mode) {
          setChargeForm(defaultChargeFormFromPanelSettings(prefs));
        }
      })
      .catch(() => {
        /* keep shop/default */
      })
      .finally(() => {
        if (!cancelled) setPrefsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, target, selectedPaciente, canChargeFeature]);

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
            title: `Não foi possível buscar ${t.pluralLower}`,
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

  const chargeFormValid = useMemo(() => {
    if (chargeKind !== "automatic") return true;
    if (chargeForm.paymentMode === "none") return false;
    if (!mpConnected) return false;
    if (!chargeForm.enableCard && !chargeForm.enablePix) return false;
    const dep = parseChargeFormDepositValue(chargeForm);
    return dep.ok;
  }, [chargeKind, chargeForm, mpConnected]);

  const canContinue = useMemo(() => {
    if (!selectedPaciente) return false;
    if (requiresService && servSel.length === 0) return false;
    if (chargeKind === "automatic" && !chargeFormValid) return false;
    return true;
  }, [selectedPaciente, requiresService, servSel.length, chargeKind, chargeFormValid]);

  const patchChargeForm = useCallback((patch: Partial<AppointmentChargeFormState>) => {
    setChargeForm((prev) => ({ ...prev, ...patch }));
  }, []);

  const handleContinue = async () => {
    if (!canContinue || !target) {
      if (!selectedPaciente) {
        toast({ title: `Selecione um ${t.singularLower}`, variant: "destructive" });
        return;
      }
      if (requiresService && servSel.length === 0) {
        toast({ title: "Selecione pelo menos um serviço", variant: "destructive" });
        return;
      }
      if (chargeKind === "automatic" && !chargeFormValid) {
        toast({ title: "Revise as configurações de cobrança", variant: "destructive" });
        return;
      }
    }

    if (chargeKind === "automatic" && chargeForm.paymentMode !== "none") {
      const dep = parseChargeFormDepositValue(chargeForm);
      if (!dep.ok) {
        toast({ title: dep.error, variant: "destructive" });
        return;
      }
      try {
        const { data, error } = await supabase.rpc("calculate_appointment_payment_centavos", {
          p_barbeiro_id: target.barbeiroId,
          p_servicos_nomes: servicosNomes,
          p_mode: chargeForm.paymentMode,
          p_deposit_type: chargeForm.paymentMode === "deposit" ? chargeForm.depositType : null,
          p_deposit_value: chargeForm.paymentMode === "deposit" ? dep.depositValue : null,
        });
        if (error) throw error;
        const calc = data as {
          error?: string;
          charge_centavos?: number;
          total_centavos?: number;
          remaining_centavos?: number;
        };
        if (calc.error || calc.charge_centavos == null) {
          toast({
            title: "Cobrança não aplicável",
            description: "Verifique preços dos serviços selecionados.",
            variant: "destructive",
          });
          return;
        }
        setConfirmChargePreview({
          chargeCentavos: calc.charge_centavos,
          totalCentavos: calc.total_centavos ?? 0,
          remainingCentavos: calc.remaining_centavos ?? 0,
        });
      } catch {
        setConfirmChargePreview(null);
      }
    } else {
      setConfirmChargePreview(null);
    }

    setStep("confirm");
  };

  const persistChargeSettings = async () => {
    if (!target || !selectedPaciente || chargeKind !== "automatic") return;
    const dep = parseChargeFormDepositValue(chargeForm);
    if (!dep.ok) throw new Error(dep.error);

    await savePaymentPanelSettings({
      appointment_payment_mode: chargeForm.paymentMode,
      appointment_deposit_type: chargeForm.paymentMode === "deposit" ? chargeForm.depositType : null,
      appointment_deposit_value: chargeForm.paymentMode === "deposit" ? dep.depositValue : null,
      payment_enable_card: chargeForm.enableCard,
      payment_enable_pix: chargeForm.enablePix,
      payment_max_installments: chargeForm.enableCard ? parseInt(chargeForm.maxInstallments, 10) || 1 : 1,
    });

    await upsertClientePagamentoPrefs({
      barbeariaId: target.barbeariaId,
      whatsappDigits: selectedPaciente.whatsapp_digits,
      appointment_payment_mode: chargeForm.paymentMode,
      appointment_deposit_type: chargeForm.paymentMode === "deposit" ? chargeForm.depositType : null,
      appointment_deposit_value: chargeForm.paymentMode === "deposit" ? dep.depositValue : null,
      payment_enable_card: chargeForm.enableCard,
      payment_enable_pix: chargeForm.enablePix,
      payment_pass_fee_card: false,
      payment_pass_fee_pix: false,
      payment_max_installments: chargeForm.enableCard ? parseInt(chargeForm.maxInstallments, 10) || 1 : 1,
    });
  };

  const handleConfirm = async () => {
    if (!target || !selectedPaciente) return;
    setSubmitting(true);

    try {
      if (chargeKind === "automatic" && chargeForm.paymentMode !== "none") {
        await persistChargeSettings();
        const result = await createPanelSlotBookingWithPaymentHold({
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

        void saveAgendamentoPanelPaymentSnapshot({
          agendamentoId: result.hold.agendamentoId,
          chargeKind: "automatic",
          chargeForm,
          chargeCentavos: result.hold.chargeCentavos,
          totalCentavos: result.hold.totalCentavos,
          remainingCentavos: result.hold.remainingCentavos,
        });

        const link = getAppointmentPaymentPageUrl(result.hold.confirmationToken);
        try {
          await navigator.clipboard.writeText(link);
        } catch {
          /* ignore */
        }
        setCreatedPaymentLink(link);
        setStep("success");
        onCreated();
        toast({
          title: "Agendamento reservado",
          description: "Link de pagamento copiado — envie ao cliente para concluir o pagamento.",
        });
        return;
      }

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

      if (chargeKind === "manual") {
        void saveAgendamentoPanelPaymentSnapshot({
          agendamentoId: result.agendamentoId,
          chargeKind: "manual",
        });
      }

      toast({ title: "Agendamento criado" });
      onCreated();
      onClose();
    } catch (e) {
      setSubmitting(false);
      toast({
        title: "Não foi possível salvar",
        description: e instanceof Error ? e.message : "Tente novamente.",
        variant: "destructive",
      });
    }
  };

  if (!open || !target) return null;

  const atendimentoDescricao =
    servicosNomes.length > 0 ? servicosNomes.join(" · ") : "Atendimento";

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
          "relative z-10 w-full max-w-lg rounded-xl border border-border/80 bg-background p-5 shadow-xl",
          "animate-in fade-in-0 zoom-in-95 duration-150",
          "min-h-[min(32rem,85vh)] max-h-[90vh] overflow-y-auto",
        )}
      >
        <div className="flex items-start justify-between gap-3 mb-4">
          <div className="min-w-0">
            <h2 id="slot-booking-title" className="text-lg font-semibold tracking-tight">
              {step === "form"
                ? "Novo agendamento"
                : step === "success"
                  ? "Link de pagamento"
                  : "Confirmar agendamento"}
            </h2>
            {step === "confirm" ? (
              <p className="text-sm text-muted-foreground">Revise os dados antes de salvar.</p>
            ) : step === "success" ? (
              <p className="text-sm text-muted-foreground">Envie ao {t.singularLower} para concluir o pagamento.</p>
            ) : null}
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
            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t.singular}</p>
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
                      placeholder={`Buscar ${t.singularLower} cadastrado…`}
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
                          Nenhum {t.singularLower} encontrado.
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

            {servicos.length > 0 ? (
              <div>
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Serviço</p>
                <ServicosCarousel
                  servicos={servicos}
                  selecionados={servSel}
                  onToggle={toggleServico}
                  showPrices
                  forceVertical
                />
              </div>
            ) : null}

            {canChargeFeature && (
              <div className="rounded-xl border border-border/80 bg-card/40 overflow-hidden">
                <div className="space-y-2 px-3 py-2.5">
                  <label className="flex items-center gap-2.5 cursor-pointer select-none">
                    <input
                      type="radio"
                      name="slot-charge-kind"
                      checked={chargeKind === "automatic"}
                      onChange={() => {
                        setChargeKind("automatic");
                        if (chargeForm.paymentMode === "none") {
                          patchChargeForm({ paymentMode: "deposit" });
                        }
                      }}
                      className="h-4 w-4 accent-primary"
                    />
                    <span className="text-sm font-semibold">Link de pagamento</span>
                    {prefsLoading && chargeKind === "automatic" && (
                      <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
                    )}
                  </label>
                  <label className="flex items-center gap-2.5 cursor-pointer select-none">
                    <input
                      type="radio"
                      name="slot-charge-kind"
                      checked={chargeKind === "manual"}
                      onChange={() => setChargeKind("manual")}
                      className="h-4 w-4 accent-primary"
                    />
                    <span className="text-sm font-semibold">Cobrança manual</span>
                  </label>
                  <label className="flex items-center gap-2.5 cursor-pointer select-none">
                    <input
                      type="radio"
                      name="slot-charge-kind"
                      checked={chargeKind === "none"}
                      onChange={() => setChargeKind("none")}
                      className="h-4 w-4 accent-primary"
                    />
                    <span className="text-sm font-semibold">Sem cobrança</span>
                  </label>
                </div>

                {chargeKind === "automatic" && (
                  <div className="border-t border-border/60 px-3 pb-4 pt-3">
                    <AppointmentChargeSettingsForm
                      state={chargeForm}
                      onChange={patchChargeForm}
                      mpConnected={mpConnected}
                      barbeiroId={target.barbeiroId}
                      servicosNomes={servicosNomes}
                      idPrefix="slot-booking-charge"
                      paymentMethodsLayout="compact"
                    />
                  </div>
                )}

                {chargeKind === "manual" && (
                  <div className="border-t border-border/60 px-3 pb-4 pt-3 space-y-2">
                    <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      Compartilhe sua chave com seu {t.singularLower}
                    </p>
                    <ManualPixKeyCopyField pixKey={manualPixKey} />
                  </div>
                )}
              </div>
            )}

            <div>
              <label className="mb-2 block text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Observação <span className="font-normal normal-case tracking-normal">(opcional)</span>
              </label>
              <textarea
                value={observacao}
                onChange={(e) => setObservacao(e.target.value)}
                maxLength={500}
                rows={3}
                className="flex w-full resize-none rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
              />
            </div>

            <Button
              type="button"
              className="w-full rounded-full"
              disabled={!canContinue}
              onClick={() => void handleContinue()}
            >
              Continuar
            </Button>
          </div>
        ) : step === "success" && createdPaymentLink ? (
          <div className="space-y-5">
            <div className="rounded-2xl border border-border/70 bg-secondary/15 px-4 py-4 space-y-3 text-center">
              <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-full bg-gradient-brand shadow-glow">
                <Check className="h-5 w-5 text-white" strokeWidth={2.5} />
              </div>
              <p className="text-sm font-semibold">Agendamento reservado</p>
              <p className="text-xs text-muted-foreground">
                O cliente só consegue pagar por este link — não é o link de agendamento público do Perfil.
              </p>
            </div>
            <div className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Link de pagamento</p>
              <PaymentLinkCopyRow url={createdPaymentLink} />
            </div>
            <Button type="button" className="w-full rounded-full" onClick={onClose}>
              Fechar
            </Button>
          </div>
        ) : (
          <div>
            <div className="rounded-2xl border border-border/70 bg-secondary/15 px-4 py-4 space-y-3">
              <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-full bg-gradient-brand shadow-glow">
                <Check className="h-5 w-5 text-white" strokeWidth={2.5} />
              </div>
              <p className="text-center text-sm font-semibold">{selectedPaciente?.cliente_nome}</p>
              <p className="text-center text-xs text-muted-foreground">
                {selectedPaciente ? formatWhatsAppDisplay(selectedPaciente.whatsapp_digits) : ""}
              </p>
              <p className="text-center text-sm text-foreground">{atendimentoDescricao}</p>
              {duracaoTotal > 0 && (
                <p className="text-center text-xs text-muted-foreground">
                  Duração: {formatTotalServiceMinutes(duracaoTotal)}
                </p>
              )}
              {chargeKind === "manual" && manualPixKey.trim() && (
                <div className="border-t border-border/60 pt-3 text-xs space-y-1.5">
                  <p className="font-medium text-foreground text-center">Cobrança manual</p>
                  <p className="text-center text-muted-foreground break-all">Chave Pix: {manualPixKey.trim()}</p>
                </div>
              )}
              {chargeKind === "automatic" && chargeForm.paymentMode !== "none" && (
                <div className="border-t border-border/60 pt-3 text-xs space-y-1.5">
                  <p className="font-medium text-foreground text-center">Cobrança</p>
                  <p className="text-center text-muted-foreground">
                    Modo: {paymentModeLabel(chargeForm.paymentMode)}
                  </p>
                  {chargeForm.paymentMode === "deposit" && (
                    <p className="text-center text-muted-foreground">
                      Pagamento parcial:{" "}
                      {chargeForm.depositType === "percent"
                        ? `${chargeForm.depositPercent}%`
                        : `R$ ${chargeForm.depositFixedReais}`}
                    </p>
                  )}
                  {confirmChargePreview && (
                    <p className="text-center text-sm font-medium text-foreground">
                      Valor a cobrar agora: {formatMoney(confirmChargePreview.chargeCentavos)}
                      {confirmChargePreview.remainingCentavos > 0 && (
                        <span className="block text-xs font-normal text-muted-foreground mt-0.5">
                          Restante presencial: {formatMoney(confirmChargePreview.remainingCentavos)}
                        </span>
                      )}
                    </p>
                  )}
                  <p className="text-center text-muted-foreground">
                    Meios:{" "}
                    {[chargeForm.enableCard && "Cartão", chargeForm.enablePix && "Pix"].filter(Boolean).join(" · ") ||
                      "—"}
                  </p>
                  {chargeForm.enableCard && (
                    <p className="text-center text-muted-foreground">
                      Parcelas: até {chargeForm.maxInstallments}x
                    </p>
                  )}
                </div>
              )}
              {observacao.trim() && (
                <p className="border-t border-border/60 pt-3 text-center text-xs text-muted-foreground">
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
