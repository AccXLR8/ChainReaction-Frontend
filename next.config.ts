import type { NextConfig } from 'next';
const nextConfig: NextConfig = {
  async rewrites() {
    return [
      { source: '/backend/:path*', destination: 'http://20.240.198.63:8080/:path*' },
    ];
  },
};
export default nextConfig;
