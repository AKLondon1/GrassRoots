import { normaliseInternalPath } from "@/lib/supabase/auth-callback";

export interface GoogleOAuthRequest {
  nextPath: string;
  redirectTo: string;
}

export function buildGoogleOAuthRequest(
  requestOrigin: string | null,
  requestedNextPath: string | null | undefined,
  configuredOrigin: string | undefined,
  nodeEnv: string,
): GoogleOAuthRequest | null {
  try {
    const trustedOrigin =
      configuredOrigin ?? (nodeEnv === "production" ? undefined : requestOrigin);
    if (!trustedOrigin) return null;

    const trustedUrl = new URL(trustedOrigin);
    if (
      nodeEnv === "production" &&
      (trustedUrl.protocol !== "https:" ||
        (requestOrigin &&
          new URL(requestOrigin).origin !== trustedUrl.origin))
    ) {
      return null;
    }

    const nextPath = normaliseInternalPath(requestedNextPath);
    const redirectTo = new URL("/auth/callback", trustedUrl);
    redirectTo.searchParams.set("next", nextPath === "/" ? "/app" : nextPath);

    return { nextPath, redirectTo: redirectTo.toString() };
  } catch {
    return null;
  }
}
