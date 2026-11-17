import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  images: {
    formats: ["image/avif", "image/webp"],
    remotePatterns: [
      { protocol: "https", hostname: "res.cloudinary.com" },
      { protocol: "https", hostname: "**.supabase.co" },
    ],
  },
  devIndicators: false,
  async rewrites() {
    const rawCustom = (
      process.env.ADMIN_CUSTOM_PATH ||
      process.env.ADMIN_PATH ||
      ""
    )
      .trim()
      .replace(/^\/+|\/+$/g, "");
    if (
      rawCustom &&
      rawCustom !== "mehanoor-control-dash" &&
      rawCustom !== "admin"
    ) {
      return [
        {
          source: `/${rawCustom}`,
          destination: "/mehanoor-control-dash",
        },
      ];
    }
    return [];
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          {
            key: "X-Frame-Options",
            value: "DENY",
          },
          {
            key: "X-Content-Type-Options",
            value: "nosniff",
          },
          {
            key: "Referrer-Policy",
            value: "strict-origin-when-cross-origin",
          },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=()",
          },
        ],
      },
    ];
  },
};

export default nextConfig;

