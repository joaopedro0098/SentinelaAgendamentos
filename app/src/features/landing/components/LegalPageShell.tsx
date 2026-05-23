import { Link } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import type { ReactNode } from "react";

type LegalPageShellProps = {
  title: string;
  subtitle?: string;
  children: ReactNode;
};

/** Fundo claro verde/branco + navbar, alinhado às páginas legais. */
export function LegalPageShell({ title, subtitle, children }: LegalPageShellProps) {
  return (
    <div className="flex-1 flex flex-col">
      <main className="flex-1 pt-28 pb-16 px-4">
        <div className="max-w-2xl mx-auto">
          <Link
            to="/"
            className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors mb-10"
          >
            <ArrowLeft className="w-4 h-4" />
            Voltar ao início
          </Link>

          <div className="mb-10">
            <h1 className="font-display text-2xl sm:text-3xl font-semibold text-foreground tracking-tight mb-2">{title}</h1>
            {subtitle ? <p className="text-sm text-muted-foreground">{subtitle}</p> : null}
          </div>

          <div className="space-y-8 text-[15px] leading-relaxed text-muted-foreground [&_strong]:text-foreground [&_h2]:text-foreground [&_h2]:text-base [&_h2]:font-semibold [&_h2]:mt-10 [&_h2]:mb-3 [&_h2]:first:mt-0 [&_p]:mb-0 [&_ul]:list-disc [&_ul]:pl-5 [&_ul]:space-y-1.5 [&_a]:text-foreground [&_a]:underline [&_a]:underline-offset-2">
            {children}
          </div>
        </div>
      </main>
    </div>
  );
}
