export const SANDBOX_URL =
  process.env.NEXT_PUBLIC_SANDBOX_URL ||
  "http://localhost:5174/sandbox.html";

export const SANDBOX_ORIGIN = new URL(SANDBOX_URL).origin;
