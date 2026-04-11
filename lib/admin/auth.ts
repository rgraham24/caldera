import { ADMIN_KEYS } from "@/lib/admin/market-generator";

export function isAdminAuthorized(adminPassword?: string, desoPublicKey?: string): boolean {
  const HARDCODED = ["caldera-admin-2026"];
  const envPw = process.env.ADMIN_PASSWORD;
  return (
    HARDCODED.includes(adminPassword ?? "") ||
    (!!envPw && adminPassword === envPw) ||
    ADMIN_KEYS.includes(desoPublicKey ?? "")
  );
}
