# VS Code Messenger

RPC messaging library for the VS Code extension platform. Makes the communication between your [VS Code extension](https://code.visualstudio.com/) and its [webviews](https://code.visualstudio.com/api/extension-guides/webview) much simpler.

[![npm](https://img.shields.io/npm/v/vscode-messenger)](https://www.npmjs.com/package/vscode-messenger)
[![CI](https://github.com/TypeFox/vscode-messenger/actions/workflows/main.yml/badge.svg)](https://github.com/TypeFox/vscode-messenger/actions/workflows/main.yml)
[![License](https://img.shields.io/github/license/TypeFox/vscode-messenger?color=green)](https://github.com/TypeFox/vscode-messenger/blob/main/LICENSE)
[![Codespaces](https://img.shields.io/badge/Codespaces-Open-blue?logo=github)](https://codespaces.new/TypeFox/vscode-messenger)
[![Copilot Skill](https://img.shields.io/badge/Copilot-Skill-blue?logo=github)](https://github.com/TypeFox/vscode-messenger/blob/main/.github/skills/vscode-messenger/SKILL.md)
[![AGENTS.md](https://img.shields.io/badge/AGENTS.md-guide-blue?logo=github)](https://github.com/TypeFox/vscode-messenger/blob/main/AGENTS.md)

## Features

- Send notifications or requests from an **extension to a view**, a **view group**, or **broadcast** to all registered views
- Send notifications or requests from a **view to another view**, a view group, or the host extension
- **Typed API** — `RequestType<P, R>` and `NotificationType<P>` enforce matching parameter and result types on both sides
- Sync and async request/notification handlers
- Request cancellation
- Automatically unregisters views on dispose
- Configurable logging

## Packages

Install only what each side needs:

| Package | Install in | Purpose |
|---|---|---|
| [`vscode-messenger`](https://www.npmjs.com/package/vscode-messenger) | Extension host | `Messenger` class, view registration, diagnostic API |
| [`vscode-messenger-webview`](https://www.npmjs.com/package/vscode-messenger-webview) | Webview script | `Messenger` class for webview, `createCancellationToken` |
| [`vscode-messenger-common`](https://www.npmjs.com/package/vscode-messenger-common) | Shared module | `NotificationType`, `RequestType`, `HOST_EXTENSION`, `BROADCAST` |

**Tip:** Keep all `NotificationType` / `RequestType` declarations in a shared TypeScript module imported by both the extension and the webview. The same `method` string and parameter/result types must match on both ends.

## Usage in an extension (TypeScript)

```ts
import * as vscode from 'vscode';
import { Messenger } from 'vscode-messenger';
import { NotificationType, RequestType } from 'vscode-messenger-common';

const messenger = new Messenger();

// Register a webview view (or use registerWebviewPanel for WebviewPanel)
messenger.registerWebviewView(webviewView);

// Define message types — declare once, import on both sides
const colorSelectType: NotificationType<string> = { method: 'colorSelected' };
const availableColorsType: RequestType<string, string[]> = { method: 'availableColor' };
const colorModifyType: NotificationType<string> = { method: 'colorModify' };

// Handle a notification from the webview
messenger.onNotification(colorSelectType, (color: string) => {
    vscode.window.activeTextEditor?.insertSnippet(new vscode.SnippetString(`#${color}`));
});

// Handle a request from the webview and return a result
messenger.onRequest(availableColorsType, (_params: string) => {
    return ['020202', 'f1eeee', 'a85b20', 'daab70', 'efcb99'];
});

// Send a notification to all views of a given type
messenger.sendNotification(colorModifyType, { type: 'webview', webviewType: 'calicoColors.colorsView' }, 'clear');

// Send a request to a view and await the result
const selectedColor = await messenger.sendRequest(
    { method: 'getSelectedColor' },
    { type: 'webview', webviewType: 'calicoColors.colorsView' },
    ''
);
```

## Usage in a webview (TypeScript)

```ts
import { Messenger } from 'vscode-messenger-webview';
import { HOST_EXTENSION } from 'vscode-messenger-common';
import { colorModifyType, availableColorsType, colorSelectType } from './shared/message-types';

const messenger = new Messenger(); // acquireVsCodeApi() is called automatically

// Handle notifications from the extension
messenger.onNotification(colorModifyType, (action: string) => {
    if (action === 'clear') clearColors();
    if (action === 'add')   addColor();
});

messenger.start(); // required — starts listening for incoming messages

// Send a request to the host extension
const colors = await messenger.sendRequest(availableColorsType, HOST_EXTENSION, '');

// Send a notification to the host extension
messenger.sendNotification(colorSelectType, HOST_EXTENSION, 'a85b20');
```

> **Note:** `messenger.start()` must be called before any messages can be received. Forgetting it causes all incoming messages to be silently dropped.

## Usage in a React webview

When the webview is a React app (e.g. Vite + React), create the `Messenger` **once** at module scope and register handlers inside a `useEffect` that disposes them on cleanup. This is required for React **StrictMode** (which mounts each component twice in development: `setup → cleanup → setup`) and for HMR, both of which re-run effects.

Registering a handler without disposing the previous one has observable consequences: a second **request** handler for the same method throws (`A request handler is already registered for method ...`), and a second **notification** handler stacks and fires twice. The `useEffect` cleanup keeps registrations balanced.

```tsx
// messenger.ts — created exactly once per webview
import { Messenger } from 'vscode-messenger-webview';
export const messenger = new Messenger();

// App.tsx
import { useEffect, useState } from 'react';
import { HOST_EXTENSION } from 'vscode-messenger-common';
import { messenger } from './messenger';
import { colorModifyType, availableColorsType } from './shared/message-types';

export function App() {
    const [colors, setColors] = useState<string[]>([]);

    useEffect(() => {
        const disposables = [
            messenger.onNotification(colorModifyType, action => {
                if (action === 'clear') setColors([]);
            }),
            messenger.onRequest(availableColorsType, () => colors),
        ];
        messenger.start(); // idempotent — safe after a StrictMode remount

        return () => disposables.forEach(d => d.dispose());
    }, []);

    return null;
}
```

**Do:** one `Messenger` at module scope, register in `useEffect`, dispose in its cleanup.
**Don't:** call `new Messenger()` or `onRequest`/`onNotification` in the component body — those run on every render and will throw on the second request-handler registration.

## Key concepts

### Message participants

| Participant | How to construct | Use for |
|---|---|---|
| Host extension | `HOST_EXTENSION` | Targeting the extension from a webview |
| Webview by type | `{ type: 'webview', webviewType: '...' }` | All instances of a view type |
| Webview by id | returned by `registerWebviewView` / `registerWebviewPanel` | One specific instance |
| Broadcast | `BROADCAST` | All registered views (notifications only) |

### Request cancellation

```ts
// Extension side — pass any CancellationToken
const cts = new vscode.CancellationTokenSource();
const result = await messenger.sendRequest(longOpType, target, params, cts.token);
cts.cancel();

// Webview side — bridge an AbortSignal
import { createCancellationToken } from 'vscode-messenger-webview';
const ctrl = new AbortController();
const result = await messenger.sendRequest(longOpType, HOST_EXTENSION, params, createCancellationToken(ctrl.signal));
ctrl.abort('timeout');
```

### Broadcast notifications

A webview receives a broadcast only when registered with `broadcastMethods` listing the method:

```ts
// Extension: opt the view in to specific broadcast methods
messenger.registerWebviewView(view, { broadcastMethods: [refreshType.method] });

// Either side: broadcast to all opted-in views
messenger.sendNotification(refreshType, BROADCAST);
```

## Diagnostics and devtools

[![Visual Studio Marketplace Version](https://img.shields.io/visual-studio-marketplace/v/typefox.vscode-messenger-devtools?label=VS-Code%20Marketplace)](https://marketplace.visualstudio.com/items?itemName=typefox.vscode-messenger-devtools)

The companion **[VS Code Messenger Developer Tool](https://marketplace.visualstudio.com/items?itemName=typefox.vscode-messenger-devtools)** extension visualizes live message traffic — requests, responses, and notifications — between the extension host and its webviews. To enable it, expose `messenger.diagnosticApi()` from your extension's `activate` return value:

```ts
import { Messenger, type MessengerDiagnostic } from 'vscode-messenger';

const messenger = new Messenger();

export function activate(context: vscode.ExtensionContext): MessengerDiagnostic {
    // ... register views, handlers, etc.
    return messenger.diagnosticApi();
}
```

Open the devtool with **Developer: Open vscode-messenger devtools** from the Command Palette.

See the [devtools README](packages/vscode-messenger-devtools/README.md) for full setup instructions, `DiagnosticOptions`, the event schema, and troubleshooting.

## More examples

The [calico-colors example](examples/calico-colors) demonstrates a complete extension with a `WebviewView` and a `WebviewPanel` sharing a single `Messenger` instance, typed message definitions in a shared module, broadcast usage, and diagnostic API integration.

## AI Agent skill

This repository includes an [Agent skill](.github/skills/vscode-messenger/SKILL.md) that teaches Agents how to implement and debug messaging with `vscode-messenger`. When the skill is active, the agnet understands the library's patterns — message type definitions, handler registration, `start()` requirements, broadcast opt-in, cancellation, and devtools setup — and can generate correct code without you having to explain the API.
