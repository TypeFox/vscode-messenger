/******************************************************************************
 * Copyright 2022 TypeFox GmbH
 * This program and the accompanying materials are made available under the
 * terms of the MIT License, which is available in the project root.
 ******************************************************************************/

import * as vscode from 'vscode';
import { MessageParticipant, MessengerAPI, NotificationHandler, NotificationType, RequestHandler, RequestType } from 'vscode-messenger-common';

export class Messenger implements MessengerAPI {

    registerWebviewPanel(panel: vscode.WebviewPanel): void {
        // TODO
    }

    registerWebviewView(view: vscode.WebviewView): void {
        // TODO
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

}
