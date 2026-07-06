import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { AlertCircle, CheckCircle2, Clock3 } from "lucide-react";
import { invokeBillingFunction } from "@/lib/billingApi";
import { openAppSupportWhatsApp } from "@/lib/supportWhatsApp";
import {
  SubscriptionPaymentStatusLoading,
  SubscriptionPaymentStatusShell,
} from "@/features/billing/components/SubscriptionPaymentStatusShell";

type UiStatus = "approved" | "pending" | "error";

type VerifyResponse = {
  ok?: boolean;
  ui_status?: UiStatus | "invalid";
  error?: string;
};

function readPreapprovalId(searchParams: URLSearchParams) {
  return (
    searchParams.get("preapproval_id")?.trim() ||
    searchParams.get("preapprovalId")?.trim() ||
    searchParams.get("id")?.trim() ||
    null
  );
}

export default function AssinaturaRetornoPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [phase, setPhase] = useState<"loading" | UiStatus>("loading");

  useEffect(() => {
    document.title = "Assinatura — Sentinela Agendamentos";
  }, []);

  useEffect(() => {
    const preapprovalId = readPreapprovalId(searchParams);
    if (!preapprovalId) {
      navigate("/app/perfil", { replace: true });
      return;
    }

    let cancelled = false;
    setPhase("loading");

    void invokeBillingFunction<VerifyResponse>("mp-verify-preapproval", { preapproval_id: preapprovalId })
      .then((data) => {
        if (cancelled) return;

        if (!data.ok || data.ui_status === "invalid" || !data.ui_status) {
          navigate("/app/perfil", { replace: true });
          return;
        }

        setPhase(data.ui_status);
      })
      .catch(() => {
        if (!cancelled) navigate("/app/perfil", { replace: true });
      });

    return () => {
      cancelled = true;
    };
  }, [searchParams, navigate]);

  if (phase === "loading") {
    return <SubscriptionPaymentStatusLoading />;
  }

  if (phase === "approved") {
    return (
      <SubscriptionPaymentStatusShell
        icon={<CheckCircle2 className="h-7 w-7 sm:h-8 sm:w-8 text-[hsl(var(--brand-green))]" aria-hidden />}
        title="Assinatura confirmada"
        description="Seu plano já está ativo. Você pode voltar para a área de conta e continuar usando o painel normalmente."
        primaryAction={{ label: "Ir para Conta", to: "/app/perfil" }}
      />
    );
  }

  if (phase === "pending") {
    return (
      <SubscriptionPaymentStatusShell
        icon={<Clock3 className="h-7 w-7 sm:h-8 sm:w-8 text-[hsl(var(--brand-green))]" aria-hidden />}
        title="Pagamento em confirmação"
        description="Estamos aguardando a confirmação do Mercado Pago. Isso pode levar alguns minutos. Você pode voltar para Conta e atualizar a página em instantes."
        primaryAction={{ label: "Ir para Conta", to: "/app/perfil" }}
      />
    );
  }

  return (
    <SubscriptionPaymentStatusShell
      icon={<AlertCircle className="h-7 w-7 sm:h-8 sm:w-8 text-muted-foreground" aria-hidden />}
      title="Pagamento não confirmado"
      description="Não foi possível confirmar sua assinatura. Isso pode ocorrer por cartão recusado, saldo insuficiente ou cancelamento no checkout."
      primaryAction={{ label: "Tentar novamente", to: "/app/perfil" }}
      secondaryAction={{ label: "Falar com suporte", onClick: openAppSupportWhatsApp }}
    />
  );
}
