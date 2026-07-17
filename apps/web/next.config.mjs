/** @type {import('next').NextConfig} */
const API_URL = process.env.API_URL ?? "http://localhost:3008";

const nextConfig = {
  output: "standalone",
  basePath: "/travel",
  images: {
    remotePatterns: [{ protocol: "https", hostname: "images.unsplash.com" }],
  },
  async rewrites() {
    return {
      beforeFiles: [
        { source: "/api/:path*", destination: `${API_URL}/api/:path*`, basePath: false },
        { source: "/health", destination: `${API_URL}/health`, basePath: false },
      ],
    };
  },
};

export default nextConfig;
