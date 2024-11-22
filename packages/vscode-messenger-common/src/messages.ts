/******************************************************************************
 * Copyright 2022 TypeFox GmbH
 * This program and the accompanying materials are made available under the
 * terms of the MIT License, which is available in the project root.
 ******************************************************************************/

/**
 * Identifies an endpoint able to send and receive messages.
 */
export type MessageParticipant = ExtensionMessageParticipant | WebviewMessageParticipant | BroadcastMessageParticipant

/**
 * Specifies the host extension (if `extensionId` is undefined) or another extension.
 */
export interface ExtensionMessageParticipant {
    type: 'extension'
    /** Identifier in the form `publisher.name`. _This property is not supported yet._ */
    extensionId?: string
}

export const HOST_EXTENSION: Readonly<ExtensionMessageParticipant> = { type: 'extension' };

/**
 * A webview must be identified either with an ID (`webviewId`) or a type (`webviewType`).
 */
export type WebviewMessageParticipant = WebviewIdMessageParticipant | WebviewTypeMessageParticipant;

export interface WebviewIdMessageParticipant {
    type: 'webview'
    /** Identifier of a specific webview instance. */
    webviewId: string
}

export function isWebviewIdMessageParticipant(participant: MessageParticipant): participant is WebviewIdMessageParticipant {
    return participant.type === 'webview' && typeof (participant as WebviewIdMessageParticipant).webviewId === 'string';
}

export interface WebviewTypeMessageParticipant {
    type: 'webview'
    /** Webview panel type or webview view type. */
    webviewType: string
}

export function isWebviewTypeMessageParticipant(participant: MessageParticipant): participant is WebviewTypeMessageParticipant {
    return participant.type === 'webview' && typeof (participant as WebviewTypeMessageParticipant).webviewType === 'string';
}

/**
 * This participant type is only valid for notifications and distributes a message
 * to all participants that have registered for it.
 */
export interface BroadcastMessageParticipant {
    type: 'broadcast'
}

export const BROADCAST: Readonly<BroadcastMessageParticipant> = { type: 'broadcast' };

export function equalParticipants(p1: MessageParticipant, p2: MessageParticipant): boolean {
    if (p1.type === 'extension' && p2.type === 'extension') {
        return p1.extensionId === p2.extensionId;
    }
    if (p1.type === 'webview' && p2.type === 'webview') {
        if (isWebviewIdMessageParticipant(p1) && isWebviewIdMessageParticipant(p2)) {
            return p1.webviewId === p2.webviewId;
        }
        if (isWebviewTypeMessageParticipant(p1) && isWebviewTypeMessageParticipant(p2)) {
            return p1.webviewType === p2.webviewType;
        }
    }
    return p1.type === p2.type;
}

export interface Message {
    /** The receiver of this message. */
    receiver: MessageParticipant
    /**
     * The sender of this message. Webviews can omit the sender so the property will be added
     * by the host extension.
     */
    sender?: MessageParticipant
}

export function isMessage(obj: unknown): obj is Message {
    return typeof obj === 'object' && obj !== null && typeof (obj as Message).receiver === 'object';
}

export interface RequestMessage extends Message {
    /** The request id. */
    id: string
    /** The method to be invoked. */
    method: string
    /** The parameters to be passed. */
    params?: JsonAny;
}

export function isRequestMessage(msg: Message): msg is RequestMessage {
    return !!(msg as RequestMessage).id && !!(msg as RequestMessage).method;
}

export interface ResponseMessage extends Message {
    /** The request id. */
    id: string
    /** The result of a request in case the request was successful. */
    result?: JsonAny
    /** The error object in case the request failed. */
    error?: ResponseError
}

export function isResponseMessage(msg: Message): msg is ResponseMessage {
    return !!(msg as ResponseMessage).id && !(msg as RequestMessage).method;
}

export interface ResponseError {
    /** The error message. */
    message: string
    /** Additional information about the error. */
    data?: JsonAny
}

export interface NotificationMessage extends Message {
    /** The method to be invoked. */
    method: string
    /** The parameters to be passed. */
    params?: JsonAny
}

