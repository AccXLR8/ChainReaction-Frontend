import type { NextConfig } from 'next';
const nextConfig: NextConfig = {
  async rewrites() {
    return [
      {
        source: '/backend/:path*',
        destination: 'https://backend.samyakshrma.space/:path*',
      },
    ];
  },
};
export default nextConfig;
