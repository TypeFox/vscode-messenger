/******************************************************************************
 * Copyright 2022 TypeFox GmbH
 * This program and the accompanying materials are made available under the
 * terms of the MIT License, which is available in the project root.
 ******************************************************************************/

import * as vscode from 'vscode';
import {
    CancellationTokenImpl,
    createCancelRequestMessage,
    equalParticipants, HOST_EXTENSION, isCancelRequestNotification, isMessage, isNotificationMessage, isRequestMessage, isResponseMessage,
    isWebviewIdMessageParticipant, JsonAny, Message, MessageParticipant, MessengerAPI, NotificationHandler,
    NotificationMessage, NotificationType, Deferred, RequestHandler, RequestMessage, RequestType, ResponseError,
    ResponseMessage, WebviewIdMessageParticipant
} from 'vscode-messenger-common';
import { DiagnosticOptions, MessengerDiagnostic, MessengerEvent } from './diagnostic-api';

export class Messenger implements MessengerAPI {

    protected readonly idProvider: IdProvider = new IdProvider();

    protected readonly viewTypeRegistry: Map<string, Set<ViewContainer>> = new Map();

    protected readonly viewRegistry: Map<string, ViewData> = new Map();

    protected readonly handlerRegistry: Map<string, HandlerRegistration[]> = new Map();

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    protected readonly requests: Map<string, Deferred<any>> = new Map();
    protected readonly pendingHandlers: Map<string, CancellationTokenImpl> = new Map();

    protected readonly eventListeners: Map<(event: MessengerEvent) => void, DiagnosticOptions | undefined> = new Map();

    protected readonly options: MessengerOptions;

    constructor(options?: MessengerOptions) {
        const defaultOptions: MessengerOptions = {
            ignoreHiddenViews: true,
            debugLog: false
        };
        this.options = { ...defaultOptions, ...options };
    }

    registerWebviewPanel(panel: vscode.WebviewPanel, options: ViewOptions = {}): WebviewIdMessageParticipant {
        return this.registerViewContainer(panel, options);
    }

    registerWebviewView(view: vscode.WebviewView, options: ViewOptions = {}): WebviewIdMessageParticipant {
        return this.registerViewContainer(view, options);
    }

    protected registerViewContainer(view: ViewContainer, options: ViewOptions): WebviewIdMessageParticipant {
        // Register typed view
        const viewTypeEntry = this.viewTypeRegistry.get(view.viewType);
        if (viewTypeEntry) {
            viewTypeEntry.add(view);
        } else {
            this.viewTypeRegistry.set(view.viewType, new Set<ViewContainer>([view]));
        }

        // Add viewId mapping
        const viewEntry = {
            id: this.idProvider.getWebviewId(view),
            container: view,
            options,
        };
        this.viewRegistry.set(viewEntry.id, viewEntry);

        // Preserve view data (view.viewType), because after a view is disposed it's data can not be accessed.
        const viewType = view.viewType;
        view.onDidDispose(() => {
            this.viewRegistry.delete(viewEntry.id);
            const removed = this.viewTypeRegistry.get(viewType)?.delete(view);
            if (!removed) {
                this.log(`Attempt to remove non-existing registry entry for View: ${viewEntry.id} (type ${viewType})`, 'warn');
            }
        });

        view.webview.onDidReceiveMessage(async (msg: unknown) => {
            if (isMessage(msg)) {
                if (!msg.sender) {
                    msg.sender = {
                        type: 'webview',
                        webviewId: viewEntry.id,
                        webviewType: view.viewType
                    };
                }
                return this.processMessage(msg, res => {
                    this.notifyEventListeners(res);
                    return view.webview.postMessage(res);
                }).catch(err => this.log(String(err), 'error'));
            }
        });

        return {
            type: 'webview',
            webviewId: viewEntry.id
        };
    }

