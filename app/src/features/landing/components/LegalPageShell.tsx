import Navbar from "@/features/landing/components/Navbar";
import { Link } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import type { ReactNode } from "react";

type LegalPageShellProps = {
  title: string;
  subtitle?: string;
  children: ReactNode;
};

/** Fundo roxo escuro em gradiente + navbar, alinhado às páginas legais. */
export function LegalPageShell({ title, subtitle, children }: LegalPageShellProps) {
  return (
    <div className="min-h-screen flex flex-col bg-[hsl(270_32%_7%)] bg-gradient-to-b from-[hsl(265_35%_9%)] via-[hsl(260_38%_6%)] to-[hsl(240_40%_4%)] text-white/90">
      <Navbar />
      <main className="flex-1 pt-28 pb-16 px-4">
        <div className="max-w-2xl mx-auto">
          <Link
            to="/"
            className="inline-flex items-center gap-1.5 text-sm text-white/55 hover:text-white/90 transition-colors mb-10"
          >
            <ArrowLeft className="w-4 h-4" />
            Voltar ao início
          </Link>

          <div className="mb-10">
            <h1 className="font-display text-2xl sm:text-3xl font-semibold text-white tracking-tight mb-2">{title}</h1>
            {subtitle ? <p className="text-sm text-white/50">{subtitle}</p> : null}
          </div>

          <div className="space-y-8 text-[15px] leading-relaxed text-white/85 [&_h2]:text-white [&_h2]:text-base [&_h2]:font-semibold [&_h2]:mt-10 [&_h2]:mb-3 [&_h2]:first:mt-0 [&_p]:mb-0 [&_ul]:list-disc [&_ul]:pl-5 [&_ul]:space-y-1.5 [&_ul]:text-white/80 [&_a]:text-white/70 [&_a]:underline [&_a]:underline-offset-2 hover:[&_a]:text-white">
            {children}
          </div>
        </div>
      </main>
    </div>
  );
}
