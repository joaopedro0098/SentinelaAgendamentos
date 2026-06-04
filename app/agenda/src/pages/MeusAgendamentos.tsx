import { useEffect, useState } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { PublicShopHeader } from "@/components/PublicShopHeader";
import { useBarbeariaResumo } from "@/hooks/useBarbeariaResumo";
import { maskPhone, unmaskPhone, isValidPhone } from "@/lib/phone";
import { canClientSelfServiceModifyAppointment } from "@/lib/appointmentDates";
import { notifyBarberAppointmentChange } from "@/lib/notifyBarberAppointmentChange";
import type { RescheduleContext } from "@agenda/pages/PublicBooking";
import { cn } from "@/lib/utils";

type ClientAppointment = {
  id: string;
  data: string;
  hora: string;
  duracao_minutos: number;
  barbeiro_id: string;
  barbeiro_nome: string;
  barbearia_nome: string;
  cliente_nome: string;
  status: "confirmado" | "cancelado" | "concluido";
  servicos_nomes: string[] | null;
  observacao: string | null;
  allow_client_self_service: boolean;
};

function formatDateBr(iso: string) {
  const [y, m, d] = iso.split("-");
  if (!y || !m || !d) return iso;
  return `${d}/${m}/${y}`;
}

function formatTime(value: string) {
  return value.slice(0, 5);
}


