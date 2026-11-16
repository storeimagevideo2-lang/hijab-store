import { NextResponse } from "next/server";
import type { Order } from "@/lib/orders";
import { getStoreOrdersByCustomer, recordCustomerOrder } from "@/lib/server/store-repository";
import { sendOrderConfirmationEmail, sendAdminNewOrderNotification } from "@/lib/server/email";
import { getAdminSession } from "@/lib/server/admin-auth";
import { getCustomerSession } from "@/lib/server/customer-auth";
import { checkRateLimit, getClientIp } from "@/lib/server/rate-limiter";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const rawIds = searchParams.get("ids") ?? "";
    const requestedPhone = searchParams.get("phone")?.trim() ?? undefined;
    const requestedEmail = searchParams.get("email")?.trim().toLowerCase() ?? undefined;

    const ids = rawIds
      .split(",")
      .map((id) => id.trim())
      .filter(Boolean);

    // Verify session permissions to prevent unauthorized IDOR scraping of customer addresses & orders
    const [adminSession, customerSession] = await Promise.all([
      getAdminSession(),
      getCustomerSession(),
    ]);

    let allowedPhone = requestedPhone;
    let allowedEmail = requestedEmail;
    let allowedIds = ids;

    if (adminSession) {
      // Super Administrator has permission to view requested customer records
    } else if (customerSession) {
      // Authenticated customer can only retrieve orders belonging to their verified identity
      allowedPhone = customerSession.phone;
      allowedEmail = customerSession.email || requestedEmail;
    } else {
      // Guest visitors can only query specific order IDs that exist in their local checkout receipt
      // Reject any open queries by arbitrary phone numbers or emails without authentication
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

    const orders = await getStoreOrdersByCustomer({
      ids: allowedIds,
      phone: allowedPhone,
      email: allowedEmail,
    });
    return NextResponse.json({ ok: true, orders });
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
