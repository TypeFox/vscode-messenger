# Change Log of `vscode-messenger-webview`

# Change Log of `vscode-messenger-webview`

## v0.7.0

### Breaking Changes

* **BREAKING: `onRequest()` now throws synchronously if a request handler is already registered for the same method** - Previously, registering a second `onRequest()` handler for the same method silently replaced the first one without any warning.
  * Only one request handler is allowed per method. Dispose the existing handler first if you need to replace it.
  * `onNotification()` is unaffected: multiple notification handlers can still be registered for the same method, and all of them are now correctly invoked (previously, only the most recently registered one was called).
  * Disposing a handler now only removes that specific registration instead of clearing all handlers registered for the method.
* **BREAKING: A method name can no longer be used for both a request and a notification handler** - Registering a handler whose kind (request/notification) differs from an already registered handler for the same method now throws. A method must be used exclusively for requests or for notifications.

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
