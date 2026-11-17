import { NextResponse } from "next/server";
import type { Order } from "@/lib/orders";
import {
  getStoreOrdersByCustomer,
  normalizePhoneForMatch,
  recordCustomerOrder,
} from "@/lib/server/store-repository";
import { sendOrderConfirmationEmail, sendAdminNewOrderNotification } from "@/lib/server/email";
import { getAdminSession } from "@/lib/server/admin-auth";
import { getCustomerSession } from "@/lib/server/customer-auth";
import { checkRateLimit, getClientIp } from "@/lib/server/rate-limiter";

function maskName(name: string): string {
  if (!name) return "";
  const parts = name.trim().split(/\s+/);
  return parts.map((p) => (p.length <= 1 ? p : `${p[0]}***`)).join(" ");
}

function maskPhone(phone: string): string {
  if (!phone) return "";
  const digits = phone.replace(/\D/g, "");
  if (digits.length <= 4) return "****";
  return digits.slice(0, 3) + "****" + digits.slice(-3);
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const rawIds = searchParams.get("ids") ?? "";
    const rawTokens = searchParams.get("tokens") ?? searchParams.get("token") ?? "";
    const requestedPhone = searchParams.get("phone")?.trim() ?? undefined;
    const requestedEmail = searchParams.get("email")?.trim().toLowerCase() ?? undefined;

    const ids = rawIds
      .split(",")
      .map((id) => id.trim())
      .filter(Boolean);

    const tokenSet = new Set(
      rawTokens
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean),
    );

    // Verify session permissions to prevent unauthorized IDOR scraping of customer addresses & orders
    const [adminSession, customerSession] = await Promise.all([
      getAdminSession(),
      getCustomerSession(),
    ]);

    let allowedPhone = requestedPhone;
    let allowedEmail = requestedEmail;
    let allowedIds = ids;
    const isGuest = !adminSession && !customerSession;

    if (adminSession) {
      // Super Administrator has permission to view requested customer records
    } else if (customerSession) {
      // Authenticated customer can only retrieve orders belonging to their verified identity
      allowedPhone = customerSession.phone;
      allowedEmail = customerSession.email || requestedEmail;
    } else {
      // Guest visitors can only query specific order IDs
      if (ids.length === 0) {
        return NextResponse.json(
          { ok: false, error: "Please log in to query order history by phone or email." },
          { status: 401 },
        );
      }
      allowedPhone = undefined;
      allowedEmail = undefined;
      allowedIds = ids.slice(0, 30);
    }

    if (allowedIds.length === 0 && !allowedPhone && !allowedEmail) {
      return NextResponse.json({ ok: true, orders: [] });
    }

    const rawOrders = await getStoreOrdersByCustomer({
      ids: allowedIds,
      phone: allowedPhone,
      email: allowedEmail,
    });

    // If guest: enforce receipt token or phone verification to protect customer PII from enumeration
    const sanitizedOrders = rawOrders.map((order) => {
      if (!isGuest) {
        return order;
      }

      const hasValidToken = Boolean(order.receiptToken && tokenSet.has(order.receiptToken));
      const hasMatchingPhone = Boolean(
        requestedPhone &&
          order.customer?.phone &&
          normalizePhoneForMatch(order.customer.phone) === normalizePhoneForMatch(requestedPhone),
      );

      if (hasValidToken || hasMatchingPhone) {
        return order;
      }

      // Unauthenticated visitor with guessed order ID: mask customer PII
      return {
        ...order,
        receiptToken: undefined,
        customer: {
          name: maskName(order.customer.name),
          phone: maskPhone(order.customer.phone),
          email: undefined,
          address: "Protected for customer privacy",
          city: order.customer.city,
          notes: undefined,
        },
      };
    });

    return NextResponse.json({ ok: true, orders: sanitizedOrders });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to retrieve orders.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const clientIp = getClientIp(request);
  const rateLimit = checkRateLimit(`order-placement:${clientIp}`, 10, 60);
  if (!rateLimit.success) {
    return NextResponse.json(
      { error: `Too many order attempts. Please wait ${rateLimit.retryAfterSeconds}s.` },
      { status: 429, headers: { "Retry-After": String(rateLimit.retryAfterSeconds) } },
    );
  }

  try {
    const order = (await request.json()) as Order;
    if (!order?.id || !order?.customer?.name || !order?.customer?.phone) {
      return NextResponse.json({ error: "Invalid order payload." }, { status: 400 });
    }
    const result = await recordCustomerOrder(order);

    // Trigger confirmation email in the background without blocking the checkout response
    if (order.customer?.email && order.customer.email.includes("@")) {
      void sendOrderConfirmationEmail({ order, to: order.customer.email }).catch(() => {});
    }
    void sendAdminNewOrderNotification({ order }).catch(() => {});

    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to record order.";
    const isStockError =
      message.toLowerCase().includes("stock") ||
      message.toLowerCase().includes("unavailable") ||
      message.includes("স্টক");
    return NextResponse.json({ error: message }, { status: isStockError ? 400 : 500 });
  }
}
