import { createHash } from "crypto";
import { cookies } from "next/headers";

/**
 * Lightweight admin auth for the web panel.
 * Password comes from ADMIN_PASSWORD (fallback documented in .env.example).
 * The cookie stores only a salted hash — never the password itself.
 */
export function getAdminPassword(): string {
  return process.env.ADMIN_PASSWORD?.trim() || "studentai-admin";
}

export function adminToken(): string {
  return createHash("sha256")
    .update(`studentai::${getAdminPassword()}`)
    .digest("hex");
}

export const ADMIN_COOKIE = "sa_admin";

export async function isAdminAuthed(): Promise<boolean> {
  const store = await cookies();
  return store.get(ADMIN_COOKIE)?.value === adminToken();
}
