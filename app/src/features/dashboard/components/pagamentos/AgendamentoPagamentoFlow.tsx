import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowLeft, ExternalLink, Loader2, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "@/hooks/use-toast";
import { formatMoney } from "@/features/dashboard/lib/agendamentosPanel";
import {
  COMPROVANTE_ACCEPT,
  createAgendamentoComprovanteSignedUrl,
  fetchAgendamentoComprovanteMeta,
  fetchAgendamentoPanelPaymentInfo,
  uploadAgendamentoComprovante,
  type AgendamentoPanelPaymentInfo,
} from "@/features/dashboard/lib/agendamentoPanelPayment";
import { paymentModeLabel } from "@/lib/paymentsApi";

type Screen = "home" | "info" | "comprovante";

type Props = {
  agendamentoId: string;
  /** Inicia direto na tela de pagamento (ex.: aba Pacientes). */
  initialScreen?: "home" | "info";
  allowUpload?: boolean;
  /** Sem tela inicial — voltar na info fecha o fluxo. */
  skipHomeScreen?: boolean;
  onRequestClose?: () => void;
};

function chargeKindLabel(kind: string | null | undefined) {
  if (kind === "manual") return "Cobrança manual";
  if (kind === "automatic") return "Cobrança automática";
  return "—";
}

function depositDetail(info: AgendamentoPanelPaymentInfo) {
  if (info.payment_mode !== "deposit" || info.deposit_value == null) return null;
  if (info.deposit_type === "percent") return `${info.deposit_value}%`;
  return formatMoney(info.deposit_value);
}

function PaymentInfoRows({ info }: { info: AgendamentoPanelPaymentInfo }) {
  const lines: { label: string; value: string }[] = [];

  if (info.has_panel_snapshot) {
    lines.push({ label: "Tipo", value: chargeKindLabel(info.charge_kind) });
    if (info.charge_kind === "automatic" && info.payment_mode) {
      lines.push({ label: "Modo", value: paymentModeLabel(info.payment_mode) });
      const dep = depositDetail(info);
      if (dep) lines.push({ label: "Valor parcial", value: dep });
      const meios: string[] = [];
      if (info.payment_enable_card) meios.push("Cartão");
      if (info.payment_enable_pix) meios.push("Pix");
      if (meios.length) lines.push({ label: "Meios", value: meios.join(" · ") });
      if (info.payment_enable_card && info.payment_max_installments && info.payment_max_installments > 1) {
        lines.push({ label: "Parcelas", value: `até ${info.payment_max_installments}x` });
      }
    }
    if (info.total_centavos != null) {
      lines.push({ label: "Total serviços", value: formatMoney(info.total_centavos) });
    }
    if (info.charge_centavos != null) {
      lines.push({ label: "Valor cobrado", value: formatMoney(info.charge_centavos) });
    }
    if (info.remaining_centavos != null && info.remaining_centavos > 0) {
      lines.push({ label: "Restante", value: formatMoney(info.remaining_centavos) });
    }
  }

  if (info.status === "aguardando_pagamento" || info.payment_status) {
    lines.push({
      label: "Status pagamento",
      value:
        info.status === "aguardando_pagamento"
          ? "Aguardando pagamento"
          : (info.payment_status ?? info.status ?? "—"),
    });
  }

  if (!info.has_panel_snapshot && info.valor_pago_centavos != null && info.valor_pago_centavos > 0) {
    lines.push({ label: "Valor online", value: formatMoney(info.valor_pago_centavos) });
    if (info.valor_restante_centavos != null && info.valor_restante_centavos > 0) {
      lines.push({ label: "Restante", value: formatMoney(info.valor_restante_centavos) });
    }
  }

  if (lines.length === 0) {
    return (
      <p className="text-sm text-muted-foreground py-2">Nenhuma cobrança registrada neste agendamento.</p>
    );
  }

  return (
    <dl className="space-y-2 text-sm">
      {lines.map((row) => (
        <div key={row.label} className="flex justify-between gap-3">
          <dt className="text-muted-foreground shrink-0">{row.label}</dt>
          <dd className="text-right font-medium text-foreground">{row.value}</dd>
        </div>
      ))}
    </dl>
  );
}

