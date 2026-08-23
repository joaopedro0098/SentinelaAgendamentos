import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
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
  invokeInfobipWabaConnectStart,
  invokeWabaDisconnect,
  pollWabaConnectStatusFromDb,
  type WabaConnectStatus,
} from "@/features/dashboard/lib/wabaConnectApi";
import {
  getMetaEmbeddedSignupConfig,
  runEmbeddedSignup,
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
  const [disconnectDialogOpen, setDisconnectDialogOpen] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
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
    setFlowError(null);
    setStatus("connected");
    toast({ title: "WhatsApp conectado", description: "Seu número Business está ativo." });
    await refreshStatus();
  }, [refreshStatus, toast]);

  const waitForConnectedFromDb = useCallback(async (isCancelled?: () => boolean) => {
    setBusy(true);
    const poll = await pollWabaConnectStatusFromDb({ isCancelled });
    if (poll.ok) {
      await completeConnected();
      return;
    }
    resetToConnect(poll.error);
  }, [completeConnected, resetToConnect]);

  const runConnectFlow = useCallback(async () => {
    if (!metaConfigured) {
      toast({
        title: "Integração indisponível",
        description: "Configuração Meta ausente no ambiente.",
        variant: "destructive",
      });
      return;
    }

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

      const start = await invokeInfobipWabaConnectStart({
        waba_id: signup.waba_id,
        phone_number_id: signup.phone_number_id,
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

      setStatus("provisioning");
      await waitForConnectedFromDb();
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
  }, [completeConnected, metaConfigured, resetToConnect, toast, waitForConnectedFromDb]);

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      setLoadingStatus(true);
      const next = await fetchWabaConnectStatus();
      if (!cancelled && next) {
        setStatus(next);

        if (
          !initialResumeDone.current &&
          (next === "pending" || next === "provisioning")
        ) {
          initialResumeDone.current = true;
          await waitForConnectedFromDb(() => cancelled);
        }
      }

      if (!cancelled) setLoadingStatus(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [waitForConnectedFromDb]);

  const isClickable = useMemo(() => {
    if (busy || loadingStatus || connectingPhase || disconnecting) return false;
    if (status === "connected") return false;
    return CONNECTABLE_STATUSES.has(status) || IN_PROGRESS_STATUSES.has(status);
  }, [busy, connectingPhase, disconnecting, loadingStatus, status]);

  const showSpinner = busy || loadingStatus || Boolean(connectingPhase);
  const badgeText = statusBadgeLabel(status, busy, connectingPhase);

  function handleCardClick() {
    if (!isClickable) return;
    if (IN_PROGRESS_STATUSES.has(status)) {
      void waitForConnectedFromDb();
      return;
    }
    setFlowError(null);
    void runConnectFlow();
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
    </div>
  );
}
