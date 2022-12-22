# VS Code Messenger Developer Tool

Shows messages sended between extension and registered extension webviews. Provides information about installed extensions that uses
[vscode-messenger](https://github.com/TypeFox/vscode-messenger) library.

#### Open Devtool View
Open _Command Palette..._ (Shift + Cmd + P)
Type _devtools_, execute command 'Developer: Open vscode-messenger devtools'


![Missing Devtool View Screenshot](https://github.com/TypeFox/vscode-messenger/blob/main/packages/vscode-messenger-devtools/media/view-screenshot.png?raw=true)


**Note:** Your extension must export `Messenger.diagnosticApi()` as public API. Otherwise it is not possible to display relevant information.

```ts
import * as vscode from 'vscode';
import { Messenger } from 'vscode-messenger';

const messenger = new Messenger();

export function activate(context: vscode.ExtensionContext) {
	// Your activation code...
	return messenger.diagnosticApi();
}
```


[Devtools Repository](https://github.com/TypeFox/vscode-messenger/tree/main/packages/vscode-messenger-devtools#readme)

[Messenger Repository](https://github.com/TypeFox/vscode-messenger#readme)