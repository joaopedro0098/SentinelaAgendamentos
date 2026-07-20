export function isDesktopForFaceHandoff(): boolean {
  if (typeof window === "undefined") return false;
  const coarseMobile = /Android|iPhone|iPad|iPod|Mobile|webOS|BlackBerry|IEMobile|Opera Mini/i.test(
    navigator.userAgent,
  );
  const desktopLike = window.matchMedia("(pointer: fine) and (min-width: 768px)").matches;
  return desktopLike && !coarseMobile;
}
