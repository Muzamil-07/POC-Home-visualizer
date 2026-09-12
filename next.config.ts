import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["openai", "sharp"],
  experimental: {
    optimizePackageImports: ["@react-three/drei", "lucide-react"],
  },
};

export default nextConfig;
