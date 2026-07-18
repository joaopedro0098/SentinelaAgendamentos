import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Link, NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { BarChart2, Calendar, CalendarCheck, ChevronLeft, ChevronRight, Headphones, LogOut, Plug2, Settings, Shield, User, UserCog, Users, Wallet } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useSubscription } from "@/hooks/useSubscription";
import { useDashboardShop } from "@/providers/DashboardShopProvider";
import { WelcomeSupportRedirect } from "@/features/dashboard/components/WelcomeSupportRedirect";
import { PwaColdStartRedirect } from "@/features/dashboard/components/PwaColdStartRedirect";
import { MobileBottomNav } from "@/features/dashboard/components/MobileBottomNav";
import { usePendingPaymentExceptions } from "@/features/dashboard/hooks/usePendingPaymentExceptions";
import { useMediaMdUp } from "@/hooks/useMediaMdUp";
import { useAdminFailedWebhookJobsCount } from "@/hooks/useAdminFailedWebhookJobsCount";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

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
  const [sidebarCollapsed, setSidebarCollapsed] = useState(readSidebarCollapsed);
  useEffect(() => {
    if (!location.pathname.startsWith("/app/pacientes")) return;
    setSidebarCollapsed(true);
    writeSidebarCollapsed(true);
  }, [location.pathname]);

  async function handleLogout() {
    await signOut();
    navigate("/login", { replace: true });
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
    subscriptionInfo?.is_admin
    || subscriptionInfo?.can_view_payments_tab
    || subscriptionInfo?.can_use_appointment_payments
    || subscriptionInfo?.account_type === "ca"
    || subscriptionInfo?.is_aggregated_account,
  );
  const { pendingCount: pendingPaymentExceptions } = usePendingPaymentExceptions(showPagamentosNav);
  const showPagamentosAttention = pendingPaymentExceptions > 0;
  const showSuporteNav = subscriptionInfo != null && !subscriptionInfo.is_admin;
  const isDesktop = useMediaMdUp();
  const failedWebhookJobsCount = useAdminFailedWebhookJobsCount(Boolean(subscriptionInfo?.is_admin && isDesktop));
  const showAdminAttention = failedWebhookJobsCount > 0;

  return (
    <div className="min-h-screen flex flex-col md:flex-row md:h-screen md:overflow-hidden w-full max-w-[100vw] overflow-x-hidden">
      <PwaColdStartRedirect />
      <WelcomeSupportRedirect />

      <aside
        className={cn(
          "hidden md:flex shrink-0 self-start md:sticky md:top-0 md:h-screen transition-[width] duration-200 ease-out border-r border-border/60 flex-col bg-card",
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
            <DesktopNavItem collapsed={sidebarCollapsed} to="/app/connect" icon={<Plug2 className="h-5 w-5" />} label="Connect" />
            <DesktopNavItem collapsed={sidebarCollapsed} to="/app/settings" icon={<Settings className="h-5 w-5" />} label="Configurações" />
            <DesktopNavItem collapsed={sidebarCollapsed} to="/app/perfil" icon={<User className="h-5 w-5" />} label="Conta" />
            {showPagamentosNav && (
              <DesktopNavItem
                collapsed={sidebarCollapsed}
                to="/app/pagamentos"
                icon={<Wallet className="h-5 w-5" />}
                label="Pagamentos"
                showAttentionDot={showPagamentosAttention}
              />
            )}
            {subscriptionInfo?.is_admin && (
              <DesktopNavItem collapsed={sidebarCollapsed} to="/app/relatorios" icon={<BarChart2 className="h-5 w-5" />} label="Relatórios" />
            )}
            {subscriptionInfo?.is_admin && (
              <DesktopNavItem
                collapsed={sidebarCollapsed}
                to="/app/admin"
                icon={<Shield className="h-5 w-5" />}
                label="Admin"
                showAttentionDot={showAdminAttention}
              />
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
              <SidebarUserEmail email={user?.email} />
              <Button variant="outline" size="sm" className="w-full rounded-full" onClick={handleLogout}>
                <LogOut className="h-4 w-4" /> Sair
              </Button>
              <SidebarExpandToggle collapsed={sidebarCollapsed} onToggle={toggleSidebarCollapsed} />
            </div>
          )}
        </div>
      </aside>

      <main className="mobile-panel-main flex-1 min-w-0 min-h-0 w-full overflow-x-hidden overflow-y-auto flex flex-col pt-[env(safe-area-inset-top,0px)] pb-[calc(3.75rem+env(safe-area-inset-bottom,0px))] md:pt-0 md:pb-0">
        <Outlet />
      </main>

      <MobileBottomNav
        showPagamentosNav={showPagamentosNav}
        showPagamentosAttention={showPagamentosAttention}
        showSuporte={showSuporteNav}
        showAdmin={Boolean(subscriptionInfo?.is_admin)}
      />
    </div>
  );
}

function SidebarUserEmail({ email }: { email?: string | null }) {
  if (!email) return null;

  return (
    <Tooltip delayDuration={300}>
      <TooltipTrigger asChild>
        <p className="text-[11px] leading-snug text-muted-foreground truncate px-1 cursor-default select-none">
          {email}
        </p>
      </TooltipTrigger>
      <TooltipContent side="top" align="start" className="max-w-[min(18rem,80vw)] break-all text-xs">
        {email}
      </TooltipContent>
    </Tooltip>
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
        "flex w-full items-center rounded-xl py-2.5 font-medium text-accent transition-colors hover:bg-accent/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40",
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

function NavIconWithAttention({ icon, showAttentionDot }: { icon: ReactNode; showAttentionDot?: boolean }) {
  return (
    <span className="relative inline-flex shrink-0">
      {icon}
      {showAttentionDot && (
        <span
          className="absolute -top-0.5 -right-0.5 h-2 w-2 rounded-full bg-red-500 ring-2 ring-card"
          aria-hidden
        />
      )}
    </span>
  );
}

function DesktopNavItem({
  to,
  icon,
  label,
  end,
  collapsed,
  showAttentionDot,
}: {
  to: string;
  icon: ReactNode;
  label: string;
  end?: boolean;
  collapsed?: boolean;
  showAttentionDot?: boolean;
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
            ? "bg-accent text-accent-foreground shadow-sm"
            : "text-muted-foreground hover:bg-secondary/80 hover:text-foreground",
        )
      }
    >
      <NavIconWithAttention icon={icon} showAttentionDot={showAttentionDot} />
      {!collapsed && <span>{label}</span>}
    </NavLink>
  );
}
