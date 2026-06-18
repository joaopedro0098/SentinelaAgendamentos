import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  CreditCard,
  FlaskConical,
  Headphones,
  Loader2,
  QrCode,
  Search,
  Shield,
  Trash2,
  TrendingDown,
  TrendingUp,
  UserPlus,
  Users,
  UserX,
  CalendarDays,
} from "lucide-react";
import { maskPhone, unmaskPhone } from "@agenda/lib/phone";
import { buildSupportWhatsAppUrl } from "@/lib/supportWhatsApp";
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
import { AdminAggregatedAccountsSection } from "@/features/dashboard/components/admin/AdminAggregatedAccountsSection";

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

type PanelMetrics = {
  total_subscribers: number;
  subscribers_card: number;
  subscribers_pix: number;
  trial_users: number;
  new_signups: number;
  not_subscribed: number;
  churn_count: number;
  churn_rate: number;
  conversion_rate: number;
};

function parsePanelMetrics(data: unknown): PanelMetrics | null {
  if (!data || typeof data !== "object" || "error" in data) return null;
  const row = data as Record<string, unknown>;
  return {
    total_subscribers: Number(row.total_subscribers ?? 0),
    subscribers_card: Number(row.subscribers_card ?? 0),
    subscribers_pix: Number(row.subscribers_pix ?? 0),
    trial_users: Number(row.trial_users ?? 0),
    new_signups: Number(row.new_signups ?? 0),
    not_subscribed: Number(row.not_subscribed ?? 0),
    churn_count: Number(row.churn_count ?? 0),
    churn_rate: Number(row.churn_rate ?? 0),
    conversion_rate: Number(row.conversion_rate ?? 0),
  };
}

type NotSubscribedRow = { display_name: string; contact_phone: string | null };

function todayYmd() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function monthStartYmd() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
}

function normalizeDateRange(start: string, end: string) {
  if (!start || !end) return { start: monthStartYmd(), end: todayYmd() };
  return start <= end ? { start, end } : { start: end, end: start };
}

function yesNo(value: boolean) {
  return value ? "Sim" : "Não";
}

function formatDateBr(iso: string | null | undefined) {
  if (!iso) return "—";
  const [y, m, d] = iso.split("-");
  if (!y || !m || !d) return iso;
  return `${d}/${m}/${y}`;
}

