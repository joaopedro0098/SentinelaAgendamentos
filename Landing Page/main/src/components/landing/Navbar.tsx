import { Button } from "@/components/ui/button";
import { Bot, ArrowRight, Menu } from "lucide-react";
import { Link, useLocation } from "react-router-dom";
import { useState } from "react";

const Navbar = () => {
  const { pathname } = useLocation();
  const [open, setOpen] = useState(false);

  const linkCls = (active: boolean) =>
    `transition-colors ${active ? "text-foreground" : "text-muted-foreground hover:text-foreground"}`;

  return (
    <header className="fixed top-0 inset-x-0 z-50">
      <div className="container py-4">
        <nav className="glass rounded-full px-3 sm:px-6 py-2.5 sm:py-3 flex items-center justify-between gap-2">
          <Link to="/" className="flex items-center gap-2 font-display font-bold text-base sm:text-lg shrink-0">
            <span className="w-8 h-8 rounded-lg bg-gradient-brand flex items-center justify-center shadow-glow shrink-0">
              <Bot className="w-4 h-4 text-white" />
            </span>
            <span className="whitespace-nowrap">
              Sentinela <span className="hidden sm:inline">Agendamentos</span>
            </span>
          </Link>

          {/* Desktop nav */}
          <div className="hidden md:flex items-center gap-8 text-sm">
            <Link to="/" className={linkCls(pathname === "/")}>Produto</Link>
            <Link to="/planos" className={linkCls(pathname === "/planos")}>Planos</Link>
          </div>

          <div className="flex items-center gap-2">
            <Button
              asChild
              size="sm"
              className="hidden sm:inline-flex bg-gradient-brand hover:opacity-90 text-white border-0 rounded-full"
            >
              <Link to="/planos">Começar <ArrowRight className="w-4 h-4 ml-1" /></Link>
            </Button>

            {/* Mobile menu trigger */}
            <button
              type="button"
              aria-label="Abrir menu"
              onClick={() => setOpen((v) => !v)}
              className="md:hidden w-9 h-9 inline-flex items-center justify-center rounded-full glass"
            >
              <Menu className="w-4 h-4" />
            </button>
          </div>
        </nav>

        {/* Mobile dropdown */}
        {open && (
          <div className="md:hidden mt-2 glass rounded-2xl p-4 flex flex-col gap-3 text-sm">
            <Link to="/" onClick={() => setOpen(false)} className={linkCls(pathname === "/")}>Produto</Link>
            <Link to="/planos" onClick={() => setOpen(false)} className={linkCls(pathname === "/planos")}>Planos</Link>
            <Button
              asChild
              size="sm"
              className="bg-gradient-brand hover:opacity-90 text-white border-0 rounded-full"
            >
              <Link to="/planos" onClick={() => setOpen(false)}>
                Começar <ArrowRight className="w-4 h-4 ml-1" />
              </Link>
            </Button>
          </div>
        )}
      </div>
    </header>
  );
};

export default Navbar;