export function AgendamentoPagamentoFlow({
  agendamentoId,
  initialScreen = "home",
  allowUpload = false,
  skipHomeScreen = false,
  onRequestClose,
}: Props) {
  const [screen, setScreen] = useState<Screen>(initialScreen === "info" ? "info" : "home");
  const [paymentInfo, setPaymentInfo] = useState<AgendamentoPanelPaymentInfo | null>(null);
  const [infoLoading, setInfoLoading] = useState(false);
  const [hasComprovanteFlag, setHasComprovanteFlag] = useState(false);

  const [comprovanteLoading, setComprovanteLoading] = useState(false);
  const [comprovanteUrl, setComprovanteUrl] = useState<string | null>(null);
  const [comprovanteMime, setComprovanteMime] = useState<string | null>(null);
  const [comprovanteName, setComprovanteName] = useState<string | null>(null);

  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const resetComprovantePreview = useCallback(() => {
    setComprovanteUrl(null);
    setComprovanteMime(null);
    setComprovanteName(null);
  }, []);

  useEffect(() => {
    setScreen(initialScreen === "info" ? "info" : "home");
    setPaymentInfo(null);
    setHasComprovanteFlag(false);
    resetComprovantePreview();
  }, [agendamentoId, initialScreen, resetComprovantePreview]);

  useEffect(() => {
    if (screen !== "info" || paymentInfo?.ok) return;
    let cancelled = false;
    setInfoLoading(true);
    void fetchAgendamentoPanelPaymentInfo(agendamentoId).then((info) => {
      if (cancelled) return;
      setInfoLoading(false);
      if (info.error) {
        toast({ title: "Não foi possível carregar pagamento", description: info.error, variant: "destructive" });
        setScreen("home");
        return;
      }
      setPaymentInfo(info);
      setHasComprovanteFlag(info.has_comprovante === true);
    });
    return () => {
      cancelled = true;
    };
  }, [screen, agendamentoId, paymentInfo?.ok]);

  const openPaymentInfo = () => {
    resetComprovantePreview();
    setPaymentInfo(null);
    setScreen("info");
  };

  const openComprovante = async () => {
    setComprovanteLoading(true);
    resetComprovantePreview();
    const meta = await fetchAgendamentoComprovanteMeta(agendamentoId);
    if (!meta.found || !meta.storage_path) {
      setComprovanteLoading(false);
      toast({ title: "Nenhum comprovante anexado", variant: "destructive" });
      return;
    }
    const signed = await createAgendamentoComprovanteSignedUrl(meta.storage_path);
    setComprovanteLoading(false);
    if ("error" in signed) {
      toast({ title: "Não foi possível abrir o comprovante", description: signed.error, variant: "destructive" });
      return;
    }
    setComprovanteUrl(signed.url);
    setComprovanteMime(meta.mime_type ?? null);
    setComprovanteName(meta.file_name ?? "comprovante");
    setScreen("comprovante");
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setUploading(true);
    const result = await uploadAgendamentoComprovante(agendamentoId, file);
    setUploading(false);
    if ("error" in result) {
      toast({ title: "Upload não concluído", description: result.error, variant: "destructive" });
      return;
    }
    setHasComprovanteFlag(true);
    if (paymentInfo) {
      setPaymentInfo({ ...paymentInfo, has_comprovante: true });
    }
    toast({ title: "Comprovante enviado" });
  };

  if (screen === "comprovante") {
    return (
      <div className="space-y-4">
        <button
          type="button"
          onClick={() => setScreen("info")}
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          Voltar
        </button>
        <h3 className="text-sm font-semibold">Comprovante</h3>
        {comprovanteLoading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : comprovanteUrl ? (
          <div className="space-y-3">
            {comprovanteName ? (
              <p className="text-xs text-muted-foreground truncate">{comprovanteName}</p>
            ) : null}
            {comprovanteMime?.startsWith("image/") ? (
              <img
                src={comprovanteUrl}
                alt="Comprovante de pagamento"
                className="max-h-64 w-full rounded-lg border border-border object-contain bg-secondary/20"
              />
            ) : (
              <a
                href={comprovanteUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 text-sm text-primary font-medium"
              >
                Abrir arquivo
                <ExternalLink className="h-4 w-4" />
              </a>
            )}
          </div>
        ) : null}
      </div>
    );
  }

  if (screen === "info") {
    return (
      <div className="space-y-4">
        <button
          type="button"
          onClick={() => {
            resetComprovantePreview();
            if (skipHomeScreen) {
              onRequestClose?.();
              return;
            }
            setScreen("home");
          }}
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          Voltar
        </button>
        {!skipHomeScreen ? <h3 className="text-sm font-semibold">Pagamento</h3> : null}
        {infoLoading ? (
          <div className="flex justify-center py-6">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : paymentInfo ? (
          <>
            <PaymentInfoRows info={paymentInfo} />
            {(paymentInfo.has_comprovante || hasComprovanteFlag) && (
              <Button
                type="button"
                variant="ghost"
                className="h-8 px-2 text-sm font-normal text-muted-foreground hover:text-foreground"
                disabled={comprovanteLoading}
                onClick={() => void openComprovante()}
              >
                {comprovanteLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Comprovante"}
              </Button>
            )}
          </>
        ) : null}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {allowUpload && (
        <div className="space-y-2">
          <p className="text-sm font-medium text-foreground">
            Faça o upload do comprovante de pagamento (opcional)
          </p>
          <input
            ref={fileInputRef}
            type="file"
            accept={COMPROVANTE_ACCEPT}
            className="hidden"
            onChange={(e) => void handleFileChange(e)}
          />
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="w-full justify-start gap-2 font-normal"
            disabled={uploading}
            onClick={() => fileInputRef.current?.click()}
          >
            {uploading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Upload className="h-4 w-4 text-muted-foreground" />
            )}
            {uploading ? "Enviando…" : "Escolher arquivo (PDF, SVG, JPG, PNG)"}
          </Button>
        </div>
      )}

      <Button
        type="button"
        variant="ghost"
        className="h-8 px-0 text-sm font-normal text-muted-foreground hover:text-foreground hover:bg-transparent"
        onClick={openPaymentInfo}
      >
        Pagamento
      </Button>
    </div>
  );
}
