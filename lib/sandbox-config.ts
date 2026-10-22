const DEFAULT_SANDBOX_URL = "http://localhost:5174/sandbox.html";

export function resolveSandboxUrl(configuredUrl?: string) {
  const url = new URL(configuredUrl || DEFAULT_SANDBOX_URL);
  if (url.pathname === "/") url.pathname = "/sandbox.html";
  return url.toString();
}

export const SANDBOX_URL = resolveSandboxUrl(
  process.env.NEXT_PUBLIC_SANDBOX_URL,
);

export const SANDBOX_ORIGIN = new URL(SANDBOX_URL).origin;
