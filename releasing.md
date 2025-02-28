# Releasing

## Release NPM packages

Packages are:

- vscode-messenger-common (shared)
- vscode-messenger (vscode API)
- vscode-messenger-webview (webview API)

### Release next version

Run install to resolve dependencies, that also runs prepare steps `clean` and `build`.

```bash
npm install
```

Update versions to add `-next.<git-commit>` suffix.

```bash
npm run prepare-next
```

Publish this version with tag `next`.

```bash
npm run publish-next
```

### Release new version

Run install to resolve dependencies, that also runs prepare steps `clean` and `build`.

```bash
npm install
```

Manually change versions and dependency versions. This includes package.json files in the NPM packages. See the list above.

Publish this version with tag `latest`.

```bash
npm run publish-latest
```

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

- Publish OpenVSX `npx ovsx publish -p <open vsx access token>`

#### Publish VSCode

- Install vsce `npm install -g @vscode/vsce` is not already installed

- Create token in `https://dev.azure.com/typefox/_usersSettings/tokens`

- Login `vsce login typefox`

- Publish: `vsce publish`
