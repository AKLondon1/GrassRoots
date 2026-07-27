export type AuthExchangeError = { message: string; code?: string };

export type AuthCodeExchange = (
  code: string,
) => Promise<{ error: AuthExchangeError | null }>;

export type AuthSessionCheck = () => Promise<boolean>;

// Supabase reports these when a single-use PKCE code (its "flow state") has
// already been exchanged, i.e. a concurrent duplicate of a callback that
// succeeded. They must not be widened to arbitrary OAuth failures.
const CONSUMED_FLOW_STATE_CODES = new Set([
  "flow_state_not_found",
  "flow_state_expired",
]);
const CONSUMED_FLOW_STATE_MESSAGE = /invalid flow state|no valid flow state/i;

export function isConsumedFlowStateError(
  error: AuthExchangeError | null | undefined,
): boolean {
  if (!error) return false;
  if (error.code && CONSUMED_FLOW_STATE_CODES.has(error.code)) return true;
  return CONSUMED_FLOW_STATE_MESSAGE.test(error.message);
}

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

  let exchangeError: AuthExchangeError;
  try {
    const { error } = await exchangeCode(code);
    if (!error) return success;
    exchangeError = error;
  } catch (thrown) {
    exchangeError = {
      message:
        thrown instanceof Error ? thrown.message : "Unexpected exchange failure",
    };
  }

  // A concurrent duplicate callback (double navigation, prefetch, retry)
  // loses the race for the single-use PKCE code while the winning request is
  // still delivering the session cookie to the browser, so no session is
  // visible here yet. Redirect to the destination anyway: it sits behind the
  // auth guard, which bounces the request back to sign-in if the winning
  // response's session never materialises.
  if (isConsumedFlowStateError(exchangeError)) return success;

  // A non-concurrent replay (e.g. revisiting the callback URL after signing
  // in) can fail the exchange for other reasons while the request already
  // carries a valid session. Honour that session.
  try {
    if (await hasValidSession?.()) return success;
  } catch {
    // No recoverable session; fall through to the error redirect.
  }

  return { destination: "/sign-in?error=callback", status: "error" };
}
