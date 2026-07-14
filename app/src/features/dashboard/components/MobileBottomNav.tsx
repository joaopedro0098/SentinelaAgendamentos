import { useEffect, useMemo, useState, type ReactNode } from "react";
import { NavLink, useLocation } from "react-router-dom";
import {
  BarChart2,
  Calendar,
  CalendarCheck,
  Headphones,
  Settings,
  Shield,
  User,
  UserCog,
  Users,
  Wallet,
} from "lucide-react";
import { cn } from "@/lib/utils";

type Props = {
  showPagamentosNav: boolean;
  showPagamentosAttention: boolean;
  showSuporte: boolean;
  showAdmin: boolean;
};

type SecondaryItem = {
  to: string;
  icon: ReactNode;
  label: string;
  showAttentionDot?: boolean;
};

function TwoLineMenuIcon({ open }: { open: boolean }) {
  return (
    <span className="relative flex h-5 w-5 items-center justify-center" aria-hidden>
      <span
        className={cn(
          "absolute h-0.5 w-5 rounded-full bg-current transition-all duration-300 ease-out",
          open ? "rotate-45 translate-y-0" : "-translate-y-[5px]",
        )}
      />
      <span
        className={cn(
          "absolute h-0.5 w-5 rounded-full bg-current transition-all duration-300 ease-out",
          open ? "-rotate-45 translate-y-0" : "translate-y-[5px]",
        )}
      />
    </span>
  );
}

function NavIconWithAttention({ icon, showAttentionDot }: { icon: ReactNode; showAttentionDot?: boolean }) {
  return (
    <span className="relative inline-flex shrink-0">
      {icon}
      {showAttentionDot && (
        <span
          className="absolute -top-0.5 -right-0.5 h-2 w-2 rounded-full bg-red-500 ring-2 ring-background"
          aria-hidden
        />
      )}
    </span>
  );
}

function BottomNavLink({
  to,
  icon,
  label,
  end,
  onNavigate,
  showAttentionDot,
}: {
  to: string;
  icon: ReactNode;
  label: string;
  end?: boolean;
  onNavigate?: () => void;
  showAttentionDot?: boolean;
}) {
  return (
    <NavLink
      to={to}
      end={end}
      aria-label={label}
      title={label}
      onClick={onNavigate}
      className={({ isActive }) =>
        cn(
          "flex flex-1 items-center justify-center py-2.5 transition-colors",
          isActive ? "text-accent" : "text-muted-foreground hover:text-foreground",
        )
      }
    >
      <NavIconWithAttention icon={icon} showAttentionDot={showAttentionDot} />
    </NavLink>
  );
}

function FloatingNavLink({
  to,
  icon,
  label,
  onNavigate,
  showAttentionDot,
}: {
  to: string;
  icon: ReactNode;
  label: string;
  onNavigate: () => void;
  showAttentionDot?: boolean;
}) {
  return (
    <NavLink
      to={to}
      aria-label={label}
      title={label}
      onClick={onNavigate}
      className={({ isActive }) =>
        cn(
          "flex h-11 w-11 items-center justify-center rounded-xl transition-colors",
          isActive
            ? "bg-accent text-accent-foreground shadow-sm"
            : "text-muted-foreground hover:bg-secondary/80 hover:text-foreground",
        )
      }
    >
      <NavIconWithAttention icon={icon} showAttentionDot={showAttentionDot} />
    </NavLink>
  );
}

