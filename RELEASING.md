# Releasing

Releases are driven by [Changesets](https://github.com/changesets/changesets).

## Day-to-day

1. Every user-facing PR adds a changeset (`pnpm changeset`).
2. Merging to `main` makes the release workflow open/refresh a "Version
   Packages" PR that bumps the version and writes the changelog.
3. Merging that PR publishes to npm (with provenance) and the workflow can
   then be tagged.

## One-time npm setup (required before the first automated publish)

The publish job is gated behind the repository variable
`NPM_TRUSTED_PUBLISHING` so it skips cleanly until npm is configured:

1. On npmjs.com, open the `svg-icon-tool` package settings and configure
   **Trusted Publishing** for GitHub Actions with:
   - repository: `jeeanribeiro/svg-icon-tool`
   - workflow: `release.yml`
2. In the GitHub repo settings, add an Actions **variable** (not secret)
   `NPM_TRUSTED_PUBLISHING` = `true`.

No npm token is stored anywhere; publishing uses the workflow's OIDC
identity (`id-token: write`), and npm attaches provenance automatically.

## Manual fallback

```sh
pnpm build
pnpm changeset version
git commit -am "chore: version packages"
npm publish            # needs a logged-in npm account with 2FA
git tag -a vX.Y.Z -m "vX.Y.Z"
git push --follow-tags
```