export function isNotificationMessage(msg: Message): msg is NotificationMessage {
    return !(msg as RequestMessage).id && !!(msg as NotificationMessage).method;
}

export type JsonAny = JsonPrimitive | JsonMap | JsonArray | null;

export type JsonPrimitive = string | number | boolean;

export interface JsonMap {
    [key: string]: JsonAny
}

export type JsonArray = JsonAny[];

/**
 * Data structure for defining a request type.
 */
export type RequestType<P, R> = {
    method: string

    /**
     * Used to ensure correct typing. Clients must not use this property
     */
    readonly _?: [P, R]
};

/**
 * Function for handling incoming requests.
 */
export type RequestHandler<P, R> = (params: P, sender: MessageParticipant, cancellationToken: CancellationToken) => HandlerResult<R>;
export type HandlerResult<R> = R | Promise<R>;

/**
 * Data structure for defining a notification type.
 */
export type NotificationType<P> = {
    method: string
    /**
     * Used to ensure correct typing. Clients must not use this property
     */
    readonly _?: P
};

/**
 * Function for handling incoming notifications.
 */
export type NotificationHandler<P> = (params: P, sender: MessageParticipant) => void | Promise<void>;

/**
 * Base API for Messenger implementations.
 */
export interface MessengerAPI {
    sendRequest<P, R>(type: RequestType<P, R>, receiver: MessageParticipant, params?: P, cancelable?: CancellationToken): Promise<R>
    onRequest<P, R>(type: RequestType<P, R>, handler: RequestHandler<P, R>): void
    sendNotification<P>(type: NotificationType<P>, receiver: MessageParticipant, params?: P): void
    onNotification<P>(type: NotificationType<P>, handler: NotificationHandler<P>): void
}

/**
 *  Deferred promise that can be resolved or rejected later.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export class Deferred<R = any> {
    resolve: (value: R) => void;
    reject: (reason?: unknown) => void;

    result = new Promise<R>((resolve, reject) => {
        this.resolve = (arg) => resolve(arg);
        this.reject = (err) => reject(err);
    });
}

/**
 * Interface that allows to check for cancellation and
 * set a listener that is called when the request is canceled.
 */
export interface CancellationToken {
    readonly isCancellationRequested: boolean;
    onCancellationRequested(callBack: (reason: string) => void): void;
}

/**
* Implementation of the CancellationToken interface.
* Allows to trigger cancelation.
*/
export class CancellationTokenImpl implements CancellationToken {
    private canceled = false;
    private listeners: Array<((reason: string) => void)> = [];

    public cancel(reason: string): void {
        if (this.canceled) {
            throw new Error('Request was already canceled.');
        }
        this.canceled = true;
        this.listeners.forEach(callBack => callBack(reason));
        this.clearCancelListeners();
    }

    get isCancellationRequested(): boolean {
        return this.canceled;
    }

    public onCancellationRequested(callBack: (reason: string) => void): void {
        this.listeners.push(callBack);
    }

    public clearCancelListeners(): void {
        this.listeners = [];
    }
}

const cancelRequestMethod = '$/cancelRequest';

/**
 * Internal message type for canceling requests.
 */
export type CancelRequestMessage = NotificationMessage & { method: typeof cancelRequestMethod, params: CancelParams };

/**
 * Parameters for canceling a request.
 * @param msgId id of the request to cancel
 */
export interface CancelParams {
    /**
     * msgId id of the request to cancel
     */
    msgId: string;
}

/**
 * Checks if the given message is a cancel request.
 * @param msg  message to check
 * @returns  true if the message is a cancel request
 */
export function isCancelRequestNotification(msg: Message): msg is CancelRequestMessage {
    return isNotificationMessage(msg) && msg.method === cancelRequestMethod;
}

/**
 * Creates a cancel request message.
 * @param receiver receiver of the cancel request
 * @param params id of the request to cancel
 * @returns  new cancel request message
 */
export function createCancelRequestMessage(receiver: MessageParticipant, params: CancelParams): CancelRequestMessage {
    return {
        method: cancelRequestMethod,
        receiver,
        params: { msgId: params.msgId }
    };
}