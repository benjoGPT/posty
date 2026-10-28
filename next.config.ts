import type { NextConfig } from 'next';

// Static export: the whole site (app + postcode data) is plain files that any
// static host or CDN can serve. No server or database is required.
const nextConfig: NextConfig = {
  output: 'export',
  images: { unoptimized: true },
  reactStrictMode: true,
};

export default nextConfig;