export function MobileBottomNav({ showPagamentosNav, showPagamentosAttention, showSuporte, showAdmin }: Props) {
  const location = useLocation();
  const [moreOpen, setMoreOpen] = useState(false);
  const [moreMounted, setMoreMounted] = useState(false);
  const [moreEntered, setMoreEntered] = useState(false);

  const secondaryItems = useMemo(() => {
    const items: SecondaryItem[] = [
      { to: "/app/profissionais", icon: <UserCog className="h-5 w-5" />, label: "Profissionais" },
      { to: "/app/settings", icon: <Settings className="h-5 w-5" />, label: "Configurações" },
      { to: "/app/perfil", icon: <User className="h-5 w-5" />, label: "Conta" },
    ];

    if (showPagamentosNav) {
      items.push({
        to: "/app/pagamentos",
        icon: <Wallet className="h-5 w-5" />,
        label: "Pagamentos",
        showAttentionDot: showPagamentosAttention,
      });
    }

    items.push({ to: "/app/relatorios", icon: <BarChart2 className="h-5 w-5" />, label: "Relatórios" });

    if (showSuporte) {
      items.push({ to: "/app/suporte", icon: <Headphones className="h-5 w-5" />, label: "Suporte" });
    }

    if (showAdmin) {
      items.push({ to: "/app/admin", icon: <Shield className="h-5 w-5" />, label: "Admin" });
    }

    return items;
  }, [showAdmin, showPagamentosAttention, showPagamentosNav, showSuporte]);

  useEffect(() => {
    setMoreOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    if (moreOpen) {
      setMoreMounted(true);
      return;
    }
    setMoreEntered(false);
    const timer = window.setTimeout(() => setMoreMounted(false), 300);
    return () => window.clearTimeout(timer);
  }, [moreOpen]);

  useEffect(() => {
    if (!moreMounted || !moreOpen) return;
    const frame = window.requestAnimationFrame(() => setMoreEntered(true));
    return () => window.cancelAnimationFrame(frame);
  }, [moreMounted, moreOpen]);

  useEffect(() => {
    if (!moreOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [moreOpen]);

  const closeMore = () => setMoreOpen(false);
  const toggleMore = () => setMoreOpen((open) => !open);

  return (
    <>
      {moreMounted && (
        <button
          type="button"
          className={cn(
            "md:hidden fixed inset-0 z-40 bg-black/40 transition-opacity duration-300 ease-out",
            moreEntered ? "opacity-100" : "opacity-0",
          )}
          aria-label="Fechar menu"
          onClick={closeMore}
        />
      )}

      {moreMounted && (
        <nav
          aria-label="Menu expandido"
          className={cn(
            "md:hidden fixed z-50 flex flex-col gap-1 rounded-2xl border border-border bg-background/95 p-1.5 shadow-xl backdrop-blur transition-transform duration-300 ease-out",
            moreEntered ? "translate-x-0 opacity-100" : "translate-x-[110%] opacity-0",
          )}
          style={{
            right: "5px",
            bottom: "calc(3.75rem + env(safe-area-inset-bottom, 0px) + 8px)",
          }}
        >
          {secondaryItems.map((item) => (
            <FloatingNavLink
              key={item.to}
              to={item.to}
              icon={item.icon}
              label={item.label}
              showAttentionDot={item.showAttentionDot}
              onNavigate={closeMore}
            />
          ))}
        </nav>
      )}

      <div
        className="md:hidden fixed inset-x-0 bottom-0 z-50 border-t border-border bg-background/95 backdrop-blur"
        style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}
      >
        <nav className="flex items-stretch px-1" aria-label="Navegação principal">
          <BottomNavLink
            to="/app/pacientes"
            icon={<Users className="h-5 w-5" />}
            label="Pacientes"
            onNavigate={closeMore}
          />
          <BottomNavLink
            to="/app/agendar"
            icon={<Calendar className="h-5 w-5" />}
            label="Agendar"
            end
            onNavigate={closeMore}
          />
          <BottomNavLink
            to="/app/agendamentos"
            icon={<CalendarCheck className="h-5 w-5" />}
            label="Agendamentos"
            onNavigate={closeMore}
          />
          <button
            type="button"
            aria-label={moreOpen ? "Fechar menu" : "Abrir menu"}
            aria-expanded={moreOpen}
            onClick={toggleMore}
            className={cn(
              "flex flex-1 items-center justify-center py-2.5 transition-colors",
              moreOpen ? "text-accent" : "text-muted-foreground hover:text-foreground",
            )}
          >
            <TwoLineMenuIcon open={moreOpen} />
          </button>
        </nav>
      </div>
    </>
  );
}
