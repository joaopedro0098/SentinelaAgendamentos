import { useCallback, useEffect, useState } from "react";
import { List, Loader2, ShieldCheck, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
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

type Props = {
  /** Usuário atualmente selecionado na busca acima, para poder torná-lo AA. */
  selectedUserEmail?: string | null;
  selectedUserShopName?: string | null;
};

export function AdminAggregatedAccountsSection({ selectedUserEmail, selectedUserShopName }: Props) {
  const [accounts, setAccounts] = useState<AaRow[]>([]);
  const [loadingList, setLoadingList] = useState(false);
  const [settingAa, setSettingAa] = useState(false);
  const [removeTarget, setRemoveTarget] = useState<AaRow | null>(null);
  const [removing, setRemoving] = useState(false);

  const selectedEmail = selectedUserEmail?.trim().toLowerCase() ?? "";
  const alreadyAa = selectedEmail ? accounts.some((a) => a.email === selectedEmail) : false;

  const loadAccounts = useCallback(async () => {
    setLoadingList(true);
    const { data, error } = await supabase.rpc("admin_list_admin_aggregated_accounts");
    setLoadingList(false);

    if (error) {
      const isMissing = error.message.includes("admin_list_admin_aggregated_accounts");
      toast({
        title: "Erro ao listar AAs",
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
  }, []);

  useEffect(() => {
    void loadAccounts();
  }, [loadAccounts]);

  async function handleSetAa() {
    if (!selectedEmail) return;
    setSettingAa(true);
    const { data, error } = await supabase.rpc("admin_set_admin_aggregated", { p_email: selectedEmail });
    setSettingAa(false);

    if (error) {
      toast({ title: "Erro ao tornar AA", description: error.message, variant: "destructive" });
      return;
    }

    const result = data as { ok?: boolean; error?: string } | null;
    if (!result?.ok) {
      const msg: Record<string, string> = {
        forbidden: "Acesso negado.",
        user_not_found: "Usuário não encontrado. Busque o usuário acima.",
        cannot_set_admin_as_aa: "Não é possível tornar um admin em AA.",
        target_is_ca: "Este usuário já é uma conta agregada (CA) de outro titular.",
        shop_not_found: "Nenhuma barbearia encontrada para este usuário.",
        invalid_email: "E-mail inválido.",
      };
      toast({
        title: "Não foi possível definir como AA",
        description: msg[result?.error ?? ""] ?? "Tente novamente.",
        variant: "destructive",
      });
      return;
    }

    toast({
      title: "Conta definida como AA",
      description: `${selectedEmail} agora é uma conta especial (Agregado do Admin). Está isenta de assinatura e pode agregar CAs.`,
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
      toast({ title: "Erro ao remover AA", description: error.message, variant: "destructive" });
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
            Contas Agregadas pelo Admin ficam isentas de assinatura e podem agregar outras contas como um titular
            normal. Ao remover, perdem a isenção e o teste gratuito permanentemente.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {selectedEmail && (
            <div className="flex items-center justify-between gap-3 rounded-lg border border-border/60 bg-secondary/30 px-3 py-3">
              <div className="min-w-0">
                <p className="text-sm font-medium truncate">{selectedEmail}</p>
                {selectedUserShopName && (
                  <p className="text-xs text-muted-foreground truncate">{selectedUserShopName}</p>
                )}
              </div>
              <Button
                type="button"
                size="sm"
                className="shrink-0 rounded-full"
                disabled={settingAa || alreadyAa}
                onClick={() => void handleSetAa()}
              >
                {settingAa ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <ShieldCheck className="h-4 w-4" />
                )}
                <span className="ml-2">{alreadyAa ? "Já é AA" : "Tornar AA"}</span>
              </Button>
            </div>
          )}

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
              <span className="ml-2">Atualizar</span>
            </Button>
          </div>

          {loadingList && accounts.length === 0 ? (
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
                  permanentemente. As contas que ela agregou continuarão vinculadas ao seu titular.
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
