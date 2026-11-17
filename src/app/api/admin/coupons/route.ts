import { NextResponse } from "next/server";
import { getAdminSession } from "@/lib/server/admin-auth";
import {
  deleteStoreCoupon,
  getStoreCoupons,
  upsertStoreCoupon,
} from "@/lib/server/store-repository";

export async function GET() {
  const session = await getAdminSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const coupons = await getStoreCoupons();
  return NextResponse.json({ coupons });
}

export async function POST(request: Request) {
  const session = await getAdminSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const body = (await request.json()) as {
      id?: string;
      code?: string;
      description?: string;
      discountType?: "percentage" | "fixed";
      discountValue?: number;
      minOrderAmount?: number;
      active?: boolean;
    };

    if (!body.code?.trim()) {
      return NextResponse.json({ error: "Coupon code is required." }, { status: 400 });
    }

    const discountType = body.discountType === "fixed" ? "fixed" : "percentage";
    const discountVal = Number(body.discountValue ?? 10);
    const minOrderAmt = Math.max(0, Number(body.minOrderAmount ?? 0));

    if (discountType === "percentage") {
      if (Number.isNaN(discountVal) || discountVal < 1 || discountVal > 100) {
        return NextResponse.json(
          { error: "Percentage discount must be between 1% and 100%." },
          { status: 400 },
        );
      }
    } else {
      if (Number.isNaN(discountVal) || discountVal <= 0) {
        return NextResponse.json(
          { error: "Fixed discount amount must be greater than ৳0." },
          { status: 400 },
        );
      }
    }

    const coupon = await upsertStoreCoupon({
      id: body.id,
      code: body.code.trim().toUpperCase(),
      description: body.description,
      discountType,
      discountValue: discountVal,
      minOrderAmount: minOrderAmt,
      active: body.active ?? true,
    });

    return NextResponse.json({ coupon });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to save coupon.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  const session = await getAdminSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");
  if (!id) return NextResponse.json({ error: "Coupon ID is required." }, { status: 400 });

  await deleteStoreCoupon(id);
  return NextResponse.json({ ok: true });
}
