/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable @typescript-eslint/no-explicit-any */
/******************************************************************************
 * Copyright 2022 TypeFox GmbH
 * This program and the accompanying materials are made available under the
 * terms of the MIT License, which is available in the project root.
 ******************************************************************************/

import { isRequestMessage, isResponseMessage, JsonAny, Message, MessageParticipant, NotificationType, RequestType } from 'vscode-messenger-common';
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

describe('Simple test', () => {
    let vsCodeApi: VsCodeApi & { messages: any[], onReceivedMessage: (message: any) => void };

    beforeAll(() => {
        vsCodeApi = {
            postMessage: (message: Message) => {
                vsCodeApi.messages.push(message);
                if (isRequestMessage(message)) {
                    postWindowMsg({
                        sender: {},
                        receiver: { webviewId: 'test-view' },
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
    });

    test('Send request to extension', async () => {
        const messenger = new Messenger(vsCodeApi).start();

        const response = await messenger.sendRequest(stringRequest, {}, 'ping');

        expect(vsCodeApi.messages[0]).toMatchObject(
            {
                method: 'stringRequest',
                receiver: {},
                params: 'ping'
            }
        );
        expect(response).toBe('result:ping');
    });

    test('Send notification to extension', () => {
        new Messenger(vsCodeApi).sendNotification(stringNotification, {}, 'ping');

        const message = vsCodeApi.messages[0] as unknown as any;
        delete message.id;
        expect(message).toMatchObject(
            {
                method: 'stringNotification',
                receiver: {},
                params: 'ping'
            }
        );
    });

    test('Handle request from an extension', async () => {
        new Messenger(vsCodeApi).start().onRequest(stringRequest, (r: string) => {
            return 'handled:' + r;
        });
        const expectation = new Promise<JsonAny | undefined>((resolve, reject) => {
            vsCodeApi.onReceivedMessage = (msg) => {
                if (isResponseMessage(msg)) {
                    resolve(msg.result);
                } else {
                    reject('not a response msg');
                }
            };
        });

        // simulate extension request
        postWindowMsg({
            sender: {},
            receiver: { webviewId: 'test-view' },
            id: 'request_id',
            method: 'stringRequest',
            params: 'ping'
        });
        expect(await expectation).toBe('handled:ping');
    });

    test('Async Handle request from an extension', async () => {
        new Messenger(vsCodeApi).start().onRequest(stringRequest, async (r: string) => {
            const promise = new Promise<string>((resolve, reject) => {
                setTimeout(() => {
                    resolve(r);
                }, 50);
            });
            return 'handled:' +  await promise;
        });
        const expectation = new Promise<JsonAny | undefined>((resolve, reject) => {
            vsCodeApi.onReceivedMessage = (msg) => {
                if (isResponseMessage(msg)) {
                    resolve(msg.result);
                } else {
                    reject('not a response msg');
                }
            };
        });

        // simulate extension request
        postWindowMsg({
            sender: {},
            receiver: { webviewId: 'test-view' },
            id: 'request_id',
            method: 'stringRequest',
            params: 'ping'
        });
        expect(await expectation).toBe('handled:ping');
    });

    test('Handle notification from an extension', async () => {
        let resolver: any;
        const responder = new Promise((resolve, reject) => {
            resolver = resolve;
        });

        new Messenger(vsCodeApi).start().onNotification(stringNotification, (note: string) => {
            const result = 'handled:' + note;
            resolver(result);
            return;
        });

        postWindowMsg({
            sender: {},
            receiver: { webviewId: 'test-view' },
            method: 'stringNotification',
            params: 'pong'
        });
        expect(await responder).toBe('handled:pong');
    });

    test('Check unique msg id', () => {
        new Messenger(vsCodeApi).sendRequest(stringNotification, {}, 'ping1');
        new Messenger(vsCodeApi).sendRequest(stringNotification, {}, 'ping2');

        const message1 = vsCodeApi.messages[0] as unknown as any;
        const message2 = vsCodeApi.messages[1] as unknown as any;

        expect(message1.id.startsWith('req_0_')).toBeTruthy();
        expect(message2.id.startsWith('req_0_')).toBeTruthy();

        expect(message1.id).not.toBe(message2.id);
    });

    test('Check no msg id for notifications', () => {
        new Messenger(vsCodeApi).sendNotification(stringNotification, {}, 'note');
        const message = vsCodeApi.messages[0] as unknown as any;
        expect(message.id).toBeUndefined();
    });

    test('Handle request handler error', async () => {
        new Messenger(vsCodeApi).start().onRequest(stringRequest, (r: string, sender: MessageParticipant) => {
            throw new Error(`Failed to handle request from: ${participantToString(sender)}`);
        });
        const expectation = new Promise<unknown>((resolve, reject) => {
            vsCodeApi.onReceivedMessage = (msg) => {
                if (isResponseMessage(msg)) {
                    resolve(msg);
                } else {
                    reject('not a response msg');
                }
            };
        });

        // simulate extension request
        postWindowMsg({
            sender: {},
            receiver: { webviewId: 'test-view' },
            id: 'request_id',
            method: 'stringRequest',
            params: 'ping'
        });
        expect(await expectation).toMatchObject(
            {
                id: 'request_id',
                error: {
                    message:'Failed to handle request from: host extension'
                }
            }
        );
    });
});

function postWindowMsg(obj: any) {
    window?.postMessage(obj, '*');
}

function participantToString(participant: MessageParticipant): string {
    if (participant.webviewId) {
        return participant.webviewId;
    } else if (participant.webviewType) {
        return participant.webviewType;
    } else {
        return 'host extension';
    }
}