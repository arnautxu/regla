import type { NextConfig } from "next";
import { execFileSync } from "node:child_process";

function currentDeploymentId(): string | undefined {
  // Vercel accepts at most 32 characters for skew protection IDs, and
  // they must be unique per deployment: a redeploy of the same commit
  // (e.g. after adding an env var) fails if the ID is just the SHA.
  if (process.env.VERCEL_DEPLOYMENT_ID) {
    return process.env.VERCEL_DEPLOYMENT_ID.slice(0, 32);
  }
  if (process.env.VERCEL_GIT_COMMIT_SHA) {
    return process.env.VERCEL_GIT_COMMIT_SHA.slice(0, 20);
  }

  // The Git SHA is also available for local builds and deployments where
  // Vercel's system environment variables have not been exposed.
  try {
    return execFileSync("git", ["rev-parse", "HEAD"], {
      encoding: "utf8",
    }).trim().slice(0, 20);
  } catch {
    return undefined;
  }
}

const nextConfig: NextConfig = {
  deploymentId: currentDeploymentId(),
};

export default nextConfig;
