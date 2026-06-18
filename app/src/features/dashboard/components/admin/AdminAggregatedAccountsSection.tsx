import { useCallback, useEffect, useState } from "react";
import { List, Loader2, Trash2, UserPlus } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
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
import { toast } from "@/hooks/use-toast";

/** AA = Agregado do Admin. Conta isenta de assinatura que pode agregar CAs. */
type AaRow = {
  user_id: string;
  email: string;
  shop_name: string;
  subscription_status: string;
  profile_name: string | null;
  set_at: string;
};

function setAaErrorMessage(code: string | undefined): string {
  switch (code) {
    case "forbidden":
      return "Acesso negado.";
    case "user_not_found":
      return "Nenhuma conta encontrada com este e-mail. O usuário precisa estar cadastrado.";
    case "cannot_set_admin_as_aa":
      return "Não é possível tornar uma conta de administrador em AA.";
    case "target_is_ca":
      return "Esta conta já é agregada (CA) de outro titular.";
    case "shop_not_found":
      return "Nenhuma barbearia encontrada para este usuário.";
    case "invalid_email":
      return "Informe um e-mail válido.";
    default:
      return "Não foi possível agregar. Tente novamente.";
  }
}

export function AdminAggregatedAccountsSection() {
  const [email, setEmail] = useState("");
  const [accounts, setAccounts] = useState<AaRow[]>([]);
  const [loadingList, setLoadingList] = useState(false);
  const [listLoaded, setListLoaded] = useState(false);
  const [settingAa, setSettingAa] = useState(false);
  const [removeTarget, setRemoveTarget] = useState<AaRow | null>(null);
  const [removing, setRemoving] = useState(false);

  const loadAccounts = useCallback(async () => {
    setLoadingList(true);
    const { data, error } = await supabase.rpc("admin_list_admin_aggregated_accounts");
    setLoadingList(false);

    if (error) {
      const isMissing = error.message.includes("admin_list_admin_aggregated_accounts");
      toast({
        title: "Erro ao listar contas AA",
        description: isMissing
          ? "Função não encontrada. Execute supabase db push para aplicar a migration."
          : error.message,
        variant: "destructive",
      });
      return;
    }

    const payload = data as { accounts?: AaRow[]; error?: string } | null;
    if (payload?.error) {
      toast({ title: "Erro", description: payload.error, variant: "destructive" });
      return;
    }

    setAccounts(Array.isArray(payload?.accounts) ? payload.accounts : []);
    setListLoaded(true);
  }, []);

  useEffect(() => {
    void loadAccounts();
  }, [loadAccounts]);

  async function handleSetAa(e: React.FormEvent) {
    e.preventDefault();
    const target = email.trim().toLowerCase();
    if (!target) return;

    setSettingAa(true);
    const { data, error } = await supabase.rpc("admin_set_admin_aggregated", { p_email: target });
    setSettingAa(false);

    if (error) {
      toast({ title: "Erro ao agregar", description: error.message, variant: "destructive" });
      return;
    }

    const result = data as { ok?: boolean; error?: string } | null;
    if (!result?.ok) {
      toast({
        title: "Não foi possível agregar",
        description: setAaErrorMessage(result?.error),
        variant: "destructive",
      });
      return;
    }

    setEmail("");
    toast({
      title: "Conta agregada como AA",
      description: `${target} está isenta de assinatura e pode agregar outras contas em Configurações.`,
    });
    void loadAccounts();
  }

  async function confirmRemove() {
    if (!removeTarget) return;
    setRemoving(true);
    const { data, error } = await supabase.rpc("admin_remove_admin_aggregated", {
      p_user_id: removeTarget.user_id,
    });
    setRemoving(false);

    if (error) {
      toast({ title: "Erro ao remover", description: error.message, variant: "destructive" });
      return;
    }

    const result = data as { ok?: boolean; error?: string } | null;
    if (!result?.ok) {
      toast({ title: "Não foi possível remover", variant: "destructive" });
      return;
    }

    toast({
      title: "AA removido",
      description: `${removeTarget.email} perdeu a isenção de assinatura e o teste gratuito.`,
    });
    setRemoveTarget(null);
    void loadAccounts();
  }

  return (
    <>
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg">Contas Especiais (AA)</CardTitle>
          <CardDescription>
            Agregue contas pelo e-mail para torná-las AA: isentas de assinatura e com permissão de agregar CAs em
            Configurações. Ao remover, perdem a isenção e o teste gratuito permanentemente.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <form onSubmit={handleSetAa} className="flex flex-col gap-2 sm:flex-row sm:items-end">
            <div className="flex-1 space-y-1.5">
              <Label htmlFor="admin-aa-email">E-mail da conta a agregar</Label>
              <Input
                id="admin-aa-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="conta@exemplo.com"
                required
                disabled={settingAa}
              />
              <p className="text-xs text-muted-foreground">A conta precisa já estar cadastrada no sistema.</p>
            </div>
            <Button type="submit" className="shrink-0 rounded-full" disabled={settingAa}>
              {settingAa ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserPlus className="h-4 w-4" />}
              <span className="ml-2">Agregar</span>
            </Button>
          </form>

          <div className="flex items-center justify-between gap-3 pt-1">
            <p className="text-sm font-medium">Contas AA ativas</p>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              className="rounded-full shrink-0"
              disabled={loadingList}
              onClick={() => void loadAccounts()}
            >
              {loadingList ? <Loader2 className="h-4 w-4 animate-spin" /> : <List className="h-4 w-4" />}
              <span className="ml-2">Listar</span>
            </Button>
          </div>

          {loadingList && !listLoaded ? (
            <p className="text-sm text-muted-foreground flex items-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin" /> Carregando…
            </p>
          ) : accounts.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhuma conta AA no momento.</p>
          ) : (
            <ul className="divide-y divide-border/60 rounded-lg border border-border/60">
              {accounts.map((row) => (
                <li key={row.user_id} className="flex items-center justify-between gap-3 px-3 py-3">
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">{row.email}</p>
                    {row.shop_name && row.shop_name !== "—" && (
                      <p className="text-xs text-muted-foreground truncate">{row.shop_name}</p>
                    )}
                    {row.profile_name && (
                      <p className="text-xs text-muted-foreground truncate">{row.profile_name}</p>
                    )}
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="shrink-0 text-destructive hover:text-destructive"
                    aria-label={`Remover AA ${row.email}`}
                    onClick={() => setRemoveTarget(row)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <AlertDialog open={Boolean(removeTarget)} onOpenChange={(open) => !open && setRemoveTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remover conta AA?</AlertDialogTitle>
            <AlertDialogDescription>
              {removeTarget ? (
                <>
                  <strong>{removeTarget.email}</strong> perderá a isenção de assinatura e o direito ao teste gratuito
                  permanentemente. As contas que ela agregou continuarão vinculadas ao titular.
                </>
              ) : null}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={removing}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={removing}
              onClick={(e) => {
                e.preventDefault();
                void confirmRemove();
              }}
            >
              {removing ? <Loader2 className="h-4 w-4 animate-spin" /> : "Remover AA"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
