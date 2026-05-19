import { useEffect, useState } from "react";
import { Link, NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { Bot, Calendar, CalendarCheck, LogOut, Menu, Settings, User, X } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export default function AppLayout() {
  const { signOut, user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);
  const [shop, setShop] = useState<{ display_name: string; avatar_url: string | null } | null>(null);

  useEffect(() => {
    if (!user) return;
    let active = true;
    (async () => {
      const { data } = await supabase
        .from("barbershops")
        .select("display_name, avatar_url")
        .eq("owner_id", user.id)
        .maybeSingle();
      if (active) setShop(data ?? null);
    })();
    const channel = supabase
      .channel(`shop:${user.id}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "barbershops", filter: `owner_id=eq.${user.id}` },
        (payload) => {
          const n = payload.new as { display_name: string; avatar_url: string | null };
          setShop({ display_name: n.display_name, avatar_url: n.avatar_url });
        },
      )
      .subscribe();
    return () => {
      active = false;
      supabase.removeChannel(channel);
    };
  }, [user]);

  useEffect(() => {
    if (!menuOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [menuOpen]);

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
        <Link to="/app/settings" className="min-w-0 flex-1 font-semibold text-sm truncate">
          {shop?.display_name ?? "Painel"}
        </Link>
        <Avatar className="h-8 w-8 shrink-0">
          {shop?.avatar_url && <AvatarImage src={shop.avatar_url} alt={shop.display_name} />}
          <AvatarFallback className="bg-primary text-primary-foreground text-xs">
            {(shop?.display_name ?? "SA").slice(0, 2).toUpperCase()}
          </AvatarFallback>
        </Avatar>
      </header>

      {menuOpen && (
        <div className="md:hidden fixed inset-0 z-50" role="dialog" aria-modal="true" aria-label="Menu do painel">
          <button type="button" className="absolute inset-0 bg-black/50" aria-label="Fechar menu" onClick={closeMenu} />
          <aside className="absolute inset-y-0 left-0 w-[min(100vw-3rem,280px)] bg-background border-r border-border shadow-xl flex flex-col">
            <div className="flex items-center justify-between gap-2 px-4 h-14 border-b border-border">
              <div className="flex items-center gap-2 min-w-0">
                <span className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center shrink-0">
                  <Bot className="w-4 h-4 text-white" />
                </span>
                <span className="font-semibold text-sm truncate">{shop?.display_name ?? "Painel"}</span>
              </div>
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
                label="Perfil"
                onNavigate={closeMenu}
              />
            </nav>

            <div className="p-3 border-t border-border space-y-2">
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
          <div className="flex items-center gap-2 px-4 py-4 border-b border-border/60">
            <span className="w-9 h-9 rounded-lg bg-primary flex items-center justify-center shrink-0 shadow-glow">
              <Bot className="w-4 h-4 text-white" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">Painel</p>
              <Link to="/app/settings" className="font-semibold truncate block text-sm hover:text-primary transition">
                {shop?.display_name ?? "Sua empresa"}
              </Link>
            </div>
          </div>

          <nav className="flex flex-col gap-1 p-2 flex-1">
            <DesktopNavItem to="/app/agendar" icon={<Calendar className="h-4 w-4" />} label="Agendar" end />
            <DesktopNavItem to="/app/agendamentos" icon={<CalendarCheck className="h-4 w-4" />} label="Agendamentos" />
            <DesktopNavItem to="/app/settings" icon={<Settings className="h-4 w-4" />} label="Configurações" />
            <DesktopNavItem to="/app/perfil" icon={<User className="h-4 w-4" />} label="Perfil" />
          </nav>

          <div className="flex flex-col gap-2 p-3 border-t border-border/60">
            <p className="text-xs text-muted-foreground truncate px-1">{user?.email}</p>
            <Button variant="outline" size="sm" className="w-full rounded-full" onClick={handleLogout}>
              <LogOut className="h-4 w-4" /> Sair
            </Button>
          </div>
        </div>
      </aside>

      <main className="flex-1 min-w-0 w-full overflow-x-hidden flex flex-col">
        <Outlet />
      </main>
    </div>
  );
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