    /**
     * Process an incoming message by forwarding it to the respective receiver or handling it with
     * a locally registered message handler.
     */
    protected async processMessage(msg: Message, responseCallback: (res: Message) => Thenable<boolean>): Promise<void> {
        this.notifyEventListeners(msg);
        if (msg.receiver.type === 'extension') {
            // The message is directed to this host extension
            if (isRequestMessage(msg)) {
                await this.processRequestMessage(msg, responseCallback);
            } else if (isNotificationMessage(msg)) {
                await this.processNotificationMessage(msg);
            } else if (isResponseMessage(msg)) {
                await this.processResponseMessage(msg);
            } else {
                this.log(`Invalid message: ${JSON.stringify(msg)}`, 'error');
            }
        } else if (msg.receiver.type === 'webview') {
            if (isWebviewIdMessageParticipant(msg.receiver)) {
                // The message is directed to a specific webview
                const receiverView = this.viewRegistry.get(msg.receiver.webviewId);
                if (receiverView) {
                    const result = await receiverView.container.webview.postMessage(msg);
                    if (!result) {
                        this.log(`Failed to forward message to view: ${msg.receiver.webviewId}`, 'error');
                    }
                } else {
                    this.log(`No webview with id ${msg.receiver.webviewId} is registered.`, 'warn');
                }
            } else if (msg.receiver.webviewType) {
                // The message is directed to all webviews of a specific type
                const webViewType = msg.receiver.webviewType;
                const receiverViews = this.viewTypeRegistry.get(webViewType);
                if (receiverViews) {
                    receiverViews.forEach(async view => {
                        const result = await view.webview.postMessage(msg);
                        if (!result) {
                            this.log(`Failed to forward message to view: ${webViewType}`, 'error');
                        }
                    });
                } else {
                    this.log(`No webview with type ${webViewType} is registered.`, 'warn');
                }
            } else {
                this.log(`A receiver of type 'webview' must specify a 'webviewId' or a 'webviewType': ${JSON.stringify(msg)}`, 'error');
            }
        } else if (msg.receiver.type === 'broadcast') {
            if (isNotificationMessage(msg)) {
                // The notification is broadcasted to all enabled webviews and to this extension
                for (const view of this.viewRegistry.values()) {
                    if (view.options.broadcastMethods && view.options.broadcastMethods.indexOf(msg.method) >= 0) {
                        view.container.webview.postMessage(msg);
                    }
                }
                await this.processNotificationMessage(msg);
            } else {
                this.log(`Only notification messages are allowed for broadcast: ${JSON.stringify(msg)}`, 'error');
            }
        }
    }

    /**
     * Process an incoming request message with a registered handler.
     */
    protected async processRequestMessage(msg: RequestMessage, responseCallback: (res: Message) => Thenable<boolean>): Promise<void> {
        this.log(`Host received Request message: ${msg.method} (id ${msg.id})`);
        const regs = this.handlerRegistry.get(msg.method);
        if (!regs) {
            this.log(`Received request with unknown method: ${msg.method}`, 'warn');
            return this.sendErrorResponse(`Unknown method: ${msg.method}`, msg, responseCallback);
        }

        const filtered = regs.filter(reg => !reg.sender || equalParticipants(reg.sender, msg.sender!));
        if (filtered.length === 0) {
            this.log(`No request handler for ${msg.method} matching sender: ${participantToString(msg.sender)}`, 'warn');
            return this.sendErrorResponse('No matching request handler', msg, responseCallback);
        }
        if (filtered.length > 1) {
            this.log(`Multiple request handlers for ${msg.method} matching sender: ${participantToString(msg.sender)}`, 'warn');
            return this.sendErrorResponse('Multiple matching request handlers', msg, responseCallback);
        }

        const cancelable = new CancellationTokenImpl();
        try {
            this.pendingHandlers.set(msg.id, cancelable);
            const result = await filtered[0].handler(msg.params, msg.sender!, cancelable);
            const response: ResponseMessage = {
                id: msg.id,
                sender: HOST_EXTENSION,
                receiver: msg.sender!,
                result: result as JsonAny
            };
            const posted = await responseCallback(response);
            if (!posted) {
                this.log(`Failed to send result message: ${participantToString(response.receiver)}`, 'error');
            }
        } catch (error) {
            if (cancelable?.isCancellationRequested) {
                // Don't report the error if request was canceled.
                return;
            }
            this.sendErrorResponse(this.createResponseError(error), msg, responseCallback);
        } finally {
            this.pendingHandlers.delete(msg.id);
        }
    }

