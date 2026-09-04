/******************************************************************************
 * Copyright 2022 TypeFox GmbH
 * This program and the accompanying materials are made available under the
 * terms of the MIT License, which is available in the project root.
 ******************************************************************************/

import type {
    CancellationToken, Disposable,
    HandlerRegistration, JsonAny, Message, MessageParticipant, MessengerAPI,
    NotificationHandler, NotificationMessage, NotificationType,
    RequestHandler, RequestMessage, RequestType, ResponseError, ResponseMessage
} from 'vscode-messenger-common';
import {
    CancellationTokenImpl,
    Deferred,
    HOST_EXTENSION,
    createCancelRequestMessage,
    isCancelRequestNotification,
    isMessage,
    isNotificationMessage, isRequestMessage, isResponseMessage,
    participantToString, wrongHandlerKindMessage
} from 'vscode-messenger-common';
import type { VsCodeApi } from './vscode-api';

export class Messenger implements MessengerAPI {

    protected readonly handlerRegistry: Map<string, HandlerRegistration[]> = new Map();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    protected readonly requests: Map<string, Deferred<any>> = new Map();
    protected readonly pendingHandlers: Map<string, CancellationTokenImpl> = new Map();

    protected readonly vscode: VsCodeApi;

    protected readonly options: MessengerOptions;

    private started = false;

    constructor(vscode?: VsCodeApi, options?: MessengerOptions) {
        this.vscode = vscode ?? acquireVsCodeApi();
        const defaultOptions: MessengerOptions = {
            debugLog: false
        };
        this.options = { ...defaultOptions, ...options };
    }

    /**
     * Register a request handler.
     * @param type The request type.
     * @param handler The request handler.
     * @returns A Disposable for automatic cleanup.
     *
     * @see {@link unregisterHandler} - Manual method to unregister handlers by method name
     *
     * @example
     * ```typescript
     * // Define message types
     * const myRequest: RequestType<{ userId: string }, { name: string }> = { method: 'getUser' };
     * const myNotification: NotificationType<string> = { method: 'statusUpdate' };
     *
     * // Register handlers and get disposables for cleanup
     * const requestDisposable = messenger.onRequest(myRequest, handler);
     * const notificationDisposable = messenger.onNotification(myNotification, notifHandler);
     *
     * // Manual unregistration
     * messenger.unregisterHandler(myRequest.method);
     *
     * // Or use the disposable for automatic cleanup
     * requestDisposable.dispose(); // Clean up when done
     * ```
     *
     * @throws {Error} If a request handler is already registered for this method. Only one request handler
     * is allowed per method; dispose the existing handler first if you need to replace it.
     */
    onRequest<P, R>(type: RequestType<P, R>, handler: RequestHandler<P, R>): Disposable {
        return this.registerHandler(type.method, handler as RequestHandler<unknown, unknown>, 'request');
    }

    /**
     * Register a notification handler.
     * @param type The notification type.
     * @param handler The notification handler.
     * @returns A Disposable for automatic cleanup.
     *
     * @see {@link unregisterHandler} - Manual method to unregister handlers by method name
     *
     * @example
     * ```typescript
     * // Define message types
     * const myNotification: NotificationType<{ status: string }> = { method: 'statusChanged' };
     * const myRequest: RequestType<string, number> = { method: 'getCount' };
     *
     * // Register handlers and get disposables for cleanup
     * const notificationDisposable = messenger.onNotification(myNotification, handler);
     * const requestDisposable = messenger.onRequest(myRequest, reqHandler);
     *
     * // Manual unregistration
     * messenger.unregisterHandler(myNotification.method);
     *
     * // Or use the disposable for automatic cleanup
     * notificationDisposable.dispose(); // Clean up when done
     * ```
     *
     * Multiple notification handlers can be registered for the same method; all of them are invoked
     * for every received notification.
     */
    onNotification<P>(type: NotificationType<P>, handler: NotificationHandler<P>): Disposable {
        return this.registerHandler(type.method, handler as NotificationHandler<unknown>, 'notification');
    }

