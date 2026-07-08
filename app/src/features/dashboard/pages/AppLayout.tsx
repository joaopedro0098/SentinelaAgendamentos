import { useEffect, useMemo, useRef, useState } from "react";
import { Link, NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { BarChart2, Calendar, CalendarCheck, ChevronLeft, ChevronRight, Headphones, LogOut, Menu, Settings, Shield, User, UserCog, Users, Wallet, X } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useSubscription } from "@/hooks/useSubscription";
import { accountUsesExternalPlan } from "@/lib/subscriptionMessages";
import { useDashboardShop } from "@/providers/DashboardShopProvider";
import { PwaInstallButton } from "@/components/pwa/PwaInstallButton";
import { useBarberPushRegistration } from "@/hooks/useBarberPushRegistration";
import { WelcomeSupportRedirect } from "@/features/dashboard/components/WelcomeSupportRedirect";
import { PwaColdStartRedirect } from "@/features/dashboard/components/PwaColdStartRedirect";

const SIDEBAR_COLLAPSED_KEY = "sentinela:panel-sidebar-collapsed";

function readSidebarCollapsed() {
  try {
    const value = localStorage.getItem(SIDEBAR_COLLAPSED_KEY);
    if (value === null) return true;
    return value === "1";
  } catch {
    return true;
  }
}

function writeSidebarCollapsed(collapsed: boolean) {
  try {
    localStorage.setItem(SIDEBAR_COLLAPSED_KEY, collapsed ? "1" : "0");
  } catch {
    /* ignore */
  }
}

