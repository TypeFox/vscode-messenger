/******************************************************************************
 * Copyright 2022 TypeFox GmbH
 * This program and the accompanying materials are made available under the
 * terms of the MIT License, which is available in the project root.
 ******************************************************************************/

/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-unused-vars */

import { HOST_EXTENSION, isRequestMessage, Message, MessageParticipant, NotificationType, RequestType } from 'vscode-messenger-common';
import { Messenger, VsCodeApi } from '../src';
import crypto from 'crypto';

Object.defineProperty(global.self, 'crypto', {
    value: {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        getRandomValues: (arr: string | any[]) => crypto.randomBytes(arr.length)
    }
});

const stringNotification: NotificationType<string> = { method: 'stringNotification' };
const stringRequest: RequestType<string, string> = { method: 'stringRequest' };

describe('Webview Messenger', () => {
    let vsCodeApi: VsCodeApi & { messages: any[], onReceivedMessage: (message: any) => void };
    let messageListeners: Array<(event: { data: unknown }) => void> = [];

    function postWindowMsg(obj: any) {
        if (messageListeners.length === 0) {
            throw new Error('Messenger is not started.');
        } else if (messageListeners.length > 1) {
            console.warn('More than one Messenger is active.');
        }
        for (const listener of messageListeners) {
            listener({ data: obj });
        }
    }

    beforeAll(() => {
        const addEventListener = window.addEventListener;
        window.addEventListener = ((type: string, listener: (event: any) => void, options: any) => {
            if (type === 'message') {
                messageListeners.push(listener);
            } else {
                addEventListener(type, listener, options);
            }
        }) as any;
        vsCodeApi = {
            postMessage: (message: Message) => {
                vsCodeApi.messages.push(message);
                if (isRequestMessage(message)) {
                    postWindowMsg({
                        sender: HOST_EXTENSION,
                        receiver: { type: 'webview', webviewId: 'test-view' },
                        id: message.id,
                        result: 'result:' + message.params
                    });
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
        new Messenger(vsCodeApi).onRequest(stringRequest, (r: string) => {
            return 'handled:' + r;
        }).start();
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
        new Messenger(vsCodeApi).onRequest(stringRequest, async (r: string) => {
            const promise = new Promise<string>((resolve, reject) => {
                setTimeout(() => {
                    resolve(r);
                }, 50);
            });
            return 'handled:' +  await promise;
        }).start();
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
    });

    test('Handle notification from an extension', async () => {
        let resolver: any;
        const responder = new Promise((resolve, reject) => {
            resolver = resolve;
        });

        new Messenger(vsCodeApi).onNotification(stringNotification, (note: string) => {
            const result = 'handled:' + note;
            resolver(result);
            return;
        }).start();

        postWindowMsg({
            sender: HOST_EXTENSION,
            receiver: { type: 'webview', webviewId: 'test-view' },
            method: 'stringNotification',
            params: 'pong'
        });
        expect(await responder).toBe('handled:pong');
    });

    test('Check unique msg id', () => {
        const messenger1 = new Messenger(vsCodeApi);
        messenger1.start();
        const messenger2 = new Messenger(vsCodeApi);
        messenger2.start();
        messenger1.sendRequest(stringNotification, HOST_EXTENSION, 'ping1');
        messenger2.sendRequest(stringNotification, HOST_EXTENSION, 'ping2');

        const message1 = vsCodeApi.messages[0] as unknown as any;
        const message2 = vsCodeApi.messages[1] as unknown as any;

        expect(message1.id.startsWith('req_0_')).toBeTruthy();
        expect(message2.id.startsWith('req_0_')).toBeTruthy();

        expect(message1.id).not.toBe(message2.id);
    });

    test('Check no msg id for notifications', () => {
        new Messenger(vsCodeApi).sendNotification(stringNotification, HOST_EXTENSION, 'note');
        const message = vsCodeApi.messages[0] as unknown as any;
        expect(message.id).toBeUndefined();
    });

    test('Handle request handler error', async () => {
        new Messenger(vsCodeApi).onRequest(stringRequest, (r: string, sender: MessageParticipant) => {
            throw new Error(`Failed to handle request from: ${JSON.stringify(sender)}`);
        }).start();
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
});
