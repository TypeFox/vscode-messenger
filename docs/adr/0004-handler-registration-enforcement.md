---
status: accepted
date: 2026-08-28
---

# ADR-0004: Handler registration throws immediately on conflicting scope or mixed kind

## Context

Raised in [#63](https://github.com/TypeFox/vscode-messenger/issues/63). Before v0.7.0:

- **Webview side:** registering a second `onRequest`/`onNotification` for the same method silently overwrote the previous handler (last-write-wins). The `Disposable` returned by the first registration would, when disposed, delete the whole map entry — removing the second handler instead of the first. No error was ever raised.
- **Host side:** a second overlapping `onRequest` registration succeeded silently; the conflict surfaced only at dispatch time as an error response ("Multiple matching request handlers"). A notification handler and a request handler could also coexist under the same method name, causing the wrong handler type to be invoked depending on which arrived first in the dispatch loop.

Three observable defects: silent overwrite (wrong handler fires), mis-targeted dispose (wrong registration removed), and runtime dispatch error (instead of an early registration error).

## Options considered

1. **Status quo — runtime errors only** — cheap; defects surface at dispatch time (potentially long after the bad registration), with no information about where the duplicate registration happened.
2. **`uniqueHandlers: true` option** — opt-in strict mode. Already existed but gated on a flag, blocked sender-scoped multi-handler patterns, and did not distinguish notification stacking from request conflicts.
3. **Typed enforcement at registration time (chosen)** — throw synchronously from `onRequest` when a conflicting scope exists; throw from both `onRequest` and `onNotification` when the method already has handlers of the opposite kind. Notification handlers stack freely (all fire). Request handlers allow multiple registrations only with provably non-overlapping sender scopes.

## Decision

We enforce handler invariants at registration time on both sides:

- **Kind homogeneity:** a method may be used for requests or for notifications, never both. Any registration attempt for the opposite kind throws immediately with the method name and both kinds in the message.
- **Request uniqueness per scope:** on the host side, a second `onRequest` for the same method throws if its `sender` scope overlaps an existing request handler's scope. Non-overlapping scopes (e.g. two different `webviewId` values) coexist. On the webview side, at most one request handler per method.
- **Notification stacking:** `onNotification` always stacks — all matching handlers fire in parallel at dispatch.
- **`Disposable.dispose()` removes by identity** (not by method name), so stacked notification handlers can be independently managed.

The `uniqueHandlers: true` option is retained for teams that want to disallow even notification stacking, but its error message now names the option so the cause is visible.

## Consequences

- **Easier:** double-registration bugs surface immediately at the call site, not at the next incoming message; stack traces point directly to the offending `onRequest` call.
- **Easier:** React StrictMode and HMR re-runs are well-defined: the `useEffect` cleanup (calling `dispose()`) removes exactly the stale handler, and the second mount re-registers cleanly.
- **Harder (breaking):** code that (accidentally or intentionally) registered overlapping request handlers now throws on the second registration instead of failing silently at dispatch. This was shipped as a minor version bump (v0.7.0) under `0.x` SemVer conventions, where the minor position carries the breaking-change signal.
- **Follow-up:** the `sendersOverlap` function (host-side, in `messenger.ts`) is conservative about `webviewId`-vs-`webviewType` pairs — it treats them as non-overlapping at registration time and relies on the dispatch-time `length > 1` guard for any cross-scope ambiguity that can't be resolved statically. Tightening this to registry-aware overlap detection is deferred.
