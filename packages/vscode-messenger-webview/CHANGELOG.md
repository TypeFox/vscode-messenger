# Change Log of `vscode-messenger-webview`

## v0.6.0 (Jan. 2026)

### Breaking Changes

* **BREAKING: `onRequest()` and `onNotification()` now return `Disposable` instead of `Messenger`** - This change removes method chaining but provides consistent disposal pattern
  * `onRequest<P, R>(type: RequestType<P, R>, handler: RequestHandler<P, R>): Disposable`
  * `onNotification<P>(type: NotificationType<P>, handler: NotificationHandler<P>): Disposable`
  * **Migration**: Replace method chaining like `messenger.onRequest(type, handler).start()` with separate calls: `messenger.onRequest(type, handler); messenger.start();`
* **BREAKING: Removed `onRequestDisposable()` and `onNotificationDisposable()` methods** - These are no longer needed since `onRequest()` and `onNotification()` now return disposables directly

### New Features

* **NEW: `unregisterHandler(method: string): boolean`** - Programmatically unregister message handlers by method name
  * Returns `true` if handler was successfully removed, `false` if no handler existed
  * Enables dynamic handler management and cleanup

### Improvements

* **Enhanced JSDoc documentation** - JSDoc with examples showing different handler registration and cleanup patterns
