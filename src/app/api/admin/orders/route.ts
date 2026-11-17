import { NextResponse } from "next/server";
import { getAdminSession } from "@/lib/server/admin-auth";
import {
  getAllStoreOrders,
  getPaginatedStoreOrders,
  getStoreOrdersByIds,
  updateStoreOrder,
  type AdminDeliveryStatus,
  type AdminOrderStatus,
  type AdminPaymentStatus,
} from "@/lib/server/store-repository";

const VALID_ORDER_STATUSES: Set<AdminOrderStatus> = new Set([
  "Pending",
  "Confirmed",
  "Processing",
  "Shipped",
  "Delivered",
  "Cancelled",
  "Returned",
  "Refunded",
]);

const VALID_PAYMENT_STATUSES: Set<AdminPaymentStatus> = new Set([
  "Pending",
  "Paid",
  "Failed",
  "Refunded",
  "Partially Refunded",
]);

const VALID_DELIVERY_STATUSES: Set<AdminDeliveryStatus> = new Set([
  "Pending Dispatch",
  "In Transit",
  "Out for Delivery",
  "Delivered",
  "Returned",
  "Cancelled",
]);

// Allowed state transitions: prevents invalid workflows like Delivered -> Pending or Refunded -> Delivered
const ALLOWED_STATUS_TRANSITIONS: Record<AdminOrderStatus, AdminOrderStatus[]> = {
  Pending: ["Confirmed", "Processing", "Cancelled"],
  Confirmed: ["Processing", "Shipped", "Cancelled"],
  Processing: ["Shipped", "Cancelled"],
  Shipped: ["Delivered", "Returned", "Cancelled"],
  Delivered: ["Returned", "Refunded"],
  Returned: ["Refunded"],
  Cancelled: [],
  Refunded: [],
};

export async function GET(request: Request) {
  const session = await getAdminSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const pageParam = searchParams.get("page");
  const limitParam = searchParams.get("limit");
  const offsetParam = searchParams.get("offset");
  const status = searchParams.get("status") ?? undefined;
  const paymentStatus = searchParams.get("paymentStatus") ?? undefined;
  const paymentMethod = searchParams.get("paymentMethod") ?? undefined;
  const search = searchParams.get("search") ?? undefined;

  if (pageParam || status || paymentStatus || paymentMethod || search) {
    const result = await getPaginatedStoreOrders({
      page: pageParam ? Number(pageParam) : 1,
      limit: limitParam ? Number(limitParam) : 20,
      status,
      paymentStatus,
      paymentMethod,
      search,
    });
    return NextResponse.json({ ok: true, ...result });
  }

  const limit = limitParam ? Math.max(1, Math.min(500, Number(limitParam))) : undefined;
  const offset = offsetParam ? Math.max(0, Number(offsetParam)) : undefined;

  const orders = await getAllStoreOrders({ limit, offset });
  return NextResponse.json({ ok: true, orders, total: orders.length });
}

export async function PATCH(request: Request) {
  const session = await getAdminSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = (await request.json()) as {
      id?: string;
      status?: AdminOrderStatus;
      paymentStatus?: AdminPaymentStatus;
      deliveryStatus?: AdminDeliveryStatus;
      refundAmount?: number;
    };
    if (!body.id) {
      return NextResponse.json({ error: "Order ID is required." }, { status: 400 });
    }

    if (body.status && !VALID_ORDER_STATUSES.has(body.status)) {
      return NextResponse.json(
        {
          error: `Invalid status "${body.status}". Allowed values: ${Array.from(VALID_ORDER_STATUSES).join(", ")}.`,
        },
        { status: 400 },
      );
    }

    if (body.status) {
      const existingOrders = await getStoreOrdersByIds([body.id]);
      const currentOrder = existingOrders[0];
      if (currentOrder && currentOrder.status !== body.status) {
        const allowedNext = ALLOWED_STATUS_TRANSITIONS[currentOrder.status] ?? [];
        if (!allowedNext.includes(body.status)) {
          return NextResponse.json(
            {
              error: `Invalid status transition from "${currentOrder.status}" to "${body.status}". Allowed transitions: ${allowedNext.join(", ") || "None (terminal status)"}.`,
            },
            { status: 400 },
          );
        }
      }
    }

    if (body.paymentStatus && !VALID_PAYMENT_STATUSES.has(body.paymentStatus)) {
      return NextResponse.json(
        {
          error: `Invalid payment status "${body.paymentStatus}". Allowed values: ${Array.from(VALID_PAYMENT_STATUSES).join(", ")}.`,
        },
        { status: 400 },
      );
    }

    if (body.deliveryStatus && !VALID_DELIVERY_STATUSES.has(body.deliveryStatus)) {
      return NextResponse.json(
        {
          error: `Invalid delivery status "${body.deliveryStatus}". Allowed values: ${Array.from(VALID_DELIVERY_STATUSES).join(", ")}.`,
        },
        { status: 400 },
      );
    }

    const result = await updateStoreOrder({
      id: body.id,
      status: body.status,
      paymentStatus: body.paymentStatus,
      deliveryStatus: body.deliveryStatus,
      refundAmount: body.refundAmount,
    });

    if (!result.order) {
      return NextResponse.json({ error: "Order not found." }, { status: 404 });
    }

    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to update order.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
