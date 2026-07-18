import { Button } from "@/components/ui/button";
import { formatWhatsAppDisplay, isPlausibleWhatsappSearch } from "@/features/dashboard/lib/pacienteFormat";

type Props = {
  search: string;
  onCreateClick: () => void;
};

export function PacientesSearchEmptyState({ search, onCreateClick }: Props) {
  const trimmed = search.trim();
  const canCreate = isPlausibleWhatsappSearch(trimmed);
  const digits = trimmed.replace(/\D/g, "");

  if (!trimmed) {
    return (
      <p className="px-3 py-8 text-center text-sm text-muted-foreground">
        Nenhum paciente com atendimento concluído.
      </p>
    );
  }

  if (canCreate) {
    return (
      <div className="px-3 py-8 text-center space-y-3">
        <p className="text-sm text-muted-foreground">
          Nenhum paciente encontrado para{" "}
          <span className="font-medium text-foreground">{formatWhatsAppDisplay(digits)}</span>.
        </p>
        <Button type="button" size="sm" className="rounded-full" onClick={onCreateClick}>
          Cadastrar paciente
        </Button>
      </div>
    );
  }

  return (
    <p className="px-3 py-8 text-center text-sm text-muted-foreground">
      Nenhum paciente encontrado. Busque por nome ou WhatsApp completo (DDD + número).
    </p>
  );
}
