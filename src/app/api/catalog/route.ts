import { NextResponse } from "next/server";
import { getAllStoreProducts, getStoreSettings } from "@/lib/server/store-repository";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const [products, settings] = await Promise.all([
      getAllStoreProducts({ bypassCache: true }),
      getStoreSettings(),
    ]);

    // Sanitize internal wholesale cost data from public API response
    const sanitizedProducts = products.map((p) => {
      const { costPrice: _cp, lowStockThreshold: _lst, ...publicData } = p;
      void _cp;
      void _lst;
      return publicData;
    });

    return NextResponse.json({
      ok: true,
      products: sanitizedProducts,
      taxonomy: settings.taxonomy,
      contact: {
        email: settings.contactEmail,
        phone: settings.contactPhone,
        location: settings.contactLocation,
      },
      socialLinks: settings.socialLinks,
    });
  } catch {
    return NextResponse.json(
      { ok: false, error: "Failed to load catalog" },
      { status: 500 },
    );
  }
}
