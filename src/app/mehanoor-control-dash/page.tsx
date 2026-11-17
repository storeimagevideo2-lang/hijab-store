import type { Metadata } from "next";
import { AdminPageView } from "@/components/admin/admin-page-view";

export const metadata: Metadata = {
  title: "Admin Enterprise Dashboard | MEHANOOR",
  description:
    "MEHANOOR E-commerce Admin Dashboard — Real-time sales analytics, variant inventory, Cloudinary CDN, and Supabase orders.",
  robots: {
    index: false,
    follow: false,
    nocache: true,
  },
};

export default async function MehanoorControlDashPage(props: {
  searchParams?: Promise<{ section?: string }>;
}) {
  return <AdminPageView searchParams={props.searchParams} />;
}
