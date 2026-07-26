---
name: container-scroll-animation
description: Add or adapt a responsive, perspective-driven scroll reveal for React and Next.js interfaces using Framer Motion and Tailwind CSS. Use when building a hero, product showcase, screen mockup, media card, dashboard preview, or other section whose title translates upward while a large card rotates and scales into place as the user scrolls.
---

# Container Scroll Animation

Use the bundled [`assets/container-scroll.tsx`](assets/container-scroll.tsx) as the source component. Copy it into the project's component structure and adapt it to existing naming, styling, and import conventions.

## Requirements

- Confirm the target is a React client component. Keep `"use client"` in Next.js App Router projects.
- Confirm `framer-motion` and Tailwind CSS are available before using the asset.
- Preserve the scroll target ref, perspective wrapper, and `useTransform` mappings unless the requested motion calls for different behavior.
- Pass the heading or hero copy through `titleComponent` and the visual content through `children`.

## Workflow

1. Inspect the destination component, framework conventions, installed dependencies, and responsive breakpoints.
2. Copy `assets/container-scroll.tsx` into the appropriate components directory.
3. Import and render `ContainerScroll`, supplying a title node and a bounded child visual.
4. Adapt heights, card dimensions, border, background, radius, and shadow to the surrounding design system.
5. Test the complete scroll range on desktop and at or below 768px. Check that ancestors do not clip the transformed card unexpectedly.
6. Respect reduced-motion preferences when the surrounding application already provides a motion policy; replace or disable the transform animation for those users.
7. Run the project's formatter, type checker, and relevant UI tests.

## Usage

```tsx
import { ContainerScroll } from "@/components/ui/container-scroll";

<ContainerScroll
  titleComponent={<h2 className="text-4xl font-semibold">See the product in action</h2>}
>
  <img
    src="/product-preview.png"
    alt="Product dashboard preview"
    className="h-full w-full object-cover"
  />
</ContainerScroll>
```

Keep meaningful content readable without motion and provide useful alternative text for images. Tune the tall outer container carefully: it defines the animation's scroll runway and has a large effect on page pacing.
