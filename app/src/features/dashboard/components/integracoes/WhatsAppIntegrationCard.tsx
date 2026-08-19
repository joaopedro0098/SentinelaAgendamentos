import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import { maskPhone, unmaskPhone, isValidPhone } from "@agenda/lib/phone";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import {
  fetchWabaConnectStatus,
  invokeWabaConnectStart,
  invokeWabaConnectVerifyOtp,
  invokeWabaDisconnect,
  pollWabaConnectStatusFromDb,
  pollWabaConnectUntilOnline,
  type WabaConnectStatus,
} from "@/features/dashboard/lib/wabaConnectApi";
import {
  getMetaEmbeddedSignupConfig,
  runEmbeddedSignup,
  toBrazilE164Phone,
} from "@/features/dashboard/lib/metaEmbeddedSignup";

const CONNECTABLE_STATUSES = new Set<WabaConnectStatus>(["not_connected", "error", "token_expired"]);
const IN_PROGRESS_STATUSES = new Set<WabaConnectStatus>(["pending", "provisioning"]);

type ConnectingPhase = "meta" | "backend" | null;

function statusBadgeLabel(
  status: WabaConnectStatus,
  busy: boolean,
  connectingPhase: ConnectingPhase,
): string {
  if (busy || connectingPhase) return "Conectando…";
  if (status === "connected") return "Conectado";
  if (IN_PROGRESS_STATUSES.has(status)) return "Conectando…";
  return "Conectar";
}

