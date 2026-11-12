import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  poweredByHeader: false,
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=()",
          },
        ],
      },
    ];
  },
  // pg ships optional native bindings; keep it out of the bundle.
  serverExternalPackages: ["pg"],
  // Eval results are read from disk by the /evals page at build time.
  outputFileTracingIncludes: {
    "/evals": ["./evals/results/*.json", "./evals/questions.jsonl"],
  },
  outputFileTracingExcludes: {
    "/*": [
      "./.env",
      "./.env.*",
      "./.git/**/*",
      "./data/**/*",
      "./evals/results/scratch/**/*",
    ],
  },
};

export default nextConfig;
