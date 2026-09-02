# Releasing

## Release NPM packages

Packages are:

- vscode-messenger-common (shared)
- vscode-messenger (vscode API)
- vscode-messenger-webview (webview API)

### Reviewing staged packages

Applies to both the `next` and `latest` flows below whenever a package is staged (via CI or `npm stage publish` locally). Before approving:

1. List staged versions to get the stage-id:

   ```bash
   npm stage list vscode-messenger-common
   npm stage list vscode-messenger
   npm stage list vscode-messenger-webview
   ```

2. View metadata (version, dist-tag, size, file list) without downloading:

   ```bash
   npm stage view <stage-id>
   ```

3. Download and inspect the actual tarball contents — catches things the metadata view won't, like stale build output, an unintended `files` whitelist, or leaked secrets:

   ```bash
   npm stage download <stage-id>
   tar -tzf <stage-id>.tgz          # list contents
   tar -xzf <stage-id>.tgz -C /tmp/review && cd /tmp/review/package
   ```

   Check: correct `version`/`main`/`types` in `package.json`, only `lib`/`src` present (no `tests`, `node_modules`, `.map` files if unwanted), and that `lib/*.js` actually reflects the intended commit.

4. Approve or reject (2FA required either way):

   ```bash
   npm stage approve <stage-id>
   # or
   npm stage reject <stage-id>
   ```

The npmjs.com "Staged Packages" tab covers steps 1–2 visually but can't show tarball contents — for anything beyond a routine release, do the CLI download+extract check too.

### Release next version

Can be done via CI, or manually from your machine. Either way it publishes under the `next` dist-tag and doesn't touch the committed package.json versions.

#### Via CI workflow (next)

Trigger the [Publish (next) workflow](.github/workflows/publish-next.yml) manually (Actions → "Publish (next)" → Run workflow). It uses npm trusted publishing (OIDC) combined with [staged publishing](https://docs.npmjs.com/staged-publishing) — see [Reviewing staged packages](#reviewing-staged-packages) above, then approve to make it live.

#### Manual local publish (next)

Install dependencies and build the project:

```bash
npm install
npm run build
```

Update versions to add `-next.<git-commit>` suffix (writes to the 3 packages' package.json on disk, no git tag/commit — discard these changes afterwards, e.g. `git checkout -- packages/*/package.json`):

```bash
npm run prepare-next
```

Publish this version with tag `next`. This uses your own npm login/2FA, not OIDC:

```bash
npm run publish-next
```

### Release new version

Can be done via CI, or manually from your machine.

Either way, first bump versions:

1. Manually change versions and dependency versions. This includes package.json files in all three NPM packages (see the list above) — they must keep matching version ranges on each other.
2. Commit the version bump to `main`.

The `vscode-messenger-devtools` extension is published separately (see below), not by either of these.

#### Via CI workflow (release)

The [Publish workflow](.github/workflows/publish.yml) is triggered by pushing a semver tag (`vX.Y.Z`) on `main`. It uses npm trusted publishing (OIDC, no token) combined with [staged publishing](https://docs.npmjs.com/staged-publishing): the workflow only stages the packages, a maintainer must approve (or reject) the staged version on [npmjs.com](https://www.npmjs.com/) (or via `npm stage approve <stage-id>`) with 2FA before it becomes publicly available.

1. Tag the commit and push:

   ```bash
   git tag vX.Y.Z
   git push origin vX.Y.Z
   ```

2. Wait for the workflow to stage all three packages, then review and approve each (see [Reviewing staged packages](#reviewing-staged-packages) above).

#### Manual local publish (release)

Install dependencies and build the project:

```bash
npm install
npm run build
```

Publish this version with tag `latest`. This uses your own npm login/2FA, not OIDC:

```bash
npm run publish-latest
```

To also get a review step locally, stage instead of publishing directly and approve from npmjs.com afterwards:

```bash
npm stage publish --workspaces --access public --tag latest
```

#### Mistakes / re-tagging

- If a staged version has **not** been approved yet, reject it first (`npm stage reject <stage-id>`, needs 2FA) — this frees up the version number. Then delete and re-push the tag on the fixed commit:

  ```bash
  git tag -d vX.Y.Z
  git push origin :refs/tags/vX.Y.Z
  git tag vX.Y.Z <fixed-commit>
  git push origin vX.Y.Z
  ```

- If a version was already **approved and published**, it is immutable — npm will never let you re-publish the same version number again. Bump to a new version instead.

## Devtools extension

Extension package is `vscode-messenger-devtools`.

### Devtools extension build

- Add a changelog.md entry
- Install vsce `npm install -g @vscode/vsce` is not already installed

```bash
cd ../vscode-messenger-devtools
vsce package --no-dependencies
```

- `vsce package` will also run `npm run vscode:prepublish`

#### Publish Open VSX

- Check the changelog.md entry

- Create token `https://open-vsx.org/user-settings/tokens` or use existing

- Publish OpenVSX `npx ovsx publish --no-dependencies`. You will be prompted to enter the token.

#### Publish VSCode

- Install vsce `npm install -g @vscode/vsce` is not already installed

- Create token in `https://dev.azure.com/typefox/_usersSettings/tokens`
  - click Show all scopes link below the Scopes section in the Scopes list, scroll to Marketplace and select Manage scope
  - click Create token
  - copy the token

- Login `vsce login typefox`

- Publish: `vsce publish --no-dependencies`
