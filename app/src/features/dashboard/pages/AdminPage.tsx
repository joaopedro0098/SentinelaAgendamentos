import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Loader2, Search, Shield, Trash2 } from "lucide-react";
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

const SUPABASE_FUNCTIONS_URL = String(import.meta.env.VITE_SUPABASE_URL ?? "").trim().replace(/\/+$/, "");
const SUPABASE_PUBLISHABLE_KEY = String(
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? import.meta.env.VITE_SUPABASE_ANON_KEY ?? "",
).trim();

type AdminUserInfo = {
  user_id: string;
  email: string;
  shop_name: string;
  is_subscriber: boolean;
  is_on_trial: boolean;
  subscription_status: string;
  subscription_label?: string;
  mp_subscription_id?: string | null;
  current_period_end?: string | null;
  email_confirmed?: boolean;
};

function yesNo(value: boolean) {
  return value ? "Sim" : "Não";
}

function formatDateBr(iso: string | null | undefined) {
  if (!iso) return "—";
  const [y, m, d] = iso.split("-");
  if (!y || !m || !d) return iso;
  return `${d}/${m}/${y}`;
}

async function invokeFunction<T>(functionName: string, body: Record<string, unknown>): Promise<T> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error("Faça login novamente.");
  if (!SUPABASE_FUNCTIONS_URL || !SUPABASE_PUBLISHABLE_KEY) {
    throw new Error("Supabase não configurado no app.");
  }

  const response = await fetch(`${SUPABASE_FUNCTIONS_URL}/functions/v1/${functionName}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      apikey: SUPABASE_PUBLISHABLE_KEY,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  const payload = (await response.json().catch(() => ({}))) as T & { error?: string };
  if (!response.ok) {
    throw new Error(payload.error ?? "Erro na requisição.");
  }
  return payload;
}

function parseLookupPayload(data: unknown): AdminUserInfo | null {
  if (!data || typeof data !== "object" || "error" in data) return null;
  return data as AdminUserInfo;
}

export default function AdminPage() {
  const [email, setEmail] = useState("");
  const [searching, setSearching] = useState(false);
  const [userInfo, setUserInfo] = useState<AdminUserInfo | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    document.title = "Admin — Sentinela Agendamentos";
  }, []);

  async function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = email.trim();
    if (!trimmed) return;

    setSearching(true);
    setUserInfo(null);

    try {
      const { data, error } = await supabase.rpc("admin_lookup_user_by_email", { p_email: trimmed });
      if (error) throw new Error(error.message);

      const lookup = parseLookupPayload(data);
      if (!lookup) {
        const code = data && typeof data === "object" && "error" in data ? String(data.error) : "unknown";
        if (code === "not_found") {
          toast({ title: "Usuário não encontrado", description: "Nenhuma conta com este e-mail." });
          return;
        }
        toast({ title: "Busca inválida", description: "Verifique o e-mail informado.", variant: "destructive" });
        return;
      }

      try {
        const syncResult = await invokeFunction<{ subscription?: unknown }>("mp-sync-subscription", {
          email: trimmed,
        });
        const synced = parseLookupPayload(syncResult.subscription);
        setUserInfo(synced ?? lookup);
      } catch {
        setUserInfo(lookup);
      }
    } catch (err) {
      toast({
        title: "Erro na busca",
        description: err instanceof Error ? err.message : "Tente novamente.",
        variant: "destructive",
      });
    } finally {
      setSearching(false);
    }
  }

  async function handleDelete() {
    if (!userInfo) return;
    setDeleting(true);
    try {
      await invokeFunction("admin-purge-user", { email: userInfo.email });
      toast({
        title: "Usuário excluído",
        description: "Todos os dados deste usuário foram removidos do sistema.",
      });
      setUserInfo(null);
      setEmail("");
      setConfirmOpen(false);
    } catch (e) {
      toast({
        title: "Falha ao excluir",
        description: e instanceof Error ? e.message : "Tente novamente.",
        variant: "destructive",
      });
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className="p-4 md:p-8 max-w-2xl mx-auto w-full space-y-6">
      <div>
        <Link to="/app/perfil" className="text-sm text-muted-foreground hover:text-foreground">
          ← Voltar à conta
        </Link>
        <h1 className="mt-2 font-display text-2xl font-semibold tracking-tight flex items-center gap-2">
          <Shield className="h-6 w-6 text-primary" />
          Admin
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Consulte usuários cadastrados e remova contas por completo quando necessário.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Buscar usuário</CardTitle>
          <CardDescription>
            Informe o e-mail cadastrado. A busca sincroniza o status de pagamento com o Mercado Pago.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSearch} className="flex flex-col sm:flex-row gap-3">
            <div className="flex-1 space-y-1.5">
              <Label htmlFor="admin-email" className="sr-only">
                E-mail
              </Label>
              <Input
                id="admin-email"
                type="email"
                placeholder="email@exemplo.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="h-11 rounded-xl"
              />
            </div>
            <Button type="submit" disabled={searching} className="h-11 rounded-full shrink-0">
              {searching ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
              Buscar
            </Button>
          </form>
        </CardContent>
      </Card>

      {userInfo && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Dados do usuário</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <dl className="grid gap-3 text-sm">
              <div className="flex justify-between gap-4 border-b border-border/60 pb-2">
                <dt className="text-muted-foreground">E-mail</dt>
                <dd className="font-medium text-right break-all">{userInfo.email}</dd>
              </div>
              <div className="flex justify-between gap-4 border-b border-border/60 pb-2">
                <dt className="text-muted-foreground">Nome da empresa</dt>
                <dd className="font-medium text-right">{userInfo.shop_name}</dd>
              </div>
              <div className="flex justify-between gap-4 border-b border-border/60 pb-2">
                <dt className="text-muted-foreground">E-mail confirmado</dt>
                <dd className="font-medium">{yesNo(userInfo.email_confirmed ?? false)}</dd>
              </div>
              <div className="flex justify-between gap-4 border-b border-border/60 pb-2">
                <dt className="text-muted-foreground">Status no banco</dt>
                <dd className="font-medium text-right">{userInfo.subscription_label ?? userInfo.subscription_status}</dd>
              </div>
              <div className="flex justify-between gap-4 border-b border-border/60 pb-2">
                <dt className="text-muted-foreground">Assinante</dt>
                <dd className="font-medium">{yesNo(userInfo.is_subscriber)}</dd>
              </div>
              <div className="flex justify-between gap-4 border-b border-border/60 pb-2">
                <dt className="text-muted-foreground">Teste grátis</dt>
                <dd className="font-medium">{yesNo(userInfo.is_on_trial)}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-muted-foreground">Vencimento do plano</dt>
                <dd className="font-medium">{formatDateBr(userInfo.current_period_end)}</dd>
              </div>
            </dl>

            <Button
              type="button"
              variant="destructive"
              className="w-full rounded-full"
              onClick={() => setConfirmOpen(true)}
            >
              <Trash2 className="h-4 w-4" />
              Deletar
            </Button>
          </CardContent>
        </Card>
      )}

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir usuário permanentemente?</AlertDialogTitle>
            <AlertDialogDescription>
              Todos os dados de <strong>{userInfo?.email}</strong> serão apagados: conta, barbearia, reconhecimento
              facial, trial e histórico. Esta ação não pode ser desfeita. O usuário poderá criar uma nova conta com teste
              grátis depois.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              disabled={deleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={(e) => {
                e.preventDefault();
                void handleDelete();
              }}
            >
              {deleting ? "Excluindo…" : "Confirmar exclusão"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
