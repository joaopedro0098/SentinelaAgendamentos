import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ArrowLeft, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { PublicShopHeader } from "@/components/PublicShopHeader";
import { useBarbeariaResumo } from "@/hooks/useBarbeariaResumo";
import { maskPhone, unmaskPhone, isValidPhone } from "@/lib/phone";

type ClientAppointment = {
  id: string;
  data: string;
  hora: string;
  duracao_minutos: number;
  barbeiro_nome: string;
  cliente_nome: string;
  servicos_nomes: string[] | null;
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
  const { slug } = useParams<{ slug: string }>();
  const { loading: shopLoading, barbearia } = useBarbeariaResumo(slug);
  const [whatsapp, setWhatsapp] = useState("");
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const [items, setItems] = useState<ClientAppointment[]>([]);

  async function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    if (!slug || !isValidPhone(whatsapp)) return;

    setLoading(true);
    setSearched(true);
    try {
      const { data, error } = await supabase.rpc("listar_agendamentos_cliente", {
        _slug: slug,
        _whatsapp: unmaskPhone(whatsapp),
      });
      if (error) throw error;
      setItems((data ?? []) as ClientAppointment[]);
    } catch {
      setItems([]);
    } finally {
      setLoading(false);
    }
  }

  const hubHref = `/agendar/${slug}`;

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
            Informe seu WhatsApp para ver os horários futuros confirmados.
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
          {items.map((item) => (
            <Card key={item.id} className="p-4 space-y-3">
              <p className="font-semibold">{formatDateBr(item.data)}</p>
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
                  <dt className="text-muted-foreground shrink-0">Horário:</dt>
                  <dd className="font-medium">{formatTime(item.hora)}</dd>
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
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
}
