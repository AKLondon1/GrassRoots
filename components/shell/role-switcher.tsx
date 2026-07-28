"use client";

import type { ChangeEvent } from "react";
import { useRouter } from "next/navigation";

import {
  getDefaultScreen,
  getScreenHref,
  roleLabels,
  type AppRole,
} from "@/lib/navigation/screen-registry";

interface RoleSwitcherProps {
  value: AppRole;
  workspace: string;
  /** Only the roles this member holds. In demo mode the caller passes `appRoles`. */
  roles: readonly AppRole[];
}

function RoleSwitcher({ value, workspace, roles }: RoleSwitcherProps) {
  const router = useRouter();

  const handleChange = (event: ChangeEvent<HTMLSelectElement>) => {
    const nextRole = event.target.value as AppRole;
    router.push(getScreenHref(workspace, getDefaultScreen(nextRole), nextRole));
  };

  return (
    <label className="flex min-h-11 items-center gap-2 rounded-[10px] border border-border bg-background px-3 text-sm font-medium text-ink focus-within:ring-3 focus-within:ring-ring/35">
      <span className="hidden text-muted sm:inline">Acting as</span>
      <select
        aria-label="Acting as"
        className="min-h-9 cursor-pointer bg-transparent font-semibold outline-none"
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
