import { useRef } from "react";

type TouchPoint = { x: number; y: number };

export function useHorizontalSwipe(
  onSwipeLeft: () => void,
  onSwipeRight: () => void,
  minDistance = 48,
) {
  const start = useRef<TouchPoint | null>(null);

  return {
    onTouchStart(event: React.TouchEvent) {
      const touch = event.touches[0];
      if (!touch) return;
      start.current = { x: touch.clientX, y: touch.clientY };
    },
    onTouchEnd(event: React.TouchEvent) {
      if (!start.current) return;
      const touch = event.changedTouches[0];
      if (!touch) {
        start.current = null;
        return;
      }

      const deltaX = touch.clientX - start.current.x;
      const deltaY = touch.clientY - start.current.y;
      start.current = null;

      if (Math.abs(deltaX) < minDistance || Math.abs(deltaX) < Math.abs(deltaY)) return;
      if (deltaX < 0) onSwipeLeft();
      else onSwipeRight();
    },
  };
}
