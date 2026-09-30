import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  outputFileTracingIncludes: {
    "/api/history": ["./data/bmc_historical_complaints.csv"],
  },
};

export default nextConfig;
