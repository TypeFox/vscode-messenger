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
    });

    test('Send notification to a View', () => {

        const messenger = new Messenger();
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

    test('Handle request', () => {
        const messenger = new Messenger();
        messenger.registerWebviewView(webView);
        let handled = false;
        messenger.onRequest(simpleRequest, (params: string) => {
            handled = true;
            return 'handled:' + params;
        });
        // simulate webview request
        webView.webview.postMessage({ ...simpleRequest, id: 'fake_req_id', params: 'test' });
        expect(handled).toBe(true);
        expect(webView.messages[1]).toMatchObject({ id: 'fake_req_id', result: 'handled:test' });
    });
});