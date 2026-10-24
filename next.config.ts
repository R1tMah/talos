import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    // Nudges coding agents to apply Next.js security upgrades (set by `next upgrade --agent=security`).
    agentUpgrade: "security",
  },
};

export default nextConfig;
