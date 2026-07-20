export type AuthCodeExchange = (
  code: string,
) => Promise<{ error: { message: string } | null }>;

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
): Promise<AuthCallbackResult> {
  const url = new URL(requestUrl);
  const code = url.searchParams.get("code");
  if (!code) {
    return { destination: "/sign-in?error=callback", status: "error" };
  }

  try {
    const { error } = await exchangeCode(code);
    if (error) {
      return { destination: "/sign-in?error=callback", status: "error" };
    }
  } catch {
    return { destination: "/sign-in?error=callback", status: "error" };
  }

  return {
    destination: normaliseInternalPath(url.searchParams.get("next")),
    status: "success",
  };
}
