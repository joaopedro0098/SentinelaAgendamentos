/** Espelha public.apply_mp_pass_fee_centavos (estimativa repasse MP). */
export function applyMpPassFeeCentavos(
  chargeCentavos: number,
  method: "card" | "pix",
  installments: number,
  passFeeCard: boolean,
  passFeePix: boolean,
): number {
  if (chargeCentavos <= 0) return 0;

  const inst = Math.max(installments, 1);
  let feeBps = 0;

  if (method === "pix" && passFeePix) {
    feeBps = 99;
  } else if (method === "card" && passFeeCard) {
    feeBps = 498;
    if (inst > 1) feeBps += (inst - 1) * 150;
  } else {
    return chargeCentavos;
  }

  return Math.round((chargeCentavos * (10000 + feeBps)) / 10000);
}

export function readMpBrickPaymentState(root: HTMLElement): {
  installments: number;
  method: "card" | "pix";
} {
  const pixTab =
    root.querySelector('[aria-selected="true"][id*="pix" i]') ??
    root.querySelector('[aria-selected="true"][class*="pix" i]') ??
    root.querySelector('[data-testid*="pix" i][aria-selected="true"]');

  if (pixTab) {
    return { installments: 1, method: "pix" };
  }

  const select =
    root.querySelector<HTMLSelectElement>('select[name*="installment" i]') ??
    root.querySelector<HTMLSelectElement>('select[id*="installment" i]') ??
    root.querySelector<HTMLSelectElement>('select[aria-label*="parcel" i]');

  if (!select) {
    return { installments: 1, method: "card" };
  }

  const parsed = parseInt(select.value, 10);
  return {
    installments: Number.isFinite(parsed) && parsed >= 1 ? parsed : 1,
    method: "card",
  };
}
