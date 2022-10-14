#### Update versions
Change versions and dependency versions

#### Common
```
cd packages/vscode-messenger-common
npm run clean && npm run build && npm run publish:latest
```

#### Extension
```
cd ../vscode-messenger
npm install && npm run clean && npm run build && npm run publish:latest
```

#### Webview
```
cd ../vscode-messenger-webview
npm install && npm run clean && npm run build && npm run publish:latest
```

#### Devtools
```
cd ../vscode-messenger-devtools
npm run install:all
npm run build:webview
```