    protected registerHandler(
        method: string,
        handler: RequestHandler<unknown, unknown> | NotificationHandler<unknown>,
        kind: 'request' | 'notification'
    ): Disposable {
        const handlers = this.handlerRegistry.get(method) ?? [];
        const existingKind = handlers[0]?.kind;
        if (existingKind && existingKind !== kind) {
            throw new Error(`Cannot register a ${kind} handler for method '${method}': a ${existingKind} handler is already registered for the same method. `
                + 'A method must be used exclusively for requests or for notifications.');
        }
        if (kind === 'request' && handlers.length > 0) {
            throw new Error(`A request handler is already registered for method '${method}'. `
                + 'Only one request handler is allowed per method; dispose the existing handler first if you need to replace it.');
        }
        const registration: HandlerRegistration = { handler, kind };
        handlers.push(registration);
        this.handlerRegistry.set(method, handlers);
        return {
            dispose: () => {
                const regs = this.handlerRegistry.get(method);
                if (regs) {
                    const index = regs.indexOf(registration);
                    if (index >= 0) {
                        regs.splice(index, 1);
                        if (regs.length === 0) {
                            this.handlerRegistry.delete(method);
                        }
                    }
                }
            }
        };
    }

    /**
     * Start the message processing.
     */
    start(): void {
        if (this.started) {
            return;
        }
        window.addEventListener('message', (event: { data: unknown }) => {
            if (isMessage(event.data)) {
                this.processMessage(event.data)
                    .catch(err => this.log(String(err), 'error'));
            }
        });
        this.started = true;
    }

    /**
     * Unregisters a handler by its method name.
     * @param method The method name of the handler to unregister. Use `<Type>.method` for type safety.
     * @returns True if the handler was successfully unregistered, false otherwise.
     */
    unregisterHandler(method: string): boolean {
        return this.handlerRegistry.delete(method);
    }

    protected async processMessage(msg: Message): Promise<void> {
        if (msg.receiver.type === 'extension') {
            // Ignore the message if it's not directed to us
            return;
        }
        if (isRequestMessage(msg)) {
            await this.processRequestMessage(msg);
        } else if (isNotificationMessage(msg)) {
            await this.processNotificationMessage(msg);
        } else if (isResponseMessage(msg)) {
            await this.processResponseMessage(msg);
        } else {
            this.log(`Invalid message: ${JSON.stringify(msg)}`, 'error');
        }
    }

    protected async processResponseMessage(msg: ResponseMessage) {
        this.log(`View received Response message: ${msg.id}`);
        const request = this.requests.get(msg.id);
        if (request) {
            if (msg.error) {
                request.reject(msg.error);
            } else {
                request.resolve(msg.result);
            }
            this.requests.delete(msg.id);
        } else {
            this.log(`Received response for untracked message id: ${msg.id} (sender: ${participantToString(msg.sender!)})`, 'warn');
        }
    }

    protected async processNotificationMessage(msg: NotificationMessage) {
        this.log(`View received Notification message: ${msg.method}`);
        if (isCancelRequestNotification(msg)) {
            const cancelable = this.pendingHandlers.get(msg.params.msgId);
            if (cancelable) {
                cancelable.cancel(`Request ${msg.params} was canceled by the sender.`);
            } else {
                this.log(`Received cancel notification for missing cancelable. ${msg.params}`, 'warn');
            }
        } else {
            const regs = this.handlerRegistry.get(msg.method);
            if (regs && regs[0].kind === 'notification') {
                await Promise.all(regs.map(reg => reg.handler(msg.params, msg.sender!, new CancellationTokenImpl())));
            } else if (regs) {
                this.log(wrongHandlerKindMessage('notification', msg.method, regs[0].kind), 'warn');
            } else if (msg.receiver.type !== 'broadcast') {
                this.log(`Received notification with unknown method: ${msg.method}`, 'warn');
            }
        }
    }

    protected async processRequestMessage(msg: RequestMessage) {
        this.log(`View received Request message: ${msg.method} (id ${msg.id})`);
        const registration = this.handlerRegistry.get(msg.method)?.[0];
        if (registration?.kind === 'request') {
            const handler = registration.handler;
            const cancelable = new CancellationTokenImpl();
            try {
                this.pendingHandlers.set(msg.id, cancelable);
                const result = await handler(msg.params, msg.sender!, cancelable);
                const response: ResponseMessage = {
                    id: msg.id,
                    receiver: msg.sender!,
                    result: result as JsonAny
                };
                this.vscode.postMessage(response);
            } catch (error) {
                if (cancelable.isCancellationRequested) {
                    // Don't report the error if request was canceled.
                    return;
                }
                const response: ResponseMessage = {
                    id: msg.id,
                    receiver: msg.sender!,
                    error: this.createResponseError(error)
                };
                this.vscode.postMessage(response);
            } finally {
                this.pendingHandlers.delete(msg.id);
            }
        } else {
            const message = registration
                ? wrongHandlerKindMessage('request', msg.method, registration.kind)
                : `Unknown method: ${msg.method}`;
            this.log(message, 'warn');
            const response: ResponseMessage = {
                id: msg.id,
                receiver: msg.sender!,
                error: {
                    message
                }
            };
            this.vscode.postMessage(response);
        }
    }

