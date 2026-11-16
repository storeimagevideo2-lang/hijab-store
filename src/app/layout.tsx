import type { Metadata, Viewport } from "next";
import { ComingSoonNotice } from "@/components/ui/coming-soon";
import { CartDrawer } from "@/components/cart/cart-drawer";
import { StorefrontMotion } from "@/components/ui/motion-reveal";
import { FacebookPixelTracker } from "@/components/analytics/facebook-pixel";
import { getStoreSettings } from "@/lib/server/store-repository";
import { themeInitScript } from "@/lib/theme";
import "./globals.css";

export const metadata: Metadata = {
  title: "NOOR | Everyday Elegance",
  description: "Discover everyday elegance with NOOR. A curated collection of modal, chiffon, jersey and silk hijabs in beautiful, timeless colours.",
  icons: {
    icon: [
      { url: "/icon.svg", type: "image/svg+xml" },
      { url: "/favicon.ico", sizes: "32x32" },
      { url: "/icon.png", sizes: "32x32", type: "image/png" },
    ],
    shortcut: "/favicon.ico",
    apple: [
      { url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" },
    ],
  },
};

export const viewport: Viewport = { width: "device-width", initialScale: 1, viewportFit: "cover", themeColor: "#ffffff" };

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const settings = await getStoreSettings().catch(() => null);

  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <link rel="icon" href="/icon.svg" type="image/svg+xml" />
        <link rel="alternate icon" href="/favicon.ico" />
        <link rel="apple-touch-icon" href="/apple-touch-icon.png" />
        <script
          dangerouslySetInnerHTML={{ __html: themeInitScript }}
          suppressHydrationWarning
        />
      </head>
      <body suppressHydrationWarning>
        <a href="#main-content" className="skip-link">
          Skip to content
        </a>
        {children}
        <StorefrontMotion />
        <CartDrawer />
        <ComingSoonNotice />
        <FacebookPixelTracker pixelConfig={settings?.facebookPixel} />
      </body>
    </html>
  );
}
