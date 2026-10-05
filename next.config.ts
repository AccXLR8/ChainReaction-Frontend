import type { NextConfig } from 'next';
const nextConfig: NextConfig = {
  async rewrites() {
    return [
      { source: '/backend/:path*', destination: 'https://fioricet-gif-wto-labour.trycloudflare.com/:path*' },
    ];
  },
};
export default nextConfig;
