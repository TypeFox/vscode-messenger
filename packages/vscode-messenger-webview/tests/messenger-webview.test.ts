/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable @typescript-eslint/no-explicit-any */
/******************************************************************************
 * Copyright 2022 TypeFox GmbH
 * This program and the accompanying materials are made available under the
 * terms of the MIT License, which is available in the project root.
 ******************************************************************************/

import { JsonAny, NotificationType, RequestType } from 'vscode-messenger-common';
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
    let vsCodeApi: VsCodeApi & { messages: JsonAny[] };

    beforeAll(() => {
        vsCodeApi = {
            postMessage: (message: JsonAny) => {
                vsCodeApi.messages.push(message);
                // fake response
                const anyMsg = (message as unknown as any);
                postWindowMsg({ id: anyMsg.id, result: 'result:' + anyMsg.params });
                return;
            },
            getState: () => { return; },
            setState: () => { return; },
            messages: []
        };
    });

    afterEach(() => {
        vsCodeApi.messages = [];
    });

    test('Send request to extension', async () => {
        const messenger = new Messenger(vsCodeApi);
        messenger.start();

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

        const messenger = new Messenger(vsCodeApi);
        messenger.sendNotification(stringNotification, {}, 'ping');

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

        let resolver: any;
        const responder = new Promise((resolve, reject) => {
            resolver = resolve;
        });

        const messenger = new Messenger(vsCodeApi).start();
        messenger.onRequest(stringRequest, (r: string) => {
            const result = 'handled:' + r;
            resolver(result);
            return result;
        });

        postWindowMsg({ id: 'req_id', method: 'stringRequest', params: 'ping' });

        expect(await responder).toBe('handled:ping');
    });

    test('Handle notification from an extension', async () => {

        let resolver: any;
        const responder = new Promise((resolve, reject) => {
            resolver = resolve;
        });

        const messenger = new Messenger(vsCodeApi).start();
        messenger.onNotification(stringNotification, (note: string) => {
            const result = 'handled:' + note;
            resolver(result);
            return;
        });

        postWindowMsg({ id: 'note_id', method: 'stringNotification', params: 'pong' });
        expect(await responder).toBe('handled:pong');
    });

    test('Check unique msg id', () => {
        new Messenger(vsCodeApi).sendNotification(stringNotification, {}, 'ping1');
        new Messenger(vsCodeApi).sendNotification(stringNotification, {}, 'ping2');

        const message1 = vsCodeApi.messages[0] as unknown as any;
        const message2 = vsCodeApi.messages[1] as unknown as any;

        expect(message1.id.startsWith('viewMsgId_0_')).toBeTruthy();
        expect(message2.id.startsWith('viewMsgId_0_')).toBeTruthy();

        expect(message1.id).not.toBe(message2.id);
    });

});

function postWindowMsg(obj: any) {
    window?.postMessage(obj, '*');
}