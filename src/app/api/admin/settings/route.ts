import { NextResponse } from "next/server";
import { getAdminSession } from "@/lib/server/admin-auth";
import {
  getStoreSettings,
  updateStoreSettings,
  type AdminSettingsRecord,
} from "@/lib/server/store-repository";

export async function GET() {
  const session = await getAdminSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const settings = await getStoreSettings();
  return NextResponse.json({ settings });
}

const ALLOWED_SETTINGS_KEYS: Array<keyof AdminSettingsRecord> = [
  "storeName",
  "timezone",
  "currency",
  "lowStockThreshold",
  "monthlySalesTarget",
  "insideDhakaShippingFee",
  "outsideDhakaShippingFee",
  "contactEmail",
  "contactPhone",
  "contactLocation",
  "socialLinks",
  "heroBanner",
  "heroSlides",
  "flashSale",
  "taxonomy",
  "stories",
  "facebookPixel",
  "courier",
];

export async function PATCH(request: Request) {
  const session = await getAdminSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const rawPatch = (await request.json()) as Record<string, unknown>;
    const sanitizedPatch: Partial<AdminSettingsRecord> = {};

    for (const key of ALLOWED_SETTINGS_KEYS) {
      if (key in rawPatch) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (sanitizedPatch as any)[key] = rawPatch[key];
      }
    }

    const settings = await updateStoreSettings(sanitizedPatch);
    return NextResponse.json({ settings });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to update settings.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
