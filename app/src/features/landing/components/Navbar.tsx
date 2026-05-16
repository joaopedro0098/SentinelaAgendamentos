import { Button } from "@/components/ui/button";
import { Bot, ArrowRight, Menu, User } from "lucide-react";
import { Link, useLocation } from "react-router-dom";
import { useState } from "react";

const Navbar = () => {
  const { pathname } = useLocation();
  const [open, setOpen] = useState(false);
  const isLoginPage = pathname === "/login";

  const outlineBtn =
    "rounded-full border-border bg-transparent hover:bg-secondary";
  const outlineBtnDesktop = `${outlineBtn} hidden sm:inline-flex`;
  const outlineBtnMobile = `${outlineBtn} w-full`;

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

          <div className="flex items-center gap-2">
            {/* Desktop + mobile (login): Produto */}
            {isLoginPage && (
              <Button asChild size="sm" variant="outline" className={outlineBtnDesktop}>
                <Link to="/">Produto</Link>
              </Button>
            )}

            <Button asChild size="sm" variant="outline" className={outlineBtnDesktop}>
              <Link to="/planos">Planos</Link>
            </Button>

            {!isLoginPage && (
              <Button asChild size="sm" variant="outline" className={outlineBtnDesktop}>
                <Link to="/login">
                  Fazer login
                  <User className="w-4 h-4 ml-1.5" strokeWidth={1.75} />
                </Link>
              </Button>
            )}

            {!isLoginPage && (
              <Button
                asChild
                size="sm"
                className="hidden sm:inline-flex bg-gradient-brand hover:opacity-90 text-white border-0 rounded-full"
              >
                <Link to="/signup">
                  Teste grátis <ArrowRight className="w-4 h-4 ml-1" />
                </Link>
              </Button>
            )}

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

        {open && (
          <div className="md:hidden mt-2 glass rounded-2xl p-4 flex flex-col gap-3 text-sm">
            {isLoginPage && (
              <Button asChild size="sm" variant="outline" className={outlineBtnMobile}>
                <Link to="/" onClick={() => setOpen(false)}>
                  Produto
                </Link>
              </Button>
            )}

            <Button asChild size="sm" variant="outline" className={outlineBtnMobile}>
              <Link to="/planos" onClick={() => setOpen(false)}>
                Planos
              </Link>
            </Button>

            {!isLoginPage && (
              <Button asChild size="sm" variant="outline" className={outlineBtnMobile}>
                <Link to="/login" onClick={() => setOpen(false)}>
                  Fazer login
                  <User className="w-4 h-4 ml-1.5" strokeWidth={1.75} />
                </Link>
              </Button>
            )}

            {!isLoginPage && (
              <Button
                asChild
                size="sm"
                className="bg-gradient-brand hover:opacity-90 text-white border-0 rounded-full w-full"
              >
                <Link to="/signup" onClick={() => setOpen(false)}>
                  Teste grátis <ArrowRight className="w-4 h-4 ml-1" />
                </Link>
              </Button>
            )}
          </div>
        )}
      </div>
    </header>
  );
};

export default Navbar;
