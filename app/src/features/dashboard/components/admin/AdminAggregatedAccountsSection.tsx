import { useCallback, useEffect, useState } from "react";
import { Loader2, Trash2, UserPlus } from "lucide-react";
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

type AggregatedAccountRow = {
  id: string;
  email: string;
  status: "pending" | "awaiting_face" | "active" | "removed";
  invited_at: string;
  activated_at: string | null;
  aggregated_display_name: string | null;
};

const STATUS_LABEL: Record<AggregatedAccountRow["status"], string> = {
  pending: "Aguardando cadastro",
  awaiting_face: "Aguardando reconhecimento facial",
  active: "Ativa",
  removed: "Removida",
};

function inviteErrorMessage(code: string | undefined): string {
  switch (code) {
    case "forbidden":
      return "Acesso negado.";
    case "owner_not_found":
      return "E-mail do titular não encontrado.";
    case "owner_is_aggregated":
      return "O titular informado já é uma conta agregada.";
    case "cannot_invite_self":
      return "Use e-mails diferentes para titular e agregada.";
    case "already_invited":
      return "Este e-mail já está na lista deste titular.";
    case "user_already_aggregated":
      return "Esta pessoa já está vinculada a outra conta titular.";
    case "user_has_own_subscription":
      return "Esta conta já possui assinatura própria.";
    case "invalid_email":
    case "invalid_owner_email":
      return "Informe e-mails válidos.";
    default:
      return "Não foi possível adicionar. Tente novamente.";
  }
}

type Props = {
  /** Preenche o titular após buscar um usuário — não dispara carregamento automático. */
  defaultOwnerEmail?: string;
};

