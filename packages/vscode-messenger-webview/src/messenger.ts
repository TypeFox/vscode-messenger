/******************************************************************************
 * Copyright 2022 TypeFox GmbH
 * This program and the accompanying materials are made available under the
 * terms of the MIT License, which is available in the project root.
 ******************************************************************************/

import type {
    CancellationToken, Disposable,
    JsonAny, Message, MessageParticipant, MessengerAPI,
    NotificationHandler, NotificationMessage, NotificationType,
    RequestHandler, RequestMessage, RequestType, ResponseError, ResponseMessage
} from 'vscode-messenger-common';
import {
    CancellationTokenImpl,
    Deferred,
    createCancelRequestMessage,
    isCancelRequestNotification,
    isMessage,
    isNotificationMessage, isRequestMessage, isResponseMessage, isWebviewIdMessageParticipant
} from 'vscode-messenger-common';
import type { VsCodeApi } from './vscode-api';
import { acquireVsCodeApi } from './vscode-api';

export class Messenger implements MessengerAPI {

    protected readonly handlerRegistry: Map<string, RequestHandler<unknown, unknown> | NotificationHandler<unknown>> = new Map();
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
     */
    onRequest<P, R>(type: RequestType<P, R>, handler: RequestHandler<P, R>): Disposable {
        this.handlerRegistry.set(type.method, handler as RequestHandler<unknown, unknown>);
        return {
            dispose: () => {
                this.unregisterHandler(type.method);
            }
        };
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
     */
    onNotification<P>(type: NotificationType<P>, handler: NotificationHandler<P>): Disposable {
        this.handlerRegistry.set(type.method, handler as NotificationHandler<unknown>);
        return {
            dispose: () => {
                this.unregisterHandler(type.method);
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
            const handler = this.handlerRegistry.get(msg.method);
            if (handler) {
                handler(msg.params, msg.sender!, new CancellationTokenImpl());
            } else if (msg.receiver.type !== 'broadcast') {
                this.log(`Received notification with unknown method: ${msg.method}`, 'warn');
            }
        }
    }

    protected async processRequestMessage(msg: RequestMessage) {
        this.log(`View received Request message: ${msg.method} (id ${msg.id})`);
        const handler = this.handlerRegistry.get(msg.method);
        if (handler) {
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
            this.log(`Received request with unknown method: ${msg.method}`, 'warn');
            const response: ResponseMessage = {
                id: msg.id,
                receiver: msg.sender!,
                error: {
                    message: `Unknown method: ${msg.method}`
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

function participantToString(participant: MessageParticipant): string {
    switch (participant.type) {
        case 'extension':
            return 'host extension';
        case 'webview': {
            if (isWebviewIdMessageParticipant(participant)) {
                return participant.webviewId;
            } else if (participant.webviewType) {
                return participant.webviewType;
            } else {
                return 'unspecified webview';
            }
        }
        case 'broadcast':
            return 'broadcast';
    }
}
