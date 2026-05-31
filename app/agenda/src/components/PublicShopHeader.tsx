import { Loader2 } from "lucide-react";
import { ShopAvatar } from "@/components/ShopAvatar";

type PublicShopHeaderProps = {
  nome: string | null;
  logoUrl: string | null;
  loading?: boolean;
  subtitle?: string;
};

export function PublicShopHeader({ nome, logoUrl, loading, subtitle }: PublicShopHeaderProps) {
  if (loading) {
    return (
      <div className="flex justify-center py-6">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="text-center space-y-3">
      <ShopAvatar
        logoUrl={logoUrl}
        name={nome ?? "Barbearia"}
        className="h-16 w-16 mx-auto"
      />
      <h1 className="font-display text-2xl font-bold">{nome ?? "Agendamento"}</h1>
      {subtitle ? <p className="text-sm text-muted-foreground">{subtitle}</p> : null}
    </div>
  );
}
