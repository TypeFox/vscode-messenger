# Architecture

`vscode-messenger` is a typed RPC layer over `postMessage` for the three-way channel between a VS Code extension host, its webviews, and (for the devtools package) other extensions inspecting that traffic. It ships as three small packages plus one VS Code extension that consumes them; there is no server, database, or network layer.

## Package layering

Build/type order follows the project references in [tsconfig.build.json](../tsconfig.build.json). A package may only depend on ones to its left:

```
vscode-messenger-common
        │
        ├── vscode-messenger            (extension host)
        └── vscode-messenger-webview    (webview script)
                        │
                        └── vscode-messenger-devtools        (VS Code extension)
                                    └── webview-ui           (React app, separate build)

examples/calico-colors  (consumes vscode-messenger + vscode-messenger-webview + vscode-messenger-common)
```

### `packages/vscode-messenger-common/`

Runtime-agnostic types shared by both ends of the channel.

- `messages.ts` — `NotificationType<P>` / `RequestType<P, R>` type tags, `MessageParticipant` variants, `HOST_EXTENSION`, `BROADCAST`, the wire message shapes, `MessengerAPI` interface, handler types.
- `util.ts` — internal utilities shared by both `Messenger` implementations: `HandlerRegistration`, `HandlerKind`, `participantToString`, `wrongHandlerKindMessage`. Not part of the public user-facing API; consumed only by the two `Messenger` classes.
- `cancellation.ts` — cancellation message types shared between the extension's `vscode.CancellationToken` and the webview's `AbortSignal` bridge.

### `packages/vscode-messenger/`

Extension-host runtime.

- `messenger.ts` — the `Messenger` class: `registerWebviewView` / `registerWebviewPanel`, `sendNotification` / `sendRequest`, `onNotification` / `onRequest`, routing by participant (single view, view-type group, broadcast), view disposal cleanup.
- `diagnostic-api.ts` — `MessengerDiagnostic` / `isMessengerDiagnostic`: an opt-in introspection surface (`extensionInfo()`, `addEventListener`) that lets another extension (namely devtools) observe a host's message traffic without coupling to its internals.

### `packages/vscode-messenger-webview/`

Webview-side mirror of the `Messenger` API (`messenger.ts`), plus `vscode-api.ts` wrapping `acquireVsCodeApi()` and `createCancellationToken` for bridging an `AbortSignal` to the extension side. `messenger.start()` must be called before any message is received — see [AGENTS.md](../AGENTS.md).

### `packages/vscode-messenger-devtools/`

A VS Code extension, not a library. `devtool-ext.ts` activates a webview panel (`panels/MessagesPanel.ts`) and, for every other installed extension, checks `isMessengerDiagnostic(ext.exports)` to attach a listener and stream its message traffic into the panel via `PushDataNotification`. `webview-ui/` is an independently built React + Vite app (uses `baukasten-ui`, `@tanstack/react-table`, `zustand`) rendering that traffic:
- `components/` — `data-table.tsx`, `messenger-chart.tsx`, `visualization.tsx`, `extension-info.tsx`, `view-header.tsx`.
- `model/` — `messenger-types.ts`, the shared request/notification contract with the extension host side (mirrors `packages/vscode-messenger-devtools/src/messenger-types.ts`).

### `examples/calico-colors/`

Reference extension (two webview types: `calico-colors-view.ts`, `cat-coding-view.ts`) showing end-to-end usage of the library. Not published; exists to keep the README examples and the SKILL.md honest against a real build.

## Invariants

- `vscode-messenger-common` has no dependency on `vscode` or DOM APIs — it must stay usable from both the extension host and the webview sandbox.
- The devtools introspection contract (`MessengerDiagnostic`) is the only sanctioned way to observe another extension's messenger traffic; it must not require the observed extension to import `vscode-messenger-devtools`.
- `webview-ui` is a `noEmit` TypeScript project (typecheck-only via the root `tsc -b` graph); its actual bundle is produced separately by its own `tsc && vite build` script, invoked from the root `npm run build` — see [AGENTS.md](../AGENTS.md#commands).
- `acquireVsCodeApi()` may be called **at most once** per webview lifetime (VS Code restriction). `vscode-messenger-webview`'s `Messenger` constructor calls it internally. Creating more than one `Messenger` instance per webview would call it twice and throw. Keep the `Messenger` at module scope, outside component trees — see the React example in [README.md](../README.md).
- A `method` string must be used for requests **or** for notifications, never both, on a given side. This is enforced at handler registration time (throws on violation). See [ADR-0004](adr/0004-handler-registration-enforcement.md).
- `Disposable.dispose()` on a handler registration removes exactly that registration by identity — not all registrations for the method. This is a prerequisite for independent notification-handler stacking. See [ADR-0003](adr/0003-disposable-return-from-handler-registration.md).

## Decision records

Key architectural decisions are in [`docs/adr/`](adr/):

| ADR | Decision |
|---|---|
| [0001](adr/0001-two-sided-cancellation-bridge.md) | Two-sided cancellation: `vscode.CancellationToken` on host, `AbortSignal` bridge on webview |
| [0002](adr/0002-webview-participant-union-type.md) | `WebviewMessageParticipant` as discriminated union (not optional fields) |
| [0003](adr/0003-disposable-return-from-handler-registration.md) | `onRequest`/`onNotification` return `Disposable`, not `this` |
| [0004](adr/0004-handler-registration-enforcement.md) | Handler registration throws immediately on conflicting scope or mixed kind (v0.7.0) |
