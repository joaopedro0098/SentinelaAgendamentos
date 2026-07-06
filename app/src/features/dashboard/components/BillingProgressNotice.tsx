import type { useSubscription } from "@/hooks/useSubscription";
import { accountUsesExternalPlan } from "@/lib/subscriptionMessages";

export function BillingProgressNotice({
  info,
  loading,
}: {
  info: ReturnType<typeof useSubscription>["info"];
  loading: boolean;
}) {
  if (loading || !info || info.is_admin || accountUsesExternalPlan(info)) return null;

  const trialNotice = getTrialNotice(info);
  const renewalNotice = getRenewalNotice(info);
  const notice = trialNotice ?? renewalNotice;
  if (!notice) return null;

  return (
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
