
import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // Allow development access from your local network IP.
  allowedDevOrigins: ['192.168.1.10'],

  // Proxy frontend API requests to the FastAPI backend.
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
