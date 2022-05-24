/******************************************************************************
 * Copyright 2022 TypeFox GmbH
 * This program and the accompanying materials are made available under the
 * terms of the MIT License, which is available in the project root.
 ******************************************************************************/

import {
    isMessage,
    isNotificationMessage, isRequestMessage, isResponseMessage, JsonAny, Message, MessageParticipant, MessengerAPI,
    NotificationHandler, NotificationMessage, NotificationType, RequestHandler, RequestMessage, RequestType, ResponseError, ResponseMessage
} from 'vscode-messenger-common';
import { acquireVsCodeApi, VsCodeApi } from './vscode-api';

export class Messenger implements MessengerAPI {

    protected readonly handlerRegistry: Map<string, RequestHandler<unknown, unknown> | NotificationHandler<unknown>> = new Map();
    protected readonly requests: Map<string, RequestData> = new Map();

    protected readonly vscode: VsCodeApi;

    protected readonly options: MessengerOptions;

    constructor(vscode?: VsCodeApi, options?: MessengerOptions) {
        this.vscode = vscode ?? acquireVsCodeApi();
        const defaultOptions: MessengerOptions = {
            debugLog: false
        };
        this.options = { ...defaultOptions, ...options };
    }

    onRequest<P extends JsonAny, R>(type: RequestType<P, R>, handler: RequestHandler<P, R>): void {
        this.handlerRegistry.set(type.method, handler as RequestHandler<unknown, unknown>);
    }

    onNotification<P extends JsonAny>(type: NotificationType<P>, handler: NotificationHandler<P>): void {
        this.handlerRegistry.set(type.method, handler as NotificationHandler<unknown>);
    }

    start(): Messenger {
        window.addEventListener('message', (event: { data: unknown }) => {
            if (isMessage(event.data)) {
                this.processMessage(event.data)
                    .catch(err => this.log(String(err), 'error'));
            }
        });
        return this;
    }

    protected async processMessage(msg: Message): Promise<void> {
        if (isRequestMessage(msg)) {
            this.log(`View received Request message: ${msg.method} (id ${msg.id})`);
            const handler = this.handlerRegistry.get(msg.method);
            if (handler) {
                try {
                    const result = await handler(msg.params, msg.sender!);
                    const response: ResponseMessage = {
                        id: msg.id,
                        receiver: msg.sender!,
                        result: result as JsonAny
                    };
                    this.vscode.postMessage(response);
                } catch (error) {
                    const response: ResponseMessage = {
                        id: msg.id,
                        receiver: msg.sender!,
                        error: this.createResponseError(error)
                    };
                    this.vscode.postMessage(response);
                }
            } else {
                this.log(`Received request with unknown method: ${msg.method}`);
            }
        } else if (isNotificationMessage(msg)) {
            this.log(`View received Notification message: ${msg.method}`);
            const handler = this.handlerRegistry.get(msg.method);
            if (handler) {
                handler(msg.params, msg.sender!);
            } else {
                this.log(`Received notification with unknown method: ${msg.method}`);
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
                this.log(`Received response for untracked message id: ${msg.id} (participant: ${participantToString(msg.sender!)})`, 'warn');
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

    sendRequest<P extends JsonAny, R>(type: RequestType<P, R>, receiver: MessageParticipant, params: P): Promise<R> {
        const msgId = this.createMsgId();
        const result = new Promise<R>((resolve, reject) => {
            this.requests.set(msgId, { resolve: resolve as (value: unknown) => void, reject });
        });
        const message: RequestMessage = {
            id: msgId,
            method: type.method,
            receiver,
            params
        };
        this.vscode.postMessage(message);
        return result;
    }

    sendNotification<P extends JsonAny>(type: NotificationType<P>, receiver: MessageParticipant, params: P): void {
        const message: NotificationMessage = {
            method: type.method,
            receiver,
            params
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

export interface RequestData {
    resolve: (value: unknown) => void,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    reject: (reason?: any) => void
}

function participantToString(participant: MessageParticipant): string {
    if (participant.webviewId) {
        return participant.webviewId;
    } else if (participant.webviewType) {
        return participant.webviewType;
    } else {
        return 'host extension';
    }
}
