# VS Code Messenger Developer Tool

Visualizes message traffic — requests, responses, and notifications — between a VS Code extension host and its registered webviews for extensions that use the [vscode-messenger](https://github.com/TypeFox/vscode-messenger) library. It is the fastest way to answer "is the message actually being sent?", "did the receiver get it?", and "what does the payload look like?" while developing or debugging.

## Open the devtool view

Open the Command Palette (`Shift+Cmd+P` / `Ctrl+Shift+P`) and run **Developer: Open vscode-messenger devtools**.

The devtool lists every installed extension that depends on `vscode-messenger`. Select yours to see its registered webviews, pending requests, registered handlers, and a live event log.

![Devtool View Screenshot](https://github.com/TypeFox/vscode-messenger/blob/main/packages/vscode-messenger-devtools/media/view-screenshot.png?raw=true)

## Exposing the diagnostic API from your extension

The devtool reads from the public API your `activate` function returns. Your extension must call `messenger.diagnosticApi()` and return the result — otherwise the devtool can see that your extension uses the library but cannot display any traffic.

```ts
import * as vscode from 'vscode';
import { Messenger, type MessengerDiagnostic } from 'vscode-messenger';

const messenger = new Messenger();

export function activate(context: vscode.ExtensionContext): MessengerDiagnostic {
    // Your activation code...
    return messenger.diagnosticApi();
}
```

If your extension already exports a public API, spread the diagnostic methods into it:

```ts
export function activate(context: vscode.ExtensionContext) {
    // Your activation code...
    return {
        ...yourApi,
        ...messenger.diagnosticApi()
    };
}
```

The devtool checks `isMessengerDiagnostic(api)` against the returned object — it looks for `extensionInfo`, `addEventListener`, and `removeEventListener` on the value. Spreading preserves those.

## `DiagnosticOptions`

`diagnosticApi(options?)` accepts two optional flags. Both default to `false` to avoid leaking sensitive payload data to anything that can read your extension's public API.

| Option | Default | Effect |
|---|---|---|
| `withParameterData` | `false` | Includes request/notification `params` as `MessengerEvent.parameter` in every event. |
| `withResponseData` | `false` | Includes response `result` as `MessengerEvent.parameter` on `type: 'response'` events. |

Enable both during development to see full payload values in the event details panel:

```ts
return messenger.diagnosticApi({ withParameterData: true, withResponseData: true });
```

## What the devtool shows

The devtool calls `extensionInfo()` to populate the overview panel:

- **webviews** — registered webview instances (`{ id, type }`)
- **handlers** — registered message handlers (`{ method, count }`)
- **pendingRequest** — count of in-flight requests
- **diagnosticListeners** — count of active event subscribers

It also subscribes via `addEventListener` to receive a `MessengerEvent` for every message that passes through the host-side `Messenger`:

| Field | Description |
|---|---|
| `type` | `'request'`, `'response'`, `'notification'`, or `'unknown'` |
| `id?` | Request id — set for requests and their matching responses |
| `method?` | Message method name (absent on `response` events — correlate by `id`) |
| `sender`, `receiver` | Stringified participants: `'host extension'`, `webviewId`, `webviewType`, or `'broadcast'` |
| `parameter?` | Payload — only populated when `withParameterData` / `withResponseData` is enabled |
| `error?` | Error message for failed responses |
| `size` | Serialized payload byte-size estimate |
| `timestamp` | `Date.now()` at the moment the event was emitted |

## Customizing events before they reach the devtool

You can wrap `addEventListener` to mutate events before any listener — including the devtool — sees them. A useful pattern is to decorate method names with their parameter values so the event timeline is easier to read:

```ts
export function activate(context: vscode.ExtensionContext): MessengerDiagnostic {
    // Your activation code...

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

The wrapper must still satisfy `isMessengerDiagnostic` — keep the original `extensionInfo` and `removeEventListener` on the returned object (the spread above handles this).

## Troubleshooting

**No row for my extension in the devtool**
The devtool detected that your extension depends on `vscode-messenger` but `activate` either threw, returned `undefined`, or returned something where `isMessengerDiagnostic` is false. Confirm that `activate` returns the diagnostic object (or a spread that includes its three methods: `extensionInfo`, `addEventListener`, `removeEventListener`).

**Extension is listed, but no events appear**
`activate` returned the diagnostic API, but no traffic has been produced yet — trigger a message. Note that the host-side `Messenger` only observes host-side traffic; webview-internal processing does not produce events until a message is posted back to the host.

**Events appear but `parameter` is always empty**
`withParameterData` and `withResponseData` are both `false` by default. Pass `{ withParameterData: true, withResponseData: true }` to `diagnosticApi` in your dev build.

**Events visible for one webview only**
The diagnostic API observes only the `Messenger` instance you exposed. If your extension creates multiple `Messenger` instances (uncommon), each needs its own diagnostic export.

---

[Devtools Repository](https://github.com/TypeFox/vscode-messenger/tree/main/packages/vscode-messenger-devtools#readme) · [Messenger Repository](https://github.com/TypeFox/vscode-messenger#readme)
