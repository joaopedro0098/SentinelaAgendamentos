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

function collectRootsDeep(root: ParentNode): ParentNode[] {
  const roots: ParentNode[] = [root];
  if (!(root instanceof HTMLElement)) return roots;

  root.querySelectorAll("iframe").forEach((iframe) => {
    try {
      const doc = iframe.contentDocument;
      if (doc?.body) roots.push(...collectRootsDeep(doc.body));
    } catch {
      /* iframe cross-origin */
    }
  });

  return roots;
}

function parseInstallmentCount(raw: string): number | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;

  const fromLabel = trimmed.match(/(\d+)\s*x/i);
  if (fromLabel) {
    const n = parseInt(fromLabel[1], 10);
    if (Number.isFinite(n) && n >= 1 && n <= 12) return n;
  }

  if (/^\d+$/.test(trimmed)) {
    const n = parseInt(trimmed, 10);
    if (n >= 1 && n <= 12) return n;
  }

  return null;
}

function readInstallmentsFromSelect(root: ParentNode): number | null {
  for (const scope of collectRootsDeep(root)) {
    const selects = scope.querySelectorAll("select");
    for (const select of selects) {
      const options = Array.from(select.options);
      const hasInstallmentOptions = options.some((opt) => {
        const n = parseInstallmentCount(opt.value) ?? parseInstallmentCount(opt.text);
        return n != null && n >= 1 && n <= 12;
      });
      if (!hasInstallmentOptions) continue;

      const fromValue = parseInstallmentCount(select.value);
      if (fromValue) return fromValue;

      const selected = options[select.selectedIndex];
      if (selected) {
        const fromText = parseInstallmentCount(selected.text);
        if (fromText) return fromText;
      }
    }
  }
  return null;
}

function readInstallmentsFromCustomUi(root: ParentNode): number | null {
  for (const scope of collectRootsDeep(root)) {
    const selected =
      scope.querySelector('[class*="installment" i] [aria-selected="true"]') ??
      scope.querySelector('[class*="installment" i] [aria-checked="true"]') ??
      scope.querySelector('[class*="installment" i] [data-selected="true"]') ??
      scope.querySelector('[role="option"][aria-selected="true"]') ??
      scope.querySelector('[role="radio"][aria-checked="true"]');

    if (selected?.textContent) {
      const n = parseInstallmentCount(selected.textContent);
      if (n) return n;
    }
  }
  return null;
}

function isPixSelected(root: ParentNode): boolean {
  for (const scope of collectRootsDeep(root)) {
    const pixTab =
      scope.querySelector('[aria-selected="true"][id*="pix" i]') ??
      scope.querySelector('[aria-selected="true"][class*="pix" i]') ??
      scope.querySelector('[data-testid*="pix" i][aria-selected="true"]');

    if (pixTab) return true;

    const activeTab = scope.querySelector('[role="tab"][aria-selected="true"]');
    if (activeTab?.textContent?.toLowerCase().includes("pix")) return true;
  }
  return false;
}

export function readMpBrickPaymentState(root: HTMLElement): {
  installments: number;
  method: "card" | "pix";
} {
  if (isPixSelected(root)) {
    return { installments: 1, method: "pix" };
  }

  const installments =
    readInstallmentsFromSelect(root) ?? readInstallmentsFromCustomUi(root) ?? 1;

  return { installments, method: "card" };
}
