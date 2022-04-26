/******************************************************************************
 * Copyright 2022 TypeFox GmbH
 * This program and the accompanying materials are made available under the
 * terms of the MIT License, which is available in the project root.
 ******************************************************************************/

import { createMessage, isRequestMessage, isResponseMessage, JsonAny, MessageParticipant, MessengerAPI, NotificationHandler, NotificationType, RequestHandler, RequestType } from 'vscode-messenger-common';
import { acquireVsCodeApi, VsCodeApi } from './vscode-api';

export class Messenger implements MessengerAPI {

    private readonly handlerRegistry = new Map();
    private readonly requests = new Map();

    private readonly vscode: VsCodeApi;

    constructor(vscode?: VsCodeApi) {
        this.vscode = vscode ?? acquireVsCodeApi();
    }

    sendRequest<P extends JsonAny, R>(type: RequestType<P, R>, receiver: MessageParticipant, params: P): Promise<R> {
        const msgId = this.createMsgId();
        const result = new Promise<R>((resolve, reject) => {
            this.requests.set(msgId, { resolve, reject });
        });
        const msg = createMessage(msgId, type, receiver, params);
        this.vscode.postMessage(msg);
        return result;
    }

    sendNotification<P extends JsonAny>(type: NotificationType<P>, receiver: MessageParticipant, params: P): void {
        this.vscode.postMessage(createMessage(this.createMsgId(), type, receiver, params));
    }

    onRequest<P extends JsonAny, R>(type: RequestType<P, R>, handler: RequestHandler<P, R>): void {
        this.handlerRegistry.set(type.method, handler);
    }

    onNotification<P extends JsonAny>(type: NotificationType<P>, handler: NotificationHandler<P>): void {
        this.handlerRegistry.set(type.method, handler);
    }

    start(): Messenger {
        window.addEventListener('message', event => {
            const data = event.data;
            if (isResponseMessage(data)) {
                console.debug(`Response message: ${data.id} `);
                const request = this.requests.get(data.id);
                if (request) {
                    if (data.error) {
                        request.reject(data.error);
                    } else {
                        request.resolve(data.result);
                    }
                    this.requests.delete(data.id);
                } else {
                    console.warn(`Received response for untracked message id: ${data.id}. Receiver was: ${data.receiver?.webviewId ?? data.receiver?.webviewType}`);
                    return;
                }
            } else if (isRequestMessage(data)) {
                console.debug(`Request message: ${data.id} `);
                const handler = this.handlerRegistry.get(data.method);
                if (handler) {
                    handler(data.params);
                }
            }
        });
        return this;
    }

    private id = 0;

    protected createMsgId(): string {
        // messenger is created each time a view gets visible.
        const cryptoRand = window.crypto.getRandomValues(new Uint8Array(10));
        const rand = Array.from(cryptoRand).map(b => b.toString(16)).join('');
        return 'viewMsgId_' + this.id++ + '_' + rand;
    }

}
