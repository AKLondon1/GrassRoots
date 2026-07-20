import type { Metadata } from "next";

import { SignInScreen } from "@/components/auth/sign-in-screen";
import { brand } from "@/lib/brand";
import { environment } from "@/lib/env";

export const metadata: Metadata = {
  title: `Sign in | ${brand.name}`,
  description: `Secure adult sign-in and clearly labelled role previews for ${brand.name}.`,
};

interface SignInPageProps {
  searchParams: Promise<{ error?: string | string[] }>;
}

export default async function SignInPage({ searchParams }: SignInPageProps) {
  const query = await searchParams;
  const error = Array.isArray(query.error) ? query.error[0] : query.error;

  return (
    <SignInScreen
      callbackError={error === "callback"}
      mode={environment.dataMode}
    />
  );
}