export function WhatsAppIntegrationCard() {
  const { toast } = useToast();
  const [status, setStatus] = useState<WabaConnectStatus>("not_connected");
  const [loadingStatus, setLoadingStatus] = useState(true);
  const [busy, setBusy] = useState(false);
  const [connectingPhase, setConnectingPhase] = useState<ConnectingPhase>(null);
  const [flowError, setFlowError] = useState<string | null>(null);

  const [phoneDialogOpen, setPhoneDialogOpen] = useState(false);
  const [otpDialogOpen, setOtpDialogOpen] = useState(false);
  const [disconnectDialogOpen, setDisconnectDialogOpen] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const [phoneInput, setPhoneInput] = useState("");
  const [otpInput, setOtpInput] = useState("");
  const initialResumeDone = useRef(false);

  const metaConfigured = getMetaEmbeddedSignupConfig().isConfigured;

  const refreshStatus = useCallback(async () => {
    const next = await fetchWabaConnectStatus();
    if (next) setStatus(next);
    return next;
  }, []);

  const resetToConnect = useCallback((message?: string) => {
    setBusy(false);
    setConnectingPhase(null);
    setOtpDialogOpen(false);
    setPhoneDialogOpen(false);
    setOtpInput("");
    setStatus("not_connected");
    if (message) {
      setFlowError(message);
      toast({ title: "Não foi possível conectar", description: message, variant: "destructive" });
    } else {
      setFlowError(null);
    }
  }, [toast]);

  const completeConnected = useCallback(async () => {
    setBusy(false);
    setConnectingPhase(null);
    setOtpDialogOpen(false);
    setPhoneDialogOpen(false);
    setOtpInput("");
    setFlowError(null);
    setStatus("connected");
    toast({ title: "WhatsApp conectado", description: "Seu número Business está ativo." });
    await refreshStatus();
  }, [refreshStatus, toast]);

  const runPolling = useCallback(async () => {
    setBusy(true);
    setStatus("pending");
    const poll = await pollWabaConnectUntilOnline();
    if (poll.ok) {
      await completeConnected();
      return;
    }
    resetToConnect(poll.error);
  }, [completeConnected, resetToConnect]);

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      setLoadingStatus(true);
      const next = await fetchWabaConnectStatus();
      if (!cancelled && next) {
        setStatus(next);

        if (!initialResumeDone.current && next === "pending") {
          initialResumeDone.current = true;
          setOtpDialogOpen(true);
          setBusy(true);
          const poll = await pollWabaConnectUntilOnline();
          if (cancelled) return;
          if (poll.ok) {
            setBusy(false);
            setOtpDialogOpen(false);
            setStatus("connected");
            toast({ title: "WhatsApp conectado", description: "Seu número Business está ativo." });
          } else {
            setBusy(false);
            setStatus("not_connected");
            setFlowError(poll.error);
          }
        }

        if (!initialResumeDone.current && next === "provisioning") {
          initialResumeDone.current = true;
          setBusy(true);
          const dbPoll = await pollWabaConnectStatusFromDb({
            isCancelled: () => cancelled,
          });
          if (cancelled) return;

          if (!dbPoll.ok) {
            resetToConnect(dbPoll.error);
            return;
          }

          if (dbPoll.status === "connected") {
            await completeConnected();
            return;
          }

          setStatus("pending");
          setBusy(false);
          setOtpDialogOpen(true);
        }
      }

      if (!cancelled) setLoadingStatus(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [completeConnected, resetToConnect, toast]);

  const isClickable = useMemo(() => {
    if (busy || loadingStatus || connectingPhase || disconnecting) return false;
    if (status === "connected") return false;
    return CONNECTABLE_STATUSES.has(status) || IN_PROGRESS_STATUSES.has(status);
  }, [busy, connectingPhase, disconnecting, loadingStatus, status]);

  const showSpinner = busy || loadingStatus || Boolean(connectingPhase);
  const badgeText = statusBadgeLabel(status, busy, connectingPhase);

  async function handlePhoneContinue() {
    if (!isValidPhone(phoneInput)) {
      toast({
        title: "Número inválido",
        description: "Informe o WhatsApp com DDD (10 ou 11 dígitos).",
        variant: "destructive",
      });
      return;
    }

    if (!metaConfigured) {
      toast({
        title: "Integração indisponível",
        description: "Configuração Meta ausente no ambiente.",
        variant: "destructive",
      });
      return;
    }

    setPhoneDialogOpen(false);
    setBusy(true);
    setFlowError(null);
    setConnectingPhase("meta");

    try {
      const signup = await runEmbeddedSignup();

      if (signup.kind === "cancelled") {
        resetToConnect();
        return;
      }
      if (signup.kind === "error") {
        resetToConnect(signup.message);
        return;
      }

      setConnectingPhase("backend");

      const start = await invokeWabaConnectStart({
        waba_id: signup.waba_id,
        phone_number_id: signup.phone_number_id,
        phone_number: toBrazilE164Phone(phoneInput),
        verification_method: "sms",
      });

      setConnectingPhase(null);

      if (!start.ok) {
        resetToConnect(start.error);
        return;
      }

      if (start.status === "connected") {
        await completeConnected();
        return;
      }

      setStatus("pending");
      setBusy(false);
      setOtpDialogOpen(true);
      toast({
        title: "Código enviado",
        description: start.message || "Digite o código recebido por SMS.",
      });
    } catch (err) {
      const raw = err instanceof Error ? err.message : String(err);
      const metaLoadFailed =
        /facebook|sdk\.js|connect\.facebook\.net/i.test(raw) ||
        raw.includes("SDK do Facebook");
      resetToConnect(
        metaLoadFailed
          ? "Não foi possível carregar a autenticação da Meta. Desative bloqueadores de anúncio para este site e tente novamente."
          : raw || "Erro inesperado ao conectar WhatsApp.",
      );
    }
  }

  async function handleOtpSubmit() {
    const code = otpInput.trim();
    if (!code) {
      toast({ title: "Informe o código", variant: "destructive" });
      return;
    }

    setBusy(true);
    const verify = await invokeWabaConnectVerifyOtp(code);
    if (!verify.ok) {
      setBusy(false);
      toast({ title: "Código inválido", description: verify.error, variant: "destructive" });
      return;
    }

    setOtpDialogOpen(false);
    setOtpInput("");
    await runPolling();
  }

  function handleCardClick() {
    if (!isClickable) return;
    if (IN_PROGRESS_STATUSES.has(status)) {
      setOtpDialogOpen(true);
      return;
    }
    setFlowError(null);
    setPhoneDialogOpen(true);
  }

  async function handleDisconnectConfirm() {
    setDisconnecting(true);
    const result = await invokeWabaDisconnect();
    setDisconnecting(false);

    if (!result.ok) {
      toast({
        title: "Não foi possível desconectar",
        description: result.error,
        variant: "destructive",
      });
      return;
    }

    setDisconnectDialogOpen(false);
    setFlowError(null);
    setStatus("not_connected");
    toast({
      title: "WhatsApp desconectado",
      description: result.message || "Você pode conectar novamente quando quiser.",
    });
    await refreshStatus();
  }

  return (
    <div className="flex flex-col items-center gap-2 w-56">
      <button
        type="button"
        disabled={!isClickable}
        onClick={handleCardClick}
        className="w-full p-4 flex flex-col items-center justify-center text-center space-y-1.5 rounded-xl hover:bg-accent/40 transition-colors disabled:opacity-70 disabled:hover:bg-transparent disabled:cursor-default"
      >
        <img src="/whatsapp-icon.png" alt="WhatsApp" className="h-28 w-28 object-contain" />
        <div className="space-y-1">
          <h3 className="text-base font-semibold text-foreground">WhatsApp</h3>
          <span
            className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium ${
              status === "connected"
                ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400"
                : "bg-secondary text-muted-foreground"
            }`}
          >
            {showSpinner && <Loader2 className="h-3 w-3 animate-spin" />}
            {loadingStatus ? "Carregando…" : badgeText}
          </span>
          {flowError && CONNECTABLE_STATUSES.has(status) && (
            <p className="text-[11px] text-destructive leading-snug px-1">{flowError}</p>
          )}
        </div>
      </button>

      {status === "connected" && !loadingStatus && (
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="rounded-full text-muted-foreground"
          disabled={disconnecting || busy}
          onClick={() => setDisconnectDialogOpen(true)}
        >
          {disconnecting ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin mr-2" />
              Desconectando…
            </>
          ) : (
            "Desconectar"
          )}
        </Button>
      )}

      <AlertDialog open={disconnectDialogOpen} onOpenChange={setDisconnectDialogOpen}>
        <AlertDialogContent className="max-w-sm">
          <AlertDialogHeader>
            <AlertDialogTitle>Desconectar WhatsApp</AlertDialogTitle>
            <AlertDialogDescription>
              Isso vai desconectar o número atual do WhatsApp. Para conectar um número diferente, use o
              fluxo normal depois. Para reconectar o mesmo número, pode ser necessário desativar a
              verificação em duas etapas dele no WhatsApp Manager da Meta antes.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={disconnecting}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              disabled={disconnecting}
              onClick={(e) => {
                e.preventDefault();
                void handleDisconnectConfirm();
              }}
            >
              {disconnecting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  Desconectando…
                </>
              ) : (
                "Desconectar"
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={phoneDialogOpen} onOpenChange={setPhoneDialogOpen}>
        <AlertDialogContent className="max-w-sm">
          <AlertDialogHeader>
            <AlertDialogTitle>Conectar WhatsApp Business</AlertDialogTitle>
            <AlertDialogDescription>
              Informe o número que será usado para enviar confirmações e lembretes. Em seguida, você
              autorizará a conta na Meta.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-2 py-2">
            <Label htmlFor="waba-phone">Número (WhatsApp com DDD)</Label>
            <Input
              id="waba-phone"
              inputMode="tel"
              autoComplete="tel"
              placeholder="(11) 99999-9999"
              value={phoneInput}
              onChange={(e) => setPhoneInput(maskPhone(e.target.value))}
            />
            <p className="text-xs text-muted-foreground">
              Será enviado no formato internacional (+55…) para a Twilio.
            </p>
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              disabled={busy || !isValidPhone(phoneInput)}
              onClick={(e) => {
                e.preventDefault();
                void handlePhoneContinue();
              }}
            >
              Continuar com Meta
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={otpDialogOpen} onOpenChange={setOtpDialogOpen}>
        <AlertDialogContent className="max-w-sm">
          <AlertDialogHeader>
            <AlertDialogTitle>Código de verificação</AlertDialogTitle>
            <AlertDialogDescription>
              Digite o código enviado por SMS para o número{" "}
              <span className="font-medium text-foreground">
                {phoneInput || maskPhone(unmaskPhone(phoneInput))}
              </span>
              . Depois disso, aguardamos a ativação do WhatsApp (pode levar alguns minutos).
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-2 py-2">
            <Label htmlFor="waba-otp">Código SMS</Label>
            <Input
              id="waba-otp"
              inputMode="numeric"
              autoComplete="one-time-code"
              placeholder="000000"
              value={otpInput}
              onChange={(e) => setOtpInput(e.target.value.replace(/\D/g, "").slice(0, 8))}
            />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              disabled={busy || !otpInput.trim()}
              onClick={(e) => {
                e.preventDefault();
                void handleOtpSubmit();
              }}
            >
              {busy ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  Validando…
                </>
              ) : (
                "Confirmar código"
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
