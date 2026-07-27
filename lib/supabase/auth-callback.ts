export type AuthCodeExchange = (
  code: string,
) => Promise<{ error: { message: string } | null }>;

export type AuthSessionCheck = () => Promise<boolean>;

type AuthCallbackResult = {
  destination: string;
  status: "success" | "error";
};

export function createAuthResponseHeaders(): Headers {
  return new Headers({
    "Cache-Control": "private, no-cache, no-store, max-age=0",
    Expires: "0",
    Pragma: "no-cache",
  });
}

export function normaliseInternalPath(value: string | null | undefined): string {
  return value?.startsWith("/") &&
    !value.startsWith("//") &&
    !/[\\\u0000-\u001f]/.test(value)
    ? value
    : "/";
}

export async function completeAuthCallback(
  requestUrl: string,
  exchangeCode: AuthCodeExchange,
  hasValidSession?: AuthSessionCheck,
): Promise<AuthCallbackResult> {
  const url = new URL(requestUrl);
  const code = url.searchParams.get("code");
  if (!code) {
    return { destination: "/sign-in?error=callback", status: "error" };
  }

  const destination = normaliseInternalPath(url.searchParams.get("next"));
  const success: AuthCallbackResult = {
    destination: destination === "/" ? "/app" : destination,
    status: "success",
  };

  try {
    const { error } = await exchangeCode(code);
    if (!error) return success;
  } catch {
    // Treated identically to an exchange error below.
  }

  // A PKCE code is single-use, so a duplicate callback request (retry,
  // prefetch, double navigation) fails the exchange even though the first
  // request already established a session. Honour that session instead of
  // bouncing an authenticated user to the error page.
  try {
    if (await hasValidSession?.()) return success;
  } catch {
    // No recoverable session; fall through to the error redirect.
  }

  return { destination: "/sign-in?error=callback", status: "error" };
}
