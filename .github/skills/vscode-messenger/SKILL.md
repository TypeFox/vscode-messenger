---
name: vscode-messenger
description: Implement and debug RPC messaging between a VS Code extension and its webviews using the `vscode-messenger` library. Use when wiring up extension–webview (or webview–webview) communication, defining `NotificationType` / `RequestType` message contracts, calling `sendRequest` / `sendNotification` / `onRequest` / `onNotification`, registering webviews with `Messenger`, sending to `HOST_EXTENSION` or `BROADCAST` participants, debugging why messages don't arrive, or setting up the `vscode-messenger-devtools` extension via `Messenger.diagnosticApi()`.
---

# VS Code Messenger

`vscode-messenger` is a typed RPC library for communication between a VS Code extension host and its webviews (`WebviewView` and `WebviewPanel`). It supports request/response, notifications, broadcasts, cancellation, and sender-scoped handlers.

This skill assumes the agent is implementing or debugging messaging code on top of this library — not contributing to the library itself.

## Packages

Three npm packages, one per execution context. Install only what each side needs:

| Package | Used in | Purpose |
|---|---|---|
| `vscode-messenger` | Extension host | `Messenger` class, view registration, diagnostics |
| `vscode-messenger-webview` | Webview script | `Messenger` class for webview side, `createCancellationToken` |
| `vscode-messenger-common` | Both (or shared module) | `NotificationType`, `RequestType`, `MessageParticipant`, `HOST_EXTENSION`, `BROADCAST` |

**Recommendation**: keep all `NotificationType` / `RequestType` declarations in a shared TypeScript module that both the extension and the webview import from. The same `method` string and parameter/result types must line up on both ends, and a shared module is the simplest way to enforce that.

## Defining message types

```ts
import type { NotificationType, RequestType } from 'vscode-messenger-common';

export const ColorSelected: NotificationType<string> = { method: 'colorSelected' };
export const GetColors: RequestType<void, string[]> = { method: 'availableColors' };
export const RenameUser: RequestType<{ userId: string; name: string }, { ok: boolean }> = {
    method: 'renameUser'
};
```

`NotificationType<P>` and `RequestType<P, R>` are pure type tags — at runtime they are just `{ method: string }`. The generics ensure that `sendRequest` / `onRequest` and their notification counterparts type-check on both sides.

## Extension side

```ts
import { Messenger } from 'vscode-messenger';
import { HOST_EXTENSION } from 'vscode-messenger-common';

const messenger = new Messenger({ debugLog: true });

class ColorsViewProvider implements vscode.WebviewViewProvider {
    static readonly viewType = 'calicoColors.colorsView';

    constructor(private readonly messenger: Messenger) {}

    resolveWebviewView(view: vscode.WebviewView) {
        view.webview.options = { enableScripts: true };
        view.webview.html = getHtml();

        // Register BEFORE setting handlers/sending so message events are wired.
        this.messenger.registerWebviewView(view);

        // Handle requests coming from the webview
        this.messenger.onRequest(GetColors, () => ['020202', 'f1eeee', 'a85b20']);

        // React to notifications from the webview
        this.messenger.onNotification(ColorSelected, color => {
            vscode.window.activeTextEditor?.insertSnippet(
                new vscode.SnippetString(`#${color}`)
            );
        });
    }

    addColor() {
        // Target every webview of this view type
        this.messenger.sendNotification(
            ColorModify,
            { type: 'webview', webviewType: ColorsViewProvider.viewType },
            'add'
        );
    }
}
```

**Key APIs:**

- `new Messenger(options?)` — `MessengerOptions`: `ignoreHiddenViews` (default `true`), `uniqueHandlers` (throws if a handler for the same method is registered twice — incompatible with sender-scoped handlers; see that section below), `debugLog`.
- `registerWebviewView(view, options?)` / `registerWebviewPanel(panel, options?)` — returns a `WebviewIdMessageParticipant` with the assigned `webviewId`. Use this returned participant to address that **specific instance** (vs. the `webviewType` string which addresses **all instances** of that type). The library auto-unregisters on `onDidDispose`.
- `onRequest(type, handler, { sender? })` / `onNotification(type, handler, { sender? })` — return a `Disposable`. **Extension side:** multiple handlers for the same method stack and all fire (for notifications; for requests, multiple matching handlers is an error — see below). **Webview side:** registering a new handler for the same method **replaces** the previous one (last-write-wins). The optional `sender` (extension side only) filters the handler so it only fires for messages from that participant.
- `sendRequest(type, receiver, params?, cancelable?)` — returns `Promise<R>`. Receiver is a `MessageParticipant` (webview by id, webview by type, or — once supported — another extension). Cannot be `BROADCAST` — throws immediately on both sides.
- `sendNotification(type, receiver, params?)` — fire-and-forget. Receiver may be `BROADCAST`.

`ViewOptions.broadcastMethods: string[]` — set per registered view to opt that view in to specific broadcast notification methods. A broadcast skips any view that doesn't list the method.

## Webview side

```ts
import { Messenger } from 'vscode-messenger-webview';
import { HOST_EXTENSION } from 'vscode-messenger-common';
import { ColorSelected, GetColors, ColorModify } from './shared/message-types';

