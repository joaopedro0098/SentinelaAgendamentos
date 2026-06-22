import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { ArrowRight, Menu, User, X } from "lucide-react";
import { Link, useLocation } from "react-router-dom";
import { BrandLogo } from "@/components/brand/BrandLogo";
import { PwaInstallButton } from "@/components/pwa/PwaInstallButton";
import { cn } from "@/lib/utils";

const Navbar = () => {
  const { pathname } = useLocation();
  const [open, setOpen] = useState(false);
  const [menuMounted, setMenuMounted] = useState(false);
  const [menuEntered, setMenuEntered] = useState(false);

  const isAuthPage =
    pathname === "/login" ||
    pathname === "/signup" ||
    pathname === "/signup/confirmar-codigo" ||
    pathname === "/recover" ||
    pathname === "/reset-password" ||
    pathname === "/reset-password/success";
  const isPlanosPage = pathname === "/planos";
  const isSignupPage = pathname === "/signup" || pathname === "/signup/confirmar-codigo";
  const isLoginPage = pathname === "/login";
  const showProdutoLink = isAuthPage || isPlanosPage;
  const showMobileLoginLink = !isAuthPage || isSignupPage;
  const showMobileSignupLink = !isAuthPage || isLoginPage;

  const outlineBtn = "rounded-full border-border bg-transparent hover:bg-secondary";
  const outlineBtnDesktop = `${outlineBtn} hidden sm:inline-flex`;
  const outlineBtnMobile = `${outlineBtn} w-full`;

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
    <header className="fixed top-0 inset-x-0 z-50">
      {menuMounted && (
        <button
          type="button"
          aria-label="Fechar menu"
          onClick={closeMenu}
          className={cn(
            "md:hidden fixed inset-0 bg-black/20 transition-opacity duration-300 ease-out motion-reduce:transition-none",
            menuEntered ? "opacity-100" : "pointer-events-none opacity-0",
          )}
        />
      )}

      <div className="container relative py-4">
        <nav className="relative z-10 glass rounded-full px-3 sm:px-6 py-2.5 sm:py-3 flex items-center justify-between gap-2">
          <BrandLogo linkTo="/" showName showFullName size="sm" className="shrink-0" />

          <div className="flex items-center gap-2">
            {showProdutoLink && (
              <Button asChild size="sm" variant="outline" className={outlineBtnDesktop}>
                <Link to="/">Produto</Link>
              </Button>
            )}

            <PwaInstallButton
              label="Baixar"
              helpVariant="landing"
              className="hidden sm:block"
              buttonClassName="border-border bg-transparent hover:bg-secondary"
            />

            {!isPlanosPage && (
              <Button asChild size="sm" variant="outline" className={outlineBtnDesktop}>
                <Link to="/planos">Planos</Link>
              </Button>
            )}

            {!isAuthPage && (
              <Button asChild size="sm" variant="outline" className={outlineBtnDesktop}>
                <Link to="/login">
                  Fazer login
                  <User className="w-4 h-4 ml-1.5" strokeWidth={1.75} />
                </Link>
              </Button>
            )}

            {!isAuthPage && (
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
              aria-label={open ? "Fechar menu" : "Abrir menu"}
              aria-expanded={open}
              onClick={() => setOpen((v) => !v)}
              className="md:hidden w-9 h-9 inline-flex items-center justify-center rounded-full glass"
            >
              {open ? <X className="w-4 h-4" /> : <Menu className="w-4 h-4" />}
            </button>
          </div>
        </nav>

        {menuMounted && (
          <div
            className={cn(
              "md:hidden relative z-10 mt-2 ml-auto w-[min(100%,20rem)] glass rounded-2xl p-4 flex flex-col gap-3 text-sm origin-top-right transition-all duration-300 ease-out motion-reduce:transition-none",
              menuEntered
                ? "opacity-100 translate-x-0 translate-y-0 scale-100"
                : "pointer-events-none opacity-0 translate-x-5 -translate-y-4 scale-[0.96]",
            )}
          >
            {showProdutoLink && (
              <Button asChild size="sm" variant="outline" className={outlineBtnMobile}>
                <Link to="/" onClick={closeMenu}>
                  Produto
                </Link>
              </Button>
            )}

            <PwaInstallButton
              label="Baixar"
              helpVariant="landing"
              buttonClassName="w-full border-border bg-transparent hover:bg-secondary/40"
              onNavigate={closeMenu}
            />

            {!isPlanosPage && (
              <Button asChild size="sm" variant="outline" className={outlineBtnMobile}>
                <Link to="/planos" onClick={closeMenu}>
                  Planos
                </Link>
              </Button>
            )}

            {showMobileLoginLink && (
              <Button asChild size="sm" variant="outline" className={outlineBtnMobile}>
                <Link to="/login" onClick={closeMenu}>
                  Fazer login
                  <User className="w-4 h-4 ml-1.5" strokeWidth={1.75} />
                </Link>
              </Button>
            )}

            {showMobileSignupLink && (
              <Button
                asChild
                size="sm"
                className="bg-gradient-brand hover:opacity-90 text-white border-0 rounded-full w-full"
              >
                <Link to="/signup" onClick={closeMenu}>
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
