import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ArrowLeft, Loader2, Scissors } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
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
    <div className="min-h-screen bg-surface px-4 py-6">
      <div className="mx-auto w-full max-w-md space-y-6">
        <Link
          to={hubHref}
          className="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          Voltar
        </Link>

        <div>
          <h1 className="font-display text-2xl font-bold">Meus agendamentos</h1>
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
            <Card key={item.id} className="p-4 space-y-2">
              <div className="flex items-center justify-between gap-3">
                <p className="font-semibold">
                  {formatDateBr(item.data)} · {formatTime(item.hora)}
                </p>
                <span className="text-xs text-muted-foreground">{item.duracao_minutos} min</span>
              </div>
              <p className="text-sm">
                <Scissors className="inline h-3.5 w-3.5 mr-1 opacity-70" />
                {item.barbeiro_nome}
              </p>
              {item.servicos_nomes && item.servicos_nomes.length > 0 && (
                <p className="text-sm text-muted-foreground">{item.servicos_nomes.join(" · ")}</p>
              )}
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
}
