/******************************************************************************
 * Copyright 2022 TypeFox GmbH
 * This program and the accompanying materials are made available under the
 * terms of the MIT License, which is available in the project root.
 ******************************************************************************/

import * as vscode from 'vscode';
import { createMessage, isNotificationMessage, isRequestMessage, isResponseMessage, JsonAny, MessageParticipant, MessengerAPI, NotificationHandler, NotificationType, RequestHandler, RequestType, ResponseMessage } from 'vscode-messenger-common';

export class Messenger implements MessengerAPI {

    protected readonly idProvider: IdProvider = new IdProvider();

    protected readonly viewTypeRegistry: Map<string, Set<vscode.WebviewView>> = new Map();

    // TODO use BiMap?
    protected readonly viewRegistry: Map<string, vscode.WebviewView> = new Map();
    protected readonly idRegistry: Map<vscode.WebviewView, string> = new Map();

    protected readonly requests = new Map();

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
            } else if (isNotificationMessage(msg)) {
                const handler = this.handlerRegistry.get(msg.method);
                if (handler) {
                    handler(msg.params, msg.sender);
                }
            } else if (isResponseMessage(msg)) {
                console.debug(`Response message: ${msg.id} `);
                const request = this.requests.get(msg.id);
                if (request) {
                    if (msg.error) {
                        request.reject(msg.error);
                    } else {
                        request.resolve(msg.result);
                    }
                    this.requests.delete(msg.id);
                } else {
                    console.warn(`Received response for untracked message id: ${msg.id}. Receiver was: ${msg.receiver?.webviewId ?? msg.receiver?.webviewType}`);
                    return;
                }
            } else {
                console.error(`Message type is not handled yet: ${msg}`);
            }
        });
    }

    protected readonly handlerRegistry = new Map();

    onRequest<P extends JsonAny, R>(type: RequestType<P, R>, handler: RequestHandler<P, R>): void {
        this.handlerRegistry.set(type.method, handler);
    }

    onNotification<P extends JsonAny>(type: NotificationType<P>, handler: NotificationHandler<P>): void {
        this.handlerRegistry.set(type.method, handler);
    }

    async sendRequest<P extends JsonAny, R>(type: RequestType<P, R>, receiver: MessageParticipant, params: P): Promise<R> {
        if (!receiver.webviewId && !receiver.webviewType) {
            throw new Error("A Request needs a receiver. Neither webviewId nor webviewType was set. If you don't have a receiver, use notification instead");
        }
        const msgId = this.createMsgId();
        const result = new Promise<R>((resolve, reject) => {
            this.requests.set(msgId, { resolve, reject });
        });
        const prepareMsg = createMessage(msgId, type, receiver, params);
        if (receiver.webviewId) {
            const receiverView = this.viewRegistry.get(receiver.webviewId);
            if (receiverView) {
                // Messages are only delivered if the webview is live (either visible or in the background with `retainContextWhenHidden`).
                const result = await receiverView.webview.postMessage(prepareMsg);
                if (!result) {
                    console.error(`Failed to send message to view with id: ${receiver.webviewId}`);
                }
            }
        } else if (receiver.webviewType) {
            // TODO what to do with a result if several views exists?
            this.viewTypeRegistry.get(receiver.webviewType)?.forEach(async (view) => {
                const result = await view.webview.postMessage(prepareMsg);
                if (!result) {
                    console.error(`Failed to send message to view with id: ${receiver.webviewId}`);
                }
            });
        }
        return result;
    }

    sendNotification<P extends JsonAny>(type: NotificationType<P>, receiver: MessageParticipant, params: P): void {
        const sender = async (view: vscode.WebviewView) => {
            const result = await view.webview.postMessage({
                method: type.method,
                receiver: receiver as JsonAny,
                params: params
            });
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

    protected createMsgId(): string {
        return 'msgId_' + this.id++;
    }

}

class IdProvider {

    counter = 0;

    getId(view: vscode.WebviewView): string {
        return view.viewType + '_' + this.counter++;
    }
}
