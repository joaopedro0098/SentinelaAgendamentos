import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { initMercadoPago, Payment } from "@mercadopago/sdk-react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { formatServicePrice } from "@/lib/servicePrice";
import {
  AppointmentPaymentError,
  MP_PUBLIC_KEY,
  MP_TEST_MODE,
  parseAppointmentPaymentErrorPayload,
  paymentErrorToastDescription,
  processAppointmentPayment,
  type AppointmentPaymentErrorDetails,
  verifyAppointmentPayment,
} from "@/lib/appointmentPaymentApi";

type Props = {
  amountCentavos: number;
  remainingCentavos: number;
  expiresAt: string | null;
  agendamentoId: string;
  confirmationToken: string;
  enableCard: boolean;
  enablePix: boolean;
  maxInstallments: number;
  onPaid: () => void;
  onExpired: () => void;
  onFailed: () => void;
};

let mpInitialized = false;

function ensureMpInit() {
  if (!MP_PUBLIC_KEY || mpInitialized) return;
  initMercadoPago(MP_PUBLIC_KEY, { locale: "pt-BR" });
  mpInitialized = true;
}

function PaymentHoldCountdown({
  expiresAt,
  onExpired,
}: {
  expiresAt: string | null;
  onExpired: () => void;
}) {
  const [secondsLeft, setSecondsLeft] = useState<number | null>(null);
  const expiredCalledRef = useRef(false);
  const onExpiredRef = useRef(onExpired);
  onExpiredRef.current = onExpired;

  useEffect(() => {
    expiredCalledRef.current = false;
    if (!expiresAt) {
      setSecondsLeft(null);
      return;
    }

    const tick = () => {
      const left = Math.max(0, Math.floor((new Date(expiresAt).getTime() - Date.now()) / 1000));
      setSecondsLeft(left);
      if (left <= 0 && !expiredCalledRef.current) {
        expiredCalledRef.current = true;
        onExpiredRef.current();
      }
    };

    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, [expiresAt]);

  if (secondsLeft == null) return null;

  const timerLabel = `${String(Math.floor(secondsLeft / 60)).padStart(2, "0")}:${String(secondsLeft % 60).padStart(2, "0")}`;

  return (
    <p className="mt-1 text-xs text-muted-foreground">
      Horário reservado por mais <span className="font-semibold text-foreground">{timerLabel}</span>
    </p>
  );
}

type MpPaymentBrickProps = {
  agendamentoId: string;
  brickRetryKey: number;
  initialization: { amount: number; marketplace: boolean };
  customization: {
    paymentMethods: {
      creditCard: "all" | "none";
      debitCard: "all" | "none";
      prepaidCard: "all" | "none";
      bankTransfer: "all" | "none";
      maxInstallments: number;
    };
  };
  onSubmit: (formData: unknown) => Promise<void>;
  onBrickError: (message: string) => void;
};

function MpPaymentBrick({
  agendamentoId,
  brickRetryKey,
  initialization,
  customization,
  onSubmit,
  onBrickError,
}: MpPaymentBrickProps) {
  const submitRef = useRef(onSubmit);
  submitRef.current = onSubmit;

  const onBrickErrorRef = useRef(onBrickError);
  onBrickErrorRef.current = onBrickError;

  const stableSubmit = useCallback(async (formData: unknown) => {
    await submitRef.current(formData);
  }, []);

  const stableOnError = useCallback((error: unknown) => {
    const message =
      typeof error === "object" && error && "message" in error
        ? String((error as { message?: string }).message)
        : "Erro no formulário de pagamento.";
    onBrickErrorRef.current(message);
  }, []);

  const brickId = `mp-payment-${agendamentoId}-${brickRetryKey}`;

  return (
    <Payment
      id={brickId}
      initialization={initialization}
      customization={customization}
      onSubmit={stableSubmit}
      onError={stableOnError}
    />
  );
}

export function PublicBookingPaymentCheckout({
  amountCentavos,
  remainingCentavos,
  expiresAt,
  agendamentoId,
  confirmationToken,
  enableCard,
  enablePix,
  maxInstallments,
  onPaid,
  onExpired,
  onFailed,
}: Props) {
  const [processing, setProcessing] = useState(false);
  const [brickRetryKey, setBrickRetryKey] = useState(0);
  const [pixQr, setPixQr] = useState<string | null>(null);
  const [pixQrBase64, setPixQrBase64] = useState<string | null>(null);
  const [lastPaymentError, setLastPaymentError] = useState<AppointmentPaymentErrorDetails | null>(null);

  const onExpiredRef = useRef(onExpired);
  const onPaidRef = useRef(onPaid);
  const onFailedRef = useRef(onFailed);
  onExpiredRef.current = onExpired;
  onPaidRef.current = onPaid;
  onFailedRef.current = onFailed;

  useEffect(() => {
    ensureMpInit();
  }, []);

  const pollConfirmed = useCallback(async () => {
    for (let i = 0; i < 40; i += 1) {
      const result = await verifyAppointmentPayment({
        agendamento_id: agendamentoId,
        confirmation_token: confirmationToken,
      });
      if (result.status === "confirmado") {
        onPaidRef.current();
        return;
      }
      if (result.status === "cancelado") {
        onFailedRef.current();
        return;
      }
      await new Promise((r) => setTimeout(r, 2000));
    }
    toast.message("Pix ainda pendente. Pague e toque em \"Já paguei — verificar\".");
  }, [agendamentoId, confirmationToken]);

  const initialization = useMemo(
    () => ({
      // Checkout Transparente + OAuth: public_key do integrador no front,
      // access_token do vendedor no backend. NÃO usar marketplace:true aqui
      // (isso exige preferenceId — ver doc wallet-credits / split Bricks).
      amount: Math.max(1, amountCentavos / 100),
    }),
    [amountCentavos],
  );

  const customization = useMemo(
    () => ({
      paymentMethods: {
        creditCard: enableCard ? ("all" as const) : ("none" as const),
        debitCard: "none" as const,
        prepaidCard: "none" as const,
        bankTransfer: enablePix ? ("all" as const) : ("none" as const),
        maxInstallments: Math.max(1, maxInstallments),
      },
    }),
    [enableCard, enablePix, maxInstallments],
  );

  const handleBrickError = useCallback((message: string) => {
    const normalized = message.toLowerCase();
    const isInstallmentOrBin =
      normalized.includes("informação de pagamento") ||
      normalized.includes("informacion de pago") ||
      normalized.includes("installments") ||
      normalized.includes("bin");

    setLastPaymentError({
      title: "Erro no formulário Mercado Pago",
      message: isInstallmentOrBin
        ? "O Brick não conseguiu ler o cartão (BIN/parcelas). Verifique chave TEST- da app de agendamentos."
        : message,
      hint: isInstallmentOrBin
        ? "Cartão teste: 5031 4332 1540 6351 · CVV 123 · validade 11/30 · titular APRO · CPF 12345678909. E-mail diferente do seu login MP."
        : "Recarregue a página e tente novamente.",
      mp_code: null,
      mp_status_detail: null,
      retry: true,
      release_hold: false,
    });
  }, []);

  const handleSubmit = useCallback(
    async (formData: unknown) => {
      setProcessing(true);
      setLastPaymentError(null);
      let shouldRemountBrick = false;
      try {
        const result = await processAppointmentPayment({
          agendamento_id: agendamentoId,
          confirmation_token: confirmationToken,
          formData: formData as Record<string, unknown>,
        });

        if (result.already_confirmed || result.status === "confirmado") {
          onPaidRef.current();
          return;
        }

        if (result.status === "pending" && (result.qr_code_base64 || result.qr_code)) {
          setPixQr(result.qr_code ?? null);
          setPixQrBase64(result.qr_code_base64 ?? null);
          void pollConfirmed();
          return;
        }

        if (result.release_hold) {
          const details = parseAppointmentPaymentErrorPayload(result);
          setLastPaymentError(details);
          toast.error(details.title, {
            description: paymentErrorToastDescription(details),
          });
          onFailedRef.current();
          return;
        }

        shouldRemountBrick = true;
        const details = parseAppointmentPaymentErrorPayload(result);
        setLastPaymentError(details);
        toast.error(details.title, {
          description: paymentErrorToastDescription(details),
        });
      } catch (e) {
        const details =
          e instanceof AppointmentPaymentError
            ? e.details
            : parseAppointmentPaymentErrorPayload({
                error: e instanceof Error ? e.message : "Pagamento não concluído.",
              });
        setLastPaymentError(details);
        toast.error(details.title, {
          description: paymentErrorToastDescription(details),
        });
        if (details.release_hold) {
          onFailedRef.current();
        } else {
          shouldRemountBrick = true;
        }
      } finally {
        setProcessing(false);
        if (shouldRemountBrick) {
          setBrickRetryKey((key) => key + 1);
        }
      }
    },
    [agendamentoId, confirmationToken, pollConfirmed],
  );

  if (!MP_PUBLIC_KEY) {
    return (
      <p className="text-sm text-destructive text-center">
        Pagamento online indisponível no momento.
      </p>
    );
  }

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-border bg-muted/30 px-4 py-3 text-center">
        <p className="text-xs text-muted-foreground">Valor a pagar agora</p>
        <p className="font-display text-2xl font-bold">{formatServicePrice(amountCentavos)}</p>
        {remainingCentavos > 0 && (
          <p className="mt-1 text-xs text-muted-foreground">
            Restante presencial: {formatServicePrice(remainingCentavos)}
          </p>
        )}
        <PaymentHoldCountdown expiresAt={expiresAt} onExpired={() => onExpiredRef.current()} />
      </div>

      {MP_TEST_MODE && (
        <p className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-900 dark:text-amber-100">
          Ambiente de teste: cartão{" "}
          <span className="font-medium">5031 4332 1540 6351</span>, CVV <span className="font-medium">123</span>,
          validade futura, titular <span className="font-medium">APRO</span>, CPF{" "}
          <span className="font-medium">12345678909</span>, e-mail diferente do login MP. Pix: o QR é gerado, mas o
          sandbox não processa pagamento real — use cartão para validar confirmação automática.
        </p>
      )}

      {lastPaymentError && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-3 text-sm space-y-1">
          <p className="font-medium text-destructive">{lastPaymentError.title}</p>
          <p className="text-foreground/90">{lastPaymentError.message}</p>
          {lastPaymentError.hint && (
            <p className="text-xs text-muted-foreground">{lastPaymentError.hint}</p>
          )}
          {MP_TEST_MODE && (lastPaymentError.mp_code != null || lastPaymentError.mp_status_detail) && (
            <p className="text-[11px] text-muted-foreground font-mono">
              {lastPaymentError.mp_code != null ? `MP código ${lastPaymentError.mp_code}` : null}
              {lastPaymentError.mp_code != null && lastPaymentError.mp_status_detail ? " · " : null}
              {lastPaymentError.mp_status_detail ? `detalhe ${lastPaymentError.mp_status_detail}` : null}
            </p>
          )}
        </div>
      )}

      {pixQrBase64 && (
        <div className="rounded-xl border border-border p-4 text-center space-y-2">
          <p className="text-sm font-medium">Pix gerado — escaneie ou copie o código</p>
          <img src={`data:image/png;base64,${pixQrBase64}`} alt="QR Code Pix" className="mx-auto max-w-[200px]" />
          {pixQr && (
            <p className="text-xs break-all text-muted-foreground bg-muted/40 rounded-lg p-2">{pixQr}</p>
          )}
          <Button type="button" className="w-full rounded-full" disabled={processing} onClick={() => void pollConfirmed()}>
            {processing ? <Loader2 className="h-5 w-5 animate-spin" /> : "Já paguei — verificar"}
          </Button>
        </div>
      )}

      {!pixQrBase64 && (
        <MpPaymentBrick
          agendamentoId={agendamentoId}
          brickRetryKey={brickRetryKey}
          initialization={initialization}
          customization={customization}
          onSubmit={handleSubmit}
          onBrickError={handleBrickError}
        />
      )}

      {processing && (
        <div className="flex justify-center">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      )}
    </div>
  );
}
