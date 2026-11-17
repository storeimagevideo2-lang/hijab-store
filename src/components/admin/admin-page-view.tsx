import { AdminDashboard, type AdminSectionId } from "@/components/admin/admin-dashboard";
import { getAdminSession } from "@/lib/server/admin-auth";
import { buildDashboardAnalytics } from "@/lib/server/analytics-engine";
import { getBackendConfig } from "@/lib/server/env";
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
import "@/app/admin/admin.css";

const VALID_SECTIONS = new Set<AdminSectionId>([
  "dashboard",
  "products",
  "categories",
  "orders",
  "customers",
  "inventory",
  "coupons",
  "analytics",
  "reviews",
  "banners",
  "shipping",
  "payments",
  "users",
  "settings",
]);

export async function AdminPageView({
  searchParams,
}: {
  searchParams?: Promise<{ section?: string }>;
}) {
  const resolvedParams = searchParams ? await searchParams : undefined;
  const rawSection = resolvedParams?.section as AdminSectionId | undefined;
  const initialSection: AdminSectionId =
    rawSection && VALID_SECTIONS.has(rawSection) ? rawSection : "dashboard";

  const session = await getAdminSession();
  const config = getBackendConfig();

  // High-scale SSR: fetch only the 65-day analytics window (not 100,000+ lifetime orders)
  // and send only page 1 of orders, customers, and contact messages in the initial HTML payload
  // so the dashboard stays well under Vercel's 4.5 MB response limit at 10,000+ orders/month.
  const sixtyFiveDaysAgoIso = new Date(Date.now() - 65 * 86_400_000).toISOString();

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
  ] = session
    ? await Promise.all([
        getAllStoreProducts({ bypassCache: true, includeInactive: true }),
        getStoreOrdersSince(sixtyFiveDaysAgoIso),
        getPaginatedStoreOrders({ page: 1, limit: 20 }),
        getStoreCoupons(),
        getStoreSettings(),
        getStoreActivities(),
        getAllStoreReviews({ status: "all" }),
        getPaginatedCustomerAccounts({ page: 1, limit: 10 }),
        getPaginatedContactMessages({ page: 1, limit: 10 }),
      ])
    : [
        [],
        [],
        { orders: [], total: 0, page: 1, limit: 20, totalPages: 1 },
        [],
        await getStoreSettings(),
        [],
        [],
        { customers: [], total: 0, page: 1, limit: 10, totalPages: 1 },
        { messages: [], total: 0, unreadCount: 0, page: 1, limit: 10, totalPages: 1 },
      ];

  const initialAnalytics = buildDashboardAnalytics({
    products,
    orders: analyticsOrders,
    coupons,
    settings,
    activities,
    preset: "last_30_days",
  });

  return (
    <main id="main-content">
      <AdminDashboard
        initialAuthenticated={Boolean(session)}
        initialStatus={{
          supabaseConfigured: config.supabaseConfigured,
          supabaseWriteConfigured: config.supabaseWriteConfigured,
          cloudinaryConfigured: config.cloudinaryConfigured,
          defaultAdminEmail: config.adminEmail,
        }}
        initialAnalytics={initialAnalytics}
        initialProducts={products}
        initialOrders={ordersPage.orders}
        initialOrdersTotal={ordersPage.total}
        initialReviews={reviews}
        initialRegisteredCustomers={customersPage.customers}
        initialRegisteredCustomersTotal={customersPage.total}
        initialContactMessages={messagesPage.messages}
        initialContactMessagesTotal={messagesPage.total}
        initialUnreadContactCount={messagesPage.unreadCount}
        initialSection={initialSection}
      />
    </main>
  );
}
