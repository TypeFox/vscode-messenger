/******************************************************************************
 * Copyright 2022 TypeFox GmbH
 * This program and the accompanying materials are made available under the
 * terms of the MIT License, which is available in the project root.
 ******************************************************************************/

import { createMessage, isRequestMessage, isResponseMessage, MessageParticipant, MessengerAPI, NotificationHandler, NotificationType, RequestHandler, RequestType } from 'vscode-messenger-common';
import { acquireVsCodeApi, VsCodeApi } from './vscode-api';

export class Messenger implements MessengerAPI {

    private readonly handlerRegistry = new Map();
    private readonly requests = new Map();

    private readonly vscode: VsCodeApi;

    constructor(vscode?: VsCodeApi) {
        this.vscode = vscode ?? acquireVsCodeApi();
    }

    sendRequest<P, R>(type: RequestType<P, R>, receiver: MessageParticipant, params: P): Promise<R> {
        const msgId = this.createMsgId();
        const result = new Promise<R>((resolve, reject) => {
            this.requests.set(msgId, { resolve, reject });
        });
        const msg = createMessage(msgId, type, receiver, params);
        this.vscode.postMessage(msg);
        return result;
    }

    sendNotification<P>(type: NotificationType<P>, receiver: MessageParticipant, params: P): void {
        this.vscode.postMessage(createMessage(this.createMsgId(), type, receiver, params));
    }

    onRequest<P, R>(type: RequestType<P, R>, handler: RequestHandler<P, R>): void {
        this.handlerRegistry.set(type.method, handler);
    }

    onNotification<P>(type: NotificationType<P>, handler: NotificationHandler<P>): void {
        this.handlerRegistry.set(type.method, handler);
    }

    start(): void {
        window.addEventListener('message', event => {
            const data = event.data;
            if(isResponseMessage(data)) {
                console.log(`Response message: ${data.id} `);
                const request = this.requests.get(data.id);
                if(data.error) {
                    request.reject(data.error);
                } else {
                    request.resolve(data.result);
                }
                this.requests.delete(data.id);
            } else if(isRequestMessage(data)) {
                console.log(`Request message: ${data.id} `);
                const handler = this.handlerRegistry.get(data.method);
                if(handler) {
                    const parameter = data.params;
                    // TODO check this and handle other cases
                    if (typeof parameter === 'string' || parameter instanceof String) {
                        handler(JSON.parse(data.params as string));
                    } else {
                        handler(data.params);
                    }
                }
            }
        });
    }

    private id = 0;

    private createMsgId(): string {
        // messenger is created each time a view gets visible.
        // TODO Use uuid library
        const uuid = Date.now().toString(36) + Math.random().toString(36).substr(2);
        return 'viewMsgId_' + this.id++ + '_' + uuid;
    }

}
