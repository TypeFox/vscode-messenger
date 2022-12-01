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
npm install && npm run build && npm run publish:latest
```

#### Webview
```
cd ../vscode-messenger-webview
npm install && npm run build && npm run publish:latest
```

#### Devtools extension build
```
cd ../vscode-messenger-devtools
npm run install:all
npm run build:webview
vsce package
```
