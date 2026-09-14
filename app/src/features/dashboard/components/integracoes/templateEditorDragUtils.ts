import { VARIABLE_MARKERS, type TemplateVariableKey } from "@/features/dashboard/lib/metaTemplateProduct";

/** Posições válidas para inserir variável: entre palavras (espaços), nunca no meio de uma palavra. */
function getValidInsertOffsets(displayText: string): number[] {
  const blocked = new Set<number>();

  for (const marker of Object.values(VARIABLE_MARKERS)) {
    let idx = displayText.indexOf(marker);
    while (idx !== -1) {
      for (let i = idx + 1; i < idx + marker.length; i++) {
        blocked.add(i);
      }
      idx = displayText.indexOf(marker, idx + 1);
    }
  }

  const offsets = new Set<number>([0, displayText.length]);

  for (let i = 0; i < displayText.length; i++) {
    if (displayText[i] !== " ") continue;
    if (!blocked.has(i)) offsets.add(i);
    if (!blocked.has(i + 1)) offsets.add(i + 1);
  }

  for (const marker of Object.values(VARIABLE_MARKERS)) {
    let idx = displayText.indexOf(marker);
    while (idx !== -1) {
      offsets.add(idx);
      offsets.add(idx + marker.length);
      idx = displayText.indexOf(marker, idx + 1);
    }
  }

  return [...offsets]
    .filter((o) => !blocked.has(o) || o === 0 || o === displayText.length)
    .sort((a, b) => a - b);
}

export function snapOffsetToWordBoundary(displayText: string, rawOffset: number): number {
  const valid = getValidInsertOffsets(displayText);
  if (valid.length === 0) return 0;
  let best = valid[0];
  let bestDist = Math.abs(rawOffset - best);
  for (const v of valid) {
    const d = Math.abs(rawOffset - v);
    if (d < bestDist) {
      best = v;
      bestDist = d;
    }
  }
  return best;
}

export function insertMarkerAtOffset(text: string, offset: number, marker: string): string {
  return text.slice(0, offset) + marker + text.slice(offset);
}

export function removeVariableMarker(text: string, key: TemplateVariableKey): string {
  return text.replace(VARIABLE_MARKERS[key], "");
}

export function caretDisplayOffsetFromPoint(root: HTMLElement, clientX: number, clientY: number): number {
  const doc = root.ownerDocument;
  let range: Range | null = null;

  if (doc.caretRangeFromPoint) {
    range = doc.caretRangeFromPoint(clientX, clientY);
  } else if ("caretPositionFromPoint" in doc) {
    const pos = (
      doc as Document & {
        caretPositionFromPoint?: (x: number, y: number) => { offsetNode: Node; offset: number } | null;
      }
    ).caretPositionFromPoint?.(clientX, clientY);
    if (pos) {
      range = doc.createRange();
      range.setStart(pos.offsetNode, pos.offset);
      range.collapse(true);
    }
  }

  if (!range || !root.contains(range.startContainer)) {
    return readDisplayTextFromEditor(root).length;
  }

  const probe = doc.createRange();
  probe.selectNodeContents(root);
  probe.setEnd(range.startContainer, range.startOffset);

  let offset = 0;
  const fragment = probe.cloneContents();
  function walk(node: Node) {
    if (node.nodeType === Node.TEXT_NODE) {
      offset += node.textContent?.length ?? 0;
      return;
    }
    if (node instanceof HTMLElement) {
      const key = node.dataset?.variable;
      if (key && key in VARIABLE_MARKERS) {
        offset += VARIABLE_MARKERS[key as TemplateVariableKey].length;
        return;
      }
    }
    node.childNodes.forEach(walk);
  }
  walk(fragment);
  return offset;
}

export function readDisplayTextFromEditor(root: HTMLElement): string {
  let out = "";

  function walk(node: Node) {
    if (node.nodeType === Node.TEXT_NODE) {
      out += node.textContent ?? "";
      return;
    }
    if (node instanceof HTMLElement) {
      const key = node.dataset.variable as TemplateVariableKey | undefined;
      if (key && VARIABLE_MARKERS[key]) {
        out += VARIABLE_MARKERS[key];
        return;
      }
    }
    node.childNodes.forEach(walk);
  }

  walk(root);
  return out;
}

export function rangeFromDisplayOffset(root: HTMLElement, targetOffset: number): Range | null {
  const doc = root.ownerDocument;
  const range = doc.createRange();
  let remaining = targetOffset;

  function walk(node: Node): boolean {
    if (node.nodeType === Node.TEXT_NODE) {
      const len = node.textContent?.length ?? 0;
      if (remaining <= len) {
        range.setStart(node, remaining);
        range.collapse(true);
        return true;
      }
      remaining -= len;
      return false;
    }
    if (node instanceof HTMLElement) {
      const key = node.dataset.variable as TemplateVariableKey | undefined;
      if (key && VARIABLE_MARKERS[key]) {
        const len = VARIABLE_MARKERS[key].length;
        if (remaining <= len) {
          if (remaining === 0) {
            range.setStartBefore(node);
          } else {
            range.setStartAfter(node);
          }
          range.collapse(true);
          return true;
        }
        remaining -= len;
        return false;
      }
    }
    for (const child of node.childNodes) {
      if (walk(child)) return true;
    }
    return false;
  }

  if (walk(root)) return range;

  range.selectNodeContents(root);
  range.collapse(false);
  return range;
}

/** Converte offset do texto completo (com marcador) para posição no texto sem a variável arrastada. */
export function mapFullTextOffsetToWithoutMarker(
  fullText: string,
  offset: number,
  key: TemplateVariableKey,
): number {
  const marker = VARIABLE_MARKERS[key];
  const idx = fullText.indexOf(marker);
  if (idx === -1) return offset;
  const end = idx + marker.length;
  if (offset <= idx) return offset;
  if (offset >= end) return offset - marker.length;
  return idx;
}

/** Converte offset no texto sem marcador para posição no DOM/texto completo (chip ainda visível). */
export function mapWithoutMarkerOffsetToFull(
  fullText: string,
  offset: number,
  key: TemplateVariableKey,
): number {
  const marker = VARIABLE_MARKERS[key];
  const idx = fullText.indexOf(marker);
  if (idx === -1) return offset;
  if (offset < idx) return offset;
  return offset + marker.length;
}
