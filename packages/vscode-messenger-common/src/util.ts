/******************************************************************************
 * Copyright 2022 TypeFox GmbH
 * This program and the accompanying materials are made available under the
 * terms of the MIT License, which is available in the project root.
 ******************************************************************************/

import type { MessageParticipant, NotificationHandler, RequestHandler } from './messages';
import { isWebviewIdMessageParticipant } from './messages';

/**
 * Discriminates whether a registered handler serves requests or notifications.
 */
export type HandlerKind = 'request' | 'notification';

/**
 * Internal record tracked per method name to keep track of a registered request/notification handler.
 * Shared between the extension host and webview `Messenger` implementations.
 */
export interface HandlerRegistration {
    handler: RequestHandler<unknown, unknown> | NotificationHandler<unknown>
    kind: HandlerKind
    /** Restricts a request/notification handler to a specific sender. Only used on the extension host side. */
    sender?: MessageParticipant
}

/**
 * Produce a human-readable representation of a message participant for logging and error messages.
 */
export function participantToString(participant: MessageParticipant | undefined): string {
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

/**
 * Build a diagnostic message for the case where an incoming message's kind does not match the kind
 * of the handler registered for its method (e.g. a request arrives but only a notification handler
 * is registered). This can only happen if the same method name is used for different kinds on the
 * two communication sides.
 *
 * @param messageKind The kind of the incoming message.
 * @param method The method name of the incoming message.
 * @param registeredKind The kind of the handler that is actually registered for the method.
 */
export function wrongHandlerKindMessage(messageKind: HandlerKind, method: string, registeredKind: HandlerKind): string {
    return `Received a ${messageKind} for method '${method}', but the registered handler is a ${registeredKind} handler. `
        + 'A method must be used exclusively for requests or for notifications on both communication sides.';
}
