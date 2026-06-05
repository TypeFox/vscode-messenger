# Debugging with the VS Code Messenger Devtools

The [VS Code Messenger Developer Tool](https://marketplace.visualstudio.com/items?itemName=typefox.vscode-messenger-devtools) is a separate VS Code extension that visualizes message traffic — requests, responses, notifications — between an extension host and its registered webviews. It is the fastest way to answer "is the message actually being sent?", "did the receiver get it?", and "what does the payload look like?" while developing or debugging an extension that uses `vscode-messenger`.

The devtool talks to your extension via the `MessengerDiagnostic` API your extension exposes. Without that hook, the devtool can detect that the extension uses the library but cannot show any traffic for it.

## Install and open

1. Install **VS Code Messenger Developer Tool** (`typefox.vscode-messenger-devtools`) from the Marketplace.
2. Open the Command Palette and run **Developer: Open vscode-messenger devtools**.
3. The devtool lists every installed extension that depends on `vscode-messenger`. Pick yours to see its registered webviews, pending requests, registered handlers, and a live event log.

## Exposing the diagnostic API from your extension

The devtool reads from the public API your `activate` function returns. `Messenger.diagnosticApi(options?)` returns an object that satisfies the `MessengerDiagnostic` interface — return it (alone, or merged into your existing extension API):

```ts
import * as vscode from 'vscode';
import { Messenger, type MessengerDiagnostic } from 'vscode-messenger';

const messenger = new Messenger();

export function activate(context: vscode.ExtensionContext): MessengerDiagnostic {
    // ... your activation: register views, command handlers, message handlers ...
    return messenger.diagnosticApi();
}
```

If your extension already exports a public API, spread the diagnostic methods into it:

```ts
export function activate(context: vscode.ExtensionContext) {
    // ... your activation ...
    return {
        ...yourApi,
        ...messenger.diagnosticApi()
    };
}
```

The devtool calls `isMessengerDiagnostic(api)` against the returned object — it must have `extensionInfo`, `addEventListener`, and `removeEventListener` reachable on the returned value. Spreading preserves that.

## `DiagnosticOptions`

`diagnosticApi(options?)` accepts:

| Option | Default | Effect |
|---|---|---|
| `withParameterData` | `false` | Includes request/notification `params` on `MessengerEvent.parameter`. Off by default to avoid leaking sensitive payloads to anything that can read your extension's API. |
| `withResponseData` | `false` | Includes response `result` on `MessengerEvent.parameter` for `type: 'response'` events. |

Turn these on during development if you want to see payload values in the devtool's event details panel. Leave them off (or omit `options`) for builds you ship.

```ts
return messenger.diagnosticApi({ withParameterData: true, withResponseData: true });
```

## What the devtool shows

`messenger.diagnosticApi()` exposes:

- `extensionInfo()` — registered `webviews` (`{ id, type }`), the count of currently `pendingRequest`s, `diagnosticListeners`, and `handlers` (`{ method, count }`). The devtool polls this for the overview panel.
- `addEventListener(listener)` / `removeEventListener(listener)` — the devtool subscribes to receive a `MessengerEvent` for every message that flows through the host-side `Messenger`.

A `MessengerEvent` has:

- `type`: `'request' | 'response' | 'notification' | 'unknown'`
- `id?`: request id (set for requests and their responses)
- `method?`: the message method (not present on `response` events — match by `id`)
- `sender`, `receiver`: stringified participants (`'host extension'`, the `webviewId`, `webviewType`, or `'broadcast'`)
- `parameter?`: payload (only when the matching `with*Data` option is enabled)
- `error?`: error message for failed responses
- `size`: serialized payload byte size estimate
- `timestamp`: `Date.now()` at the moment the event was emitted

## Customizing events before they reach the devtool

You can wrap `addEventListener` to mutate or filter events before listeners (including the devtool) see them. A common use is to disambiguate identical method names by parameter so the timeline reads better:

```ts
export function activate(context: vscode.ExtensionContext): MessengerDiagnostic {
    // ... activation ...

    const diagnostics = messenger.diagnosticApi({
        withParameterData: true,
        withResponseData: true
    });

    return {
        ...diagnostics,
        addEventListener: (listener) => diagnostics.addEventListener(event => {
            if (event.method === 'colorSelected') {
                event.method = `colorSelected(${JSON.stringify(event.parameter)})`;
            }
            listener(event);
        })
    };
}
```

Every wrapper must still satisfy `isMessengerDiagnostic` — keep the original `extensionInfo` and `removeEventListener` references. Note: since the wrapper passes a new anonymous function to `diagnostics.addEventListener`, callers cannot use `removeEventListener(originalListener)` to unsubscribe — they must use the `Disposable` returned by `addEventListener` instead. This is fine in practice since the devtool uses disposables.

## When the devtool shows nothing

- **No row for your extension in the devtool** — the devtool detected your extension declares a dependency on `vscode-messenger` but `activate` either threw, didn't return, or returned something where `isMessengerDiagnostic` is false. Check your activation output and confirm your `activate` returns the diagnostic object (or a spread that includes its three methods).
- **Extension visible, no events** — `activate` returned the diagnostic API, but no traffic has been produced yet. Trigger a message, and remember that the host-side `Messenger` only sees host-side traffic; webview-internal handlers that run before posting back to the host produce no event until the response is sent.
- **Events visible but `parameter` is empty** — `withParameterData` / `withResponseData` are off (the default). Re-create the `Messenger` with those options enabled in a dev build.
- **Events for one webview only** — the diagnostic API only observes traffic on the `Messenger` instance you exposed. If your extension uses multiple `Messenger` instances (rare), each needs its own diagnostic export.

## Cleanup

`addEventListener` returns a `vscode.Disposable`. The devtool manages its own subscription lifecycle, so you typically don't need to manage it. If you add your own listeners (e.g. logging traffic to a file in dev), dispose them on extension deactivation to avoid leaking handlers across reloads.
