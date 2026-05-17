import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { toast } from "sonner";
import { maskPhone, unmaskPhone, isValidPhone } from "@/lib/phone";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { ArrowLeft, CalendarX, Loader2, Scissors, X } from "lucide-react";

const STORAGE_KEY = "agendabarber:cliente";

interface Agendamento {
  id: string;
  data: string;
  hora: string;
  duracao_minutos: number;
  status: string;
  cliente_nome: string;
  barbeiro_id: string;
  barbeiro_nome: string;
  barbearia_nome: string;
}

const MeusAgendamentos = () => {
  const { slug } = useParams();
  const [whatsapp, setWhatsapp] = useState("");
  const [searched, setSearched] = useState(false);
  const [loading, setLoading] = useState(false);
  const [items, setItems] = useState<Agendamento[]>([]);
  const [confirmCancel, setConfirmCancel] = useState<Agendamento | null>(null);
  const [cancelling, setCancelling] = useState(false);

  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      try {
        const c = JSON.parse(saved);
        if (c.whatsapp) setWhatsapp(maskPhone(c.whatsapp));
      } catch {}
    }
  }, []);

  const buscar = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!isValidPhone(whatsapp)) return toast.error("WhatsApp inválido");
    if (!slug) return;
    setLoading(true);
    const clean = unmaskPhone(whatsapp);
    const { data, error } = await supabase.rpc("listar_agendamentos_cliente", {
      _slug: slug,
      _whatsapp: clean,
    });
    setLoading(false);
    setSearched(true);
    if (error) {
      toast.error(error.message);
      return;
    }
    setItems((data ?? []) as Agendamento[]);
  };

  const cancelar = async () => {
    if (!confirmCancel || !slug) return;
    setCancelling(true);
    const { data, error } = await supabase.rpc("cancelar_agendamento_cliente", {
      _slug: slug,
      _whatsapp: unmaskPhone(whatsapp),
      _agendamento_id: confirmCancel.id,
    });
    setCancelling(false);
    if (error || !data) {
      toast.error(error?.message ?? "Não foi possível cancelar");
      return;
    }
    toast.success("Agendamento cancelado");
    setItems((cur) => cur.filter((x) => x.id !== confirmCancel.id));
    setConfirmCancel(null);
  };

  const fmtData = (d: string) =>
    new Date(d + "T00:00:00").toLocaleDateString("pt-BR", { weekday: "short", day: "2-digit", month: "short" });

  return (
    <div className="min-h-screen bg-surface">
      <div className="mx-auto w-full max-w-md">
        <header className="bg-card border-b border-border px-5 pt-6 pb-4">
          <Link to={`/agendar/${slug}`} className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
            <ArrowLeft className="h-4 w-4" /> Voltar para agendamento
          </Link>
          <div className="flex items-center gap-3 mt-3">
            <div className="h-12 w-12 rounded-full bg-foreground text-background flex items-center justify-center shrink-0">
              <Scissors className="h-5 w-5" />
            </div>
            <h1 className="font-display text-2xl font-bold leading-tight flex-1">Meus agendamentos</h1>
          </div>
        </header>

        <div className="px-5 py-5 space-y-5">
          <form onSubmit={buscar} className="space-y-3">
            <div>
              <label className="block text-sm font-semibold mb-1.5">Seu WhatsApp</label>
              <Input
                inputMode="tel"
                value={whatsapp}
                onChange={(e) => setWhatsapp(maskPhone(e.target.value))}
                placeholder="(11) 91234-5678"
                className="h-12 text-base"
                required
              />
              <p className="mt-1.5 text-xs text-muted-foreground">
                Use o mesmo número informado ao fazer o agendamento.
              </p>
            </div>
            <Button type="submit" disabled={loading} className="w-full h-12 text-base font-semibold rounded-xl">
              {loading ? <Loader2 className="h-5 w-5 animate-spin" /> : "Ver agendamentos"}
            </Button>
          </form>

          {searched && !loading && (
            <section className="space-y-2.5">
              {items.length === 0 ? (
                <Card className="p-5 text-center">
                  <CalendarX className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
                  <p className="font-semibold">Nenhum agendamento futuro</p>
                  <p className="text-sm text-muted-foreground mt-1">
                    Não encontramos agendamentos confirmados para esse WhatsApp.
                  </p>
                  <Button asChild variant="outline" className="mt-4">
                    <Link to={`/agendar/${slug}`}>Fazer um agendamento</Link>
                  </Button>
                </Card>
              ) : (
                items.map((a) => (
                  <Card key={a.id} className="p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="font-display text-lg font-bold leading-tight capitalize">
                          {fmtData(a.data)} • {a.hora.slice(0, 5)}
                        </p>
                        <p className="text-sm text-muted-foreground mt-0.5 truncate">
                          {a.barbearia_nome} — com <b className="text-foreground">{a.barbeiro_nome}</b>
                        </p>
                        <p className="text-xs text-muted-foreground mt-1">
                          Duração: {a.duracao_minutos} min
                        </p>
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="text-destructive shrink-0"
                        onClick={() => setConfirmCancel(a)}
                        aria-label="Cancelar"
                      >
                        <X className="h-5 w-5" />
                      </Button>
                    </div>
                    <div className="mt-3 flex gap-2">
                      <Button
                        asChild
                        variant="outline"
                        className="flex-1"
                      >
                        <Link to={`/agendar/${slug}`}>Reagendar</Link>
                      </Button>
                      <Button
                        variant="destructive"
                        className="flex-1"
                        onClick={() => setConfirmCancel(a)}
                      >
                        Cancelar
                      </Button>
                    </div>
                  </Card>
                ))
              )}
              <p className="text-[11px] text-muted-foreground text-center pt-2">
                Para alterar, cancele o atual e faça um novo agendamento.
              </p>
            </section>
          )}
        </div>
      </div>

      <AlertDialog open={!!confirmCancel} onOpenChange={(o) => !o && setConfirmCancel(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancelar agendamento?</AlertDialogTitle>
            <AlertDialogDescription>
              {confirmCancel && (
                <>
                  Você está prestes a cancelar o horário de{" "}
                  <b>{fmtData(confirmCancel.data)} às {confirmCancel.hora.slice(0, 5)}</b> com{" "}
                  <b>{confirmCancel.barbeiro_nome}</b>. Esta ação não pode ser desfeita.
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={cancelling}>Voltar</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => { e.preventDefault(); cancelar(); }}
              disabled={cancelling}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {cancelling ? <Loader2 className="h-4 w-4 animate-spin" /> : "Sim, cancelar"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default MeusAgendamentos;
