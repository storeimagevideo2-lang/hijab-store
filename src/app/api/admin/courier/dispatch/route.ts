import { NextResponse } from "next/server";
import { getAdminSession } from "@/lib/server/admin-auth";
import { dispatchOrderToCourier } from "@/lib/server/courier";

export async function POST(request: Request) {
  const session = await getAdminSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized. Admin session required." }, { status: 401 });
  }

  try {
    const body = (await request.json().catch(() => ({}))) as { orderId?: string };
    const orderId = body.orderId?.trim();

    if (!orderId) {
      return NextResponse.json({ error: "Order ID is required." }, { status: 400 });
    }

    const result = await dispatchOrderToCourier(orderId);
    if (!result.ok) {
      return NextResponse.json({ ok: false, message: result.message }, { status: 400 });
    }

    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to dispatch order to courier.";
    return NextResponse.json({ ok: false, message }, { status: 500 });
  }
}
