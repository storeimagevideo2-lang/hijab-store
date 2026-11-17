import { NextResponse } from "next/server";
import { getAdminSession } from "@/lib/server/admin-auth";
import {
  buildDashboardAnalytics,
  type DateRangePreset,
} from "@/lib/server/analytics-engine";
import {
  getAllStoreProducts,
  getAllStoreReviews,
  getPaginatedContactMessages,
  getPaginatedCustomerAccounts,
  getPaginatedStoreOrders,
  getStoreActivities,
  getStoreCoupons,
  getStoreOrdersSince,
  getStoreSettings,
} from "@/lib/server/store-repository";

function computeAnalyticsSinceIso(preset: DateRangePreset, customStart?: string): string {
  const now = new Date();
  const daysBack = (days: number) => new Date(now.getTime() - days * 86_400_000).toISOString();

  if (preset === "this_year") {
    // Include previous year too for year-over-year comparison
    return new Date(Date.UTC(now.getUTCFullYear() - 1, 0, 1)).toISOString();
  }
  if (preset === "custom" && customStart) {
    const parsed = new Date(customStart);
    if (!Number.isNaN(parsed.getTime())) {
      // Go back an extra 65 days before customStart to cover comparison window + thisMonth KPI
      const earlier = new Date(parsed.getTime() - 65 * 86_400_000);
      const sixtyFiveDaysAgo = new Date(now.getTime() - 65 * 86_400_000);
      return (earlier < sixtyFiveDaysAgo ? earlier : sixtyFiveDaysAgo).toISOString();
    }
  }
  if (preset === "last_month") {
    return daysBack(95);
  }
  // today, yesterday, last_7_days, last_30_days, this_month: 65 days covers current + comparison + thisMonth
  return daysBack(65);
}

const VALID_PRESETS: DateRangePreset[] = [
  "today",
  "yesterday",
  "last_7_days",
  "last_30_days",
  "this_month",
  "last_month",
  "this_year",
  "custom",
];

export async function GET(request: Request) {
  const session = await getAdminSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { searchParams } = new URL(request.url);
    const rawPreset = searchParams.get("preset") as DateRangePreset | null;
    const preset: DateRangePreset =
      rawPreset && VALID_PRESETS.includes(rawPreset) ? rawPreset : "last_30_days";
    const startDate = searchParams.get("startDate") ?? undefined;
    const endDate = searchParams.get("endDate") ?? undefined;

    const sinceIso = computeAnalyticsSinceIso(preset, startDate);

    const [
      products,
      analyticsOrders,
      ordersPage,
      coupons,
      settings,
      activities,
      reviews,
      customersPage,
      messagesPage,
    ] = await Promise.all([
      getAllStoreProducts({ bypassCache: true, includeInactive: true }),
      getStoreOrdersSince(sinceIso),
      getPaginatedStoreOrders({ page: 1, limit: 20 }),
      getStoreCoupons(),
      getStoreSettings(),
      getStoreActivities(),
      getAllStoreReviews({ status: "all" }),
      getPaginatedCustomerAccounts({ page: 1, limit: 10 }),
      getPaginatedContactMessages({ page: 1, limit: 10 }),
    ]);

    const analytics = buildDashboardAnalytics({
      products,
      orders: analyticsOrders,
      coupons,
      settings,
      activities,
      preset,
      customStart: startDate,
      customEnd: endDate,
    });

    return NextResponse.json({
      analytics,
      products,
      orders: ordersPage.orders,
      ordersTotal: ordersPage.total,
      reviews,
      registeredCustomers: customersPage.customers,
      registeredCustomersTotal: customersPage.total,
      contactMessages: messagesPage.messages,
      contactMessagesTotal: messagesPage.total,
      unreadContactMessagesCount: messagesPage.unreadCount,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to compute analytics.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
