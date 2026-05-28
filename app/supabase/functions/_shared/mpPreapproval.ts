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
  const start = new Date();
  start.setHours(start.getHours() + 1);

  const end = new Date();
  end.setFullYear(end.getFullYear() + 5);

  return {
    frequency: 1,
    frequency_type: "months",
    start_date: start.toISOString(),
    end_date: end.toISOString(),
    transaction_amount: Number(planAmount.toFixed(2)),
    currency_id: "BRL",
  };
}
