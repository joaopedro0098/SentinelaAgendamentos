import { Loader2, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type Props = {
  tierName: string;
  periodEndLabel: string | null;
  processing: boolean;
  error: string | null;
  onConfirm: () => void;
  onCancel: () => void;
};

export function StripeReactivationConfirm({
  tierName,
  periodEndLabel,
  processing,
  error,
  onConfirm,
  onCancel,
}: Props) {
  const validityText = periodEndLabel
    ? `ainda ativa até ${periodEndLabel}`
    : "ainda ativa até o fim do período já pago";

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <RotateCcw className="h-4 w-4" /> Reativar assinatura
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="rounded-xl border border-border bg-muted/30 px-4 py-3 text-sm space-y-2">
          <p>
            Você tem uma assinatura do plano <strong>{tierName}</strong> {validityText}.
          </p>
          <p className="text-muted-foreground">
            Deseja reativar a renovação automática no cartão? Não haverá cobrança agora — a próxima
            cobrança será na data de renovação.
          </p>
        </div>

        {error && <p className="text-sm text-destructive">{error}</p>}

        <Button
          type="button"
          className="w-full rounded-full bg-gradient-brand text-white border-0"
          disabled={processing}
          onClick={onConfirm}
        >
          {processing ? <Loader2 className="h-4 w-4 animate-spin" /> : "Reativar assinatura"}
        </Button>

        <Button
          type="button"
          variant="ghost"
          className="w-full rounded-full"
          disabled={processing}
          onClick={onCancel}
        >
          Voltar
        </Button>
      </CardContent>
    </Card>
  );
}
