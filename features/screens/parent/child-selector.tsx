import Link from "next/link";

import type { LinkedChild } from "@/features/screens/parent/linked-children";

/**
 * Switches the parent journey between linked children.
 *
 * Renders nothing for a single child, which is most families. A control offering one
 * choice is not a choice; it is furniture that makes the screen look more
 * complicated than the situation is.
 *
 * A server component on purpose. Selection is a URL, not local state, so a link is
 * the whole implementation: it survives a refresh, it can be bookmarked per child,
 * it works before hydration, and it ships no JavaScript. Making this interactive
 * would cost a client bundle to reimplement what the address bar already does.
 */
export function ChildSelector({
  linkedChildren,
  selectedPlayerId,
  section,
  workspace,
}: {
  /**
   * Named `linkedChildren` rather than `children` on purpose. React treats a prop
   * called `children` specially, so passing a data array under that name reads as
   * slot content to anyone skimming, and to the DevTools tree.
   */
  linkedChildren: readonly LinkedChild[];
  selectedPlayerId: string;
  section: string;
  workspace: string;
}) {
  if (linkedChildren.length < 2) return null;

  return (
    <nav aria-label="Choose a child" className="mb-5">
      <ul className="flex flex-wrap gap-2">
        {linkedChildren.map((child) => {
          const isSelected = child.playerId === selectedPlayerId;
          return (
            <li key={child.playerId}>
              <Link
                aria-current={isSelected ? "page" : undefined}
                className={`inline-flex min-h-11 items-center rounded-xl border px-4 text-sm font-semibold ${
                  isSelected
                    ? "border-primary bg-primary-light text-ink"
                    : "border-border-strong text-muted"
                }`}
                href={`/app/${workspace}/${section}?role=parent&child=${child.playerId}`}
              >
                {child.firstName}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
