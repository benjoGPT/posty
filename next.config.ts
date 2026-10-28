import type { NextConfig } from 'next';
import { execFileSync } from 'node:child_process';
execFileSync(process.execPath,['pipeline/optimise-data.mjs'],{stdio:'inherit'});
const dataRelease = execFileSync(process.execPath,['pipeline/prepare-data.mjs'],{encoding:'utf8'}).trim();

// Static export: the whole site (app + postcode data) is plain files that any
// static host or CDN can serve. No server or database is required.
const nextConfig: NextConfig = {
  output: 'export',
  env: { NEXT_PUBLIC_DATA_RELEASE: dataRelease },
  images: { unoptimized: true },
  reactStrictMode: true,
};

export default nextConfig;
