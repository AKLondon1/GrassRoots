import type { ScreenDefinition } from "@/lib/navigation/screen-registry";

export interface ScreenCopy {
  title: string;
  description: string;
}

/**
 * Curated copy for the screens on the weekly loop. Everything else falls back to
 * the registry's generated strings, which is honest because those screens now sit
 * behind a "not built yet" empty state rather than fictional data.
 */
const copy: Record<string, ScreenCopy> = {
  "parent:home": {
    title: "Your football week",
    description: "Replies you owe, and what is coming up.",
  },
  "parent:availability": {
    title: "Availability",
    description: "Tell the manager who can play.",
  },
  "parent:squad": {
    title: "Squad status",
    description: "Whether your child has a place this week.",
  },
  "coach:today": {
    title: "Today",
    description: "Your next session, and who has replied.",
  },
  "coach:squad": {
    title: "Squad selection",
    description: "Pick from the players who said they are available.",
  },
  "coach:event-editor": {
    title: "Fixtures and sessions",
    description: "Create and change your team's events.",
  },
  "club:overview": {
    title: "Club overview",
    description: "Teams, upcoming fixtures and outstanding replies.",
  },
};

export function getScreenCopy(screen: ScreenDefinition): ScreenCopy {
  return (
    copy[`${screen.role}:${screen.id}`] ?? {
      title: screen.label,
      description: screen.states.empty.description,
    }
  );
}
