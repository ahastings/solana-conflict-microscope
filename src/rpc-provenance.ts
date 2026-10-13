/** Public provenance identifies the server, never the full connection URL. */
export function publicRpcEndpoint(value: string | null | undefined): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:" ? url.origin : null;
  } catch { return null; }
}

/** A saved discovery plan must not silently reuse a stripped connection URL. */
export function rpcUrlHasOmittedParts(value: string): boolean {
  try {
    const url = new URL(value);
    return publicRpcEndpoint(value) === null || Boolean(url.username || url.password || url.search || url.hash || url.pathname !== "/");
  } catch { return true; }
}

/** Strip complete HTTP URLs in persisted diagnostics; arbitrary text is not a secrets audit. */
export function publicErrorMessage(error: unknown): string {
  const text = error instanceof Error ? error.message : String(error);
  return text.replace(/https?:\/\/[^\s<>"']+/gi, (url) => publicRpcEndpoint(url) ?? "[invalid RPC URL]");
}
