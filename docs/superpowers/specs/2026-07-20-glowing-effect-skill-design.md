# Glowing Effect Skill Design

## Purpose

Create a project-local `$glowing-effect` skill that helps Codex integrate a pointer-responsive glowing border into React or Next.js interfaces that use TypeScript, Tailwind CSS, and shadcn conventions. Keep it independent from `$container-scroll-animation` because the effects have different triggers, dependencies, and interaction models.

## Scope

The skill will package the supplied production component and demonstration as reusable assets. It will guide Codex through project inspection, dependency checks, component placement, integration, accessibility, responsiveness, and verification.

The skill will not create a generalized animation library, modify an application automatically when merely invoked, or couple the glowing border to the scroll-animation component.

## Structure

```text
.agents/skills/glowing-effect/
├── SKILL.md
├── agents/
│   └── openai.yaml
└── assets/
    ├── glowing-effect.tsx
    └── demo.tsx
```

- `SKILL.md` will contain concise trigger metadata, requirements, an integration workflow, a quick reference, and common failure modes.
- `agents/openai.yaml` will expose the display name, short description, and a default prompt that explicitly invokes `$glowing-effect`.
- `assets/glowing-effect.tsx` will preserve the reusable `GlowingEffect` component.
- `assets/demo.tsx` will demonstrate the expected relative container, card layout, props, and optional Lucide icons.

## Dependencies and Integration Contract

The target project must provide React, TypeScript, Tailwind CSS, a `cn` utility compatible with `@/lib/utils`, and the `motion` package for `animate` from `motion/react`. The demonstration additionally uses `lucide-react`.

The skill will direct Codex to inspect aliases and component paths rather than assume they exist. In a conventional shadcn project, the component belongs in `components/ui/glowing-effect.tsx`. If the repository uses a different established UI-component directory, Codex will follow that convention and adjust imports. If no convention exists, it will recommend `components/ui` and explain that this keeps reusable primitives separate from feature components.

## Component Behavior and Data Flow

`GlowingEffect` receives visual and interaction props such as blur, proximity, spread, variant, border width, and disabled state. When enabled, pointer movement and scrolling schedule an animation-frame update. The component measures its container, determines whether the pointer is within the active region, computes the shortest angle toward the pointer, and animates CSS custom properties. A masked conic/radial gradient renders the border while remaining pointer-transparent.

Consumers place the effect inside a relatively positioned element with inherited border radius. The visible card content remains a separate layer above the effect.

## Edge Cases and Accessibility

- Keep the effect decorative and pointer-transparent.
- Avoid registering global listeners while `disabled` is true and remove listeners and pending animation frames during cleanup.
- Confirm the containing element is positioned and has a usable border radius; otherwise the overlay may escape or appear square.
- Preserve readable borders and content when animation is disabled or reduced motion is preferred.
- Check light and dark themes, keyboard navigation, mobile layouts, and coarse-pointer devices. The effect must never be required to understand or operate the interface.
- Treat `lucide-react` as optional when only the production component is integrated.

## Verification

1. Run the skill validator against the completed skill directory.
2. Confirm the metadata contains only valid frontmatter fields and has no placeholders.
3. Confirm both asset files exist and the skill links to them.
4. Confirm the production asset imports `animate` from `motion/react` and `cn` from the expected utility path.
5. Verify the component and demo with the target project's formatter and TypeScript checker when the skill is used in an application.
6. Exercise a reference-skill scenario to ensure an agent can identify dependencies, choose the correct destination, and integrate the effect without requiring the demo.

## Acceptance Criteria

- `$glowing-effect` is independently discoverable for glowing borders, animated card outlines, pointer-following gradients, shadcn, Tailwind, and React/Next.js requests.
- The supplied production component and demo are available as copyable assets.
- The instructions distinguish required dependencies from demo-only dependencies.
- The skill handles nonstandard aliases and component paths without forcing a repository-wide restructure.
- Structural validation passes and no TODO or placeholder text remains.

## Repository Constraint

The current GrassRoots directory is not a Git repository, so the design document and later skill files cannot be committed here. All local creation and validation steps remain available.
