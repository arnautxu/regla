/** Explicit rollout switch: legacy installations keep their original diary. */
export const accountMode = () => process.env.NEXT_PUBLIC_ACCOUNT_MODE === "true";
