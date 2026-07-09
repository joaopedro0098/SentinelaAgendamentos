import { Monitor } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";

export function AgendamentosGridDesktopOnlyNotice() {
  return (
    <Card className="border-dashed">
      <CardContent className="flex flex-col items-center justify-center gap-3 py-14 px-6 text-center">
        <Monitor className="h-8 w-8 text-muted-foreground/70" aria-hidden />
        <p className="text-sm font-medium text-muted-foreground">
          Visualização disponível somente pelo Computador/Notebook
        </p>
      </CardContent>
    </Card>
  );
}
