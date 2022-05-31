# VS Code Messenger
RPC messaging library for the VS Code extension platform

#### Supported features

- Sending notification or an async request from an extension to a view, a view group or broadcast to all registered views
- Sending notification or an async request from a view to an other view, a view group or the host extension
- Support for sync and async request/notification handlers
- Typed API
- Automatically unregister views on view dispose
- Configurable logging


#### Usage Example for an extension

```ts
const messenger = new Messenger();

// register one or more views
messenger.registerWebviewView(webviewView);

// Handle incoming view notification
messenger.onNotification({ method: 'colorSelected' }, (params: string) => {
    vscode.window.activeTextEditor?.insertSnippet(new vscode.SnippetString(`#${params}`));
});

// handle view requests and return a result
messenger.onRequest({ method: 'availableColors' }, (params: string) => {
    return ['020202', 'f1eeee', 'a85b20', 'daab70', 'efcb99'];
});

// send a notification to a view of type 'calicoColors.colorsView'
messenger.sendNotification({ method: 'colorModify' }, { webviewType: 'calicoColors.colorsView' }, 'clear');


// send a request to a view of type 'calicoColors.colorsView' and get a result
const selectedColor = await messenger.sendRequest({ method: 'getSelectedColor' }, { webviewType: 'calicoColors.colorsView' }, '');
```


#### Usage Example a webview

```js
const vscode = acquireVsCodeApi();
const vscode_messenger = require("vscode-messenger-webview");

const messenger = new vscode_messenger.Messenger(vscode);

messenger.logDebug = true; // optional debug log activation
messenger.start(); // start listening for incoming events

// Handle extension Notifications. For requests use `onRequest()` 
messenger.onNotification({method: 'colorModify'}, (params) => {
    switch(params) {
        case 'add': {
            addColor();
            break;
        }
        case 'clear': {
            colors = [];
            updateColorList(colors);
            break;
        }
    }
});

// Send a request to your extension. Empty receiver {} means the message should go to the extension.
// For notification use `sendNotification()`
 const colors = await messenger.sendRequest({ method: 'availableColors'}, {}, '');
 console.log(colors);
```