export function AdminAggregatedAccountsSection({ defaultOwnerEmail }: Props) {
  const [ownerEmail, setOwnerEmail] = useState("");
  const [aggregatedEmail, setAggregatedEmail] = useState("");
  const [accounts, setAccounts] = useState<AggregatedAccountRow[]>([]);
  const [loadingList, setLoadingList] = useState(false);
  const [inviting, setInviting] = useState(false);
  const [removeTarget, setRemoveTarget] = useState<AggregatedAccountRow | null>(null);
  const [removing, setRemoving] = useState(false);
  const [listLoaded, setListLoaded] = useState(false);

  useEffect(() => {
    if (defaultOwnerEmail?.trim()) {
      setOwnerEmail(defaultOwnerEmail.trim().toLowerCase());
      setListLoaded(false);
      setAccounts([]);
    }
  }, [defaultOwnerEmail]);

  const loadAccounts = useCallback(async (owner: string) => {
    const trimmed = owner.trim().toLowerCase();
    if (!trimmed) {
      setAccounts([]);
      setListLoaded(false);
      return;
    }

    setLoadingList(true);
    const { data, error } = await supabase.rpc("admin_list_aggregated_accounts", {
      p_owner_email: trimmed,
    });
    setLoadingList(false);

    if (error) {
      const missingFn = error.message.includes("admin_list_aggregated_accounts");
      toast({
        title: "Erro ao carregar contas agregadas",
        description: missingFn
          ? "Função ainda não disponível no servidor. Rode supabase db push para aplicar a migration."
          : error.message,
        variant: "destructive",
      });
      return;
    }

    const payload = data as { accounts?: AggregatedAccountRow[]; error?: string } | null;
    if (payload?.error === "owner_not_found") {
      setAccounts([]);
      setListLoaded(true);
      return;
    }
    if (payload?.error) {
      toast({
        title: "Erro ao carregar contas agregadas",
        description: inviteErrorMessage(payload.error),
        variant: "destructive",
      });
      return;
    }

    setAccounts(Array.isArray(payload?.accounts) ? payload.accounts : []);
    setListLoaded(true);
  }, []);

  async function handleInvite(e: React.FormEvent) {
    e.preventDefault();
    const owner = ownerEmail.trim().toLowerCase();
    const target = aggregatedEmail.trim().toLowerCase();
    if (!owner || !target) return;

    setInviting(true);
    const { data, error } = await supabase.rpc("admin_invite_aggregated_account", {
      p_owner_email: owner,
      p_email: target,
    });
    setInviting(false);

    if (error) {
      toast({ title: "Erro ao agregar", description: error.message, variant: "destructive" });
      return;
    }

    const result = data as { ok?: boolean; error?: string; user_exists?: boolean };
    if (!result?.ok) {
      toast({
        title: "Não foi possível agregar",
        description: inviteErrorMessage(result?.error),
        variant: "destructive",
      });
      return;
    }

    setAggregatedEmail("");
    toast({
      title: "Conta agregada",
      description: result.user_exists
        ? "Usuário existente vinculado (verificação facial se necessário)."
        : "Quando a pessoa se cadastrar com este e-mail, será vinculada automaticamente.",
    });
    void loadAccounts(owner);
  }

  function handleLoadList() {
    void loadAccounts(ownerEmail);
  }

  async function confirmRemove() {
    if (!removeTarget) return;
    setRemoving(true);
    const { data, error } = await supabase.rpc("admin_remove_aggregated_account", {
      p_account_id: removeTarget.id,
    });
    setRemoving(false);

    if (error) {
      toast({ title: "Erro ao remover", description: error.message, variant: "destructive" });
      return;
    }

    const result = data as { ok?: boolean; error?: string };
    if (!result?.ok) {
      toast({ title: "Não foi possível remover", variant: "destructive" });
      return;
    }

    toast({ title: "Conta agregada removida" });
    setRemoveTarget(null);
    void loadAccounts(ownerEmail);
  }

  return (
    <>
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg">Contas agregadas</CardTitle>
          <CardDescription>
            Vincule uma conta a um titular com assinatura. Cada conta agregada continua independente (visual, link,
            equipe), mas usa o plano do titular.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
            <div className="flex-1 space-y-1.5">
              <Label htmlFor="admin-agg-owner">E-mail do titular (quem tem o plano)</Label>
              <Input
                id="admin-agg-owner"
                type="email"
                value={ownerEmail}
                onChange={(e) => {
                  setOwnerEmail(e.target.value);
                  setListLoaded(false);
                }}
                placeholder="titular@exemplo.com"
              />
            </div>
            <Button
              type="button"
              variant="secondary"
              className="shrink-0 rounded-full"
              disabled={loadingList || !ownerEmail.trim()}
              onClick={handleLoadList}
            >
              {loadingList ? <Loader2 className="h-4 w-4 animate-spin" /> : "Carregar lista"}
            </Button>
          </div>

          <form onSubmit={handleInvite} className="flex flex-col gap-2 sm:flex-row sm:items-end">
            <div className="flex-1 space-y-1.5">
              <Label htmlFor="admin-agg-email">E-mail da conta a agregar</Label>
              <Input
                id="admin-agg-email"
                type="email"
                value={aggregatedEmail}
                onChange={(e) => setAggregatedEmail(e.target.value)}
                placeholder="agregada@exemplo.com"
                required
                disabled={!ownerEmail.trim()}
              />
            </div>
            <Button type="submit" className="shrink-0 rounded-full" disabled={inviting || !ownerEmail.trim()}>
              {inviting ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserPlus className="h-4 w-4" />}
              <span className="ml-2">Agregar</span>
            </Button>
          </form>

          {loadingList ? (
            <p className="text-sm text-muted-foreground flex items-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin" /> Carregando…
            </p>
          ) : !listLoaded ? (
            <p className="text-sm text-muted-foreground">
              Informe o titular e clique em &quot;Carregar lista&quot; para ver contas vinculadas.
            </p>
          ) : accounts.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhuma conta agregada para este titular.</p>
          ) : (
            <ul className="divide-y divide-border/60 rounded-lg border border-border/60">
              {accounts.map((row) => (
                <li key={row.id} className="flex items-center justify-between gap-3 px-3 py-3">
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">{row.email}</p>
                    {row.aggregated_display_name && (
                      <p className="text-xs text-muted-foreground truncate">{row.aggregated_display_name}</p>
                    )}
                    <p className="text-xs text-muted-foreground mt-0.5">{STATUS_LABEL[row.status] ?? row.status}</p>
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="shrink-0 text-destructive hover:text-destructive"
                    aria-label={`Remover ${row.email}`}
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
            <AlertDialogTitle>Remover conta agregada?</AlertDialogTitle>
            <AlertDialogDescription>
              {removeTarget
                ? `A conta ${removeTarget.email} deixará de usar a assinatura do titular. Os dados dela permanecem intactos.`
                : ""}
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
              {removing ? <Loader2 className="h-4 w-4 animate-spin" /> : "Remover"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
