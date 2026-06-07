import { useEffect, useState } from "react";
import { Link, NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { Calendar, CalendarCheck, Headphones, LogOut, Menu, Settings, Shield, User, X } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useSubscription } from "@/hooks/useSubscription";
import { useDashboardShop } from "@/providers/DashboardShopProvider";
import { PwaInstallButton } from "@/components/pwa/PwaInstallButton";
import { useBarberPushRegistration } from "@/hooks/useBarberPushRegistration";

export default function AppLayout() {
  const { signOut, user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const { info: subscriptionInfo, loading: subscriptionLoading } = useSubscription();
  const { shop } = useDashboardShop();
  const [menuOpen, setMenuOpen] = useState(false);
  const [menuMounted, setMenuMounted] = useState(false);
  const [menuEntered, setMenuEntered] = useState(false);

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
  }, [location.pathname]);

  async function handleLogout() {
    setMenuOpen(false);
    await signOut();
    navigate("/login", { replace: true });
  }

  function closeMenu() {
    setMenuOpen(false);
  }

  return (
    <div className="min-h-screen flex flex-col md:flex-row w-full max-w-[100vw] overflow-x-hidden">
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
              "absolute inset-y-0 left-0 w-[min(100vw-3rem,280px)] bg-background border-r border-border shadow-xl flex flex-col transition-transform duration-200 ease-out",
              menuEntered ? "translate-x-0" : "-translate-x-full",
            )}
          >
            <div className="flex items-center justify-between gap-2 px-4 min-h-14 py-3 border-b border-border">
              <ShopPanelBrand
                shop={shop ? { display_name: shop.display_name, avatar_url: shop.avatar_url } : null}
                avatarClassName="h-9 w-9"
              />
              <button
                type="button"
                onClick={closeMenu}
                className="p-2 rounded-lg text-muted-foreground hover:bg-secondary/80"
                aria-label="Fechar menu"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <nav className="flex flex-col gap-1 p-3 flex-1">
              <MobileNavItem to="/app/agendar" icon={<Calendar className="h-4 w-4" />} label="Agendar" end onNavigate={closeMenu} />
              <MobileNavItem
                to="/app/agendamentos"
                icon={<CalendarCheck className="h-4 w-4" />}
                label="Agendamentos"
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
              {subscriptionInfo != null && !subscriptionInfo.is_admin && (
                <MobileNavItem
                  to="/app/suporte"
                  icon={<Headphones className="h-4 w-4" />}
                  label="Suporte"
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
            </nav>

            <div className="p-3 border-t border-border space-y-2">
              <PwaInstallButton
                label="Instalar"
                helpPresentation="dialog"
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

      <aside className="hidden md:flex md:w-64 border-r border-border shrink-0">
        <div className="glass-panel m-3 rounded-2xl flex flex-col flex-1 overflow-hidden w-full">
          <div className="px-4 py-4 border-b border-border/60">
            <ShopPanelBrand
              shop={shop ? { display_name: shop.display_name, avatar_url: shop.avatar_url } : null}
              avatarClassName="h-12 w-12"
            />
          </div>

          <nav className="flex flex-col gap-1 p-2 flex-1">
            <DesktopNavItem to="/app/agendar" icon={<Calendar className="h-4 w-4" />} label="Agendar" end />
            <DesktopNavItem to="/app/agendamentos" icon={<CalendarCheck className="h-4 w-4" />} label="Agendamentos" />
            <DesktopNavItem to="/app/settings" icon={<Settings className="h-4 w-4" />} label="Configurações" />
            <DesktopNavItem to="/app/perfil" icon={<User className="h-4 w-4" />} label="Conta" />
            {subscriptionInfo != null && !subscriptionInfo.is_admin && (
              <DesktopNavItem to="/app/suporte" icon={<Headphones className="h-4 w-4" />} label="Suporte" />
            )}
            {subscriptionInfo?.is_admin && (
              <DesktopNavItem to="/app/admin" icon={<Shield className="h-4 w-4" />} label="Admin" />
            )}
          </nav>

          <div className="flex flex-col gap-2 p-3 border-t border-border/60">
            <PwaInstallButton
              label="Instalar"
              helpPresentation="dialog"
              buttonClassName="w-full bg-gradient-brand hover:opacity-90 text-white border-0 shadow-glow"
              variant="default"
            />
            <p className="text-xs text-muted-foreground truncate px-1">{user?.email}</p>
            <Button variant="outline" size="sm" className="w-full rounded-full" onClick={handleLogout}>
              <LogOut className="h-4 w-4" /> Sair
            </Button>
          </div>
        </div>
      </aside>

      <main className="flex-1 min-w-0 w-full overflow-x-hidden flex flex-col">
        <BillingProgressNotice info={subscriptionInfo} loading={subscriptionLoading} />
        <Outlet />
      </main>
    </div>
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

function BillingProgressNotice({
  info,
  loading,
}: {
  info: ReturnType<typeof useSubscription>["info"];
  loading: boolean;
}) {
  if (loading || !info || info.is_admin || info.is_aggregated_account) return null;

  const trialNotice = getTrialNotice(info);
  const renewalNotice = getRenewalNotice(info);
  const notice = trialNotice ?? renewalNotice;
  if (!notice) return null;

  return (
    <div className="px-4 pt-4 md:px-8 md:pt-6">
      <div className="rounded-2xl border border-border/70 bg-card/80 p-3 shadow-sm">
        <div className="flex items-center justify-between gap-3 text-xs font-medium">
          <span className="text-muted-foreground">{notice.label}</span>
          <span className="text-foreground">{notice.countLabel}</span>
        </div>
        <div className="mt-2 h-2 overflow-hidden rounded-full bg-secondary">
          <div
            className="h-full rounded-full bg-gradient-brand transition-all"
            style={{ width: `${notice.progress}%` }}
            aria-hidden="true"
          />
        </div>
        <p className="mt-2 text-xs text-muted-foreground">{notice.message}</p>
      </div>
    </div>
  );
}

function getTrialNotice(info: ReturnType<typeof useSubscription>["info"]) {
  if (!info || info.subscription_status !== "trial") return null;

  const daysLeft = Math.max(0, Math.min(14, info.trial_days_left ?? 0));
  const currentDay = Math.max(1, Math.min(14, 15 - daysLeft));

  return {
    label: "Teste grátis",
    countLabel: `${currentDay}/14`,
    progress: Math.round((currentDay / 14) * 100),
    message:
      daysLeft > 0
        ? `${daysLeft} dia${daysLeft === 1 ? "" : "s"} restante${daysLeft === 1 ? "" : "s"} do seu teste.`
        : 'Assine na aba "Conta" para fazer novos agendamentos.',
  };
}

function getRenewalNotice(info: ReturnType<typeof useSubscription>["info"]) {
  if (!info || info.subscription_status !== "active" || !info.current_period_end) return null;

  const overdueDays = daysBetween(dateOnly(info.current_period_end), todayOnly());
  if (overdueDays < 1 || overdueDays > 3) return null;

  return {
    label: "Renovação pendente",
    countLabel: `30+${overdueDays}`,
    progress: Math.round((overdueDays / 3) * 100),
    message: 'Renove a assinatura na aba "Conta" para fazer novos agendamentos.',
  };
}

function todayOnly() {
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  return date;
}

function dateOnly(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year, (month || 1) - 1, day || 1);
}

function daysBetween(from: Date, to: Date) {
  const msPerDay = 24 * 60 * 60 * 1000;
  return Math.floor((to.getTime() - from.getTime()) / msPerDay);
}

function DesktopNavItem({ to, icon, label, end }: { to: string; icon: React.ReactNode; label: string; end?: boolean }) {
  return (
    <NavLink
      to={to}
      end={end}
      className={({ isActive }) =>
        cn(
          "flex items-center gap-2 px-3 py-2.5 rounded-xl text-sm font-medium transition justify-start",
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