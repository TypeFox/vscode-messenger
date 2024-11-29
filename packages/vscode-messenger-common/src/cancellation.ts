/******************************************************************************
 * Copyright 2024 TypeFox GmbH
 * This program and the accompanying materials are made available under the
 * terms of the MIT License, which is available in the project root.
 ******************************************************************************/

import { isNotificationMessage, Message, MessageParticipant, NotificationMessage } from './messages';

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
    onCancellationRequested(callBack: (reason: string) => void): Disposable;
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
        this.listeners = [];
    }

    get isCancellationRequested(): boolean {
        return this.canceled;
    }

    public onCancellationRequested(callBack: (reason: string) => void): Disposable {
        this.listeners.push(callBack);
        const listeners = this.listeners;
        return {
            dispose() {
                listeners.splice(listeners.indexOf(callBack), 1);
            }
        };
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