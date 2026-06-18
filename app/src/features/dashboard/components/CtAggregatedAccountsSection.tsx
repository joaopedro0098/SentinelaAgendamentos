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
import { useDashboardShop } from "@/providers/DashboardShopProvider";

type CaRow = {
  id: string;
  email: string;
  status: "pending" | "awaiting_face" | "active" | "removed";
  invited_at: string;
  activated_at: string | null;
  aggregated_display_name: string | null;
};

const STATUS_LABEL: Record<CaRow["status"], string> = {
  pending: "Aguardando cadastro",
  awaiting_face: "Aguardando reconhecimento facial",
  active: "Ativa",
  removed: "Removida",
};

function inviteErrorMessage(code: string | undefined): string {
  switch (code) {
    case "aggregated_cannot_invite":
      return "Sua conta é uma conta agregada e não pode convidar outras.";
    case "cannot_invite_self":
      return "Você não pode agregar sua própria conta.";
    case "already_invited":
      return "Este e-mail já está na sua lista.";
    case "user_not_found":
      return "Nenhuma conta encontrada com este e-mail. O usuário precisa se cadastrar primeiro.";
    case "cannot_aggregate_admin":
      return "Não é possível agregar uma conta de administrador.";
    case "cannot_aggregate_aa":
      return "Esta conta já é uma conta especial do admin e não pode ser agregada.";
    case "user_already_aggregated":
      return "Esta conta já está vinculada a outro titular.";
    case "invalid_email":
      return "Informe um e-mail válido.";
    default:
      return "Não foi possível agregar. Tente novamente.";
  }
}

export function CtAggregatedAccountsSection() {
  const { refresh } = useDashboardShop();
  const [email, setEmail] = useState("");
  const [accounts, setAccounts] = useState<CaRow[]>([]);
  const [loadingList, setLoadingList] = useState(false);
  const [inviting, setInviting] = useState(false);
  const [removeTarget, setRemoveTarget] = useState<CaRow | null>(null);
  const [removing, setRemoving] = useState(false);

  const loadAccounts = useCallback(async () => {
    setLoadingList(true);
    const { data, error } = await supabase.rpc("list_my_aggregated_accounts");
    setLoadingList(false);

    if (error) {
      toast({ title: "Erro ao carregar contas", description: error.message, variant: "destructive" });
      return;
    }

    const payload = data as { accounts?: CaRow[]; error?: string } | null;
    if (payload?.error) {
      toast({ title: "Erro", description: inviteErrorMessage(payload.error), variant: "destructive" });
      return;
    }

    setAccounts(Array.isArray(payload?.accounts) ? payload.accounts : []);
  }, []);

  useEffect(() => {
    void loadAccounts();
  }, [loadAccounts]);

  async function handleInvite(e: React.FormEvent) {
    e.preventDefault();
    const target = email.trim().toLowerCase();
    if (!target) return;

    setInviting(true);
    const { data, error } = await supabase.rpc("invite_aggregated_account", { p_email: target });
    setInviting(false);

    if (error) {
      toast({ title: "Erro ao agregar conta", description: error.message, variant: "destructive" });
      return;
    }

    const result = data as { ok?: boolean; error?: string; status?: string } | null;
    if (!result?.ok) {
      toast({
        title: "Não foi possível agregar",
        description: inviteErrorMessage(result?.error),
        variant: "destructive",
      });
      return;
    }

    setEmail("");
    toast({
      title: "Conta agregada com sucesso",
      description:
        result.status === "awaiting_face"
          ? "Conta vinculada. Aguardando verificação facial do usuário."
          : "Conta vinculada. Agendamentos e assinatura agora são compartilhados.",
    });
    void loadAccounts();
    // Atualiza lista de barbearias das CAs no provider
    void refresh({ force: true });
  }

  async function confirmRemove() {
    if (!removeTarget) return;
    setRemoving(true);
    const { data, error } = await supabase.rpc("remove_aggregated_account", {
      p_account_id: removeTarget.id,
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
      title: "Conta desagregada",
      description: `${removeTarget.email} recuperou o link individual. O teste gratuito foi bloqueado permanentemente para essa conta.`,
    });
    setRemoveTarget(null);
    void loadAccounts();
    void refresh({ force: true });
  }

  return (
    <>
      <Card className="glass-panel border-border/80">
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Contas Agregadas</CardTitle>
          <CardDescription>
            Vincule contas ao seu plano. As CAs usam sua assinatura e seus clientes agendam pelo sistema normalmente.
            Ao desvincular, a conta perde o direito ao teste gratuito.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <form onSubmit={handleInvite} className="flex flex-col gap-2 sm:flex-row sm:items-end">
            <div className="flex-1 space-y-1.5">
              <Label htmlFor="ct-agg-email">E-mail da conta a agregar</Label>
              <Input
                id="ct-agg-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="parceiro@exemplo.com"
                required
                disabled={inviting}
              />
              <p className="text-xs text-muted-foreground">A conta precisa já estar cadastrada no sistema.</p>
            </div>
            <Button type="submit" className="shrink-0 rounded-full" disabled={inviting}>
              {inviting ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserPlus className="h-4 w-4" />}
              <span className="ml-2">Agregar</span>
            </Button>
          </form>

          {loadingList ? (
            <p className="text-sm text-muted-foreground flex items-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin" /> Carregando…
            </p>
          ) : accounts.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhuma conta agregada ainda.</p>
          ) : (
            <ul className="divide-y divide-border/60 rounded-lg border border-border/60">
              {accounts.map((row) => (
                <li key={row.id} className="flex items-center justify-between gap-3 px-3 py-3">
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">{row.email}</p>
                    {row.aggregated_display_name && (
                      <p className="text-xs text-muted-foreground truncate">{row.aggregated_display_name}</p>
                    )}
                    <p className="text-xs text-muted-foreground">{STATUS_LABEL[row.status] ?? row.status}</p>
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="shrink-0 text-destructive hover:text-destructive"
                    aria-label={`Desagregar ${row.email}`}
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
            <AlertDialogTitle>Desagregar conta?</AlertDialogTitle>
            <AlertDialogDescription>
              {removeTarget ? (
                <>
                  <strong>{removeTarget.email}</strong> deixará de usar seu plano e recuperará seu link de agendamento
                  individual.
                  <br />
                  <br />
                  <strong>Atenção:</strong> essa conta perderá o direito ao teste gratuito permanentemente.
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
              {removing ? <Loader2 className="h-4 w-4 animate-spin" /> : "Confirmar"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
