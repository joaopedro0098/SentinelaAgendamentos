import { Label } from "@/components/ui/label";
import {
  PROFESSIONAL_SPECIALTIES,
  PROFESSIONAL_SPECIALTY_LABELS,
  type ProfessionalSpecialty,
} from "@/lib/professionalSpecialty";
import { cn } from "@/lib/utils";

type SignupSpecialtySelectProps = {
  id?: string;
  value: ProfessionalSpecialty | "";
  onChange: (value: ProfessionalSpecialty | "") => void;
  required?: boolean;
  className?: string;
};

export function SignupSpecialtySelect({
  id = "professional-specialty",
  value,
  onChange,
  required = true,
  className,
}: SignupSpecialtySelectProps) {
  return (
    <div className={cn("space-y-1.5", className)}>
      <Label htmlFor={id} className="text-xs font-medium text-muted-foreground">
        Especialidade
      </Label>
      <select
        id={id}
        required={required}
        value={value}
        onChange={(e) => {
          const next = e.target.value;
          onChange(next === "" ? "" : (next as ProfessionalSpecialty));
        }}
        className="flex h-11 w-full rounded-xl border border-border/80 bg-secondary/30 px-3 py-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--brand-violet)/0.5)]"
      >
        <option value="">Selecione sua especialidade</option>
        {PROFESSIONAL_SPECIALTIES.map((key) => (
          <option key={key} value={key}>
            {PROFESSIONAL_SPECIALTY_LABELS[key]}
          </option>
        ))}
      </select>
    </div>
  );
}
