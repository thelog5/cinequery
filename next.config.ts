import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // pg ships optional native bindings; keep it out of the bundle.
  serverExternalPackages: ["pg"],
  // Eval results are read from disk by the /evals page at build time.
  outputFileTracingIncludes: {
    "/evals": ["./evals/results/*.json", "./evals/questions.jsonl"],
  },
};

export default nextConfig;