export default function MeusAgendamentosPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { slug } = useParams<{ slug: string }>();
  const { loading: shopLoading, barbearia } = useBarbeariaResumo(slug);
  const [whatsapp, setWhatsapp] = useState(() => {
    const saved = (location.state as { whatsapp?: string } | null)?.whatsapp;
    return saved ? maskPhone(saved) : "";
  });
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const [items, setItems] = useState<ClientAppointment[]>([]);
  const [cancelTarget, setCancelTarget] = useState<ClientAppointment | null>(null);
  const [cancelling, setCancelling] = useState(false);

  const contactName = barbearia?.nome?.trim() || "a barbearia";
  const hubHref = `/agendar/${slug}`;

  async function loadItems(phone: string) {
    if (!slug) return;
    const { data, error } = await supabase.rpc("listar_agendamentos_cliente", {
      _slug: slug,
      _whatsapp: unmaskPhone(phone),
    });
    if (error) throw error;
    setItems((data ?? []) as ClientAppointment[]);
  }

  async function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    if (!slug || !isValidPhone(whatsapp)) return;

    setLoading(true);
    setSearched(true);
    try {
      await loadItems(whatsapp);
    } catch {
      setItems([]);
    } finally {
      setLoading(false);
    }
  }

  function handleAlterar(item: ClientAppointment) {
    if (!slug) return;
    const payload: RescheduleContext = {
      agendamentoId: item.id,
      barbeiroId: item.barbeiro_id,
      data: item.data,
      hora: formatTime(item.hora),
      cliente_nome: item.cliente_nome,
      cliente_whatsapp: unmaskPhone(whatsapp),
      observacao: item.observacao,
      duracao_minutos: item.duracao_minutos,
      servicos_nomes: item.servicos_nomes?.length ? item.servicos_nomes : undefined,
    };
    navigate(`/agendar/${slug}/agendar`, { state: { reschedule: payload, whatsapp: unmaskPhone(whatsapp) } });
  }

  async function handleConfirmCancel() {
    if (!slug || !cancelTarget || !isValidPhone(whatsapp)) return;
    setCancelling(true);
    const { error } = await supabase.rpc("cancelar_agendamento_cliente", {
      _agendamento_id: cancelTarget.id,
      _slug: slug,
      _whatsapp: unmaskPhone(whatsapp),
    });
    setCancelling(false);
    if (error) {
      setCancelTarget(null);
      return;
    }
    await notifyBarberAppointmentChange({ agendamento_id: cancelTarget.id, event: "cancelled" });
    setCancelTarget(null);
    await loadItems(whatsapp);
  }

  return (
    <div className="relative min-h-screen bg-surface px-4 py-8">
      <Link
        to={hubHref}
        className="absolute left-4 top-8 inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" />
        Voltar
      </Link>

      <div className="mx-auto w-full max-w-md space-y-6">
        <PublicShopHeader
          nome={barbearia?.nome ?? null}
          logoUrl={barbearia?.logo_url ?? null}
          loading={shopLoading}
        />

        <div>
          <h2 className="font-display text-lg font-semibold">Meus agendamentos</h2>
          <p className="text-sm text-muted-foreground mt-1">
            Informe seu WhatsApp para ver seus agendamentos futuros confirmados.
          </p>
        </div>

        <form onSubmit={handleSearch} className="space-y-3">
          <Input
            inputMode="tel"
            value={whatsapp}
            onChange={(e) => setWhatsapp(maskPhone(e.target.value))}
            placeholder="(11) 91234-5678"
            required
            className="h-12 text-base"
          />
          <Button type="submit" disabled={loading || !isValidPhone(whatsapp)} className="w-full h-11 rounded-xl">
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Buscar"}
          </Button>
        </form>

        {searched && !loading && items.length === 0 && (
          <Card className="p-4 text-sm text-muted-foreground text-center">
            Nenhum agendamento futuro encontrado para este WhatsApp.
          </Card>
        )}

        <div className="space-y-3">
          {items.map((item) => {
            const isCancelled = item.status === "cancelado";
            const canShowActions =
              !isCancelled &&
              item.allow_client_self_service &&
              canClientSelfServiceModifyAppointment(item.data);

            return (
              <Card key={item.id} className="p-4 space-y-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="space-y-2">
                    {isCancelled && (
                      <span className="inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-semibold tracking-wide border bg-destructive/20 text-destructive border-destructive/80">
                        Cancelado
                      </span>
                    )}
                    <p className="font-semibold">{formatDateBr(item.data)}</p>
                  </div>
                  <span className="text-sm font-semibold tabular-nums text-primary">{formatTime(item.hora)}</span>
                </div>

                <dl className="grid gap-2 text-sm">
                  <div className="flex gap-2">
                    <dt className="text-muted-foreground shrink-0">Cliente:</dt>
                    <dd className="font-medium">{item.cliente_nome}</dd>
                  </div>
                  <div className="flex gap-2">
                    <dt className="text-muted-foreground shrink-0">Profissional:</dt>
                    <dd className="font-medium">{item.barbeiro_nome}</dd>
                  </div>
                  <div className="flex gap-2">
                    <dt className="text-muted-foreground shrink-0">Serviço:</dt>
                    <dd className="font-medium">
                      {item.servicos_nomes && item.servicos_nomes.length > 0
                        ? item.servicos_nomes.join(" · ")
                        : "—"}
                    </dd>
                  </div>
                </dl>

                {canShowActions && (
                  <div className="flex gap-2 pt-1">
                    <Button
                      type="button"
                      variant="outline"
                      className="flex-1 rounded-full"
                      onClick={() => handleAlterar(item)}
                    >
                      Alterar
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      className={cn(
                        "flex-1 rounded-full",
                        "hover:bg-destructive/10 hover:text-destructive hover:border-destructive/50",
                      )}
                      onClick={() => setCancelTarget(item)}
                    >
                      Cancelar
                    </Button>
                  </div>
                )}

                {!isCancelled && !canShowActions && (
                  <p className="text-xs text-muted-foreground border-t border-border/60 pt-3">
                    Para alterar ou cancelar contate <span className="font-medium text-foreground">{contactName}</span>.
                  </p>
                )}
              </Card>
            );
          })}
        </div>
      </div>

      {cancelTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <Card className="w-full max-w-sm p-5 space-y-4">
            <div className="space-y-2">
              <h3 className="font-semibold text-lg">Cancelar agendamento?</h3>
              <p className="text-sm text-muted-foreground">
                Tem certeza que deseja cancelar o horário de{" "}
                <span className="font-medium text-foreground">{cancelTarget.cliente_nome}</span> em{" "}
                {formatDateBr(cancelTarget.data)} às {formatTime(cancelTarget.hora)}?
              </p>
            </div>
            <div className="flex gap-2">
              <Button
                type="button"
                variant="outline"
                className="flex-1 rounded-full"
                disabled={cancelling}
                onClick={() => setCancelTarget(null)}
              >
                Voltar
              </Button>
              <Button
                type="button"
                className="flex-1 rounded-full bg-destructive text-destructive-foreground hover:bg-destructive/90"
                disabled={cancelling}
                onClick={() => void handleConfirmCancel()}
              >
                {cancelling ? <Loader2 className="h-4 w-4 animate-spin" /> : "Sim, cancelar"}
              </Button>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}
