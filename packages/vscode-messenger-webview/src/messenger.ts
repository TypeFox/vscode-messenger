/******************************************************************************
 * Copyright 2022 TypeFox GmbH
 * This program and the accompanying materials are made available under the
 * terms of the MIT License, which is available in the project root.
 ******************************************************************************/

import {
    CancellationTokenImpl,
    DeferredRequest,
    JsonAny, Message, MessageParticipant, MessengerAPI,
    NotificationHandler, NotificationMessage, NotificationType,
    RequestHandler, RequestMessage, RequestType, ResponseError, ResponseMessage,
    createCancelRequestMessage,
    isCancelRequestNotification,
    isMessage,
    isNotificationMessage, isRequestMessage, isResponseMessage, isWebviewIdMessageParticipant
} from 'vscode-messenger-common';
import { VsCodeApi, acquireVsCodeApi } from './vscode-api';

export class Messenger implements MessengerAPI {

    protected readonly handlerRegistry: Map<string, RequestHandler<unknown, unknown> | NotificationHandler<unknown>> = new Map();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    protected readonly requests: Map<string, DeferredRequest<any>> = new Map();
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

    onRequest<P, R>(type: RequestType<P, R>, handler: RequestHandler<P, R>): Messenger {
        this.handlerRegistry.set(type.method, handler as RequestHandler<unknown, unknown>);
        return this;
    }

    onNotification<P>(type: NotificationType<P>, handler: NotificationHandler<P>): Messenger {
        this.handlerRegistry.set(type.method, handler as NotificationHandler<unknown>);
        return this;
    }

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

    protected async processMessage(msg: Message): Promise<void> {
        if (msg.receiver.type === 'extension') {
            // Ignore the message if it's not directed to us
            return;
        }
        if (isRequestMessage(msg)) {
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
                    if (cancelable.isCanceled) {
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
        } else if (isNotificationMessage(msg)) {
            this.log(`View received Notification message: ${msg.method}`);
            if (isCancelRequestNotification(msg)) {
                const cancelable = this.pendingHandlers.get(msg.params);
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
        } else if (isResponseMessage(msg)) {
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
        } else {
            this.log(`Invalid message: ${JSON.stringify(msg)}`, 'error');
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

    sendRequest<P, R>(type: RequestType<P, R>, receiver: MessageParticipant, params?: P, cancelable?: CancellationTokenImpl): Promise<R> {
        if (receiver.type === 'broadcast') {
            throw new Error('Only notification messages are allowed for broadcast.');
        }

        const msgId = this.createMsgId();
        const pending = new DeferredRequest<R>();
        this.requests.set(msgId, pending);
        if (cancelable) {
            cancelable.onCancel = (reason) => {
                // Send cancel message for pending request
                this.vscode.postMessage(createCancelRequestMessage(receiver, msgId));
                pending.reject(new Error(reason));
                this.requests.delete(msgId);
            };
            pending.result.finally(() => {
                // Request finished, nothing to do on cancel.
                cancelable.onCancel = undefined;
            }).catch((err) =>
                this.log(`Pending request rejected: ${String(err)}`, 'warn')
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
