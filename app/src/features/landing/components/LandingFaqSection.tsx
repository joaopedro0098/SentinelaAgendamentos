import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { Reveal } from "@/components/layout/PageReveal";
import { FAQ_ITEMS } from "@/features/landing/content/landingContent";
import { LandingSection } from "@/features/landing/components/LandingSection";
import { LandingSectionHeader } from "@/features/landing/components/LandingSectionHeader";
import { cn } from "@/lib/utils";

export function LandingFaqSection() {
  const [openId, setOpenId] = useState<string | null>(FAQ_ITEMS[0]?.id ?? null);

  return (
    <LandingSection id="faq" narrow>
      <LandingSectionHeader
        eyebrow="Dúvidas frequentes"
        title="Perguntas que recebemos com frequência"
        description="Não encontrou sua resposta? Fale com nosso suporte via WhatsApp após criar sua conta."
      />

      <div className="space-y-3">
        {FAQ_ITEMS.map((item, i) => {
          const isOpen = openId === item.id;
          return (
            <Reveal key={item.id} index={i}>
              <div className="rounded-xl border border-border/70 bg-card overflow-hidden shadow-soft">
                <button
                  type="button"
                  aria-expanded={isOpen}
                  onClick={() => setOpenId(isOpen ? null : item.id)}
                  className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left hover:bg-secondary/30 transition-colors"
                >
                  <span className="font-medium text-sm sm:text-[15px] text-foreground leading-snug pr-2">
                    {item.question}
                  </span>
                  <ChevronDown
                    className={cn(
                      "h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-200",
                      isOpen && "rotate-180",
                    )}
                    aria-hidden
                  />
                </button>
                <div
                  className={cn(
                    "grid transition-[grid-template-rows] duration-200 ease-out",
                    isOpen ? "grid-rows-[1fr]" : "grid-rows-[0fr]",
                  )}
                >
                  <div className="min-h-0 overflow-hidden">
                    <p className="px-5 pb-4 text-sm text-muted-foreground leading-relaxed border-t border-border/40 pt-3">
                      {item.answer}
                    </p>
                  </div>
                </div>
              </div>
            </Reveal>
          );
        })}
      </div>
    </LandingSection>
  );
}
