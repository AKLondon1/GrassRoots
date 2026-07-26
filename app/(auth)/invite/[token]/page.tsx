import type { Metadata } from "next";

import { InvitationScreen } from "@/components/auth/invitation-screen";
import { brand } from "@/lib/brand";
import { environment } from "@/lib/env";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: `Club invitation | ${brand.name}`,
  description: `Accept an adult organisation invitation to ${brand.name}.`,
};

interface InvitationPageProps {
  params: Promise<{ token: string }>;
}

export default async function InvitationPage({ params }: InvitationPageProps) {
  const { token } = await params;
  const supabase = await createServerSupabaseClient();
  const { data } = supabase
    ? await supabase.auth.getUser()
    : { data: { user: null } };

  return (
    <InvitationScreen
      authenticated={Boolean(data.user)}
      mode={environment.dataMode}
      token={token}
    />
  );
}
