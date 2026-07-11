import { useEffect, useState } from "react";

const MD_QUERY = "(min-width: 768px)";

/** true quando viewport >= md (768px) — alinhado ao breakpoint Tailwind md: */
export function useMediaMdUp() {
  const [matches, setMatches] = useState(
    () => typeof window !== "undefined" && window.matchMedia(MD_QUERY).matches,
  );

  useEffect(() => {
    const mq = window.matchMedia(MD_QUERY);
    const onChange = () => setMatches(mq.matches);
    onChange();
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  return matches;
}
