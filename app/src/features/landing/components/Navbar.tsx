import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Menu, X } from "lucide-react";
import { Link, useLocation } from "react-router-dom";
import { BrandLogo } from "@/components/brand/BrandLogo";
import { PwaInstallButton } from "@/components/pwa/PwaInstallButton";
import { cn } from "@/lib/utils";

const navLinkClass =
  "text-sm font-medium text-muted-foreground hover:text-accent transition-colors px-3 py-2 rounded-lg";

const Navbar = () => {
  const { pathname } = useLocation();
  const [open, setOpen] = useState(false);
  const [menuMounted, setMenuMounted] = useState(false);
  const [menuEntered, setMenuEntered] = useState(false);

  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (open) {
      setMenuMounted(true);
      return;
    }
    setMenuEntered(false);
    const timer = window.setTimeout(() => setMenuMounted(false), 250);
    return () => window.clearTimeout(timer);
  }, [open]);

  useEffect(() => {
    if (!menuMounted || !open) return;
    const frame = window.requestAnimationFrame(() => setMenuEntered(true));
    return () => window.cancelAnimationFrame(frame);
  }, [menuMounted, open]);

  function closeMenu() {
    setOpen(false);
  }

  return (
    <header className="fixed top-0 inset-x-0 z-50 marketing-nav">
      {menuMounted && (
        <button
          type="button"
          aria-label="Fechar menu"
          onClick={closeMenu}
          className={cn(
            "md:hidden fixed inset-0 bg-black/15 transition-opacity duration-300 ease-out motion-reduce:transition-none",
            menuEntered ? "opacity-100" : "pointer-events-none opacity-0",
          )}
        />
      )}

      <div className="container flex items-center justify-between gap-4 h-16 md:h-[4.5rem]">
        <BrandLogo linkTo="/" showName size="md" className="shrink-0 min-w-0" />

        <div className="hidden md:flex items-center gap-1">
          <Link to="/planos" className={navLinkClass}>
            Planos
          </Link>
          <Link to="/login" className={navLinkClass}>
            Entrar
          </Link>
          <Button asChild size="sm" className="ml-2 rounded-full bg-primary hover:bg-primary/90 text-primary-foreground border-0 px-5">
            <Link to="/signup">Teste Grátis</Link>
          </Button>
        </div>

        <div className="flex items-center md:hidden">
          <button
            type="button"
            aria-label={open ? "Fechar menu" : "Abrir menu"}
            aria-expanded={open}
            onClick={() => setOpen((v) => !v)}
            className="w-9 h-9 inline-flex items-center justify-center rounded-full border border-border/70 bg-background/80"
          >
            {open ? <X className="w-4 h-4" /> : <Menu className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {menuMounted && (
        <div
          className={cn(
            "md:hidden absolute top-full inset-x-0 border-b border-border/60 bg-background/95 backdrop-blur-md px-4 pb-4 pt-2 flex flex-col gap-2 transition-all duration-300 ease-out motion-reduce:transition-none",
            menuEntered ? "opacity-100 translate-y-0" : "pointer-events-none opacity-0 -translate-y-2",
          )}
        >
          <Link to="/planos" onClick={closeMenu} className="text-sm font-medium px-3 py-2.5 rounded-xl hover:bg-secondary/60">
            Planos
          </Link>
          <Link to="/login" onClick={closeMenu} className="text-sm font-medium px-3 py-2.5 rounded-xl hover:bg-secondary/60">
            Entrar
          </Link>
          <PwaInstallButton
            label="Baixar"
            helpVariant="landing"
            className="w-full"
            buttonClassName="w-full rounded-xl border-border bg-background/80 hover:bg-secondary text-sm h-10 justify-center gap-2"
            onNavigate={closeMenu}
          />
          <Button asChild className="rounded-full bg-primary hover:bg-primary/90 text-primary-foreground border-0 w-full mt-1">
            <Link to="/signup" onClick={closeMenu}>
              Teste Grátis
            </Link>
          </Button>
        </div>
      )}
    </header>
  );
};

export default Navbar;
