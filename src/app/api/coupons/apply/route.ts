import { NextResponse } from "next/server";
import { applyStoreCoupon } from "@/lib/server/store-repository";
import { checkRateLimit, getClientIp } from "@/lib/server/rate-limiter";

export async function POST(request: Request) {
  const clientIp = getClientIp(request);
  const rateLimit = checkRateLimit(`coupon-apply:${clientIp}`, 15, 60);
  if (!rateLimit.success) {
    return NextResponse.json(
      { ok: false, message: `Too many coupon attempts. Please wait ${rateLimit.retryAfterSeconds}s.` },
      { status: 429, headers: { "Retry-After": String(rateLimit.retryAfterSeconds) } },
    );
  }

  try {
    const body = await request.json();
    const { code, subtotal } = body ?? {};

    if (!code || typeof code !== "string" || !code.trim()) {
      return NextResponse.json({ ok: false, message: "Please enter a coupon code." }, { status: 400 });
    }

    const numericSubtotal = Math.max(0, Number(subtotal) || 0);
    const result = await applyStoreCoupon(code, numericSubtotal);

    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to apply coupon.";
    return NextResponse.json({ ok: false, message }, { status: 500 });
  }
}
