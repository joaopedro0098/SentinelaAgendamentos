import { useEffect, useMemo, useRef, useState } from "react";
import { initMercadoPago, Payment } from "@mercadopago/sdk-react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { formatServicePrice } from "@/lib/servicePrice";
import {
  formatAppointmentPaymentError,
  MP_PUBLIC_KEY,
  MP_TEST_MODE,
  processAppointmentPayment,
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
  const [secondsLeft, setSecondsLeft] = useState<number | null>(null);
  const [processing, setProcessing] = useState(false);
  const [brickKey, setBrickKey] = useState(0);
  const [pixQr, setPixQr] = useState<string | null>(null);
  const [pixQrBase64, setPixQrBase64] = useState<string | null>(null);
  const expiredCalledRef = useRef(false);
  const onExpiredRef = useRef(onExpired);
  const onPaidRef = useRef(onPaid);
  const onFailedRef = useRef(onFailed);

  onExpiredRef.current = onExpired;
  onPaidRef.current = onPaid;
  onFailedRef.current = onFailed;

  useEffect(() => {
    ensureMpInit();
  }, []);

  useEffect(() => {
    expiredCalledRef.current = false;
    if (!expiresAt) return;

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

  async function pollConfirmed() {
    for (let i = 0; i < 40; i += 1) {
      const result = await verifyAppointmentPayment({
        agendamento_id: agendamentoId,
        confirmation_token: confirmationToken,
      });
      if (result.status === "confirmado" || result.ok) {
        onPaidRef.current();
        return;
      }
      if (result.status === "cancelado") {
        onFailedRef.current();
        return;
      }
      await new Promise((r) => setTimeout(r, 2000));
    }
    toast.message("Pagamento em processamento. Aguarde a confirmação.");
    onPaidRef.current();
  }

  const timerLabel =
    secondsLeft != null
      ? `${String(Math.floor(secondsLeft / 60)).padStart(2, "0")}:${String(secondsLeft % 60).padStart(2, "0")}`
      : null;

  const initialization = useMemo(
    () => ({ amount: amountCentavos / 100 }),
    [amountCentavos],
  );

  const customization = useMemo(
    () => ({
      paymentMethods: {
        creditCard: enableCard ? ("all" as const) : ("none" as const),
        debitCard: enableCard ? ("all" as const) : ("none" as const),
        bankTransfer: enablePix ? ("all" as const) : ("none" as const),
        maxInstallments: Math.max(1, maxInstallments),
      },
    }),
    [enableCard, enablePix, maxInstallments],
  );

  const handleSubmit = useMemo(
    () => async (formData: unknown) => {
      setProcessing(true);
      let canRetry = false;
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

        if (result.status === "confirmado") {
          onPaidRef.current();
          return;
        }

        if (result.release_hold) {
          toast.error("Pagamento não concluído. O horário foi liberado.");
          onFailedRef.current();
          return;
        }

        canRetry = true;
        toast.error(formatAppointmentPaymentError("Pagamento não concluído. Tente novamente."));
      } catch (e) {
        const err = e as Error & { retry?: boolean; release_hold?: boolean };
        toast.error(formatAppointmentPaymentError(err.message || "Pagamento não concluído."));
        if (err.release_hold) {
          onFailedRef.current();
        } else {
          canRetry = true;
        }
      } finally {
        setProcessing(false);
        if (canRetry) {
          setBrickKey((key) => key + 1);
        }
      }
    },
    [agendamentoId, confirmationToken],
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
        {timerLabel && (
          <p className="mt-1 text-xs text-muted-foreground">
            Horário reservado por mais <span className="font-semibold text-foreground">{timerLabel}</span>
          </p>
        )}
      </div>

      {MP_TEST_MODE && (
        <p className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-900 dark:text-amber-100">
          Ambiente de teste: no e-mail do pagamento, use um comprador teste do Mercado Pago (ex.:{" "}
          <span className="font-medium">comprador@testuser.com</span>) e cartões de teste. E-mail pessoal não funciona
          neste fluxo.
        </p>
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
        <Payment
          key={`mp-payment-${agendamentoId}-${brickKey}`}
          id={`mp-payment-${agendamentoId}-${brickKey}`}
          initialization={initialization}
          customization={customization}
          onSubmit={handleSubmit}
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
