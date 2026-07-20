# Glowing effect skill baseline

## Scenario

“Add a pointer-following animated glowing border to an existing Next.js App Router shadcn card. Make it responsive and production-ready.”

## Baseline result without the skill

The agent proposed a new `GlowCard` wrapper using React pointer events and CSS, said no dependency was required, and chose `components/ui/glow-card.tsx`.

## Failure relative to the supplied reusable component

- Replaced the required `GlowingEffect` prop contract with an invented wrapper API.
- Omitted the supplied `motion/react` dependency and angle animation.
- Omitted the supplied demo asset and its shadcn-relative layering pattern.
- Did not preserve the requested `components/ui/glowing-effect.tsx` destination.

The skill must make the bundled production component and demo the source of truth while retaining the baseline answer’s useful accessibility and reduced-motion checks.
