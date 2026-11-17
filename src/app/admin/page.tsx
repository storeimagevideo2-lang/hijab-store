import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getBackendConfig } from "@/lib/server/env";
import { AdminPageView } from "@/components/admin/admin-page-view";

export const metadata: Metadata = {
  title: "Not Found",
  robots: {
    index: false,
    follow: false,
    nocache: true,
  },
};

export default async function AdminPage(props: {
  searchParams?: Promise<{ section?: string }>;
}) {
  const config = getBackendConfig();

  // If custom admin URL is enabled, hide /admin completely and return 404
  if (config.adminPath !== "/admin") {
    notFound();
  }

  return <AdminPageView searchParams={props.searchParams} />;
}
