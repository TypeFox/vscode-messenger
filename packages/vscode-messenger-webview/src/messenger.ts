/******************************************************************************
 * Copyright 2022 TypeFox GmbH
 * This program and the accompanying materials are made available under the
 * terms of the MIT License, which is available in the project root.
 ******************************************************************************/

import { MessageParticipant, MessengerAPI, NotificationHandler, NotificationType, RequestHandler, RequestType } from 'vscode-messenger-common';
import { acquireVsCodeApi, VsCodeApi } from './vscode-api';

export class Messenger implements MessengerAPI {

    protected readonly vscode: VsCodeApi;

    constructor(vscode?: VsCodeApi) {
        this.vscode = vscode ?? acquireVsCodeApi();
    }

    sendRequest<P, R>(type: RequestType<P, R>, receiver: MessageParticipant, params: P): Promise<R> {
        // TODO
        throw new Error('Method not implemented.');
    }

    onRequest<P, R>(type: RequestType<P, R>, handler: RequestHandler<P, R>): void {
        // TODO
    }

    sendNotification<P>(type: NotificationType<P>, receiver: MessageParticipant, params: P): void {
        // TODO
    }

    onNotification<P>(type: NotificationType<P>, handler: NotificationHandler<P>): void {
        // TODO
    }

    start(): void {
        window.addEventListener('message', event => {
            // TODO: const message = event.data;
        });
    }

}
