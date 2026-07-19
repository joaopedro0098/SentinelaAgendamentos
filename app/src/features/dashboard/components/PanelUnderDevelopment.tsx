import type { LucideIcon } from "lucide-react";
import { Construction } from "lucide-react";

type Props = {
  title: string;
  icon: LucideIcon;
  description?: string;
};

export function PanelUnderDevelopment({ title, icon: Icon, description }: Props) {
  return (
    <div className="panel-canvas-page p-4 md:p-6 max-w-3xl mx-auto w-full">
      <header className="space-y-1 mb-6">
        <div className="flex items-center gap-2">
          <Icon className="h-6 w-6 text-primary" />
          <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        </div>
      </header>
      <div className="rounded-xl border border-border/80 bg-card p-8 text-center space-y-3">
        <Construction className="h-10 w-10 text-muted-foreground mx-auto" aria-hidden />
        <p className="text-sm font-medium text-foreground">Em desenvolvimento</p>
        <p className="text-sm text-muted-foreground max-w-md mx-auto">
          {description ?? "Esta área ainda não está disponível. Em breve você poderá configurar tudo daqui."}
        </p>
      </div>
    </div>
  );
}
