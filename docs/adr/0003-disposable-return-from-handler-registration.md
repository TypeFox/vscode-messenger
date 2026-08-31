---
status: accepted
date: 2026-01-15
---

# ADR-0003: `onRequest`/`onNotification` return `Disposable`, not `this`

## Context

The original webview-side `onRequest` and `onNotification` returned `this` (fluent chaining). This was raised as a gap in [#51](https://github.com/TypeFox/vscode-messenger/issues/51): there was no public way to unregister a handler. The workaround required accessing the private `handlerRegistry` directly. The problem is acute in React webviews: `useEffect` hooks must return a cleanup function, and stale closures from un-disposed handlers are a common source of bugs. The `this`-return pattern is also fundamentally incompatible with a design where `dispose()` targets a specific registration rather than the whole method entry.

## Options considered

1. **Add `unregisterHandler(method)` as a separate method, keep `this`-return** — public unregistration, but `this`-return means the returned value is not the disposable, so the React `useEffect` pattern requires an extra call; chaining `messenger.onRequest(...).onNotification(...)` is also order-sensitive and hard to reason about.
2. **Return `Disposable` and drop fluent chaining (chosen)** — align with VS Code's own `Disposable` pattern; the caller captures the return value and calls `dispose()` on cleanup; pairs naturally with `vscode.ExtensionContext.subscriptions.push(...)` and React `useEffect` return.

## Decision

We return a `Disposable` from `onRequest` and `onNotification` on both the extension-host and webview sides. Fluent chaining is removed. The `Disposable.dispose()` method removes exactly the registration it was issued for (by identity, not by method name), so disposing one notification handler does not affect other handlers registered for the same method.

## Consequences

- **Easier:** React `useEffect` cleanup, VS Code subscription management, and any pattern that needs to register/unregister handlers at different lifecycle points all work directly with the returned `Disposable`.
- **Easier:** multiple notification handlers for the same method can each be independently disposed.
- **Harder:** existing code using fluent chaining (`messenger.onRequest(...).onNotification(...)`) breaks — this was a breaking change shipped in v0.6.0.
- **Follow-up:** the `Disposable` return is the prerequisite for the kind-homogeneity enforcement in ADR-0004 — without per-registration identity, a `dispose()` that deleted the whole map entry would interact badly with stacked notification handlers.
