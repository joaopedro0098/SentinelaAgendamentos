import { useEffect, useState } from "react";
import { Link, NavLink, Outlet, useNavigate } from "react-router-dom";
import { MessageSquare, Settings, LogOut, Scissors, Shield } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useIsAdmin } from "@/hooks/useIsAdmin";

export default function AppLayout() {
  const { signOut, user } = useAuth();
  const { isAdmin } = useIsAdmin();
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
    // Realtime: atualiza header quando o barbeiro salvar nova foto/nome
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
    return () => { active = false; supabase.removeChannel(channel); };
  }, [user]);

  async function handleLogout() {
    await signOut();
    navigate("/login", { replace: true });
  }

  return (
    <div className="min-h-screen bg-background flex flex-col md:flex-row">
      {/* Sidebar (desktop) / Topbar (mobile) */}
      <aside className="md:w-60 md:border-r border-b md:border-b-0 bg-card flex md:flex-col">
        <div className="flex items-center gap-2 px-4 py-3 md:py-5 border-b md:border-b border-border md:flex-none flex-1 md:flex-initial min-w-0">
          <Avatar className="h-9 w-9 shrink-0">
            {shop?.avatar_url && <AvatarImage src={shop.avatar_url} alt={shop.display_name} />}
            <AvatarFallback className="bg-primary text-primary-foreground rounded-lg">
              <Scissors className="h-4 w-4" />
            </AvatarFallback>
          </Avatar>
          <Link to="/app/settings" className="font-semibold truncate">
            {shop?.display_name ?? "Sua barbearia"}
          </Link>
        </div>
        <nav className="md:flex-1 flex md:flex-col gap-1 p-2">
          <NavItem to="/app" icon={<MessageSquare className="h-4 w-4" />} label="Conversas" end />
          <NavItem to="/app/settings" icon={<Settings className="h-4 w-4" />} label="Barbearia" />
          {isAdmin && <NavItem to="/admin" icon={<Shield className="h-4 w-4" />} label="Admin" />}
        </nav>
        <div className="hidden md:block p-3 border-t border-border">
          <p className="text-xs text-muted-foreground truncate mb-2">{user?.email}</p>
          <Button variant="outline" size="sm" className="w-full" onClick={handleLogout}>
            <LogOut className="h-4 w-4" /> Sair
          </Button>
        </div>
        <button
          onClick={handleLogout}
          className="md:hidden p-3 text-muted-foreground"
          aria-label="Sair"
        >
          <LogOut className="h-5 w-5" />
        </button>
      </aside>

      <main className="flex-1 min-w-0">
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
          "flex items-center gap-2 px-3 py-2 rounded-md text-sm font-medium transition flex-1 md:flex-initial justify-center md:justify-start",
          isActive ? "bg-secondary text-foreground" : "text-muted-foreground hover:bg-secondary/60",
        )
      }
    >
      {icon}
      <span>{label}</span>
    </NavLink>
  );
}
