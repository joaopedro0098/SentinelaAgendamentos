export type PreapprovalRow = {
  id?: string;
  status?: string;
  init_point?: string;
  sandbox_init_point?: string;
  payer_email?: string;
};

export async function readJsonOrText(res: Response) {
  const text = await res.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return { message: text };
  }
}

export async function findLatestPreapproval(mpToken: string, shopId: string): Promise<PreapprovalRow | null> {
  const searchRes = await fetch(
    `https://api.mercadopago.com/preapproval/search?external_reference=${encodeURIComponent(shopId)}&sort=date_created&criteria=desc&limit=10`,
    { headers: { Authorization: `Bearer ${mpToken}` } },
  );
  const searchData = await searchRes.json();
  if (!searchRes.ok) return null;
  const results = (searchData.results ?? []) as PreapprovalRow[];
  return results[0] ?? null;
}

export async function getPreapproval(mpToken: string, id: string): Promise<PreapprovalRow | null> {
  const res = await fetch(`https://api.mercadopago.com/preapproval/${id}`, {
    headers: { Authorization: `Bearer ${mpToken}` },
  });
  const data = (await readJsonOrText(res)) as PreapprovalRow | null;
  if (!res.ok || !data) return null;
  return data;
}

export function resolvePreapprovalCheckoutUrl(preapproval: PreapprovalRow, mpToken: string) {
  const isTest = mpToken.startsWith("TEST-");
  if (isTest) {
    return preapproval.sandbox_init_point ?? preapproval.init_point ?? null;
  }
  return preapproval.init_point ?? preapproval.sandbox_init_point ?? null;
}

export async function cancelPreapproval(mpToken: string, id: string) {
  await fetch(`https://api.mercadopago.com/preapproval/${id}`, {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${mpToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ status: "cancelled" }),
  });
}

export function buildAutoRecurring(planAmount: number) {
  const end = new Date();
  end.setFullYear(end.getFullYear() + 5);

  return {
    frequency: 1,
    frequency_type: "months",
    end_date: end.toISOString(),
    transaction_amount: Number(planAmount.toFixed(2)),
    currency_id: "BRL",
  };
}

const PLAN_REASON = "Sentinela Agendamentos";

export async function ensurePreapprovalPlan(
  mpToken: string,
  planAmount: number,
  backUrl: string,
): Promise<string> {
  const envPlan = Deno.env.get("MP_PREAPPROVAL_PLAN_ID")?.trim();
  if (envPlan) return envPlan;

  const searchRes = await fetch(
    "https://api.mercadopago.com/preapproval_plan/search?status=active&limit=50",
    { headers: { Authorization: `Bearer ${mpToken}` } },
  );
  const searchData = await searchRes.json();
  if (searchRes.ok) {
    const results = (searchData.results ?? []) as Array<{
      id?: string;
      reason?: string;
      auto_recurring?: { transaction_amount?: number | string };
    }>;
    const amount = Number(planAmount.toFixed(2));
    const match = results.find((plan) => {
      if (plan.reason !== PLAN_REASON) return false;
      const planAmountValue = Number(plan.auto_recurring?.transaction_amount ?? 0);
      return Math.abs(planAmountValue - amount) < 0.01;
    });
    if (match?.id) return match.id;
  }

  const createRes = await fetch("https://api.mercadopago.com/preapproval_plan", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${mpToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      reason: PLAN_REASON,
      auto_recurring: buildAutoRecurring(planAmount),
      back_url: backUrl,
    }),
  });
  const plan = (await readJsonOrText(createRes)) as { id?: string; message?: string };
  if (!createRes.ok || !plan.id) {
    throw new Error(plan.message ?? "Não foi possível criar o plano de assinatura no Mercado Pago.");
  }

  return plan.id;
}