const messenger = new Messenger();

messenger.onNotification(ColorModify, async action => {
    if (action === 'clear') colors = [];
    if (action === 'add') colors.push({ value: await getNewColor() });
    render();
});

messenger.start(); // REQUIRED — registers the window 'message' listener

async function getNewColor(): Promise<string> {
    const palette = await messenger.sendRequest(GetColors, HOST_EXTENSION);
    return palette[Math.floor(Math.random() * palette.length)];
}

function pickColor(value: string) {
    messenger.sendNotification(ColorSelected, HOST_EXTENSION, value);
}
```

The webview-side `Messenger` constructor calls `acquireVsCodeApi()` for you. Pass an existing instance only if your code already called `acquireVsCodeApi()` (it can be called only once per webview):

```ts
const vscodeApi = acquireVsCodeApi();
const messenger = new Messenger(vscodeApi);
```

## Core patterns

### Request / response

Either side can `sendRequest`; the other side handles it with `onRequest`. Errors thrown by the handler are surfaced as a rejected promise on the sender side with a `ResponseError { message, data? }`.

### Notification

Fire-and-forget. Use `onNotification` to handle, `sendNotification` to send. No response, no awaiting.

### Broadcast (notifications only)

```ts
// Extension: register the view with the methods it should receive broadcasts for
messenger.registerWebviewView(view, { broadcastMethods: [Refresh.method] });

// Either side:
messenger.sendNotification(Refresh, BROADCAST);
```

Sending a request to `BROADCAST` throws immediately on both sides. Broadcast is for notifications only.

### Cancellation

Extension side accepts a `vscode.CancellationToken` (or any `CancellationToken`-shaped object) directly:

```ts
const cts = new vscode.CancellationTokenSource();
const result = await messenger.sendRequest(LongOp, target, params, cts.token);
// ...
cts.cancel(); // Sends a cancel notification to the receiver
```

Webview side bridges `AbortSignal`:

```ts
import { createCancellationToken } from 'vscode-messenger-webview';

