/******************************************************************************
 * Copyright 2022 TypeFox GmbH
 * This program and the accompanying materials are made available under the
 * terms of the MIT License, which is available in the project root.
 ******************************************************************************/

/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-unused-vars */

import { Event } from 'vscode';
import { isRequestMessage, NotificationType, RequestType } from 'vscode-messenger-common';
import { Messenger } from '../src';

const TEST_VIEW_TYPE = 'test.view.type';

const simpleNotification: NotificationType<string> = { method: 'notification' };
const simpleRequest: RequestType<string, string> = { method: 'request' };

describe('Simple test', () => {
    let webView: any;

    beforeAll(() => {
        webView = {
            viewType: TEST_VIEW_TYPE,
            webview: {
                onDidReceiveMessage: (event: Event<string>) => {
                    webView.receiver.push(event);
                    return;
                },
                postMessage: (message: any) => {
                    webView.messages.push(message);
                    webView.receiver.forEach((element: any) => {
                        if (isRequestMessage(message)) {
                            element(message);
                            element({ id: message.id, result: 'result:' + message.params });
                        } else {
                            element(message);
                        }
                    });
                    return true;
                }
            },
            onDidDispose: () => {
                webView.receiver = [];
                webView.messages = [];
                return;
            },
            visible: true,
            onDidChangeVisibility: undefined,
            show: (preserveFocus?: boolean) => {
                throw new Error('Function not implemented.');
            },
            messages: [],
        };
    });

    afterEach(() => {
        webView.messages = [];
        webView.visible = true;
    });

    test('Send notification to a View', () => {

        const messenger = new Messenger({ debugLog: true });
        messenger.registerWebviewView(webView);
        messenger.sendNotification(simpleNotification, { webviewType: TEST_VIEW_TYPE }, 'ping');

        expect(webView.messages[0].id).toBeUndefined();
        expect(webView.messages[0]).toMatchObject(
            {
                method: 'notification',
                receiver: {
                    webviewType: 'test.view.type'
                },
                params: 'ping'
            }
        );
    });

    test('Send request to a View', async () => {
        const messenger = new Messenger();
        messenger.registerWebviewView(webView);

        expect(await messenger.sendRequest(simpleRequest, { webviewType: TEST_VIEW_TYPE }, 'ping')).toBe('result:ping');
    });

    test('Handle notification', () => {
        const messenger = new Messenger();
        messenger.registerWebviewView(webView);
        let handled = '';
        messenger.onNotification(simpleNotification, (params: string) => {
            handled = 'handled:' + params;
        });
        // simulate webview note
        webView.webview.postMessage({ ...simpleNotification, params: 'test' });
        expect(handled).toBe('handled:test');
    });

    test('Handle request', async () => {
        const messenger = new Messenger();
        messenger.registerWebviewView(webView);
        let handled = false;
        messenger.onRequest(simpleRequest, (params: string) => {
            handled = true;
            return 'handled:' + params;
        });
        // simulate webview request
        await webView.webview.postMessage({ ...simpleRequest, id: 'fake_req_id', params: 'test' });
        expect(handled).toBe(true);
        expect(webView.messages[1]).toMatchObject({ id: 'fake_req_id', result: 'handled:test' });
    });

    test('Handle request async handler', async () => {
        const messenger = new Messenger();
        messenger.registerWebviewView(webView);
        let handled = false;
        const promise = new Promise<void>((resolve, reject) => {
            setTimeout(()=> {
                resolve();
            }, 50);});
        messenger.onRequest(simpleRequest, async (params: string) => {
            await promise;
            handled = true;
            return 'handled:' + params;
        });
        // simulate webview request
        await webView.webview.postMessage({ ...simpleRequest, id: 'fake_req_id', params: 'test' });
        await promise;
        expect(handled).toBe(true);
        // TODO do it better here
        // wait for post massage again to get the response msg
        await webView.webview.postMessage({ ...simpleNotification, id: 'fake_note_id', params: 'test' });
        expect(webView.messages[2]).toMatchObject({ id: 'fake_req_id', result: 'handled:test' });
    });

    test('Do not handle events for hidden view', async () => {
        const messenger = new Messenger();
        webView.visible = false;
        messenger.registerWebviewView(webView);

        // ignore notifications
        messenger.sendNotification(simpleNotification, { webviewType: TEST_VIEW_TYPE }, 'note');
        expect(webView.messages.length).toBe(0);

        // reject requests
        await expect(messenger.sendRequest(simpleRequest, { webviewType: TEST_VIEW_TYPE }, 'ping'))
            .rejects.toEqual({ error: 'Skip request for hidden view: test.view.type' });
    });
});
