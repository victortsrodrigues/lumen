/**
 * Extracts a human-readable error message from an API error, in priority order:
 * 1. Backend response `message` field
 * 2. Backend response `error` field (legacy backend pattern)
 * 3. Backend response `detail` field (problem+json)
 * 4. ApiError.message (generic HTTP status)
 * 5. Fallback generic message
 *
 * Works with the custom-fetch ApiError class (err.data) and also axios-style
 * errors (err.response.data) for compatibility.
 */
export function getErrorMessage(err: unknown, fallback = "Ocorreu um erro inesperado."): string {
  if (!err) return fallback;

  // Custom-fetch ApiError
  const errObj = err as {
    data?: unknown;
    message?: string;
    response?: { data?: unknown };
  };

  // Try err.data first (custom-fetch)
  const dataSources: unknown[] = [];
  if (errObj.data) dataSources.push(errObj.data);
  if (errObj.response?.data) dataSources.push(errObj.response.data);

  for (const data of dataSources) {
    if (!data) continue;
    if (typeof data === "string" && data.trim()) return data.trim();
    if (typeof data === "object") {
      const d = data as Record<string, unknown>;
      const candidate =
        (typeof d.message === "string" && d.message.trim()) ||
        (typeof d.error === "string" && d.error.trim()) ||
        (typeof d.detail === "string" && d.detail.trim()) ||
        (typeof d.error_description === "string" && d.error_description.trim());
      if (candidate) return candidate;
    }
  }

  if (typeof errObj.message === "string" && errObj.message.trim()) {
    return errObj.message;
  }

  return fallback;
}
