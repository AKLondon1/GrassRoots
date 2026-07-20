---
name: glowing-effect
description: Add an accessible, pointer-responsive animated border glow to React, Next.js, shadcn/ui, Tailwind CSS, and TypeScript interfaces. Use when building or polishing cards, feature grids, dashboards, calls to action, or other bordered surfaces that should react subtly to pointer proximity while respecting reduced-motion and touch users.
---

# Glowing Effect

Integrate the supplied glow as progressive enhancement. Preserve legibility, keyboard affordances, and the component's public props.

## Workflow

1. Inspect the project aliases, component directory, global styles, Tailwind setup, and existing `cn` helper.
2. Use `components/ui` as the canonical shadcn-compatible location. If the project uses another convention, explain the boundary and keep imports consistent.
3. Copy `assets/glowing-effect.tsx` to `components/ui/glowing-effect.tsx`. Copy and adapt `assets/demo.tsx` only when a usage example is useful.
4. Install `motion`; install `lucide-react` only if the chosen usage needs icons.
5. Place `<GlowingEffect />` inside a `relative`, rounded parent. Keep content in a separate relative child above the non-interactive effect.
6. Enable it explicitly with `disabled={false}`. Prefer restrained settings: `spread={32}`, `proximity={56}`, `borderWidth={1}`, and no blur.
7. Match colours to the product tokens instead of introducing unrelated rainbow accents. Use `variant="white"` only on sufficiently dark surfaces.
8. Verify keyboard focus remains visible, text contrast is unaffected, pointer movement is smooth, reduced-motion disables interpolation, and touch/coarse-pointer layouts remain useful without the effect.

## Public API

`GlowingEffect` accepts `blur`, `inactiveZone`, `proximity`, `spread`, `variant`, `glow`, `className`, `disabled`, `movementDuration`, and `borderWidth`. Preserve these names so existing examples remain compatible.

## Guardrails

- Do not use the glow on every surface; reserve it for a few high-value cards or actions.
- Do not make glow the only indication of state, selection, error, or focus.
- Do not add pointer handlers to every card; the component owns one passive document listener and animation-frame throttling.
- Do not copy promotional demo wording into production. Replace it with product-specific content.
- Do not invent an alternative CSS-only API when this skill is explicitly requested.

## Verification

Run the project lint, typecheck, unit tests, and production build. Inspect at mobile, tablet, and desktop widths with mouse, keyboard, and reduced-motion emulation.
