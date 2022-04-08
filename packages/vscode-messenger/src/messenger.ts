/******************************************************************************
 * Copyright 2022 TypeFox GmbH
 * This program and the accompanying materials are made available under the
 * terms of the MIT License, which is available in the project root.
 ******************************************************************************/

import * as vscode from 'vscode';
import { createMessage, isRequestMessage, MessageParticipant, MessengerAPI, NotificationHandler, NotificationType, RequestHandler, RequestType, ResponseMessage } from 'vscode-messenger-common';

export class Messenger implements MessengerAPI {

    readonly idProvider: IdProvider = new IdProvider();

    readonly viewTypeRegistry: Map<string, Set<vscode.WebviewView>> = new Map();

    // TODO use BiMap?
    readonly viewRegistry: Map<string, vscode.WebviewView> = new Map();
    readonly idRegistry: Map<vscode.WebviewView, string> = new Map();

    readonly requests = new Map();

    registerWebviewPanel(panel: vscode.WebviewPanel): void {
        // TODO
        throw new Error(`registerWebviewPanel is not supported yet. ViewPanel: ${panel.title} type: ${panel.viewType}`);
    }

    registerWebviewView(view: vscode.WebviewView): void {
        view.onDidDispose(() => {
            const storedId = this.idRegistry.get(view);
            if (storedId) {
                this.viewRegistry.delete(storedId);
                this.idRegistry.delete(view);
            }
            const removed = this.viewTypeRegistry.get(view.viewType)?.delete(view);
            if (!removed) {
                console.warn(`Attempt to remove not existing registry entry for View: ${view.title} type ${view.viewType} `);
            }
        });

        // Register typed view
        const viewTypeEntry = this.viewTypeRegistry.get(view.viewType);
        if (viewTypeEntry) {
            viewTypeEntry.add(view);
        } else {
            this.viewTypeRegistry.set(view.viewType, new Set<vscode.WebviewView>([view]));
        }

        // Add viewId mapping
        const viewId: string = this.idProvider.getId(view);
        this.viewRegistry.set(viewId, view);
        this.idRegistry.set(view, viewId);

        view.webview.onDidReceiveMessage((msg) => {
            if (isRequestMessage(msg)) {
                const handler = this.handlerRegistry.get(msg.method);
                if (handler) {
                    const result = handler(msg.params, msg.sender);
                    const response: ResponseMessage = { id: msg.id, receiver: msg.sender ?? {}, result };
                    view.webview.postMessage(response);
                }
            } else {
                // TODO handle response
                console.error(`Message type is not handled yet: ${msg}`);
            }
        });
    }

    readonly handlerRegistry = new Map();

    onRequest<P, R>(type: RequestType<P, R>, handler: RequestHandler<P, R>): void {
        this.handlerRegistry.set(type.method, handler);
    }

    onNotification<P>(type: NotificationType<P>, handler: NotificationHandler<P>): void {
        this.handlerRegistry.set(type.method, handler);
    }

    async sendRequest<P, R>(type: RequestType<P, R>, receiver: MessageParticipant, params: P): Promise<R> {
        if (!receiver.webviewId && !receiver.webviewType) {
            throw new Error("A Request needs a receiver. Neither webviewId nor webviewType was set. If you don't have a receiver, use notification instead");
        }
        const msgId = this.createMsgId();
        const result = new Promise<R>((resolve, reject) => {
            this.requests.set(msgId, { resolve, reject });
        });
        this.requests.set(msgId, result);
        if (receiver.webviewId) {
            const receiverView = this.viewRegistry.get(receiver.webviewId);
            if (receiverView) {
                // Messages are only delivered if the webview is live (either visible or in the background with `retainContextWhenHidden`).
                const result = await receiverView.webview.postMessage(createMessage(msgId, type, receiver, params));
                if (!result) {
                    console.error(`Failed to send message to view with id: ${receiver.webviewId}`);
                }
            }
        } else if (receiver.webviewType) {
            // TODO what to do with a result if several views exists?
            this.viewTypeRegistry.get(receiver.webviewType)?.forEach(async (view) => {
                const result = await view.webview.postMessage(createMessage(msgId, type, receiver, params));
                if (!result) {
                    console.error(`Failed to send message to view with id: ${receiver.webviewId}`);
                }
            });
        }
        return result;
    }

    sendNotification<P>(type: NotificationType<P>, receiver: MessageParticipant, params: P): void {
        const msgId = this.createMsgId();
        const sender = async (view: vscode.WebviewView) => {
            const result = await view.webview.postMessage(createMessage(msgId, type, receiver, params));
            if (!result) {
                console.error(`Failed to send message to view with id: ${receiver.webviewId}`);
            }
        };
        if (receiver.webviewId || receiver.webviewType) {
            if (receiver.webviewId) {
                const receiverView = this.viewRegistry.get(receiver.webviewId);
                if (receiverView) {
                    sender(receiverView);
                }
            } else if (receiver.webviewType) {
                this.viewTypeRegistry.get(receiver.webviewType)?.forEach(sender);
            }
        } else {
            // broadcast
            this.viewRegistry.forEach(sender);
        }
    }

    private id = 0;

    private createMsgId(): string {
        return 'msgId_' + this.id++;
    }

}

class IdProvider {

    counter = 0;

    getId(view: vscode.WebviewView): string {
        return view.viewType + '_' + this.counter++;
    }
}
