import { NextResponse } from "next/server";
import { createPasswordResetRequest } from "@/lib/server/store-repository";
import { sendPasswordResetEmail } from "@/lib/server/email";
import { checkRateLimit, getClientIp } from "@/lib/server/rate-limiter";

export async function POST(request: Request) {
  const clientIp = getClientIp(request);
  const rateLimit = checkRateLimit(`forgot-password:${clientIp}`, 4, 300);
  if (!rateLimit.success) {
    return NextResponse.json(
      { ok: false, error: `Too many password reset requests. Please wait ${rateLimit.retryAfterSeconds}s.` },
      { status: 429, headers: { "Retry-After": String(rateLimit.retryAfterSeconds) } },
    );
  }

  try {
    const body = (await request.json().catch(() => ({}))) as { email?: string };
    const email = body.email?.trim().toLowerCase();

    if (!email || !email.includes("@")) {
      return NextResponse.json(
        { ok: false, error: "Please enter a valid email address." },
        { status: 400 },
      );
    }

    const resetReq = await createPasswordResetRequest(email);
    if (!resetReq.ok) {
      // Prevent Email Enumeration: Always return standard message even if account does not exist
      return NextResponse.json({
        ok: true,
        message: "If an account is associated with this email, a password reset link and verification code have been sent.",
      });
    }

    // Determine Base URL securely (Prevent Host Header Poisoning)
    let baseUrl = process.env.NEXT_PUBLIC_SITE_URL || process.env.SITE_URL;
    if (!baseUrl) {
      const forwardedHost = request.headers.get("x-forwarded-host");
      const host = (forwardedHost ? forwardedHost.split(",")[0].trim() : request.headers.get("host")) || "localhost:3000";
      const cleanHost = host.replace(/[^a-zA-Z0-9.:_-]/g, "");
      const protocol = cleanHost.includes("localhost") || cleanHost.startsWith("127.") ? "http" : "https";
      baseUrl = `${protocol}://${cleanHost}`;
    }
    const resetUrl = `${baseUrl.replace(/\/$/, "")}/reset-password?token=${encodeURIComponent(resetReq.token)}`;

    const emailResult = await sendPasswordResetEmail({
      to: resetReq.email,
      name: resetReq.name,
      resetUrl,
      resetCode: resetReq.code,
    });

    // In production, NEVER expose devPreview, reset codes, or tokens in the API response!
    const isDevelopment = process.env.NODE_ENV !== "production";

    return NextResponse.json({
      ok: true,
      message: "If an account is associated with this email, a password reset link and verification code have been sent.",
      devMode: isDevelopment && emailResult.devMode,
      devPreview:
        isDevelopment && emailResult.devMode
          ? {
              code: resetReq.code,
              token: resetReq.token,
              resetUrl,
            }
          : undefined,
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Failed to process forgot password request.";
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
