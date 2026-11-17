import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import {
  ADMIN_COOKIE_NAME,
  createAdminSessionToken,
  getAdminSession,
} from "@/lib/server/admin-auth";
import { getBackendConfig } from "@/lib/server/env";
import { checkRateLimit, getClientIp } from "@/lib/server/rate-limiter";

export async function GET() {
  const session = await getAdminSession();
  if (!session) {
    return NextResponse.json({
      authenticated: false,
      email: null,
      status: null,
    });
  }
  const config = getBackendConfig();
  return NextResponse.json({
    authenticated: true,
    email: session.email,
    status: {
      supabaseConfigured: config.supabaseConfigured,
      supabaseWriteConfigured: config.supabaseWriteConfigured,
      cloudinaryConfigured: config.cloudinaryConfigured,
      defaultAdminEmail: config.adminEmail,
    },
  });
}

export async function POST(request: Request) {
  const clientIp = getClientIp(request);
  const ipRateLimit = checkRateLimit(`admin-login:${clientIp}`, 5, 60);
  if (!ipRateLimit.success) {
    return NextResponse.json(
      { error: `Too many login attempts. Please wait ${ipRateLimit.retryAfterSeconds}s before retrying.` },
      { status: 429, headers: { "Retry-After": String(ipRateLimit.retryAfterSeconds) } },
    );
  }

  try {
    const body = (await request.json()) as { email?: string; password?: string };
    const config = getBackendConfig();

    const email = (body.email ?? "").trim();
    const password = body.password ?? "";

    if (!email) {
      return NextResponse.json({ error: "Email is required." }, { status: 400 });
    }

    // Email-based lockout (prevents distributed IP brute force against admin accounts)
    const emailLockout = checkRateLimit(`admin-lockout:${email.toLowerCase()}`, 5, 15 * 60);
    if (!emailLockout.success) {
      return NextResponse.json(
        {
          error: `This account is temporarily locked due to multiple failed login attempts. Please try again in ${Math.ceil(emailLockout.retryAfterSeconds / 60)} minute(s).`,
        },
        { status: 429, headers: { "Retry-After": String(emailLockout.retryAfterSeconds) } },
      );
    }

    if (!config.adminPassword) {
      return NextResponse.json(
        { error: "Admin login is disabled until ADMIN_PASSWORD is set in environment." },
        { status: 500 },
      );
    }

    const emailMatch = email.toLowerCase() === config.adminEmail.toLowerCase();
    const candidateBuf = Buffer.from(password);
    const expectedBuf = Buffer.from(config.adminPassword);
    const passwordMatch =
      candidateBuf.length === expectedBuf.length &&
      timingSafeEqual(candidateBuf, expectedBuf);

    if (!emailMatch || !passwordMatch) {
      return NextResponse.json(
        { error: "Invalid admin email or password." },
        { status: 401 },
      );
    }

    const token = createAdminSessionToken(config.adminEmail);
    const cookieStore = await cookies();
    cookieStore.set(ADMIN_COOKIE_NAME, token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24 * 7, // 7 days
    });

    return NextResponse.json({
      ok: true,
      email: config.adminEmail,
    });
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }
}

export async function DELETE() {
  const cookieStore = await cookies();
  cookieStore.delete(ADMIN_COOKIE_NAME);
  return NextResponse.json({ ok: true });
}
