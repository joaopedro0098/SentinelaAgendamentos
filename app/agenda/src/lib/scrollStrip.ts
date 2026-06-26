/** Centraliza um item na faixa horizontal sem rolar a página inteira. */
export function scrollElementIntoHorizontalStrip(
  container: HTMLElement,
  target: HTMLElement,
  behavior: ScrollBehavior = "smooth",
) {
  const maxLeft = Math.max(0, container.scrollWidth - container.clientWidth);
  const targetLeft = target.offsetLeft - (container.clientWidth - target.offsetWidth) / 2;
  container.scrollTo({
    left: Math.max(0, Math.min(maxLeft, targetLeft)),
    behavior,
  });
}
