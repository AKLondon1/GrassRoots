"use client";

import {
  motion,
  useScroll,
  useTransform,
  type MotionValue,
} from "motion/react";
import { useEffect, useRef, useState, type ReactNode } from "react";

interface ContainerScrollProps {
  children: ReactNode;
  titleComponent: ReactNode;
}

function ContainerScroll({ children, titleComponent }: ContainerScrollProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({ target: containerRef });
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth <= 768);
    checkMobile();
    window.addEventListener("resize", checkMobile, { passive: true });
    return () => window.removeEventListener("resize", checkMobile);
  }, []);

  const rotate = useTransform(scrollYProgress, [0, 1], isMobile ? [7, 0] : [14, 0]);
  const scale = useTransform(
    scrollYProgress,
    [0, 1],
    isMobile ? [0.86, 0.98] : [1.02, 1],
  );
  const translate = useTransform(scrollYProgress, [0, 1], [0, -72]);

  return (
    <div
      ref={containerRef}
      className="relative flex h-[52rem] items-center justify-center px-4 sm:px-6 md:h-[68rem] lg:px-8"
    >
      <div className="relative w-full max-w-7xl py-16 [perspective:1000px] md:py-28">
        <ContainerScrollHeader translate={translate}>
          {titleComponent}
        </ContainerScrollHeader>
        <ContainerScrollCard rotate={rotate} scale={scale}>
          {children}
        </ContainerScrollCard>
      </div>
    </div>
  );
}

function ContainerScrollHeader({
  children,
  translate,
}: {
  children: ReactNode;
  translate: MotionValue<number>;
}) {
  return (
    <motion.div
      className="container-scroll-motion mx-auto max-w-3xl text-center"
      style={{ translateY: translate }}
    >
      {children}
    </motion.div>
  );
}

function ContainerScrollCard({
  children,
  rotate,
  scale,
}: {
  children: ReactNode;
  rotate: MotionValue<number>;
  scale: MotionValue<number>;
}) {
  return (
    <motion.div
      className="container-scroll-card mx-auto mt-10 h-[31rem] w-full max-w-6xl overflow-hidden rounded-2xl border border-border-strong bg-background p-2 sm:h-[34rem] sm:p-3 md:mt-14 md:h-[39rem]"
      data-testid="container-scroll-card"
      style={{ rotateX: rotate, scale }}
    >
      <div className="h-full w-full overflow-hidden rounded-xl bg-surface">{children}</div>
    </motion.div>
  );
}

export { ContainerScroll };
