/******************************************************************************
 * Copyright 2022 TypeFox GmbH
 * This program and the accompanying materials are made available under the
 * terms of the MIT License, which is available in the project root.
 ******************************************************************************/

/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-unused-vars */

import crypto from 'crypto';
import type { Disposable, Message, MessageParticipant, NotificationType, RequestType } from 'vscode-messenger-common';
import { CancellationTokenImpl, createCancelRequestMessage, HOST_EXTENSION, isRequestMessage } from 'vscode-messenger-common';
import type { VsCodeApi } from '../src';
import { createCancellationToken, Messenger } from '../src';

Object.defineProperty(globalThis, 'crypto', {
    value: {
        getRandomValues: (arr: string | any[]) => crypto.randomBytes(arr.length)
    }
});

const stringNotification: NotificationType<string> = { method: 'stringNotification' };
const stringRequest: RequestType<string, string> = { method: 'stringRequest' };

const FORCE_HANDLER_TO_WAIT_PARAM = 'wait';

describe('Webview Messenger', () => {
    let vsCodeApi: VsCodeApi & { messages: any[], onReceivedMessage: (message: any) => void };
    let messageListeners: Array<(event: { data: unknown }) => void> = [];

    function postWindowMsg(obj: any) {
        if (messageListeners.length === 0) {
            throw new Error('Messenger is not started.');
        }
        for (const listener of messageListeners) {
            listener({ data: obj });
        }
    }

    beforeAll(() => {
        const globWindow = (global as any).window;
        const addEventListener = globWindow.addEventListener;
        globWindow.addEventListener = ((type: string, listener: (event: any) => void, options: any) => {
            if (type === 'message') {
                messageListeners.push(listener);
            } else {
                addEventListener(type, listener, options);
            }
        }) as any;
        vsCodeApi = {
            postMessage: async (message: Message) => {
                vsCodeApi.messages.push(message);
                if (isRequestMessage(message)) {
                    const postMsg = () => postWindowMsg({
                        sender: HOST_EXTENSION,
                        receiver: { type: 'webview', webviewId: 'test-view' },
                        id: message.id,
                        result: 'result:' + message.params
                    });

                    if (message.params === FORCE_HANDLER_TO_WAIT_PARAM) {
                        let cleanUp: any;
                        await new Promise((resolve, reject) => {
                            cleanUp = reject;
                            setTimeout(() => {
                                postMsg();
                                resolve('resolved');
                            }, 500);
                        }).catch((_error) => clearTimeout(cleanUp));
                    } else {
                        postMsg();
                    }

                }
                vsCodeApi.onReceivedMessage(message);
                return;
            },
            getState: () => { return; },
            setState: () => { return; },
            messages: [],
            onReceivedMessage: (message: any) => { return; }
        };
    });

    afterEach(() => {
        vsCodeApi.messages = [];
        vsCodeApi.onReceivedMessage = (message: any) => { return; };
        messageListeners = [];
    });

    test('Send request to extension', async () => {
        const messenger = new Messenger(vsCodeApi);
        messenger.start();

        const response = await messenger.sendRequest(stringRequest, HOST_EXTENSION, 'ping');

        expect(vsCodeApi.messages[0]).toMatchObject(
            {
                method: 'stringRequest',
                receiver: HOST_EXTENSION,
                params: 'ping'
            }
        );
        expect(response).toBe('result:ping');
    });

    test('Send notification to extension', () => {
        new Messenger(vsCodeApi).sendNotification(stringNotification, HOST_EXTENSION, 'ping');

        const message = vsCodeApi.messages[0] as unknown as any;
        delete message.id;
        expect(message).toMatchObject(
            {
                method: 'stringNotification',
                receiver: HOST_EXTENSION,
                params: 'ping'
            }
        );
    });

    test('Handle request from an extension', async () => {
        const messenger = new Messenger(vsCodeApi);
        messenger.onRequest(stringRequest, (r: string) => {
            return 'handled:' + r;
        });
        messenger.start();
        const expectation = new Promise<unknown>((resolve, reject) => {
            vsCodeApi.onReceivedMessage = resolve;
        });

        // simulate extension request
        postWindowMsg({
            sender: HOST_EXTENSION,
            receiver: { type: 'webview', webviewId: 'test-view' },
            id: 'request_id',
            method: 'stringRequest',
            params: 'ping'
        });
        expect(await expectation).toMatchObject({
            id: 'request_id',
            result: 'handled:ping'
        });
    });

    test('Handle request with async handler', async () => {
        const messenger = new Messenger(vsCodeApi);
        messenger.onRequest(stringRequest, async (r: string) => {
            const promise = new Promise<string>((resolve, reject) => {
                setTimeout(() => {
                    resolve(r);
                }, 100);
            });
            return 'handled:' + await promise;
        });
        messenger.start();
        const expectation = new Promise<unknown>((resolve, reject) => {
            vsCodeApi.onReceivedMessage = resolve;
        });

        // simulate extension request
        postWindowMsg({
            sender: HOST_EXTENSION,
            receiver: { type: 'webview', webviewId: 'test-view' },
            id: 'request_id',
            method: 'stringRequest',
            params: 'ping'
        });

        expect(await expectation).toMatchObject({
            id: 'request_id',
            result: 'handled:ping'
        });
    });

    test('Handle request with no handler', async () => {
        new Messenger(vsCodeApi).start();
        const warn = jest.spyOn(console, 'warn').mockImplementation(() => null);
        const expectation = new Promise<unknown>((resolve, reject) => {
            vsCodeApi.onReceivedMessage = resolve;
        });

        // simulate extension request
        postWindowMsg({
            sender: HOST_EXTENSION,
            receiver: { type: 'webview', webviewId: 'test-view' },
            id: 'request_id',
            method: 'stringRequest',
            params: 'ping'
        });
        expect(await expectation).toMatchObject({
            id: 'request_id',
            error: {
                message: 'Unknown method: stringRequest'
            }
        });
        warn.mockRestore();
    });

    test('Handle notification from an extension', async () => {
        let resolver: any;
        const responder = new Promise((resolve, reject) => {
            resolver = resolve;
        });

        const messenger = new Messenger(vsCodeApi);
        messenger.onNotification(stringNotification, (note: string) => {
            const result = 'handled:' + note;
            resolver(result);
            return;
        });
        messenger.start();

        postWindowMsg({
            sender: HOST_EXTENSION,
            receiver: { type: 'webview', webviewId: 'test-view' },
            method: 'stringNotification',
            params: 'pong'
        });
        expect(await responder).toBe('handled:pong');
    });

    test('Check unique msg id', () => {
        // disable warn logging for untracked messages
        const warn = jest.spyOn(console, 'warn').mockImplementation(() => null);

        const messenger1 = new Messenger(vsCodeApi);
        messenger1.start();
        const messenger2 = new Messenger(vsCodeApi);
        messenger2.start();
        messenger1.sendRequest(stringRequest, HOST_EXTENSION, 'ping1');
        messenger2.sendRequest(stringRequest, HOST_EXTENSION, 'ping2');

        const message1 = vsCodeApi.messages[0] as unknown as any;
        const message2 = vsCodeApi.messages[1] as unknown as any;

        expect(message1.id.startsWith('req_0_')).toBeTruthy();
        expect(message2.id.startsWith('req_0_')).toBeTruthy();

        expect(message1.id).not.toBe(message2.id);

        // re-enable console warn
        warn.mockRestore();
    });

    test('Check no msg id for notifications', () => {
        new Messenger(vsCodeApi).sendNotification(stringNotification, HOST_EXTENSION, 'note');
        const message = vsCodeApi.messages[0] as unknown as any;
        expect(message.id).toBeUndefined();
    });

    test('Handle request handler error', async () => {
        const messenger = new Messenger(vsCodeApi);
        messenger.onRequest(stringRequest, (r: string, sender: MessageParticipant) => {
            throw new Error(`Failed to handle request from: ${JSON.stringify(sender)}`);
        });
        messenger.start();
        const expectation = new Promise<unknown>((resolve, reject) => {
            vsCodeApi.onReceivedMessage = resolve;
        });

        // simulate extension request
        postWindowMsg({
            sender: HOST_EXTENSION,
            receiver: { type: 'webview', webviewId: 'test-view' },
            id: 'request_id',
            method: 'stringRequest',
            params: 'ping'
        });
        expect(await expectation).toMatchObject({
            id: 'request_id',
            error: {
                message: 'Failed to handle request from: {"type":"extension"}'
            }
        });
    });

    test('Cancel request-handler', async () => {
        const messenger = new Messenger(vsCodeApi);
        messenger.start();

        const cancel = new CancellationTokenImpl();
        setTimeout(() =>
            cancel.cancel('Test cancel'), 100);

        await messenger.sendRequest(stringRequest, HOST_EXTENSION, FORCE_HANDLER_TO_WAIT_PARAM, cancel)
            .then(() => {
                throw new Error('Expected to throw error');
            }).catch((error) => {
                expect(error.message).toBe('Test cancel');
            });
        // check the internal cancelation listener attached in `sendRequest` was removed
        expect((cancel as any).listeners.length).toBe(0);
    });

    test('Handle cancel request event', async () => {
        let started = false;
        let canceled = false;
        let handled = false;
        const toDispose: Disposable[] = [];
        const messenger = new Messenger(vsCodeApi);
        messenger.onRequest(stringRequest, async (param: string, sender, cancelation) => {
            let timeOut: any;
            toDispose.push(cancelation.onCancellationRequested(() => {
                clearTimeout(timeOut);
                canceled = true;
            }));
            started = true;
            // simulate work in progress
            await new Promise<void>(resolve => {
                timeOut = setTimeout(resolve, 1000);
            });
            handled = true;
            return 'handled:' + param;
        });
        messenger.start();

        // simulate extension request
        postWindowMsg({
            sender: HOST_EXTENSION,
            receiver: { type: 'webview', webviewId: 'test-view' },
            id: 'request_id',
            method: 'stringRequest',
            params: 'ping'
        });
        // send cancel request
        postWindowMsg(createCancelRequestMessage({ type: 'webview', webviewId: 'test-view' }, { msgId: 'request_id' }));

        toDispose.forEach(d => d.dispose());
        expect(started).toBe(true);
        expect(canceled).toBe(true);
        expect(handled).toBe(false);
        expect(vsCodeApi.messages.length).toBe(0); // receiver should not receive any message
    });

    test('Test AbortSignal wrapper', async () => {
        const messenger = new Messenger(vsCodeApi);
        messenger.start();

        const abortController = new AbortController();
        setTimeout(() => abortController.abort('Test Abort Signal'), 100);

        const cancellable = createCancellationToken(abortController.signal);
        await messenger.sendRequest(stringRequest, HOST_EXTENSION, FORCE_HANDLER_TO_WAIT_PARAM, cancellable)
            .then(() => {
                throw new Error('Expected to throw error');
            }).catch((error) => {
                expect(error.message).toBe('Test Abort Signal');
            });
    });

    test('onRequest should register handler and return disposable', async () => {
        const messenger = new Messenger(vsCodeApi);
        messenger.start();

        let handled = false;
        const disposable = messenger.onRequest(stringRequest, (params) => {
            handled = true;
            return `Response to: ${params}`;
        });

        // Verify it's a disposable with a dispose method
        expect(typeof disposable.dispose).toBe('function');

        // Send a request to trigger the handler
        postWindowMsg({
            id: 'test-1',
            method: 'stringRequest',
            params: 'test-param',
            receiver: { type: 'webview' },
            sender: HOST_EXTENSION
        });

        await new Promise(resolve => setTimeout(resolve, 10));

        // Verify handler was called
        expect(handled).toBe(true);
        expect(vsCodeApi.messages).toHaveLength(1);
        expect(vsCodeApi.messages[0].result).toBe('Response to: test-param');

        // Clear messages and reset
        vsCodeApi.messages = [];
        handled = false;

        // Dispose the handler
        disposable.dispose();

        // Send another request - should not be handled
        postWindowMsg({
            id: 'test-2',
            method: 'stringRequest',
            params: 'test-param-2',
            receiver: { type: 'webview' },
            sender: HOST_EXTENSION
        });

        await new Promise(resolve => setTimeout(resolve, 10));

        // Verify handler was not called and error response was sent
        expect(handled).toBe(false);
        expect(vsCodeApi.messages).toHaveLength(1);
        expect(vsCodeApi.messages[0].error).toBeDefined();
        expect(vsCodeApi.messages[0].error.message).toBe('Unknown method: stringRequest');
    });

    test('onNotification should register handler and return disposable', async () => {
        const messenger = new Messenger(vsCodeApi);
        messenger.start();

        let handled = false;
        let receivedParams: string | undefined;

        const disposable = messenger.onNotification(stringNotification, (params) => {
            handled = true;
            receivedParams = params;
        });

        // Verify it's a disposable with a dispose method
        expect(typeof disposable.dispose).toBe('function');

        // Send a notification to trigger the handler
        postWindowMsg({
            method: 'stringNotification',
            params: 'test-notification-param',
            receiver: { type: 'webview' },
            sender: HOST_EXTENSION
        });

        await new Promise(resolve => setTimeout(resolve, 10));

        // Verify handler was called
        expect(handled).toBe(true);
        expect(receivedParams).toBe('test-notification-param');

        // Reset state
        handled = false;
        receivedParams = undefined;

        // Dispose the handler
        disposable.dispose();

        // Send another notification - should not be handled
        postWindowMsg({
            method: 'stringNotification',
            params: 'test-notification-param-2',
            receiver: { type: 'webview' },
            sender: HOST_EXTENSION
        });

        await new Promise(resolve => setTimeout(resolve, 10));

        // Verify handler was not called
        expect(handled).toBe(false);
        expect(receivedParams).toBeUndefined();
    });

    test('Multiple disposable handlers should work independently', async () => {
        const messenger = new Messenger(vsCodeApi);
        messenger.start();

        let handler1Called = false;
        let handler2Called = false;

        const disposable1 = messenger.onRequest(stringRequest, () => {
            handler1Called = true;
            return 'response1';
        });

        const disposable2 = messenger.onNotification(stringNotification, () => {
            handler2Called = true;
        });

        // Test both handlers work
        postWindowMsg({
            id: 'test-req',
            method: 'stringRequest',
            params: 'test',
            receiver: { type: 'webview' },
            sender: HOST_EXTENSION
        });

        postWindowMsg({
            method: 'stringNotification',
            params: 'test',
            receiver: { type: 'webview' },
            sender: HOST_EXTENSION
        });

        await new Promise(resolve => setTimeout(resolve, 10));

        expect(handler1Called).toBe(true);
        expect(handler2Called).toBe(true);

        // Reset state
        handler1Called = false;
        handler2Called = false;
        vsCodeApi.messages = [];

        // Dispose only the first handler
        disposable1.dispose();

        // Test again
        postWindowMsg({
            id: 'test-req-2',
            method: 'stringRequest',
            params: 'test',
            receiver: { type: 'webview' },
            sender: HOST_EXTENSION
        });

        postWindowMsg({
            method: 'stringNotification',
            params: 'test',
            receiver: { type: 'webview' },
            sender: HOST_EXTENSION
        });

        await new Promise(resolve => setTimeout(resolve, 10));

        // Only the notification handler should still work
        expect(handler1Called).toBe(false);
        expect(handler2Called).toBe(true);

        // Should have error response for the request
        expect(vsCodeApi.messages.some(msg => msg.error?.message === 'Unknown method: stringRequest')).toBe(true);

        // Clean up
        disposable2.dispose();
    });

    test('unregisterHandler should remove handlers by method name', async () => {
        const messenger = new Messenger(vsCodeApi);
        messenger.start();

        let requestHandled = false;
        let notificationHandled = false;

        // Register handlers without method chaining
        messenger.onRequest(stringRequest, (params: string) => {
            requestHandled = true;
            return `Response to: ${params}`;
        });
        messenger.onNotification(stringNotification, (params: string) => {
            notificationHandled = true;
        });

        // Test that handlers work initially
        postWindowMsg({
            id: 'test-req-1',
            method: 'stringRequest',
            params: 'test-param',
            receiver: { type: 'webview' },
            sender: HOST_EXTENSION
        });

        postWindowMsg({
            method: 'stringNotification',
            params: 'test-notification',
            receiver: { type: 'webview' },
            sender: HOST_EXTENSION
        });

        await new Promise(resolve => setTimeout(resolve, 10));

        expect(requestHandled).toBe(true);
        expect(notificationHandled).toBe(true);
        expect(vsCodeApi.messages).toHaveLength(1);
        expect(vsCodeApi.messages[0].result).toBe('Response to: test-param');

        // Reset state
        requestHandled = false;
        notificationHandled = false;
        vsCodeApi.messages = [];

        // Unregister the request handler and verify return value
        const requestUnregistered = messenger.unregisterHandler('stringRequest');
        expect(requestUnregistered).toBe(true); // Should return true for existing handler

        // Test again - request should fail, notification should still work
        postWindowMsg({
            id: 'test-req-2',
            method: 'stringRequest',
            params: 'test-param-2',
            receiver: { type: 'webview' },
            sender: HOST_EXTENSION
        });

        postWindowMsg({
            method: 'stringNotification',
            params: 'test-notification-2',
            receiver: { type: 'webview' },
            sender: HOST_EXTENSION
        });

        await new Promise(resolve => setTimeout(resolve, 10));

        expect(requestHandled).toBe(false);
        expect(notificationHandled).toBe(true);

        // Should have error response for the request
        expect(vsCodeApi.messages).toHaveLength(1);
        expect(vsCodeApi.messages[0].error).toBeDefined();
        expect(vsCodeApi.messages[0].error.message).toBe('Unknown method: stringRequest');

        // Reset state
        notificationHandled = false;
        vsCodeApi.messages = [];

        // Unregister the notification handler and verify return value
        const notificationUnregistered = messenger.unregisterHandler('stringNotification');
        expect(notificationUnregistered).toBe(true); // Should return true for existing handler

        // Test notification - should no longer be handled
        postWindowMsg({
            method: 'stringNotification',
            params: 'test-notification-3',
            receiver: { type: 'webview' },
            sender: HOST_EXTENSION
        });

        await new Promise(resolve => setTimeout(resolve, 10));

        expect(notificationHandled).toBe(false);
        expect(vsCodeApi.messages).toHaveLength(0); // No response for unhandled notifications
    });

    test('unregisterHandler should return correct boolean values', () => {
        const messenger = new Messenger(vsCodeApi);
        messenger.start();

        // Should return false when unregistering a non-existent handler
        const nonExistentResult = messenger.unregisterHandler('nonExistentMethod');
        expect(nonExistentResult).toBe(false);

        // Register a handler and verify unregistering returns true
        messenger.onRequest(stringRequest, () => 'response');
        const existingResult = messenger.unregisterHandler('stringRequest');
        expect(existingResult).toBe(true);

        // Should return false when unregistering the same method again
        const alreadyUnregisteredResult = messenger.unregisterHandler('stringRequest');
        expect(alreadyUnregisteredResult).toBe(false);

        // Test with notification handlers too
        messenger.onNotification(stringNotification, () => {});
        const notificationResult = messenger.unregisterHandler('stringNotification');
        expect(notificationResult).toBe(true);

        const notificationAlreadyUnregisteredResult = messenger.unregisterHandler('stringNotification');
        expect(notificationAlreadyUnregisteredResult).toBe(false);
    });
});
