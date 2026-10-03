import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  agentRules: false,
  devIndicators: false,
  allowedDevOrigins: ["w365.azules-panga.ts.net"],
};

export default nextConfig;
