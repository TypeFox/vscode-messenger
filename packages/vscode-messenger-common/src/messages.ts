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
export type RequestHandler<P, R> = (params: P, sender: MessageParticipant, cancelable: CancellationToken) => HandlerResult<R>;
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
 *
 * The MessengerAPI provides a standardized interface for bidirectional communication between
 * VS Code extensions and webviews, as well as between different webviews. It supports both
 * request-response patterns and fire-and-forget notifications.
 */
export interface MessengerAPI {
    /**
     * Send a request message to another participant and wait for a response.
     *
     * Requests follow a request-response pattern where the sender waits for a response
     * from the receiver. The request can be canceled using the optional cancellation token.
     *
     * @template P The type of the request parameters
     * @template R The type of the response data
     * @param type The request type definition containing the method name
     * @param receiver The target participant (extension, webview, etc.). Cannot be broadcast.
     * @param params Optional parameters to send with the request
     * @param cancelable Optional cancellation token to cancel the request
     * @returns A Promise that resolves with the response data or rejects if the request fails
     */
    sendRequest<P, R>(type: RequestType<P, R>, receiver: MessageParticipant, params?: P, cancelable?: CancellationToken): Promise<R>

    /**
     * Register a handler for incoming request messages.
     *
     * The handler will be called whenever a request with the specified method is received.
     * The handler should return the response data or throw an error for failed requests.
     *
     * @template P The type of the request parameters
     * @template R The type of the response data
     * @param type The request type to handle
     * @param handler Function that processes the request and returns a response
     * @returns A Disposable that can be used to unregister the handler
     */
    onRequest<P, R>(type: RequestType<P, R>, handler: RequestHandler<P, R>): Disposable

    /**
     * Send a notification message to one or more participants without expecting a response.
     *
     * Notifications are fire-and-forget messages that don't require acknowledgment.
     * Unlike requests, notifications can be sent to broadcast receivers to notify all handlers.
     *
     * @template P The type of the notification parameters
     * @param type The notification type definition containing the method name
     * @param receiver The target participant (extension, webview, or broadcast)
     * @param params Optional parameters to send with the notification
     */
    sendNotification<P>(type: NotificationType<P>, receiver: MessageParticipant, params?: P): void

    /**
     * Register a handler for incoming notification messages.
     *
     * The handler will be called whenever a notification with the specified method is received.
     * Notification handlers don't return values and should not throw errors for normal operation.
     *
     * @template P The type of the notification parameters
     * @param type The notification type to handle
     * @param handler Function that processes the notification
     * @returns A Disposable that can be used to unregister the handler
     */
    onNotification<P>(type: NotificationType<P>, handler: NotificationHandler<P>): Disposable
}

/**
 * Interface that allows to check for cancellation and
 * set a listener that is called when the request is canceled.
 */
export interface CancellationToken {
    readonly isCancellationRequested: boolean;
    onCancellationRequested(callBack: (reason?: string) => void): Disposable;
}

/**
 * Interface for objects that can be disposed.
 */
export interface Disposable {
    /**
     * Dispose this object.
     */
    dispose(): void;
}