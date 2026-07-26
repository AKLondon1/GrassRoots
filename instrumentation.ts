import { reportOperationalError } from "@/lib/observability/health";

export function register() {
  // Structured stderr logging is the supported baseline; a vendor SDK is not configured by this repository.
}

export function onRequestError(error: unknown) {
  reportOperationalError(error, "request.failed");
}
