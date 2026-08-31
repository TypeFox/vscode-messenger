---
status: accepted
date: 2024-12-01
---

# ADR-0001: Two-sided cancellation bridge — `vscode.CancellationToken` on the host, `AbortSignal` on the webview

## Context

Request cancellation was requested in [#16](https://github.com/TypeFox/vscode-messenger/issues/16). The library spans two runtime environments that have incompatible native cancellation primitives: the VS Code extension host exposes `vscode.CancellationToken` (and `CancellationTokenSource`) as the ecosystem-standard; browser-side code uses `AbortSignal` / `AbortController` from the Web Platform API. A request handler on the host side receives `CancellationToken` from the VS Code runtime itself (e.g. editor commands pass one in). Forcing the webview side to use `CancellationToken` would require shipping a userland implementation of something VS Code provides natively on the host; forcing the host side to use `AbortSignal` would break the VS Code extension contract.

## Options considered

1. **`AbortSignal` on both sides** — avoids a bespoke type; requires a userland `CancellationToken` implementation on the host (reimplements what VS Code provides) and disconnects host handlers from VS Code's own cancellation plumbing.
2. **`vscode.CancellationToken` on both sides** — host stays idiomatic; requires shipping a browser polyfill of `CancellationTokenSource` in the webview package, adding complexity and runtime size.
3. **Native type per side, bridge at the webview boundary (chosen)** — host uses `vscode.CancellationToken` natively; webview calls `createCancellationToken(abortSignal)` to produce a `CancellationToken`-shaped object from any `AbortSignal`.

## Decision

We use `vscode.CancellationToken` as the shared cancellation contract on all request handlers (both host and webview) and provide `createCancellationToken(signal: AbortSignal)` in `vscode-messenger-webview` to bridge the Web Platform primitive into that contract.

The bridge is one-directional (AbortSignal → CancellationToken) and one-line: it keeps the host side idiomatic to VS Code and the webview side idiomatic to the browser without requiring a polyfill in either direction.

## Consequences

- **Easier:** host handlers integrate directly with VS Code's built-in cancellation sources (editor commands, task runners); no extra import needed.
- **Easier:** webview consumers use standard `AbortController`/`AbortSignal` which is already familiar and available without imports.
- **Harder:** webview consumers must import and call `createCancellationToken`; the bridge is not automatic.
- **Follow-up:** the internal `CancellationToken` interface in `vscode-messenger-common` must remain a structural (duck-typed) subset of `vscode.CancellationToken` so both the VS Code-provided token and the bridge's output satisfy it — any narrowing of that interface is a breaking change.
