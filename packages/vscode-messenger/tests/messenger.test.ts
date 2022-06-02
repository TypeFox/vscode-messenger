/******************************************************************************
 * Copyright 2022 TypeFox GmbH
 * This program and the accompanying materials are made available under the
 * terms of the MIT License, which is available in the project root.
 ******************************************************************************/

/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-unused-vars */

import { BROADCAST, HOST_EXTENSION, isRequestMessage, MessageParticipant, NotificationType, RequestType } from 'vscode-messenger-common';
import { Messenger } from '../src';

const VIEW_TYPE_1 = 'test.view.type.1';
const VIEW_TYPE_2 = 'test.view.type.2';

const simpleNotification: NotificationType<string> = { method: 'notification' };
const simpleRequest: RequestType<string, string> = { method: 'request' };

function createWebview(viewType: string) {
    const view: any = {
        viewType,
        webview: {
            onDidReceiveMessage: (callback: (msg: unknown) => void) => {
                view.messageCallback = callback;
            },
            postMessage: (message: any) => {
                view.messages.push(message);
                if (isRequestMessage(message)) {
                    view.messageCallback({ receiver: view.responseReceiver, id: message.id, result: 'result:' + message.params });
                }
                return true;
            }
        },
        onDidDispose: () => {
            view.messages = [];
        },
        visible: true,
        messageCallback: undefined,
        onDidChangeVisibility: undefined,
        show: (preserveFocus?: boolean) => {
            throw new Error('Function not implemented.');
        },
        messages: [],
        responseReceiver: HOST_EXTENSION
    };
    return view;
}

