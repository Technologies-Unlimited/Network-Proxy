/** @type {import('next').NextConfig} */

const nextConfig = {
  reactStrictMode: true,
  swcMinify: true,
  transpilePackages: [
    'goobs-frontend',
    'goobs-auth',
    'goobs-cache',
    'goobs-testing',
    'goobs-encryption',
  ],
}

export default nextConfig
