import type { NextConfig } from "next";

const basePath =
  process.env.NODE_ENV === "production" ? "/us/aspen-eitc-ctc" : "";

const nextConfig: NextConfig = {
  basePath,
  env: {
    NEXT_PUBLIC_BASE_PATH: basePath,
  },
};

export default nextConfig;
