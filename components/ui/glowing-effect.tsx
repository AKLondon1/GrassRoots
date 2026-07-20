"use client";

import { memo, useCallback, useEffect, useRef, type CSSProperties } from "react";

import { cn } from "@/lib/utils";

export interface GlowingEffectProps {
  blur?: number;
  inactiveZone?: number;
  proximity?: number;
  spread?: number;
  variant?: "default" | "white";
  glow?: boolean;
  className?: string;
  disabled?: boolean;
  movementDuration?: number;
  borderWidth?: number;
}

const GlowingEffect = memo(function GlowingEffect({
  blur = 0,
  inactiveZone = 0.7,
  proximity = 0,
  spread = 20,
  variant = "default",
  glow = false,
  className,
  movementDuration = 0.2,
  borderWidth = 1,
  disabled = true,
}: GlowingEffectProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const frameRef = useRef<number>(0);

  const handleMove = useCallback(
    (event?: PointerEvent) => {
      const element = containerRef.current;
      if (!element) return;

      cancelAnimationFrame(frameRef.current);
      frameRef.current = requestAnimationFrame(() => {
        const { left, top, width, height } = element.getBoundingClientRect();
        const mouseX = event?.clientX ?? -1;
        const mouseY = event?.clientY ?? -1;
        const centreX = left + width / 2;
        const centreY = top + height / 2;
        const inactiveRadius = Math.min(width, height) * inactiveZone * 0.5;
        const insideInactiveZone =
          Math.hypot(mouseX - centreX, mouseY - centreY) < inactiveRadius;
        const isNear =
          mouseX >= left - proximity &&
          mouseX <= left + width + proximity &&
          mouseY >= top - proximity &&
          mouseY <= top + height + proximity;

        element.style.setProperty(
          "--glow-active",
          isNear && !insideInactiveZone ? "1" : "0",
        );
      });
    },
    [inactiveZone, proximity],
  );

  useEffect(() => {
    if (disabled) return;

    const coarsePointer =
      typeof window.matchMedia === "function"
        ? window.matchMedia("(pointer: coarse)")
        : null;
    if (coarsePointer?.matches) return;

    const onPointerMove = (event: PointerEvent) => handleMove(event);
    const onScroll = () => handleMove();
    document.body.addEventListener("pointermove", onPointerMove, { passive: true });
    window.addEventListener("scroll", onScroll, { passive: true });

    return () => {
      cancelAnimationFrame(frameRef.current);
      document.body.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("scroll", onScroll);
    };
  }, [disabled, handleMove]);

  const style = {
    "--glow-active": "0",
    "--glow-spread": spread,
    borderColor: variant === "white" ? "var(--background)" : "var(--primary)",
    borderWidth,
    filter: blur > 0 ? `blur(${blur}px)` : undefined,
    opacity: disabled ? 0 : "var(--glow-active)",
    transitionDuration: `${movementDuration}s`,
  } as CSSProperties;

  return (
    <>
      {glow ? (
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 rounded-[inherit] border border-primary/30"
        />
      ) : null}
      <div
        ref={containerRef}
        aria-hidden="true"
        className={cn(
          "glowing-effect pointer-events-none absolute -inset-px rounded-[inherit] border-solid transition-opacity ease-[cubic-bezier(0.22,1,0.36,1)]",
          className,
        )}
        style={style}
      />
    </>
  );
});

GlowingEffect.displayName = "GlowingEffect";

export { GlowingEffect };
