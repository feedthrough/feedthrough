import { feedthroughHandle } from "@feedthrough/sveltekit";
import { sequence } from "@sveltejs/kit/hooks";

// Feedthrough is only active in development (NODE_ENV=development).
// Safe to leave wired in — production builds are unaffected.
export const handle = sequence(feedthroughHandle);