export default function AppLayout() {
  const { signOut, user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const { info: subscriptionInfo } = useSubscription();
  const { shop } = useDashboardShop();
  const [menuOpen, setMenuOpen] = useState(false);
  const [menuMounted, setMenuMounted] = useState(false);
  const [menuEntered, setMenuEntered] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(readSidebarCollapsed);
  const prevPanelPathRef = useRef(location.pathname);

  useBarberPushRegistration();

  useEffect(() => {
    if (menuOpen) {
      setMenuMounted(true);
      return;
    }
    setMenuEntered(false);
    const timer = window.setTimeout(() => setMenuMounted(false), 200);
    return () => window.clearTimeout(timer);
  }, [menuOpen]);

  useEffect(() => {
    if (!menuMounted || !menuOpen) return;
    const frame = window.requestAnimationFrame(() => setMenuEntered(true));
    return () => window.cancelAnimationFrame(frame);
  }, [menuMounted, menuOpen]);

  useEffect(() => {
    if (!menuMounted) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [menuMounted]);

  useEffect(() => {
    setMenuOpen(false);

    if (prevPanelPathRef.current === location.pathname) return;
    prevPanelPathRef.current = location.pathname;

    setSidebarCollapsed((prev) => {
      if (prev) return prev;
      writeSidebarCollapsed(true);
      return true;
    });
  }, [location.pathname]);

  async function handleLogout() {
    setMenuOpen(false);
    await signOut();
    navigate("/login", { replace: true });
  }

  function closeMenu() {
    setMenuOpen(false);
  }

  function toggleSidebarCollapsed() {
    setSidebarCollapsed((prev) => {
      const next = !prev;
      writeSidebarCollapsed(next);
      return next;
    });
  }

  const panelBrandShop = useMemo(() => {
    if (!shop) return null;
    if (subscriptionInfo?.account_type !== "ca") {
      return { display_name: shop.display_name, avatar_url: shop.avatar_url };
    }
    return {
      display_name: subscriptionInfo.owner_display_name ?? shop.display_name,
      avatar_url: subscriptionInfo.owner_avatar_url ?? shop.avatar_url,
    };
  }, [shop, subscriptionInfo]);

  const showPagamentosNav = Boolean(
    subscriptionInfo?.is_admin ||
      (subscriptionInfo != null && !accountUsesExternalPlan(subscriptionInfo)),
  );

  return (
    <div className="min-h-screen flex flex-col md:flex-row md:h-screen md:overflow-hidden w-full max-w-[100vw] overflow-x-hidden">
      <PwaColdStartRedirect />
      <WelcomeSupportRedirect />
      <header className="md:hidden sticky top-0 z-30 flex items-center gap-3 px-4 h-14 border-b border-border bg-background/95 backdrop-blur shrink-0">
        <button
          type="button"
          onClick={() => setMenuOpen(true)}
          className="p-2 -ml-2 rounded-lg text-foreground hover:bg-secondary/80"
          aria-label="Abrir menu"
        >
          <Menu className="h-5 w-5" />
        </button>
        <div className="flex-1 min-w-0" />
      </header>

      {menuMounted && (
        <div className="md:hidden fixed inset-0 z-50" role="dialog" aria-modal="true" aria-label="Menu do painel">
          <button
            type="button"
            className={cn(
              "absolute inset-0 bg-black/50 transition-opacity duration-200 ease-out",
              menuEntered ? "opacity-100" : "opacity-0",
            )}
            aria-label="Fechar menu"
            onClick={closeMenu}
          />
          <aside
            className={cn(
              "absolute inset-y-0 left-0 w-[min(100vw-3rem,280px)] bg-background border-r border-border shadow-xl flex flex-col min-h-0 transition-transform duration-200 ease-out",
              menuEntered ? "translate-x-0" : "-translate-x-full",
            )}
          >
            <div className="flex items-center justify-between gap-2 px-4 min-h-14 py-3 border-b border-border shrink-0">
              <ShopPanelBrand shop={panelBrandShop} avatarClassName="h-9 w-9" />
              <button
                type="button"
                onClick={closeMenu}
                className="p-2 rounded-lg text-muted-foreground hover:bg-secondary/80"
                aria-label="Fechar menu"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <nav className="flex flex-col gap-1 p-3 flex-1 min-h-0 overflow-y-auto overscroll-contain">
              <MobileNavItem to="/app/agendar" icon={<Calendar className="h-4 w-4" />} label="Agendar" end onNavigate={closeMenu} />
              <MobileNavItem
                to="/app/agendamentos"
                icon={<CalendarCheck className="h-4 w-4" />}
                label="Agendamentos"
                onNavigate={closeMenu}
              />
              <MobileNavItem
                to="/app/pacientes"
                icon={<Users className="h-4 w-4" />}
                label="Pacientes"
                onNavigate={closeMenu}
              />
              <MobileNavItem
                to="/app/profissionais"
                icon={<UserCog className="h-4 w-4" />}
                label="Profissionais"
                onNavigate={closeMenu}
              />
              <MobileNavItem
                to="/app/settings"
                icon={<Settings className="h-4 w-4" />}
                label="Configurações"
                onNavigate={closeMenu}
              />
              <MobileNavItem
                to="/app/perfil"
                icon={<User className="h-4 w-4" />}
                label="Conta"
                onNavigate={closeMenu}
              />
              {showPagamentosNav && (
                <MobileNavItem
                  to="/app/pagamentos"
                  icon={<Wallet className="h-4 w-4" />}
                  label="Pagamentos"
                  onNavigate={closeMenu}
                />
              )}
              {subscriptionInfo?.is_admin && (
                <MobileNavItem
                  to="/app/relatorios"
                  icon={<BarChart2 className="h-4 w-4" />}
                  label="Relatórios"
                  onNavigate={closeMenu}
                />
              )}
              {subscriptionInfo?.is_admin && (
                <MobileNavItem
                  to="/app/admin"
                  icon={<Shield className="h-4 w-4" />}
                  label="Admin"
                  onNavigate={closeMenu}
                />
              )}
              {subscriptionInfo != null && !subscriptionInfo.is_admin && (
                <MobileNavItem
                  to="/app/relatorios"
                  icon={<BarChart2 className="h-4 w-4" />}
                  label="Relatórios"
                  onNavigate={closeMenu}
                />
              )}
              {subscriptionInfo != null && !subscriptionInfo.is_admin && (
                <MobileNavItem
                  to="/app/suporte"
                  icon={<Headphones className="h-4 w-4" />}
                  label="Suporte"
                  onNavigate={closeMenu}
                />
              )}
            </nav>

            <div className="mt-auto shrink-0 p-3 border-t border-border space-y-2">
              <PwaInstallButton
                label="Instalar"
                helpVariant="app"
                buttonClassName="w-full bg-gradient-brand hover:opacity-90 text-white border-0 shadow-glow"
                variant="default"
              />
              <p className="text-xs text-muted-foreground truncate px-1">{user?.email}</p>
              <Button variant="outline" size="sm" className="w-full rounded-full" onClick={handleLogout}>
                <LogOut className="h-4 w-4" /> Sair
              </Button>
            </div>
          </aside>
        </div>
      )}

      <aside
        className={cn(
          "hidden md:flex shrink-0 self-start md:sticky md:top-0 md:h-screen transition-[width] duration-200 ease-out border-r border-border/60 flex-col bg-background",
          sidebarCollapsed ? "w-16" : "w-56",
        )}
      >
        <div className="flex flex-col flex-1 min-h-0 h-full w-full overflow-hidden">
          {!sidebarCollapsed && (
            <div className="px-3 py-4 shrink-0">
              <ShopPanelBrand shop={panelBrandShop} avatarClassName="h-12 w-12" />
            </div>
          )}

          <nav
            className={cn(
              "flex flex-col gap-1 flex-1 min-h-0 overflow-y-auto overscroll-contain [scrollbar-width:none] [&::-webkit-scrollbar]:hidden",
              sidebarCollapsed ? "p-1 pt-3" : "p-2",
            )}
          >
            <DesktopNavItem collapsed={sidebarCollapsed} to="/app/agendar" icon={<Calendar className="h-5 w-5" />} label="Agendar" end />
            <DesktopNavItem collapsed={sidebarCollapsed} to="/app/agendamentos" icon={<CalendarCheck className="h-5 w-5" />} label="Agendamentos" />
            <DesktopNavItem collapsed={sidebarCollapsed} to="/app/pacientes" icon={<Users className="h-5 w-5" />} label="Pacientes" />
            <DesktopNavItem collapsed={sidebarCollapsed} to="/app/profissionais" icon={<UserCog className="h-5 w-5" />} label="Profissionais" />
            <DesktopNavItem collapsed={sidebarCollapsed} to="/app/settings" icon={<Settings className="h-5 w-5" />} label="Configurações" />
            <DesktopNavItem collapsed={sidebarCollapsed} to="/app/perfil" icon={<User className="h-5 w-5" />} label="Conta" />
            {showPagamentosNav && (
              <DesktopNavItem collapsed={sidebarCollapsed} to="/app/pagamentos" icon={<Wallet className="h-5 w-5" />} label="Pagamentos" />
            )}
            {subscriptionInfo?.is_admin && (
              <DesktopNavItem collapsed={sidebarCollapsed} to="/app/relatorios" icon={<BarChart2 className="h-5 w-5" />} label="Relatórios" />
            )}
            {subscriptionInfo?.is_admin && (
              <DesktopNavItem collapsed={sidebarCollapsed} to="/app/admin" icon={<Shield className="h-5 w-5" />} label="Admin" />
            )}
            {subscriptionInfo != null && !subscriptionInfo.is_admin && (
              <DesktopNavItem collapsed={sidebarCollapsed} to="/app/relatorios" icon={<BarChart2 className="h-5 w-5" />} label="Relatórios" />
            )}
            {subscriptionInfo != null && !subscriptionInfo.is_admin && (
              <DesktopNavItem collapsed={sidebarCollapsed} to="/app/suporte" icon={<Headphones className="h-5 w-5" />} label="Suporte" />
            )}
          </nav>

          {sidebarCollapsed ? (
            <div className="mt-auto shrink-0 p-1">
              <SidebarExpandToggle collapsed={sidebarCollapsed} onToggle={toggleSidebarCollapsed} />
            </div>
          ) : (
            <div className="mt-auto shrink-0 flex flex-col gap-2 p-3">
              <PwaInstallButton
                label="Instalar"
                helpVariant="app"
                buttonClassName="w-full bg-gradient-brand hover:opacity-90 text-white border-0 shadow-glow"
                variant="default"
              />
              <p className="text-xs text-muted-foreground truncate px-1">{user?.email}</p>
              <Button variant="outline" size="sm" className="w-full rounded-full" onClick={handleLogout}>
                <LogOut className="h-4 w-4" /> Sair
              </Button>
              <SidebarExpandToggle collapsed={sidebarCollapsed} onToggle={toggleSidebarCollapsed} />
            </div>
          )}
        </div>
      </aside>

      <main className="flex-1 min-w-0 min-h-0 w-full overflow-x-hidden overflow-y-auto flex flex-col">
        <Outlet />
      </main>
    </div>
  );
}

function SidebarExpandToggle({
  collapsed,
  onToggle,
}: {
  collapsed: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      title={collapsed ? "Expandir menu" : "Recolher menu"}
      aria-label={collapsed ? "Expandir menu" : "Recolher menu"}
      className={cn(
        "flex w-full items-center rounded-xl py-2.5 font-medium text-primary transition-colors hover:bg-primary/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40",
        collapsed ? "justify-center" : "justify-center gap-2 px-2 text-sm",
      )}
    >
      {collapsed ? (
        <ChevronRight className="h-6 w-6 shrink-0" strokeWidth={2.75} />
      ) : (
        <>
          <span>Recolher menu</span>
          <ChevronLeft className="h-5 w-5 shrink-0" strokeWidth={2.5} />
        </>
      )}
    </button>
  );
}

function ShopPanelBrand({
  shop,
  avatarClassName,
}: {
  shop: { display_name: string; avatar_url: string | null } | null;
  avatarClassName: string;
}) {
  const displayName = shop?.display_name?.trim() || "Sua empresa";
  return (
    <Link to="/app/settings" className="flex items-center gap-2.5 min-w-0 flex-1 hover:opacity-90 transition-opacity">
      <Avatar className={cn("shrink-0", avatarClassName)}>
        {shop?.avatar_url && <AvatarImage src={shop.avatar_url} alt={displayName} />}
        <AvatarFallback className="bg-primary text-primary-foreground text-xs">
          {displayName.slice(0, 2).toUpperCase()}
        </AvatarFallback>
      </Avatar>
      <div className="min-w-0 flex-1">
        <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium leading-none">Painel</p>
        <p className="mt-1 font-semibold text-base text-foreground truncate leading-tight">{displayName}</p>
      </div>
    </Link>
  );
}

function DesktopNavItem({
  to,
  icon,
  label,
  end,
  collapsed,
}: {
  to: string;
  icon: React.ReactNode;
  label: string;
  end?: boolean;
  collapsed?: boolean;
}) {
  return (
    <NavLink
      to={to}
      end={end}
      title={collapsed ? label : undefined}
      className={({ isActive }) =>
        cn(
          "flex items-center rounded-xl text-sm font-medium transition",
          collapsed ? "justify-center px-1.5 py-2.5" : "gap-2 px-2.5 py-2.5 justify-start",
          isActive
            ? "bg-primary text-primary-foreground shadow-glow"
            : "text-muted-foreground hover:bg-secondary/80 hover:text-foreground",
        )
      }
    >
      {icon}
      {!collapsed && <span>{label}</span>}
    </NavLink>
  );
}

function MobileNavItem({
  to,
  icon,
  label,
  end,
  onNavigate,
}: {
  to: string;
  icon: React.ReactNode;
  label: string;
  end?: boolean;
  onNavigate: () => void;
}) {
  return (
    <NavLink
      to={to}
      end={end}
      onClick={onNavigate}
      className={({ isActive }) =>
        cn(
          "flex items-center gap-3 px-4 py-3 rounded-xl text-base font-medium transition",
          isActive
            ? "bg-primary text-primary-foreground shadow-glow"
            : "text-muted-foreground hover:bg-secondary/80 hover:text-foreground",
        )
      }
    >
      {icon}
      <span>{label}</span>
    </NavLink>
  );
}