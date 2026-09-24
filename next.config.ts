import type { NextConfig } from "next";
import { execFileSync } from "node:child_process";

function currentDeploymentId(): string | undefined {
  if (process.env.VERCEL_GIT_COMMIT_SHA) {
    return process.env.VERCEL_GIT_COMMIT_SHA;
  }

  // The Git SHA is also available for local builds and deployments where
  // Vercel's system environment variables have not been exposed.
  try {
    return execFileSync("git", ["rev-parse", "HEAD"], {
      encoding: "utf8",
    }).trim();
  } catch {
    return undefined;
  }
}

const nextConfig: NextConfig = {
  deploymentId: currentDeploymentId(),
};

export default nextConfig;
