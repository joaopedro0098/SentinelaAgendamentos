import { useEffect, useState } from "react";
import { Link, NavLink, Outlet, useNavigate } from "react-router-dom";
import { Bot, Calendar, CalendarCheck, LogOut, Settings } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { DashboardThemeToggle } from "@/components/theme/DashboardThemeToggle";
export default function AppLayout() {
  const { signOut, user } = useAuth();
  const navigate = useNavigate();
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

  async function handleLogout() {
    await signOut();
    navigate("/login", { replace: true });
  }

  return (
    <div className="min-h-screen flex flex-col md:flex-row">
      <aside className="md:w-64 border-b md:border-b-0 md:border-r border-border flex md:flex-col shrink-0">
        <div className="glass-panel md:m-3 md:rounded-2xl flex md:flex-col flex-1 md:overflow-hidden">
          <div className="flex items-center gap-2 px-4 py-3 md:py-4 border-b border-border/60">
            <span className="w-9 h-9 rounded-lg bg-primary flex items-center justify-center shrink-0 shadow-glow">
              <Bot className="w-4 h-4 text-white" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">Painel</p>
              <Link to="/app/settings" className="font-semibold truncate block text-sm hover:text-primary transition">
                {shop?.display_name ?? "Sua empresa"}
              </Link>
            </div>
            <Avatar className="h-9 w-9 shrink-0 md:hidden">
              {shop?.avatar_url && <AvatarImage src={shop.avatar_url} alt={shop.display_name} />}
              <AvatarFallback className="bg-primary text-primary-foreground text-xs">
                {(shop?.display_name ?? "SA").slice(0, 2).toUpperCase()}
              </AvatarFallback>
            </Avatar>
          </div>

          <nav className="flex md:flex-col gap-1 p-2 md:flex-1">
            <NavItem to="/app/agendar" icon={<Calendar className="h-4 w-4" />} label="Agendar" end />
            <NavItem to="/app/agendamentos" icon={<CalendarCheck className="h-4 w-4" />} label="Agendamentos" />
            <NavItem to="/app/settings" icon={<Settings className="h-4 w-4" />} label="Configurações" />
          </nav>

          <div className="hidden md:flex flex-col gap-2 p-3 border-t border-border/60">
            <p className="text-xs text-muted-foreground truncate px-1">{user?.email}</p>
            <Button variant="outline" size="sm" className="w-full rounded-full" onClick={handleLogout}>
              <LogOut className="h-4 w-4" /> Sair
            </Button>
          </div>

          <div className="md:hidden flex items-center justify-end gap-2 p-2 border-t border-border/60">
            <button type="button" onClick={handleLogout} className="p-2 text-muted-foreground" aria-label="Sair">
              <LogOut className="h-5 w-5" />
            </button>
          </div>
        </div>
      </aside>

      <main className="relative flex-1 min-w-0 flex flex-col">
        <div className="absolute top-4 right-4 z-20">
          <DashboardThemeToggle />
        </div>
        <Outlet />
      </main>
    </div>
  );
}

function NavItem({ to, icon, label, end }: { to: string; icon: React.ReactNode; label: string; end?: boolean }) {
  return (
    <NavLink
      to={to}
      end={end}
      className={({ isActive }) =>
        cn(
          "flex items-center gap-2 px-3 py-2.5 rounded-xl text-sm font-medium transition flex-1 md:flex-initial justify-center md:justify-start",
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
