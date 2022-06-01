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
export interface WebviewMessageParticipant {
    type: 'webview'
    /** Identifier of a specific webview instance. */
    webviewId?: string
    /** Webview panel type or webview view type. */
    webviewType?: string
}

/**
 * This participant type is only valid for notifications and distributes a message
 * to all known participants.
 */
export interface BroadcastMessageParticipant {
    type: 'broadcast'
}

export const BROADCAST: Readonly<BroadcastMessageParticipant> = { type: 'broadcast' };

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

export type JsonAny =  JsonPrimitive | JsonMap | JsonArray | null;

export type JsonPrimitive = string | number | boolean;

export interface JsonMap {
    [key: string]: JsonAny
}

export type JsonArray = JsonAny[];

/**
 * Data structure for defining a request type.
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export type RequestType<P extends JsonAny, R> = { method: string };

/**
 * Function for handling incoming requests.
 */
export type RequestHandler<P, R> = (params: P, sender: MessageParticipant) => HandlerResult<R>;
export type HandlerResult<R> = R | Promise<R>;

/**
 * Data structure for defining a notification type.
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export type NotificationType<P extends JsonAny> = { method: string };

/**
 * Function for handling incoming notifications.
 */
export type NotificationHandler<P> = (params: P) => void | Promise<void>;

/**
 * Base API for Messenger implementations.
 */
export interface MessengerAPI {
    sendRequest<P extends JsonAny, R>(type: RequestType<P, R>, receiver: MessageParticipant, params: P): Promise<R>
    onRequest<P extends JsonAny, R>(type: RequestType<P, R>, handler: RequestHandler<P, R>): void
    sendNotification<P extends JsonAny>(type: NotificationType<P>, receiver: MessageParticipant, params: P): void
    onNotification<P extends JsonAny>(type: NotificationType<P>, handler: NotificationHandler<P>): void
}
