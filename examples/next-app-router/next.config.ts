import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  transpilePackages: [
    '@never-rest-examples/shared-contract',
    '@eddy-works/never-rest',
  ],
};

export default nextConfig;