describe('Simple test', () => {
    let view1: any;
    let view2: any;

    beforeAll(() => {
        view1 = createWebview(VIEW_TYPE_1);
        view2 = createWebview(VIEW_TYPE_2);
    });

    afterEach(() => {
        view1.messages = [];
        view1.visible = true;
        view1.messageCallback = undefined;
        view2.messages = [];
        view2.visible = true;
        view2.messageCallback = undefined;
    });

    test('Send notification to a view by type', () => {
        const messenger = new Messenger({ debugLog: true });
        messenger.registerWebviewView(view1);
        messenger.sendNotification(simpleNotification, { type: 'webview', webviewType: VIEW_TYPE_1 }, 'ping');

        expect(view1.messages[0].id).toBeUndefined();
        expect(view1.messages[0]).toMatchObject(
            {
                method: 'notification',
                receiver: {
                    type: 'webview',
                    webviewType: 'test.view.type.1'
                },
                params: 'ping'
            }
        );
    });

    test('Send notification to a view by id', () => {
        const messenger = new Messenger({ debugLog: true });
        messenger.registerWebviewView(view1);
        messenger.sendNotification(simpleNotification, { type: 'webview', webviewId: VIEW_TYPE_1 + '_0' }, 'ping');

        expect(view1.messages[0].id).toBeUndefined();
        expect(view1.messages[0]).toMatchObject(
            {
                method: 'notification',
                receiver: {
                    type: 'webview',
                    webviewId: VIEW_TYPE_1 + '_0'
                },
                params: 'ping'
            }
        );
    });

    test('Send request to a view by type', async () => {
        const messenger = new Messenger();
        messenger.registerWebviewView(view1);

        const response = await messenger.sendRequest(simpleRequest, { type: 'webview', webviewType: VIEW_TYPE_1 }, 'ping');
        expect(response).toBe('result:ping');
    });

    test('Send request to a view by id', async () => {
        const messenger = new Messenger();
        messenger.registerWebviewView(view1);

        const response = await messenger.sendRequest(simpleRequest, { type: 'webview', webviewId: VIEW_TYPE_1 + '_0' }, 'ping');
        expect(response).toBe('result:ping');
    });

    test('Handle notification', () => {
        const messenger = new Messenger();
        messenger.registerWebviewView(view1);
        let handled = '';
        messenger.onNotification(simpleNotification, (params: string) => {
            handled = 'handled:' + params;
        });
        // Simulate webview notification
        view1.messageCallback({ ...simpleNotification, receiver: HOST_EXTENSION, params: 'test' });
        expect(handled).toBe('handled:test');
    });

    test('Handle request', async () => {
        const messenger = new Messenger();
        messenger.registerWebviewView(view1);
        let handled = false;
        messenger.onRequest(simpleRequest, (params: string) => {
            handled = true;
            return 'handled:' + params;
        });
        // Simulate webview request
        await view1.messageCallback({ ...simpleRequest, receiver: HOST_EXTENSION, id: 'fake_req_id', params: 'test' });
        expect(handled).toBe(true);
        expect(view1.messages[0]).toMatchObject({ id: 'fake_req_id', result: 'handled:test' });
    });

    test('Handle request with async handler', async () => {
        const messenger = new Messenger();
        messenger.registerWebviewView(view1);
        let handled = false;
        const delayElapsed = delay(50);
        messenger.onRequest(simpleRequest, async (params: string) => {
            await delayElapsed;
            handled = true;
            return 'handled:' + params;
        });
        // Simulate webview request
        await view1.messageCallback({ ...simpleRequest, receiver: HOST_EXTENSION, id: 'fake_req_id', params: 'test' });
        await delayElapsed;
        expect(handled).toBe(true);
        expect(view1.messages[0]).toMatchObject({ id: 'fake_req_id', result: 'handled:test' });
    });

    test('Handle request with no handler', async () => {
        const messenger = new Messenger();
        messenger.registerWebviewView(view1);
        // Simulate webview request
        await view1.messageCallback({ ...simpleRequest, receiver: HOST_EXTENSION, id: 'fake_req_id', params: 'test' });
        expect(view1.messages[0]).toMatchObject({ id: 'fake_req_id', error: { message: 'Unknown method: request' } });
    });

    test('Do not handle events for hidden view', async () => {
        const messenger = new Messenger();
        view1.visible = false;
        messenger.registerWebviewView(view1);

        // Ignore notifications
        messenger.sendNotification(simpleNotification, { type: 'webview', webviewType: VIEW_TYPE_1 }, 'note');
        expect(view1.messages.length).toBe(0);

        const response = messenger.sendRequest(simpleRequest, { type: 'webview', webviewType: VIEW_TYPE_1 }, 'ping');
        // Reject requests
        await expect(response).rejects.toEqual(new Error('Skipped request for hidden view: test.view.type.1'));
    });

    test('Forward notification to other webview by type', async () => {
        const messenger = new Messenger();
        messenger.registerWebviewView(view1);
        messenger.registerWebviewView(view2);
        // Simulate webview notification
        view1.messageCallback({ ...simpleNotification, receiver: { type: 'webview', webviewType: VIEW_TYPE_2 }, params: 'ping' });

        expect(view2.messages[0].id).toBeUndefined();
        expect(view2.messages[0]).toMatchObject(
            {
                method: 'notification',
                receiver: {
                    type: 'webview',
                    webviewType: 'test.view.type.2'
                },
                params: 'ping'
            }
        );
    });

    test('Forward notification to other webview by id', async () => {
        const messenger = new Messenger();
        messenger.registerWebviewView(view1);
        messenger.registerWebviewView(view2);
        // Simulate webview notification
        view1.messageCallback({ ...simpleNotification, receiver: { type: 'webview', webviewId: VIEW_TYPE_2 + '_1' }, params: 'ping' });

        expect(view2.messages[0].id).toBeUndefined();
        expect(view2.messages[0]).toMatchObject(
            {
                method: 'notification',
                receiver: {
                    type: 'webview',
                    webviewId: VIEW_TYPE_2 + '_1'
                },
                params: 'ping'
            }
        );
    });

    test('Forward request to other webview by type', async () => {
        const messenger = new Messenger();
        messenger.registerWebviewView(view1);
        messenger.registerWebviewView(view2);
        view2.responseReceiver = { type: 'webview', webviewType: VIEW_TYPE_1 };
        // Simulate webview request
        await view1.messageCallback({ ...simpleRequest, receiver: { type: 'webview', webviewType: VIEW_TYPE_2 }, id: 'fake_req_id', params: 'test' });

        expect(view2.messages[0]).toMatchObject(
            {
                id: 'fake_req_id',
                method: 'request',
                receiver: {
                    type: 'webview',
                    webviewType: 'test.view.type.2'
                },
                params: 'test'
            }
        );
        await waitAsync();
        expect(view1.messages[0]).toMatchObject(
            {
                id: 'fake_req_id',
                receiver: {
                    type: 'webview',
                    webviewType: 'test.view.type.1'
                },
                result: 'result:test'
            }
        );
    });

    test('Forward request to other webview by id', async () => {
        const messenger = new Messenger();
        messenger.registerWebviewView(view1);
        messenger.registerWebviewView(view2);
        view2.responseReceiver = { type: 'webview', webviewId: VIEW_TYPE_1 + '_0' };
        // Simulate webview request
        await view1.messageCallback({ ...simpleRequest, receiver: { type: 'webview', webviewId: VIEW_TYPE_2 + '_1' }, id: 'fake_req_id', params: 'test' });

        expect(view2.messages[0]).toMatchObject(
            {
                id: 'fake_req_id',
                method: 'request',
                receiver: {
                    type: 'webview',
                    webviewId: VIEW_TYPE_2 + '_1'
                },
                params: 'test'
            }
        );
        await waitAsync();
        expect(view1.messages[0]).toMatchObject(
            {
                id: 'fake_req_id',
                receiver: {
                    type: 'webview',
                    webviewId: VIEW_TYPE_1 + '_0'
                },
                result: 'result:test'
            }
        );
    });

    test('Handle handler error', async () => {
        const messenger = new Messenger();
        messenger.registerWebviewView(view1);

        messenger.onRequest(simpleRequest, (params: string, sender: MessageParticipant) => {
            throw new Error('Failed to handle request');
        });
        // Simulate webview request
        await view1.messageCallback({ ...simpleRequest, receiver: HOST_EXTENSION, id: 'fake_req_id', params: 'test' });
        expect(view1.messages[0]).toMatchObject(
            {
                id: 'fake_req_id',
                error: {
                    message:'Failed to handle request'
                }
            }
        );
    });

    test('Broadcast notification to all webviews', () => {
        const messenger = new Messenger({ debugLog: true });
        messenger.registerWebviewView(view1);
        messenger.registerWebviewView(view2);
        messenger.sendNotification(simpleNotification, BROADCAST, 'ping');

        expect(view1.messages[0]).toMatchObject(
            {
                method: 'notification',
                receiver: {
                    type: 'broadcast'
                },
                params: 'ping'
            }
        );
        expect(view2.messages[0]).toMatchObject(
            {
                method: 'notification',
                receiver: {
                    type: 'broadcast'
                },
                params: 'ping'
            }
        );
    });

    test('Broadcast from one webview to extension and other webview', async () => {
        const messenger = new Messenger();
        messenger.registerWebviewView(view1);
        messenger.registerWebviewView(view2);

        let handled = '';
        messenger.onNotification(simpleNotification, (params: string) => {
            handled = 'handled:' + params;
        });
        // Simulate webview notification
        view1.messageCallback({ ...simpleNotification, receiver: BROADCAST, params: 'ping' });

        expect(handled).toBe('handled:ping');
        expect(view2.messages[0]).toMatchObject(
            {
                method: 'notification',
                receiver: {
                    type: 'broadcast'
                },
                params: 'ping'
            }
        );
    });

});

function delay(delay: number): Promise<void> {
    return new Promise<void>(resolve => setTimeout(resolve, delay));
}

async function waitAsync(n = 1): Promise<void> {
    if (n > 0) {
        await waitAsync(n - 1);
        return new Promise<void>(resolve => setImmediate(resolve));
    }
}