    protected createResponseError(error: unknown): ResponseError {
        if (error instanceof Error) {
            return { message: error.message, data: error.stack };
        } else if (typeof error === 'object' && error !== null && typeof (error as ResponseError).message === 'string') {
            return { message: (error as ResponseError).message, data: (error as ResponseError).data };
        } else {
            return { message: String(error) };
        }
    }

    /**
     * Send a request message to another participant and wait for a response.
     *
     * @template P The type of the request parameters
     * @template R The type of the response data
     * @param type The request type definition containing the method name
     * @param receiver The target participant to send the request to (extension or specific webview)
     * @param params Optional parameters to send with the request
     * @param cancelable Optional cancellation token to cancel the request
     * @returns A Promise that resolves with the response data or rejects if the request fails
     *
     * @throws {Error} If the receiver is a broadcast participant (broadcasts are only allowed for notifications)
     *
     * @example
     * ```typescript
     * // Define a request type
     * const GetUserRequest: RequestType<{ userId: string }, { name: string, email: string }> = {
     *     method: 'getUser'
     * };
     *
     * // Send a request to the host extension
     * const user = await messenger.sendRequest(
     *     GetUserRequest,
     *     HOST_EXTENSION,
     *     { userId: '123' }
     * );
     * console.log(`User: ${user.name} (${user.email})`);
     *
     * // Send a request with cancellation support
     * const controller = new AbortController();
     * const cancelToken = createCancellationToken(controller.signal);
     *
     * try {
     *     const result = await messenger.sendRequest(
     *         GetUserRequest,
     *         HOST_EXTENSION,
     *         { userId: '456' },
     *         cancelToken
     *     );
     * } catch (error) {
     *     if (controller.signal.aborted) {
     *         console.log('Request was cancelled');
     *     } else {
     *         console.error('Request failed:', error);
     *     }
     * }
     *
     * // Cancel the request after 5 seconds
     * setTimeout(() => controller.abort('Timeout'), 5000);
     * ```
     */
    sendRequest<P, R>(type: RequestType<P, R>, receiver: MessageParticipant, params?: P, cancelable?: CancellationToken): Promise<R> {
        if (receiver.type === 'broadcast') {
            throw new Error('Only notification messages are allowed for broadcast.');
        }

        const msgId = this.createMsgId();
        const pending = new Deferred<R>();
        this.requests.set(msgId, pending);
        if (cancelable) {
            const listener = cancelable.onCancellationRequested((reason) => {
                // Send cancel message for pending request
                this.vscode.postMessage(createCancelRequestMessage(receiver, { msgId }));
                pending.reject(new Error(reason));
                this.requests.delete(msgId);
            });
            pending.result.finally(() => {
                // Request finished, remove the listener
                listener.dispose();
            }).catch((err: unknown) =>
                this.log(`Pending request rejected: ${String(err)}`)
            );
        }
        const message: RequestMessage = {
            id: msgId,
            method: type.method,
            receiver,
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            params: params as any
        };
        this.vscode.postMessage(message);
        return pending.result;
    }

    /**
     * Send a request message to the host extension and wait for a response.
     *
     * Shorthand for `sendRequest(type, HOST_EXTENSION, params, cancelable)`, since sending a
     * request to the host extension is the most common case on the webview side.
     *
     * @template P The type of the request parameters
     * @template R The type of the response data
     * @param type The request type definition containing the method name
     * @param params Optional parameters to send with the request
     * @param cancelable Optional cancellation token to cancel the request
     * @returns A Promise that resolves with the response data or rejects if the request fails
     *
     * @see {@link sendRequest} - Use this instead when the receiver is not the host extension
     *
     * @example
     * ```typescript
     * const GetUserRequest: RequestType<{ userId: string }, { name: string }> = { method: 'getUser' };
     *
     * // Equivalent to messenger.sendRequest(GetUserRequest, HOST_EXTENSION, { userId: '123' })
     * const user = await messenger.sendExtensionRequest(GetUserRequest, { userId: '123' });
     * ```
     */
    sendExtensionRequest<P, R>(type: RequestType<P, R>, params?: P, cancelable?: CancellationToken): Promise<R> {
        return this.sendRequest(type, HOST_EXTENSION, params, cancelable);
    }

