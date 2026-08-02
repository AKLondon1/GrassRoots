"use client";

import { useSyncExternalStore, type ChangeEvent } from "react";
import { useRouter } from "next/navigation";

import { roleLabels, type AppRole } from "@/lib/navigation/screen-registry";

interface RoleSwitcherProps {
  value: AppRole;
  workspace: string;
  /** Only the roles this member holds. In demo mode the caller passes `appRoles`. */
  roles: readonly AppRole[];
}

const subscribeToHydration = () => () => {};
const getClientHydrationSnapshot = () => true;
const getServerHydrationSnapshot = () => false;

function RoleSwitcher({ value, workspace, roles }: RoleSwitcherProps) {
  const router = useRouter();
  const isHydrated = useSyncExternalStore(
    subscribeToHydration,
    getClientHydrationSnapshot,
    getServerHydrationSnapshot,
  );

  const handleChange = (event: ChangeEvent<HTMLSelectElement>) => {
    const nextRole = event.target.value as AppRole;
    // Send the member to the workspace root rather than guessing a screen. Only the
    // server knows the target role's capabilities, and the registered default for a
    // role is often one the member cannot open: parent "home" needs family:view,
    // which the guardian role does not grant. The landing page resolves the role and
    // redirects to the first screen they can actually open.
    router.push(
      `/app/${encodeURIComponent(workspace)}?role=${encodeURIComponent(nextRole)}`,
    );
  };

  return (
    <label className="flex min-h-11 items-center gap-2 rounded-[10px] border border-border bg-background px-3 text-sm font-medium text-ink focus-within:ring-3 focus-within:ring-ring/35">
      <span className="hidden text-muted sm:inline">Acting as</span>
      <select
        aria-label="Acting as"
        className="min-h-9 cursor-pointer bg-transparent font-semibold outline-none"
        disabled={!isHydrated}
        value={value}
        onChange={handleChange}
      >
        {roles.map((role) => (
          <option key={role} value={role}>
            {roleLabels[role]}
          </option>
        ))}
      </select>
    </label>
  );
}

export { RoleSwitcher };
