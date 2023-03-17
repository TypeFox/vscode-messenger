#### Update versions
Change versions and dependency versions
```
npm install
```

#### Common
```
cd packages/vscode-messenger-common
npm run build && npm run publish:latest
```

#### Extension
```
cd ../vscode-messenger
npm run build && npm run publish:latest
```

#### Webview
```
cd ../vscode-messenger-webview
npm run build && npm run publish:latest
```

#### Devtools extension build
- Add a changelog.md entry

```
cd ../vscode-messenger-devtools
npm run install:all
npm run vscode:prepublish
npm run build:webview
vsce package
```

#### Publish Open VSX

- Check the changelog.md entry

- Create token `https://open-vsx.org/user-settings/tokens` or use existing

- Publish OpenVSX `npx ovsx publish -p <open vsx access token>` 

#### Publish VSCode

- Install vsce `npm install -g @vscode/vsce`

- Create token in `https://dev.azure.com/typefox/_usersSettings/tokens`

- Login `vsce login typefox`

- Publish: `vsce publish`