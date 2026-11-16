import { randomBytes } from "node:crypto";

function isRealValue(value: string | undefined): value is string {
  if (!value) return false;
  const trimmed = value.trim();
  if (!trimmed) return false;
  if (trimmed.startsWith("your-") || trimmed.includes("your-project-id")) return false;
  return true;
}

// Memory-resident ephemeral secret if ADMIN_SESSION_SECRET is omitted in environment,
// ensuring predictable hardcoded fallback keys never compromise production sessions.
let ephemeralAdminSecret: string | null = null;
function getEphemeralAdminSecret(): string {
  if (!ephemeralAdminSecret) {
    ephemeralAdminSecret = randomBytes(32).toString("hex");
  }
  return ephemeralAdminSecret;
}

export function getBackendConfig() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim().replace(/\/+$/, "");
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();
  const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();

  const cloudinaryCloudName = process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME?.trim();
  const cloudinaryApiKey = process.env.CLOUDINARY_API_KEY?.trim();
  const cloudinaryApiSecret = process.env.CLOUDINARY_API_SECRET?.trim();

  const adminEmail = process.env.ADMIN_EMAIL?.trim() || "admin@noor.com";
  const adminPassword = process.env.ADMIN_PASSWORD?.trim() || "";
  const adminSecret = process.env.ADMIN_SESSION_SECRET?.trim() || getEphemeralAdminSecret();

  const supabaseConfigured =
    isRealValue(supabaseUrl) &&
    (isRealValue(supabaseServiceRoleKey) || isRealValue(supabaseAnonKey));

  const supabaseWriteConfigured =
    isRealValue(supabaseUrl) && isRealValue(supabaseServiceRoleKey);

  const cloudinaryConfigured =
    isRealValue(cloudinaryCloudName) &&
    isRealValue(cloudinaryApiKey) &&
    isRealValue(cloudinaryApiSecret);

  return {
    supabaseUrl: supabaseUrl || "",
    supabaseAnonKey: supabaseAnonKey || "",
    supabaseServiceRoleKey: supabaseServiceRoleKey || "",
    supabaseConfigured,
    supabaseWriteConfigured,
    cloudinaryCloudName: cloudinaryCloudName || "",
    cloudinaryApiKey: cloudinaryApiKey || "",
    cloudinaryApiSecret: cloudinaryApiSecret || "",
    cloudinaryConfigured,
    adminEmail,
    adminPassword,
    adminSecret,
  };
}