    /**
     * Send a notification message to another participant without expecting a response.
     *
     * Notifications are fire-and-forget messages that don't require acknowledgment or return values.
     * Unlike requests, notifications can be sent to broadcast receivers to notify all registered handlers.
     *
     * @template P The type of the notification parameters
     * @param type The notification type definition containing the method name
     * @param receiver The target participant to send the notification to (extension, webview, or broadcast)
     * @param params Optional parameters to send with the notification
     *
     * @example
     * ```typescript
     * // Define a notification type
     * const UserLoggedInNotification: NotificationType<{ userId: string, timestamp: number }> = {
     *     method: 'userLoggedIn'
     * };
     *
     * // Send a notification to the host extension
     * messenger.sendNotification(
     *     UserLoggedInNotification,
     *     HOST_EXTENSION,
     *     { userId: '123', timestamp: Date.now() }
     * );
     *
     * // Send a notification to a specific webview
     * messenger.sendNotification(
     *     UserLoggedInNotification,
     *     { type: 'webview', webviewType: 'dashboard' },
     *     { userId: '123', timestamp: Date.now() }
     * );
     *
     * // Broadcast a notification to all registered handlers
     * messenger.sendNotification(
     *     UserLoggedInNotification,
     *     BROADCAST,
     *     { userId: '123', timestamp: Date.now() }
     * );
     *
     * // Send a simple notification without parameters
     * const RefreshNotification: NotificationType<void> = { method: 'refresh' };
     * messenger.sendNotification(RefreshNotification, HOST_EXTENSION);
     * ```
     */
    sendNotification<P>(type: NotificationType<P>, receiver: MessageParticipant, params?: P): void {
        const message: NotificationMessage = {
            method: type.method,
            receiver,
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            params: params as any
        };
        this.vscode.postMessage(message);
    }

    /**
     * Send a notification message to the host extension without expecting a response.
     *
     * Shorthand for `sendNotification(type, HOST_EXTENSION, params)`, since sending a
     * notification to the host extension is the most common case on the webview side.
     *
     * @template P The type of the notification parameters
     * @param type The notification type definition containing the method name
     * @param params Optional parameters to send with the notification
     *
     * @see {@link sendNotification} - Use this instead when the receiver is not the host extension
     *
     * @example
     * ```typescript
     * const UserLoggedInNotification: NotificationType<{ userId: string }> = { method: 'userLoggedIn' };
     *
     * // Equivalent to messenger.sendNotification(UserLoggedInNotification, HOST_EXTENSION, { userId: '123' })
     * messenger.sendExtensionNotification(UserLoggedInNotification, { userId: '123' });
     * ```
     */
    sendExtensionNotification<P>(type: NotificationType<P>, params?: P): void {
        this.sendNotification(type, HOST_EXTENSION, params);
    }

    private nextMsgId = 0;

    protected createMsgId(): string {
        // Messenger is created each time a view gets visible, so we need a UUID.
        const cryptoRand = window.crypto.getRandomValues(new Uint8Array(10));
        const rand = Array.from(cryptoRand).map(b => b.toString(16)).join('');
        return 'req_' + this.nextMsgId++ + '_' + rand;
    }

    /**
     * Log a message to the console.
     * @param text The message to log.
     * @param level The log level. Defaults to 'debug'.
     */
    protected log(text: string, level: 'debug' | 'warn' | 'error' = 'debug'): void {
        switch (level) {
            case 'debug': {
                if (this.options.debugLog) {
                    console.debug(text);
                }
                break;
            }
            case 'warn': {
                console.warn(text);
                break;
            }
            case 'error': {
                console.error(text);
                break;
            }
        }
    }
}

export interface MessengerOptions {
    /** Whether to log any debug-level messages to the console. */
    debugLog?: boolean;
}

/**
 * Create a CancellationToken that is linked to the given signal.
 *
 * @param signal An AbortSignal to create a CancellationToken for.
 * @returns A CancellationToken that is linked to the given signal.
 */
export function createCancellationToken(signal: AbortSignal): CancellationToken {
    return {
        get isCancellationRequested(): boolean {
            return signal.aborted;
        },

        onCancellationRequested: (callback: (reason: string) => void) => {
            const listener = () => callback(String(signal.reason));
            signal.addEventListener('abort', listener);
            return {
                dispose: () => signal.removeEventListener('abort', listener)
            };
        }
    };
}
