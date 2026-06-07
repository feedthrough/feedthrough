import { withFeedthrough } from "@feedthrough/nextjs";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {};

// withFeedthrough() only injects code when Next.js is running in dev mode (ctx.dev).
// Production builds are unaffected.
export default withFeedthrough()(nextConfig);
