import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { brand } from "@/lib/brand";
import {
  getDefaultScreen,
  getScreenHref,
} from "@/lib/navigation/screen-registry";

export const metadata: Metadata = {
  title: `Illustrative workspace | ${brand.name}`,
  description: `A non-persistent, illustrative ${brand.name} application shell.`,
};

interface WorkspacePageProps {
  params: Promise<{ workspace: string }>;
}

export default async function WorkspacePage({ params }: WorkspacePageProps) {
  const { workspace } = await params;

  redirect(getScreenHref(workspace, getDefaultScreen("parent"), "parent"));
}
