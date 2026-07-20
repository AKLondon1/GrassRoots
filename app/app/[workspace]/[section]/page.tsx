import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { ApplicationShell } from "@/components/shell/application-shell";
import { DeniedState } from "@/components/ui/denied-state";
import { getDemoCapabilities } from "@/lib/access/demo-access-policy";
import { brand } from "@/lib/brand";
import {
  parseAppRole,
  resolveScreenSection,
} from "@/lib/navigation/screen-registry";

export const metadata: Metadata = {
  title: `Illustrative workspace | ${brand.name}`,
  description: `A non-persistent, illustrative ${brand.name} application shell.`,
};

interface WorkspaceSectionPageProps {
  params: Promise<{ section: string; workspace: string }>;
  searchParams: Promise<{ role?: string | string[] }>;
}

export default async function WorkspaceSectionPage({
  params,
  searchParams,
}: WorkspaceSectionPageProps) {
  const [{ section, workspace }, query] = await Promise.all([params, searchParams]);
  const requestedRole = Array.isArray(query.role) ? query.role[0] : query.role;
  const role = parseAppRole(requestedRole);
  const capabilities = getDemoCapabilities(role);
  const resolution = resolveScreenSection({
    capabilities,
    role,
    section,
  });

  if (resolution.status === "unknown") notFound();

  if (resolution.status === "denied") {
    return (
      <main className="flex min-h-dvh items-center justify-center bg-surface p-4 sm:p-8">
        <DeniedState
          className="bg-background"
          title={`${resolution.screen.label} is not available for this role`}
          description={resolution.screen.states.denied}
        />
      </main>
    );
  }

  return (
    <ApplicationShell
      activeSection={resolution.screen.section}
      capabilities={capabilities}
      role={role}
      workspace={workspace}
    />
  );
}