function formatPeriodLabel(start: string, end: string) {
  if (start === end) return formatDateBr(start);
  return `${formatDateBr(start)} — ${formatDateBr(end)}`;
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
  const [panelMetrics, setPanelMetrics] = useState<PanelMetrics | null>(null);
  const [panelLoading, setPanelLoading] = useState(true);
  const [dateStart, setDateStart] = useState(monthStartYmd);
  const [dateEnd, setDateEnd] = useState(todayYmd);
  const [listOpen, setListOpen] = useState(false);
  const [notSubList, setNotSubList] = useState<NotSubscribedRow[] | null>(null);
  const [listLoading, setListLoading] = useState(false);
  const [supportPhone, setSupportPhone] = useState("");
  const [supportLoading, setSupportLoading] = useState(true);
  const [supportSaving, setSupportSaving] = useState(false);

  useEffect(() => {
    document.title = "Admin — Sentinela Agendamentos";
  }, []);

  useEffect(() => {
    void (async () => {
      setSupportLoading(true);
      try {
        const { data, error } = await supabase.rpc("admin_get_support_whatsapp");
        if (error) throw error;
        if (typeof data === "string" && data.trim()) {
          setSupportPhone(maskPhone(data));
        } else {
          setSupportPhone("");
        }
      } catch {
        setSupportPhone("");
      } finally {
        setSupportLoading(false);
      }
    })();
  }, []);

  const loadPanelMetrics = useCallback(async (start: string, end: string) => {
    const range = normalizeDateRange(start, end);
    setPanelLoading(true);
    try {
      const { data, error } = await supabase.rpc("admin_panel_metrics", {
        p_start: range.start,
        p_end: range.end,
      });
      if (error) throw error;
      setPanelMetrics(parsePanelMetrics(data));
    } catch {
      setPanelMetrics(null);
    } finally {
      setPanelLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadPanelMetrics(dateStart, dateEnd);
  }, [dateStart, dateEnd, loadPanelMetrics]);

  useEffect(() => {
    if (!listOpen) return;
    const range = normalizeDateRange(dateStart, dateEnd);
    void (async () => {
      setListLoading(true);
      try {
        const { data, error } = await supabase.rpc("admin_not_subscribed_list", {
          p_start: range.start,
          p_end: range.end,
        });
        if (error) throw error;
        const rows = (Array.isArray(data) ? data : []) as Array<{
          display_name: string | null;
          contact_phone: string | null;
        }>;
        setNotSubList(
          rows.map((r) => ({ display_name: r.display_name ?? "—", contact_phone: r.contact_phone ?? null })),
        );
      } catch {
        setNotSubList([]);
      } finally {
        setListLoading(false);
      }
    })();
  }, [listOpen, dateStart, dateEnd]);

  async function refreshStats() {
    await loadPanelMetrics(dateStart, dateEnd);
  }

  const periodLabel = formatPeriodLabel(
    normalizeDateRange(dateStart, dateEnd).start,
    normalizeDateRange(dateStart, dateEnd).end,
  );
  const isTodayOnly = dateStart === dateEnd && dateStart === todayYmd();
  const isCurrentMonthRange = dateStart === monthStartYmd() && dateEnd === todayYmd();

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
      await refreshStats();
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

  async function handleSaveSupportWhatsApp(e: React.FormEvent) {
    e.preventDefault();
    setSupportSaving(true);
    try {
      const { data, error } = await supabase.rpc("admin_set_support_whatsapp", {
        p_whatsapp: unmaskPhone(supportPhone),
      });
      if (error) throw new Error(error.message);

      const payload = data as { error?: string; support_whatsapp?: string | null };
      if (payload.error === "invalid_phone") {
        toast({
          title: "Número inválido",
          description: "Informe DDD + número (10 ou 11 dígitos).",
          variant: "destructive",
        });
        return;
      }
      if (payload.error) {
        throw new Error(payload.error);
      }

      if (payload.support_whatsapp) {
        setSupportPhone(maskPhone(payload.support_whatsapp));
      } else {
        setSupportPhone("");
      }

      toast({ title: "WhatsApp de suporte salvo" });
    } catch (err) {
      toast({
        title: "Erro ao salvar",
        description: err instanceof Error ? err.message : "Tente novamente.",
        variant: "destructive",
      });
    } finally {
      setSupportSaving(false);
    }
  }

  const supportPreviewUrl = buildSupportWhatsAppUrl(unmaskPhone(supportPhone));

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
        <CardHeader className="pb-3">
          <CardTitle className="text-lg">Painel</CardTitle>
        </CardHeader>
        <CardContent>
          {panelLoading ? (
            <div className="flex justify-center py-4">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : panelMetrics ? (
            <div className="space-y-4">
              <div className="space-y-3">
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <CalendarDays className="h-3.5 w-3.5 shrink-0" />
                  <span>Período: {periodLabel}</span>
                  {isTodayOnly && <span>(hoje)</span>}
                  {!isTodayOnly && isCurrentMonthRange && <span>(mês atual)</span>}
                </div>

                <div className="flex flex-wrap items-end gap-2">
                  <div className="space-y-1">
                    <Label htmlFor="admin-date-start" className="text-xs text-muted-foreground">
                      Data de início
                    </Label>
                    <Input
                      id="admin-date-start"
                      type="date"
                      value={dateStart}
                      max={dateEnd || todayYmd()}
                      onChange={(e) => setDateStart(e.target.value)}
                      className="h-9 w-[10.5rem]"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="admin-date-end" className="text-xs text-muted-foreground">
                      Data de término
                    </Label>
                    <Input
                      id="admin-date-end"
                      type="date"
                      value={dateEnd}
                      min={dateStart}
                      max={todayYmd()}
                      onChange={(e) => setDateEnd(e.target.value)}
                      className="h-9 w-[10.5rem]"
                    />
                  </div>
                </div>

                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    className="h-8 rounded-full text-xs"
                    onClick={() => {
                      const t = todayYmd();
                      setDateStart(t);
                      setDateEnd(t);
                    }}
                  >
                    Hoje
                  </Button>
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    className="h-8 rounded-full text-xs"
                    onClick={() => {
                      setDateStart(monthStartYmd());
                      setDateEnd(todayYmd());
                    }}
                  >
                    Mês atual
                  </Button>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                <div className="rounded-xl border border-border/60 bg-card/40 p-3">
                  <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                    <Users className="h-3.5 w-3.5" /> Total
                  </div>
                  <p className="mt-1 text-xl font-semibold tabular-nums">{panelMetrics.total_subscribers}</p>
                </div>

                <div className="rounded-xl border border-border/60 bg-card/40 p-3">
                  <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                    <UserPlus className="h-3.5 w-3.5" /> Novos cadastros
                  </div>
                  <p className="mt-1 text-xl font-semibold tabular-nums text-emerald-500">
                    +{panelMetrics.new_signups}
                  </p>
                </div>

                <div className="rounded-xl border border-border/60 bg-card/40 p-3">
                  <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                    <TrendingDown className="h-3.5 w-3.5" /> Churn
                  </div>
                  <p className="mt-1 text-xl font-semibold tabular-nums">
                    {panelMetrics.churn_count}
                    <span className="ml-1 text-xs font-medium text-destructive">{panelMetrics.churn_rate}%</span>
                  </p>
                </div>

                <div className="rounded-xl border border-border/60 bg-card/40 p-3">
                  <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                    <CreditCard className="h-3.5 w-3.5" /> Cartão
                  </div>
                  <p className="mt-1 text-xl font-semibold tabular-nums">{panelMetrics.subscribers_card}</p>
                </div>

                <div className="rounded-xl border border-border/60 bg-card/40 p-3">
                  <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                    <QrCode className="h-3.5 w-3.5" /> Pix
                  </div>
                  <p className="mt-1 text-xl font-semibold tabular-nums">{panelMetrics.subscribers_pix}</p>
                </div>

                <div className="rounded-xl border border-border/60 bg-card/40 p-3">
                  <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                    <FlaskConical className="h-3.5 w-3.5" /> Em teste
                  </div>
                  <p className="mt-1 text-xl font-semibold tabular-nums">{panelMetrics.trial_users}</p>
                </div>

                <div className="rounded-xl border border-border/60 bg-card/40 p-3">
                  <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                    <TrendingUp className="h-3.5 w-3.5" /> Conversão
                  </div>
                  <p className="mt-1 text-xl font-semibold tabular-nums text-emerald-500">
                    {panelMetrics.conversion_rate}%
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() => setListOpen((open) => !open)}
                  aria-expanded={listOpen}
                  className="rounded-xl border border-border/60 bg-card/40 p-3 text-left transition-colors hover:bg-secondary/40"
                >
                  <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                    <UserX className="h-3.5 w-3.5" /> Não assinaram
                  </div>
                  <p className="mt-1 text-xl font-semibold tabular-nums">{panelMetrics.not_subscribed}</p>
                </button>
              </div>

              {listOpen && (
                <div className="rounded-xl border border-border/60">
                  <div className="border-b border-border/60 px-3 py-2">
                    <p className="text-sm font-medium">Não assinaram — contatos ({periodLabel})</p>
                    <p className="text-xs text-muted-foreground">
                      Quem se cadastrou no período e ainda não assinou. Use para remarketing.
                    </p>
                  </div>
                  {listLoading ? (
                    <div className="flex justify-center py-4">
                      <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                    </div>
                  ) : !notSubList || notSubList.length === 0 ? (
                    <p className="px-3 py-4 text-sm text-muted-foreground">Ninguém neste período.</p>
                  ) : (
                    <ul className="divide-y divide-border/60">
                      {notSubList.map((row, index) => (
                        <li key={index} className="flex items-center justify-between gap-3 px-3 py-2.5">
                          <span className="truncate text-sm font-medium">{row.display_name}</span>
                          <span className="shrink-0 text-sm tabular-nums text-muted-foreground">
                            {row.contact_phone ? maskPhone(row.contact_phone) : "—"}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">Não foi possível carregar os números.</p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg flex items-center gap-2">
            <Headphones className="h-5 w-5 text-primary" />
            Suporte aos barbeiros
          </CardTitle>
          <CardDescription>
            Número que abre no WhatsApp quando o barbeiro clica em &quot;Suporte&quot; no menu lateral.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {supportLoading ? (
            <div className="flex justify-center py-4">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <form onSubmit={handleSaveSupportWhatsApp} className="space-y-3">
              <div className="space-y-1.5">
                <Label htmlFor="support-whatsapp">Seu WhatsApp (com DDD)</Label>
                <Input
                  id="support-whatsapp"
                  type="tel"
                  inputMode="numeric"
                  placeholder="(11) 99999-9999"
                  value={supportPhone}
                  onChange={(e) => setSupportPhone(maskPhone(e.target.value))}
                  className="h-11 rounded-xl max-w-xs"
                />
                <p className="text-xs text-muted-foreground">
                  Apenas dígitos — o sistema gera o link wa.me automaticamente. Deixe vazio para desativar o botão.
                </p>
              </div>
              {supportPreviewUrl && (
                <p className="text-xs text-muted-foreground break-all">
                  Prévia: {supportPreviewUrl}
                </p>
              )}
              <Button type="submit" disabled={supportSaving} className="rounded-full">
                {supportSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Salvar WhatsApp de suporte"}
              </Button>
            </form>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Buscar usuário</CardTitle>
          <CardDescription>
            Informe o e-mail cadastrado. A busca sincroniza pagamentos Pix (Mercado Pago) quando aplicável.
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

      <AdminAggregatedAccountsSection />
    </div>
  );
}
