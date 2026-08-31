/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ["@soroban-verify/sdk"],
  env: {
    NEXT_PUBLIC_REGISTRY_TESTNET_ID: process.env.REGISTRY_TESTNET_ID ?? "",
    NEXT_PUBLIC_REGISTRY_MAINNET_ID: process.env.REGISTRY_MAINNET_ID ?? "",
  },
};

module.exports = nextConfig;