    protected async sendErrorResponse(error: ResponseError | string, msg: RequestMessage, responseCallback: (res: Message) => Thenable<boolean>): Promise<void> {
        const response: ResponseMessage = {
            id: msg.id,
            sender: HOST_EXTENSION,
            receiver: msg.sender!,
            error: typeof error === 'string' ? { message: error } : error
        };
        const posted = await responseCallback(response);
        if (!posted) {
            this.log(`Failed to send error message: ${participantToString(response.receiver)}`, 'error');
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
     * Process an incoming notification message with a registered handler.
     */
    protected async processNotificationMessage(msg: NotificationMessage): Promise<void> {
        this.log(`Host received Notification message: ${msg.method}`);
        if (isCancelRequestNotification(msg)) {
            const cancelable = this.pendingHandlers.get(msg.params.msgId);
            if (cancelable) {
                cancelable.cancel(`Request ${msg.params} was canceled by the sender.`);
            } else {
                this.log(`Received cancel notification for missing cancelable. ${msg.params}`);
            }
        } else {
            const regs = this.handlerRegistry.get(msg.method);
            if (regs) {
                const filtered = regs.filter(reg => !reg.sender || equalParticipants(reg.sender, msg.sender!));
                if (filtered.length > 0) {
                    // TODO No need to cancel a notification
                    await Promise.all(filtered.map(reg => reg.handler(msg.params, msg.sender!, new CancellationTokenImpl())));
                }
            } else if (msg.receiver.type !== 'broadcast') {
                this.log(`Received notification with unknown method: ${msg.method}`, 'warn');
            }
        }

    }

    /**
     * Process an incoming response message by resolving or rejecting the associated promise.
     */
    protected async processResponseMessage(msg: ResponseMessage): Promise<void> {
        this.log(`Host received Response message: ${msg.id} `);
        const request = this.requests.get(msg.id);
        if (request) {
            if (msg.error) {
                request.reject(msg.error);
            } else {
                request.resolve(msg.result);
            }
            this.requests.delete(msg.id);
        } else {
            this.log(`Received response for untracked message id: ${msg.id} (participant: ${participantToString(msg.sender)})`, 'warn');
        }
    }

    onRequest<P, R>(type: RequestType<P, R>, handler: RequestHandler<P, R>, options: { sender?: MessageParticipant } = {}): vscode.Disposable {
        return this.registerHandler(type, handler, options);
    }

    onNotification<P>(type: NotificationType<P>, handler: NotificationHandler<P>, options: { sender?: MessageParticipant } = {}): vscode.Disposable {
        return this.registerHandler(type, handler, options);
    }

    protected registerHandler(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        type: RequestType<any, any> | NotificationType<any>,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        handler: RequestHandler<any, any> | NotificationHandler<any>,
        options: { sender?: MessageParticipant }
    ): vscode.Disposable {
        let handlers = this.handlerRegistry.get(type.method);
        if (handlers && this.options.uniqueHandlers) {
            throw new Error(`A message handler is already registered for method ${type.method}.`);
        }
        if (!handlers) {
            handlers = [];
            this.handlerRegistry.set(type.method, handlers);
        }
        const registration: HandlerRegistration = { handler, sender: options.sender };
        handlers.push(registration);

        // Create a disposable that removes the message handler from the registry
        return {
            dispose: () => {
                const handlers = this.handlerRegistry.get(type.method);
                if (handlers) {
                    const index = handlers.indexOf(registration);
                    if (index >= 0) {
                        handlers.splice(index, 1);
                        if (handlers.length === 0) {
                            this.handlerRegistry.delete(type.method);
                        }
                    }
                }
            }
        };
    }

    async sendRequest<P, R>(type: RequestType<P, R>, receiver: MessageParticipant, params?: P, cancelable?: CancellationTokenImpl): Promise<R> {
        if (receiver.type === 'extension') {
            throw new Error('Requests to other extensions are not supported yet.');
        } else if (receiver.type === 'broadcast') {
            throw new Error('Only notification messages are allowed for broadcast.');
        } else if (receiver.type === 'webview') {
            if (isWebviewIdMessageParticipant(receiver)) {
                const receiverView = this.viewRegistry.get(receiver.webviewId);
                if (receiverView) {
                    return this.sendRequestToWebview(type, receiver, params, receiverView.container, cancelable);
                } else {
                    return Promise.reject(new Error(`No webview with id ${receiver.webviewId} is registered.`));
                }
            } else if (receiver.webviewType) {
                const receiverViews = this.viewTypeRegistry.get(receiver.webviewType);
                if (receiverViews) {
                    // If there are multiple views, we make a race: the first view to return a result wins
                    const results = Array.from(receiverViews).map(view => this.sendRequestToWebview(type, receiver, params, view, cancelable));
                    return Promise.race(results);
                } else {
                    return Promise.reject(new Error(`No webview with type ${receiver.webviewType} is registered.`));
                }
            } else {
                throw new Error('Unspecified webview receiver: neither webviewId nor webviewType was set.');
            }
        }
        throw new Error(`Invalid receiver: ${JSON.stringify(receiver)}`);
    }

    protected async sendRequestToWebview<P, R>(type: RequestType<P, R>, receiver: MessageParticipant, params: P, view: ViewContainer, cancelable?: CancellationTokenImpl): Promise<R> {
        // Messages are only delivered if the webview is live (either visible or in the background with `retainContextWhenHidden`).
        if (!view.visible && this.options.ignoreHiddenViews) {
            return Promise.reject(new Error(`Skipped request for hidden view: ${participantToString(receiver)}`));
        }

        const msgId = this.createMsgId();
        const pendingRequest = new Deferred<R>();
        this.requests.set(msgId, pendingRequest);
        if (cancelable) {
            const listener = cancelable.onCancellationRequested((reason) => {
                // Send cancel message for pending request
                view.webview.postMessage(createCancelRequestMessage(receiver, { msgId }));
                pendingRequest.reject(new Error(reason));
                this.requests.delete(msgId);
            });
            pendingRequest.result.finally(() => {
                // Request finished, remove listener
                listener.dispose();
            }).catch((err) =>
                this.log(`Pending request rejected: ${String(err)}`)
            );
        }
        const message: RequestMessage = {
            id: msgId,
            method: type.method,
            sender: HOST_EXTENSION,
            receiver,
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            params: params as any
        };
        this.notifyEventListeners(message);
        const posted = await view.webview.postMessage(message);
        if (!posted) {
            this.log(`Failed to send message to view: ${participantToString(receiver)}`, 'error');
            this.requests.get(msgId)?.reject(new Error(`Failed to send message to view: ${participantToString(receiver)}`));
            this.requests.delete(msgId);
        }
        return pendingRequest.result;
    }

    sendNotification<P>(type: NotificationType<P>, receiver: MessageParticipant, params?: P): void {
        if (receiver.type === 'extension') {
            throw new Error('Notifications to other extensions are not supported yet.');
        } else if (receiver.type === 'webview') {
            if (isWebviewIdMessageParticipant(receiver)) {
                const receiverView = this.viewRegistry.get(receiver.webviewId);
                if (receiverView) {
                    this.sendNotificationToWebview(type, receiver, params, receiverView.container)
                        .catch(err => this.log(String(err), 'error'));
                } else {
                    this.log(`No webview with id ${receiver.webviewId} is registered.`, 'warn');
                }
            } else if (receiver.webviewType) {
                const receiverViews = this.viewTypeRegistry.get(receiver.webviewType);
                if (receiverViews) {
                    receiverViews.forEach(view => {
                        this.sendNotificationToWebview(type, receiver, params, view)
                            .catch(err => this.log(String(err), 'error'));
                    });
                } else {
                    this.log(`No webview with type ${receiver.webviewType} is registered.`, 'warn');
                }
            } else {
                throw new Error('Unspecified webview receiver: neither webviewId nor webviewType was set.');
            }
        } else if (receiver.type === 'broadcast') {
            for (const view of this.viewRegistry.values()) {
                if (view.options.broadcastMethods && view.options.broadcastMethods.indexOf(type.method) >= 0) {
                    this.sendNotificationToWebview(type, receiver, params, view.container)
                        .catch(err => this.log(String(err), 'error'));
                }
            }
        }
    }

    protected async sendNotificationToWebview<P>(type: NotificationType<P>, receiver: MessageParticipant, params: P | undefined, view: ViewContainer): Promise<void> {
        if (!view.visible && this.options.ignoreHiddenViews) {
            this.log(`Skipped notification for hidden view: ${participantToString(receiver)}`, 'debug');
            return;
        }

        const message: NotificationMessage = {
            method: type.method,
            sender: HOST_EXTENSION,
            receiver,
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            params: params as any
        };
        this.notifyEventListeners(message);
        const result = await view.webview.postMessage(message);
        if (!result) {
            this.log(`Failed to send message to view: ${participantToString(receiver)}`, 'error');
        }
    }

    protected async notifyEventListeners(msg: Message): Promise<void> {
        if (this.eventListeners.size > 0) {
            const event: MessengerEvent = {
                type: 'unknown',
                sender: participantToString(msg.sender),
                receiver: participantToString(msg.receiver),
                size: 0,
                timestamp: Date.now()
            };
            if (isRequestMessage(msg)) {
                event.type = 'request';
                event.id = msg.id;
                event.method = msg.method;
                event.parameter = msg.params;
                event.size = JSON.stringify(msg.params)?.length ?? 0;
            } else if (isNotificationMessage(msg)) {
                event.type = 'notification';
                event.method = msg.method;
                event.parameter = msg.params;
                event.size = JSON.stringify(msg.params)?.length ?? 0;
            } else if (isResponseMessage(msg)) {
                event.type = 'response';
                event.id = msg.id;
                event.size = JSON.stringify(msg.result)?.length ?? 0;
                event.parameter = msg.result;
                if (msg.error) {
                    event.error = msg.error?.message ? msg.error?.message : 'No error message provided';
                    if (msg.error.data) {
                        event.size += JSON.stringify(msg.error.data)?.length ?? 0;
                    }
                }
            } else {
                event.error = `Unknown message to ${msg.receiver}`;
            }
            this.eventListeners.forEach((options, listener) => {
                if (isResponseMessage(msg)) {
                    if (!options?.withResponseData) {
                        // Clear response value if user don't want to expose it
                        event.parameter = undefined;
                    }
                } else if (!options?.withParameterData) {
                    // Clear parameter if user don't want to expose it
                    event.parameter = undefined;
                }
                listener(event);
            });
        }
        return Promise.resolve();
    }

    /**
     *  Exposes diagnostic api to be used by message interaction tracking tools.
     *  True if payload data (parameter, response value) should be added to diagnostic API
     * @param options Configurations to control the behavior of diagnostic message provider.
     */
    diagnosticApi(options?: DiagnosticOptions): MessengerDiagnostic {
        return {
            extensionInfo: () => {
                return {
                    diagnosticListeners: this.eventListeners.size,
                    pendingRequest: this.requests.size + this.pendingHandlers.size,
                    handlers:
                        Array.from(this.handlerRegistry.entries()).map(
                            entry => { return { method: entry[0], count: entry[1].length }; }),
                    webviews:
                        Array.from(this.viewRegistry.entries()).map(
                            entry => { return { id: entry[0], type: entry[1].container.viewType }; })
                };
            },
            addEventListener: (listener) => {
                this.eventListeners.set(listener, options);
                return {
                    dispose: () => this.eventListeners.delete(listener)
                };
            },
            removeEventListener: (listener) => this.eventListeners.delete(listener)
        };
    }

    private nextMsgId = 0;

    protected createMsgId(): string {
        return 'req_' + this.nextMsgId++;
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

export type ViewContainer = vscode.WebviewPanel | vscode.WebviewView

export interface MessengerOptions {
    /** A message is ignored if the receiver is a webview that is currently hidden (not visible). */
    ignoreHiddenViews?: boolean;
    /** Enforces message handlers to be unique for each message type. */
    uniqueHandlers?: boolean;
    /** Whether to log any debug-level messages to the console. */
    debugLog?: boolean;
}

export interface ViewData {
    id: string
    container: ViewContainer
    options: ViewOptions
}

export interface ViewOptions {
    /**
     * Specifies a list of methods that the webview should receive when corresponding notifications are sent with a `broadcast` type.
     * When a notification corresponding to any of the listed methods is broadcasted, the webview will be notified.
     * If this option is omitted or set to `undefined`, the webview will not receive any broadcast notifications.
     * The default is `undefined`.
     */
    broadcastMethods?: string[]
}

export interface HandlerRegistration {
    handler: RequestHandler<unknown, unknown> | NotificationHandler<unknown>
    sender: MessageParticipant | undefined
}

class IdProvider {

    private counter = 0;

    /**
     * Provide an identifier for the given webview. This should be called only once per webview
     * instance because the result will be different for every call.
     */
    getWebviewId(view: ViewContainer): string {
        return view.viewType + '_' + this.counter++;
    }
}

function participantToString(participant: MessageParticipant | undefined): string {
    if (!participant) {
        return 'undefined';
    }
    switch (participant.type) {
        case 'extension':
            return 'host extension';
        case 'webview':
            if (isWebviewIdMessageParticipant(participant)) {
                return participant.webviewId;
            } else if (participant.webviewType) {
                return participant.webviewType;
            } else {
                return 'unspecified webview';
            }
        case 'broadcast':
            return 'broadcast';
    }
}