const ctrl = new AbortController();
const result = await messenger.sendRequest(
    LongOp, HOST_EXTENSION, params, createCancellationToken(ctrl.signal)
);
ctrl.abort('User cancelled');
```

In the handler, the third argument is the `CancellationToken`:

```ts
messenger.onRequest(LongOp, async (params, _sender, token) => {
    while (!token.isCancellationRequested) { /* work */ }
    if (token.isCancellationRequested) throw new Error('cancelled');
});
```

### Sender-scoped handlers (extension side only)

`onRequest` / `onNotification` accept `{ sender: MessageParticipant }`. The handler only fires when the message's sender matches. Use this to handle the same method differently per-webview, e.g. when two webviews share a method but should be served by different logic.

**Important:** Sender-scoped handlers require registering multiple handlers for the same method. This is only possible when `uniqueHandlers` is unset or `false` (the default). Do not set `uniqueHandlers: true` if you intend to use sender-scoped handlers — it throws on any duplicate method registration, even with different senders.

### Targeting specific webview instances

`registerWebviewView` / `registerWebviewPanel` return a `WebviewIdMessageParticipant`. Save it to address that one instance:

```ts
const colorsView = messenger.registerWebviewView(view); // { type: 'webview', webviewId: '...' }
messenger.sendNotification(ColorModify, colorsView, 'clear');
```

If you address by `webviewType` instead and multiple instances of that type are registered, `sendRequest` sends the request to **all** registered instances and uses `Promise.race` — the first response wins, others are discarded. Hidden instances (when `ignoreHiddenViews` is `true`, the default) produce an immediate rejection that participates in the race; if any visible instance responds successfully, its result is returned. If all instances are hidden, the request is rejected. `sendNotification` is sent to all instances of that type (hidden ones are silently skipped when `ignoreHiddenViews` is `true`).

## Common gotchas

### Setup prerequisites (must be correct before any message works)

- **Webview drops messages until `start()`** — the webview-side `Messenger` only attaches its `window.addEventListener('message', ...)` inside `start()`. Forgetting to call it makes every incoming message disappear silently. Call `start()` once, synchronously after all `onRequest`/`onNotification` registrations in the same top-level script execution (before any async work), so no incoming messages are missed.
- **Hidden views are skipped by default** — `ignoreHiddenViews: true` causes `sendNotification` / `sendRequest` to a non-visible webview to be skipped (notification) or rejected (request). Either ensure the view is visible, set `ignoreHiddenViews: false` in `MessengerOptions`, or enable `retainContextWhenHidden` on the webview itself when constructing it.
- **Broadcast requires opt-in per view** — a view receives a broadcast notification only if its `ViewOptions.broadcastMethods` contains the method string. Without that, the broadcast looks like it works but the view never sees it.
- **Extension may send before webview is ready** — if the extension sends a request immediately after `registerWebviewView`, the webview may not yet have called `messenger.start()`. Guard against this by having the webview send an initialization notification to the extension once `start()` is called, and only then begin sending from the extension side.

### Runtime and targeting pitfalls

- **Webview handlers are last-write-wins** — on the webview side, `onRequest`/`onNotification` for the same method **replace** the previous handler. On the extension side, notification handlers stack and all fire; request handlers also stack but having multiple matching handlers for the same request method results in an error response ("Multiple matching request handlers"). Use `uniqueHandlers: true` to catch accidental duplicate registrations at registration time (throws immediately). If you re-register on the webview during HMR or re-mount, dispose the old `Disposable` first.
- **`webviewType` with multiple instances races requests** — if you really want to broadcast a question and aggregate, you have to do it yourself (iterate instances by id and `Promise.all`). The library only returns the first response.
- **`extensionId` is reserved for future use** — `ExtensionMessageParticipant.extensionId` is in the type but cross-extension messaging isn't implemented. `sendRequest` to `{ type: 'extension', extensionId }` throws. Use `HOST_EXTENSION` (no `extensionId`) for the host extension.
- **`webviewId` changes on every register** — the id is generated fresh each time `registerWebviewView` / `registerWebviewPanel` is called. Don't persist it across sessions; capture the returned participant and use it for the lifetime of that view.
- **Don't mutate `params` in handlers** — incoming params are deserialized JSON and may be shared with diagnostic listeners. Treat them as immutable.

## Debugging the message flow

The companion **VS Code Messenger Developer Tool** extension (`typefox.vscode-messenger-devtools`) visualizes live traffic — requests, responses, notifications, pending requests, registered handlers, and registered webviews — for any extension that exposes `Messenger.diagnosticApi()` from its `activate` return value. It is the fastest way to confirm whether a message is actually being sent, who received it, and what the payload looks like.

Minimum wiring — return the diagnostic API from `activate`:

```ts
import * as vscode from 'vscode';
import { Messenger, type MessengerDiagnostic } from 'vscode-messenger';

const messenger = new Messenger();

export function activate(context: vscode.ExtensionContext): MessengerDiagnostic {
    // ... register views, handlers, etc.
    return messenger.diagnosticApi();
}
```

To see actual `params` / `result` payloads in the devtool's event details (off by default to avoid leaking sensitive data), pass options:

```ts
return messenger.diagnosticApi({ withParameterData: true, withResponseData: true });
```

Open the devtool with **Developer: Open vscode-messenger devtools** from the Command Palette and select your extension from the list.

For deeper coverage — merging the diagnostic API into an existing public API, customizing events before they reach the devtool (for example, decorating method names with their parameters in the event timeline), the full `MessengerEvent` / `ExtensionInfo` schema, and a checklist for "the devtool shows nothing" — see [references/devtools.md](references/devtools.md).

If `references/devtools.md` is not accessible, here is the essential "devtool shows nothing" checklist:
1. Ensure `activate()` returns the result of `messenger.diagnosticApi()`.
2. Verify the extension is listed in the devtool's extension dropdown — if not, the return value isn't being picked up.
3. Confirm at least one webview is registered (`registerWebviewView` / `registerWebviewPanel` was called).
4. Check that the webview has called `messenger.start()` and is visible (or `ignoreHiddenViews` is `false`).
