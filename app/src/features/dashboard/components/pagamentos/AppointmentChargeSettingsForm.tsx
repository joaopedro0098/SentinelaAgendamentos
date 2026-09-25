import { Check, Copy, CreditCard, Link2, Loader2, QrCode } from "lucide-react";
import { useCallback, useEffect, useState, type ReactNode } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import {
  formatDepositFixedReais,
  type AppointmentDepositType,
  type AppointmentPaymentMode,
} from "@/lib/paymentsApi";

const INSTALLMENT_OPTIONS = Array.from({ length: 12 }, (_, i) => i + 1);

const selectClass =
  "w-full h-11 rounded-xl border border-border/80 bg-background/80 px-3 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

export type AppointmentChargeFormState = {
  paymentMode: AppointmentPaymentMode;
  depositType: AppointmentDepositType;
  depositPercent: string;
  depositFixedReais: string;
  enableCard: boolean;
  enablePix: boolean;
  passFeeCard: boolean;
  passFeePix: boolean;
  maxInstallments: string;
};

type Props = {
  state: AppointmentChargeFormState;
  onChange: (patch: Partial<AppointmentChargeFormState>) => void;
  publicBookingUrl: string | null;
  mpConnected: boolean;
  barbeiroId?: string | null;
  servicosNomes?: string[];
  idPrefix?: string;
};

async function resolveChargeCentavosForDisplay(
  barbeiroId: string,
  servicosNomes: string[],
  state: AppointmentChargeFormState,
): Promise<number | null> {
  if (state.paymentMode === "none" || servicosNomes.length === 0) return null;
  const dep = parseChargeFormDepositValue(state);
  if (!dep.ok) return null;

  const { data, error } = await supabase.rpc("calculate_appointment_payment_centavos", {
    p_barbeiro_id: barbeiroId,
    p_servicos_nomes: servicosNomes,
    p_mode: state.paymentMode,
    p_deposit_type: state.paymentMode === "deposit" ? state.depositType : null,
    p_deposit_value: state.paymentMode === "deposit" ? dep.depositValue : null,
  });
  if (error) return null;
  const calc = data as { error?: string; charge_centavos?: number };
  if (calc.error || calc.charge_centavos == null || calc.charge_centavos <= 0) return null;

  let charge = calc.charge_centavos;
  const passCard = state.enableCard && state.passFeeCard;
  const passPix = state.enablePix && state.passFeePix;

  if (passCard) {
    const { data: withFee } = await supabase.rpc("apply_mp_pass_fee_centavos", {
      p_charge_centavos: charge,
      p_method: "card",
      p_installments: 1,
      p_pass_fee_card: true,
      p_pass_fee_pix: false,
    });
    if (typeof withFee === "number") charge = withFee;
  } else if (passPix) {
    const { data: withFee } = await supabase.rpc("apply_mp_pass_fee_centavos", {
      p_charge_centavos: charge,
      p_method: "pix",
      p_installments: 1,
      p_pass_fee_card: false,
      p_pass_fee_pix: true,
    });
    if (typeof withFee === "number") charge = withFee;
  }

  return charge;
}

function formatMoney(centavos: number) {
  return (centavos / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function StepNumberBadge({ step }: { step: number }) {
  return (
    <span
      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/15 text-sm font-semibold text-primary"
      aria-hidden
    >
      {step}
    </span>
  );
}

function ChargeStepHeader({
  step,
  title,
  description,
  action,
}: {
  step: number;
  title?: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex items-start gap-3">
      <StepNumberBadge step={step} />
      <div className="min-w-0 flex-1 pt-0.5">
        {(title || action) && (
          <div className="flex items-start justify-between gap-2">
            {title ? <p className="text-sm font-semibold text-foreground">{title}</p> : <span />}
            {action}
          </div>
        )}
        {description ? (
          <p className={cn("text-xs text-muted-foreground leading-relaxed", title && "mt-0.5")}>
            {description}
          </p>
        ) : null}
      </div>
    </div>
  );
}

function PaymentMethodToggleRow({
  id,
  label,
  icon,
  checked,
  onToggle,
}: {
  id: string;
  label: string;
  icon: ReactNode;
  checked: boolean;
  onToggle: () => void;
}) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-xl border border-border/70 bg-background/60 px-3 py-2.5">
      <div className="flex items-center gap-3 min-w-0">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-muted/80 text-muted-foreground">
          {icon}
        </span>
        <label htmlFor={id} className="text-sm font-medium cursor-pointer">
          {label}
        </label>
      </div>
      <button
        id={id}
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={onToggle}
        className={cn(
          "relative inline-flex h-7 w-12 shrink-0 items-center rounded-full transition-colors",
          checked ? "bg-primary" : "bg-muted",
        )}
      >
        <span
          className={cn(
            "inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform",
            checked ? "translate-x-6" : "translate-x-1",
          )}
        />
      </button>
    </div>
  );
}

