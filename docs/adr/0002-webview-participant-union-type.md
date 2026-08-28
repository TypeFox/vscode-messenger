---
status: accepted
date: 2022-08-04
---

# ADR-0002: `WebviewMessageParticipant` as a discriminated union, not a single interface with optional fields

## Context

The original `WebviewMessageParticipant` interface had both `webviewId` and `webviewType` as optional strings ([#5](https://github.com/TypeFox/vscode-messenger/issues/5)):

```ts
interface WebviewMessageParticipant { type: 'webview'; webviewId?: string; webviewType?: string; }
```

This silently allowed constructing `{ type: 'webview' }` — a participant with neither field set — which the library would reject at runtime with a confusing error. The type system gave no help.

## Options considered

1. **Single interface, runtime validation** — add a guard that throws immediately when neither field is set; keep the optional fields. Preserves a simpler type structure but loses compile-time safety.
2. **Discriminated union (chosen)** — split into `WebviewIdMessageParticipant` (requires `webviewId: string`) and `WebviewTypeMessageParticipant` (requires `webviewType: string`); `WebviewMessageParticipant` is their union. Illegal states become unrepresentable at the type level.

## Decision

We model `WebviewMessageParticipant` as `WebviewIdMessageParticipant | WebviewTypeMessageParticipant` so the compiler rejects participant objects that carry neither field. The type guards `isWebviewIdMessageParticipant` and `isWebviewTypeMessageParticipant` (exported from `vscode-messenger-common`) are the sanctioned way to narrow the union at runtime.

## Consequences

- **Easier:** TypeScript narrows correctly; passing `{ type: 'webview' }` is a compile error; the type guards replace manual field checks throughout the library.
- **Harder:** `webviewId` and `webviewType` cannot be accessed directly on the union without narrowing — code that previously read `participant.webviewType` unconditionally must call `isWebviewTypeMessageParticipant` first.
- **Note:** a concrete sender populated by the library (inside `registerViewContainer`) always carries both fields (`webviewId` AND `webviewType`) as the extension knows both; a consumer-constructed participant carries exactly one. `equalParticipants` is designed for the concrete sender case and uses structural equality; it is **not** suitable for comparing two consumer-constructed filter participants against each other — use `sendersOverlap` in `vscode-messenger/src/messenger.ts` for that.
