# Launch checklist — 0.1.0

## GitHub
- [ ] Make repo public (Settings → Danger Zone)
- [ ] Set up branch protection on `main` — require all 3 CI checks, no force push, no deletion
- [ ] Update `deploy-website.yml` trigger from `workflow_dispatch` to `push: branches: [main]`
- [ ] Configure GitHub Pages with custom domain `feedthrough.dev` (Settings → Pages)

## DNS
- [ ] Add CNAME record pointing `feedthrough.dev` to `feedthrough.github.io`

## CLA Assistant
- [ ] Set up cla-assistant.io for the repo (CONTRIBUTING.md promises the bot but it isn't wired up yet)

## npm — first publish (manual, one-time)
- [ ] `npm login`
- [ ] `pnpm build && pnpm -r --filter './packages/*' publish`
- [ ] Configure trusted publisher on npmjs.com for each of the 10 packages, linking to `publish.yml`

## Verify
- [ ] Website live at feedthrough.dev
- [ ] All 10 packages visible on npmjs.com
- [ ] Create GitHub Release `v0.1.0` — triggers publish workflow, verifies OIDC flow works end to end