function PaymentLinkCopyRow({ url }: { url: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      /* ignore */
    }
  }, [url]);

  return (
    <div className="flex items-center gap-2 rounded-xl border border-border/80 bg-background/80 pl-3 pr-1.5 py-1.5">
      <Link2 className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
      <input
        readOnly
        value={url}
        className="min-w-0 flex-1 bg-transparent text-xs text-muted-foreground truncate outline-none"
      />
      <button
        type="button"
        onClick={() => void handleCopy()}
        className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-border/70 bg-muted/40 px-3 py-1.5 text-xs font-medium hover:bg-muted/70 transition-colors"
      >
        {copied ? <Check className="h-3.5 w-3.5 text-primary" /> : <Copy className="h-3.5 w-3.5" />}
        Copiar
      </button>
    </div>
  );
}

export function AppointmentChargeSettingsForm({
  state,
  onChange,
  publicBookingUrl,
  mpConnected,
  barbeiroId,
  servicosNomes = [],
  idPrefix = "charge",
}: Props) {
  const chargeEnabled = state.paymentMode !== "none";
  const [chargePreviewCentavos, setChargePreviewCentavos] = useState<number | null>(null);
  const [chargePreviewLoading, setChargePreviewLoading] = useState(false);
  const linkUrl = publicBookingUrl;

  useEffect(() => {
    if (!chargeEnabled || !barbeiroId || servicosNomes.length === 0) {
      setChargePreviewCentavos(null);
      setChargePreviewLoading(false);
      return;
    }

    let cancelled = false;
    setChargePreviewLoading(true);
    const timer = window.setTimeout(() => {
      void resolveChargeCentavosForDisplay(barbeiroId, servicosNomes, state).then((value) => {
        if (cancelled) return;
        setChargePreviewCentavos(value);
        setChargePreviewLoading(false);
      });
    }, 280);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [
    barbeiroId,
    servicosNomes,
    chargeEnabled,
    state.paymentMode,
    state.depositType,
    state.depositPercent,
    state.depositFixedReais,
    state.enableCard,
    state.enablePix,
    state.passFeeCard,
    state.passFeePix,
  ]);

  const content = (
    <div className="space-y-6">
      {chargeEnabled && !mpConnected && (
        <p className="text-sm text-destructive rounded-xl border border-destructive/30 bg-destructive/5 px-3 py-2">
          Conecte sua conta Mercado Pago em Pagamentos antes de cobrar.
        </p>
      )}

      {/* 1 — modo / valor parcial */}
      <section className="flex items-start gap-3">
        <StepNumberBadge step={1} />
        <div className="min-w-0 flex-1 space-y-2 pt-0.5">
          {state.paymentMode === "deposit" ? (
            <div className="grid grid-cols-2 gap-2">
              <select
                id={`${idPrefix}-payment-mode`}
                className={cn(selectClass, "min-w-0 text-xs sm:text-sm px-2")}
                aria-label="Modo de cobrança"
                value={state.paymentMode === "none" ? "deposit" : state.paymentMode}
                onChange={(e) => onChange({ paymentMode: e.target.value as AppointmentPaymentMode })}
              >
                <option value="deposit">Pagamento parcial</option>
                <option value="full">Pagamento integral</option>
              </select>
              <select
                id={`${idPrefix}-deposit-type`}
                className={cn(selectClass, "min-w-0 text-xs sm:text-sm px-2")}
                aria-label="Tipo de valor parcial"
                value={state.depositType}
                onChange={(e) => onChange({ depositType: e.target.value as AppointmentDepositType })}
              >
                <option value="percent">Percentual do total</option>
                <option value="fixed">Valor fixo (R$)</option>
              </select>
            </div>
          ) : (
            <select
              id={`${idPrefix}-payment-mode`}
              className={selectClass}
              aria-label="Modo de cobrança"
              value={state.paymentMode === "none" ? "deposit" : state.paymentMode}
              onChange={(e) => onChange({ paymentMode: e.target.value as AppointmentPaymentMode })}
            >
              <option value="deposit">Pagamento parcial</option>
              <option value="full">Pagamento integral</option>
            </select>
          )}

          {state.paymentMode === "deposit" && (
            <div className="relative">
              {state.depositType === "fixed" ? (
                <>
                  <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
                    R$
                  </span>
                  <Input
                    id={`${idPrefix}-deposit-value`}
                    inputMode="decimal"
                    placeholder="50,00"
                    aria-label="Valor fixo do pagamento parcial"
                    className="h-11 rounded-xl pl-9"
                    value={state.depositFixedReais}
                    onChange={(e) => onChange({ depositFixedReais: e.target.value })}
                  />
                </>
              ) : (
                <>
                  <Input
                    id={`${idPrefix}-deposit-value`}
                    inputMode="numeric"
                    aria-label="Percentual do pagamento parcial"
                    className="h-11 rounded-xl pr-9"
                    value={state.depositPercent}
                    onChange={(e) => onChange({ depositPercent: e.target.value.replace(/\D/g, "") })}
                  />
                  <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
                    %
                  </span>
                </>
              )}
            </div>
          )}
        </div>
      </section>

      {chargeEnabled && (
        <>
          {/* 2 — meios */}
          <section className="space-y-3">
            <ChargeStepHeader step={2} description="Escolha como o paciente poderá pagar." />
            <div className="space-y-2 pl-11">
              <PaymentMethodToggleRow
                id={`${idPrefix}-payment-enable-pix`}
                label="Pix"
                icon={<QrCode className="h-4 w-4" />}
                checked={state.enablePix}
                onToggle={() => onChange({ enablePix: !state.enablePix })}
              />
              <PaymentMethodToggleRow
                id={`${idPrefix}-payment-enable-card`}
                label="Cartão de crédito"
                icon={<CreditCard className="h-4 w-4" />}
                checked={state.enableCard}
                onToggle={() => onChange({ enableCard: !state.enableCard })}
              />
              {!state.enableCard && !state.enablePix && (
                <p className="text-sm text-destructive px-1">Ative cartão ou Pix para cobrar.</p>
              )}
              {state.enableCard && (
                <div className="space-y-1.5 pt-1">
                  <Label htmlFor={`${idPrefix}-max-installments`} className="text-xs text-muted-foreground">
                    Parcelas
                  </Label>
                  <select
                    id={`${idPrefix}-max-installments`}
                    className={selectClass}
                    value={state.maxInstallments}
                    onChange={(e) => onChange({ maxInstallments: e.target.value })}
                  >
                    {INSTALLMENT_OPTIONS.map((n) => (
                      <option key={n} value={String(n)}>
                        Até {n}x
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>
          </section>

          {/* 4 — Link de pagamento */}
          {linkUrl ? (
            <section className="space-y-3">
              <ChargeStepHeader
                step={4}
                title="Link de pagamento"
                description="Compartilhe este link com o paciente para realizar o pagamento."
              />
              <div className="pl-11">
                <PaymentLinkCopyRow url={linkUrl} />
              </div>
            </section>
          ) : null}

          <div className="rounded-xl border border-primary/25 bg-primary/10 px-4 py-3 flex justify-end">
            {chargePreviewLoading ? (
              <Loader2 className="h-5 w-5 animate-spin text-primary" />
            ) : (
              <p className="text-xl font-bold tabular-nums text-primary leading-none">
                {formatMoney(chargePreviewCentavos ?? 0)}
              </p>
            )}
          </div>
        </>
      )}
    </div>
  );

  return content;
}

export function defaultChargeFormFromPanelSettings(data: {
  appointment_payment_mode?: AppointmentPaymentMode;
  appointment_deposit_type?: AppointmentDepositType | null;
  appointment_deposit_value?: number | null;
  payment_enable_card?: boolean;
  payment_enable_pix?: boolean;
  payment_pass_fee_card?: boolean;
  payment_pass_fee_pix?: boolean;
  payment_max_installments?: number | null;
}): AppointmentChargeFormState {
  const depositType =
    data.appointment_deposit_type === "fixed" || data.appointment_deposit_type === "percent"
      ? data.appointment_deposit_type
      : "percent";
  return {
    paymentMode: data.appointment_payment_mode ?? "none",
    depositType,
    depositPercent:
      depositType === "percent" && data.appointment_deposit_value != null
        ? String(data.appointment_deposit_value)
        : "30",
    depositFixedReais:
      depositType === "fixed" && data.appointment_deposit_value != null
        ? formatDepositFixedReais(data.appointment_deposit_value)
        : "50,00",
    enableCard: data.payment_enable_card ?? true,
    enablePix: data.payment_enable_pix ?? true,
    passFeeCard: data.payment_pass_fee_card ?? false,
    passFeePix: data.payment_pass_fee_pix ?? false,
    maxInstallments: String(data.payment_max_installments ?? 1),
  };
}

export function parseChargeFormDepositValue(
  state: AppointmentChargeFormState,
): { ok: true; depositValue: number | null } | { ok: false; error: string } {
  if (state.paymentMode !== "deposit") {
    return { ok: true, depositValue: null };
  }
  if (state.depositType === "percent") {
    const v = Math.min(100, Math.max(1, parseInt(state.depositPercent, 10) || 0));
    if (v < 1) return { ok: false, error: "Informe um percentual válido." };
    return { ok: true, depositValue: v };
  }
  const normalized = state.depositFixedReais.replace(/\./g, "").replace(",", ".").trim();
  const reais = Number.parseFloat(normalized);
  if (!Number.isFinite(reais) || reais <= 0) {
    return { ok: false, error: "Informe um valor fixo válido." };
  }
  const centavos = Math.round(reais * 100);
  if (centavos < 50) {
    return { ok: false, error: "Valor fixo do sinal deve ser de pelo menos R$ 0,50." };
  }
  return { ok: true, depositValue: centavos };
}
