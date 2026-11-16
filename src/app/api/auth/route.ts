import { NextResponse } from "next/server";
import {
  changeCustomerAccountPassword,
  updateCustomerAccountProfile,
  upsertCustomerAccount,
  verifyCustomerAccount,
} from "@/lib/server/store-repository";
import {
  clearCustomerSessionCookie,
  getCustomerSession,
  setCustomerSessionCookie,
} from "@/lib/server/customer-auth";
import { getAdminSession } from "@/lib/server/admin-auth";
import { checkRateLimit, getClientIp } from "@/lib/server/rate-limiter";

export async function POST(request: Request) {
  const clientIp = getClientIp(request);

  try {
    const body = (await request.json()) as {
      action?: "signup" | "login" | "logout" | "update-profile" | "change-password";
      id?: string;
      name?: string;
      phone?: string;
      email?: string;
      address?: string;
      city?: string;
      password?: string;
      currentPassword?: string;
      newPassword?: string;
      identifier?: string;
    };

    if (body.action === "logout") {
      await clearCustomerSessionCookie();
      return NextResponse.json({ ok: true });
    }

    if (body.action === "signup") {
      const rateLimit = checkRateLimit(`auth-signup:${clientIp}`, 8, 60);
      if (!rateLimit.success) {
        return NextResponse.json(
          { ok: false, error: `Too many signup attempts. Please wait ${rateLimit.retryAfterSeconds}s.` },
          { status: 429, headers: { "Retry-After": String(rateLimit.retryAfterSeconds) } },
        );
      }

      if (!body.name?.trim() || !body.phone?.trim()) {
        return NextResponse.json(
          { ok: false, error: "Please enter your full name and phone number." },
          { status: 400 },
        );
      }
      const cleanEmail = body.email?.trim().toLowerCase();
      if (!cleanEmail || !cleanEmail.includes("@") || !cleanEmail.includes(".")) {
        return NextResponse.json(
          { ok: false, error: "A valid email address is required for account creation and password recovery." },
          { status: 400 },
        );
      }
      if (!body.password || body.password.length < 4) {
        return NextResponse.json(
          { ok: false, error: "Password must be at least 4 characters long." },
          { status: 400 },
        );
      }
      const user = await upsertCustomerAccount({
        id: body.id,
        name: body.name,
        phone: body.phone,
        email: body.email,
        address: body.address,
        city: body.city,
        password: body.password,
      });

      await setCustomerSessionCookie({
        userId: user.id,
        phone: user.phone,
        email: user.email,
      });

      return NextResponse.json({ ok: true, user });
    }

    if (body.action === "login") {
      const rateLimit = checkRateLimit(`auth-login:${clientIp}`, 10, 60);
      if (!rateLimit.success) {
        return NextResponse.json(
          { ok: false, error: `Too many login attempts. Please wait ${rateLimit.retryAfterSeconds}s.` },
          { status: 429, headers: { "Retry-After": String(rateLimit.retryAfterSeconds) } },
        );
      }

      if (!body.identifier?.trim() || !body.password) {
        return NextResponse.json(
          { ok: false, error: "Please enter your phone/email and password." },
          { status: 400 },
        );
      }
      const result = await verifyCustomerAccount(body.identifier, body.password);
      if (!result.ok) {
        return NextResponse.json({ ok: false, error: result.error }, { status: 401 });
      }

      await setCustomerSessionCookie({
        userId: result.user.id,
        phone: result.user.phone,
        email: result.user.email,
      });

      return NextResponse.json({ ok: true, user: result.user });
    }

    if (body.action === "update-profile") {
      if (!body.id) {
        return NextResponse.json(
          { ok: false, error: "User ID is required." },
          { status: 400 },
        );
      }

      const [customerSession, adminSession] = await Promise.all([
        getCustomerSession(),
        getAdminSession(),
      ]);

      const isAuthorized =
        adminSession !== null ||
        (customerSession !== null && customerSession.userId === body.id);

      if (!isAuthorized) {
        return NextResponse.json(
          { ok: false, error: "Unauthorized. You can only update your own profile." },
          { status: 401 },
        );
      }

      const user = await updateCustomerAccountProfile({
        id: body.id,
        name: body.name,
        phone: body.phone,
        email: body.email,
        address: body.address,
        city: body.city,
      });

      if (!user) {
        return NextResponse.json(
          { ok: false, error: "Customer account not found." },
          { status: 404 },
        );
      }

      // Update cookie if phone or email changed
      if (customerSession && customerSession.userId === body.id) {
        await setCustomerSessionCookie({
          userId: user.id,
          phone: user.phone,
          email: user.email,
        });
      }

      return NextResponse.json({ ok: true, user });
    }

    if (body.action === "change-password") {
      const rateLimit = checkRateLimit(`auth-chg-pwd:${clientIp}`, 5, 60);
      if (!rateLimit.success) {
        return NextResponse.json(
          { ok: false, error: `Too many password change attempts. Please wait ${rateLimit.retryAfterSeconds}s.` },
          { status: 429, headers: { "Retry-After": String(rateLimit.retryAfterSeconds) } },
        );
      }

      if (!body.id || !body.currentPassword || !body.newPassword) {
        return NextResponse.json(
          { ok: false, error: "Current password and new password are required." },
          { status: 400 },
        );
      }

      const [customerSession, adminSession] = await Promise.all([
        getCustomerSession(),
        getAdminSession(),
      ]);

      const isAuthorized =
        adminSession !== null ||
        (customerSession !== null && customerSession.userId === body.id);

      if (!isAuthorized) {
        return NextResponse.json(
          { ok: false, error: "Unauthorized. Please log in to change password." },
          { status: 401 },
        );
      }

      const result = await changeCustomerAccountPassword({
        id: body.id,
        phone: body.phone,
        currentPassword: body.currentPassword,
        newPassword: body.newPassword,
      });
      if (!result.ok) {
        return NextResponse.json({ ok: false, error: result.error }, { status: 400 });
      }
      return NextResponse.json({ ok: true });
    }

    return NextResponse.json({ ok: false, error: "Invalid auth action." }, { status: 400 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Authentication request failed.";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
