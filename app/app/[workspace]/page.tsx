import type { Metadata } from "next";

import { ApplicationShell } from "@/components/shell/application-shell";
import { brand } from "@/lib/brand";

export const metadata: Metadata = {
  title: `Illustrative workspace | ${brand.name}`,
  description: `A non-persistent, illustrative ${brand.name} application shell.`,
};

interface WorkspacePageProps {
  params: Promise<{ workspace: string }>;
}

export default async function WorkspacePage({ params }: WorkspacePageProps) {
  const { workspace } = await params;

  return <ApplicationShell workspace={workspace} />;
}
