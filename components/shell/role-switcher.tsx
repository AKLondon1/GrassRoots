"use client";

import type { ChangeEvent } from "react";

import {
  appRoles,
  roleLabels,
  type AppRole,
} from "@/lib/navigation/screen-registry";

interface RoleSwitcherProps {
  value: AppRole;
  onChange: (role: AppRole) => void;
}

function RoleSwitcher({ value, onChange }: RoleSwitcherProps) {
  const handleChange = (event: ChangeEvent<HTMLSelectElement>) => {
    onChange(event.target.value as AppRole);
  };

  return (
    <label className="flex min-h-11 items-center gap-2 rounded-[10px] border border-border bg-background px-3 text-sm font-medium text-ink focus-within:ring-3 focus-within:ring-ring/35">
      <span className="hidden text-muted sm:inline">View as</span>
      <select
        aria-label="Preview role"
        className="min-h-9 cursor-pointer bg-transparent font-semibold outline-none"
        value={value}
        onChange={handleChange}
      >
        {appRoles.map((role) => (
          <option key={role} value={role}>
            {roleLabels[role]}
          </option>
        ))}
      </select>
    </label>
  );
}

export { RoleSwitcher };
