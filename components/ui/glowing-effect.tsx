"use client";

import {
  memo,
  useCallback,
  useEffect,
  useRef,
  type CSSProperties,
} from "react";
import { animate } from "motion/react";

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
  const lastPosition = useRef({ x: 0, y: 0 });
  const animationFrameRef = useRef<number>(0);
  const animationRef = useRef<ReturnType<typeof animate> | null>(null);
  const prefersReducedMotion = useRef(false);

  const handleMove = useCallback(
    (event?: MouseEvent | PointerEvent | { x: number; y: number }) => {
      if (!containerRef.current) return;

      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = requestAnimationFrame(() => {
        const element = containerRef.current;
        if (!element) return;

        const { left, top, width, height } = element.getBoundingClientRect();
        const mouseX = event?.x ?? lastPosition.current.x;
        const mouseY = event?.y ?? lastPosition.current.y;

        if (event) lastPosition.current = { x: mouseX, y: mouseY };

        const centreX = left + width * 0.5;
        const centreY = top + height * 0.5;
        const distance = Math.hypot(mouseX - centreX, mouseY - centreY);
        const inactiveRadius = 0.5 * Math.min(width, height) * inactiveZone;

        if (distance < inactiveRadius) {
          element.style.setProperty("--active", "0");
          return;
        }

        const isActive =
          mouseX > left - proximity &&
          mouseX < left + width + proximity &&
          mouseY > top - proximity &&
          mouseY < top + height + proximity;

        element.style.setProperty("--active", isActive ? "1" : "0");
        if (!isActive) return;

        const currentAngle =
          Number.parseFloat(element.style.getPropertyValue("--start")) || 0;
        const targetAngle =
          (180 * Math.atan2(mouseY - centreY, mouseX - centreX)) / Math.PI + 90;
        const angleDifference = ((targetAngle - currentAngle + 180) % 360) - 180;
        const nextAngle = currentAngle + angleDifference;

        animationRef.current?.stop();
        if (prefersReducedMotion.current) {
          element.style.setProperty("--start", String(nextAngle));
          return;
        }

        animationRef.current = animate(currentAngle, nextAngle, {
          duration: movementDuration,
          ease: [0.16, 1, 0.3, 1],
          onUpdate: (value) => element.style.setProperty("--start", String(value)),
        });
      });
    },
    [inactiveZone, movementDuration, proximity],
  );

  useEffect(() => {
    if (disabled) return;

    const reducedMotion =
      typeof window.matchMedia === "function"
        ? window.matchMedia("(prefers-reduced-motion: reduce)")
        : null;
    const coarsePointer =
      typeof window.matchMedia === "function"
        ? window.matchMedia("(pointer: coarse)")
        : null;
    prefersReducedMotion.current = reducedMotion?.matches ?? false;

    const handlePreferenceChange = () => {
      prefersReducedMotion.current = reducedMotion?.matches ?? false;
    };
    const handleScroll = () => handleMove();
    const handlePointerMove = (event: PointerEvent) => handleMove(event);

    reducedMotion?.addEventListener("change", handlePreferenceChange);
    window.addEventListener("scroll", handleScroll, { passive: true });
    if (!coarsePointer?.matches) {
      document.body.addEventListener("pointermove", handlePointerMove, {
        passive: true,
      });
    }

    return () => {
      cancelAnimationFrame(animationFrameRef.current);
      animationRef.current?.stop();
      reducedMotion?.removeEventListener("change", handlePreferenceChange);
      window.removeEventListener("scroll", handleScroll);
      document.body.removeEventListener("pointermove", handlePointerMove);
    };
  }, [disabled, handleMove]);

  const style = {
    "--blur": `${blur}px`,
    "--spread": spread,
    "--start": "0",
    "--active": "0",
    "--glowingeffect-border-width": `${borderWidth}px`,
    "--repeating-conic-gradient-times": "5",
    "--gradient":
      variant === "white"
        ? "repeating-conic-gradient(from 236.84deg at 50% 50%, var(--primary-foreground), var(--primary-foreground) calc(25% / var(--repeating-conic-gradient-times)))"
        : "radial-gradient(circle, var(--primary-light) 8%, transparent 18%), radial-gradient(circle at 40% 40%, var(--primary) 6%, transparent 16%), radial-gradient(circle at 60% 60%, var(--ring) 8%, transparent 18%), repeating-conic-gradient(from 236.84deg at 50% 50%, var(--primary-light) 0%, var(--primary) calc(50% / var(--repeating-conic-gradient-times)), var(--ring) calc(100% / var(--repeating-conic-gradient-times)))",
  } as CSSProperties;

  return (
    <>
      <div
        aria-hidden="true"
        className={cn(
          "pointer-events-none absolute -inset-px hidden rounded-[inherit] border border-primary/30 opacity-0 transition-opacity",
          glow && "opacity-100",
          variant === "white" && "border-primary-foreground/40",
          disabled && "!block",
        )}
      />
      <div
        ref={containerRef}
        aria-hidden="true"
        style={style}
        className={cn(
          "glowing-effect pointer-events-none absolute inset-0 rounded-[inherit] opacity-100 transition-opacity",
          glow && "opacity-100",
          blur > 0 && "blur-[var(--blur)]",
          className,
          disabled && "!hidden",
        )}
      >
        <div
          data-glow-direction="true"
          className={cn(
            "absolute inset-0 rounded-[inherit]",
            'after:absolute after:inset-[calc(-1*var(--glowingeffect-border-width))] after:rounded-[inherit] after:content-[\"\"]',
            "after:[border:var(--glowingeffect-border-width)_solid_transparent]",
            "after:[background:var(--gradient)] after:[background-attachment:fixed]",
            "after:opacity-[var(--active)] after:transition-opacity after:duration-300",
            "after:[mask-clip:padding-box,border-box] after:[mask-composite:intersect]",
            "after:[mask-image:linear-gradient(#0000,#0000),conic-gradient(from_calc((var(--start)-var(--spread))*1deg),#0000_0deg,#fff,#0000_calc(var(--spread)*2deg))]",
          )}
        />
      </div>
    </>
  );
});

GlowingEffect.displayName = "GlowingEffect";

export { GlowingEffect };
