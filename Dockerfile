# Build and run the Feedthrough MCP server (@feedthrough/mcp) from this monorepo.
# Used by the Glama MCP directory (and anyone) to inspect the server: it starts
# over stdio, which is how an MCP client launches it (run the container with -i).
#
# Only the mcp package is installed and built; it has no workspace dependencies,
# so the examples, website, and other adapters are never pulled in.

FROM node:22-slim

# The MCP server never needs a browser to build or run; make sure no adapter's
# transitive Playwright install tries to download one.
ENV PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1

WORKDIR /app

RUN corepack enable && corepack prepare pnpm@11 --activate

# Copy the workspace (node_modules and build output are excluded via .dockerignore).
# All package manifests are present so the committed lockfile validates.
COPY . .

# Install just what @feedthrough/mcp needs, checked against the lockfile, then build.
RUN pnpm install --frozen-lockfile --filter @feedthrough/mcp...
RUN pnpm --filter @feedthrough/mcp build

# The server speaks the MCP protocol over stdio.
WORKDIR /app/packages/mcp
CMD ["node", "dist/index.js"]
