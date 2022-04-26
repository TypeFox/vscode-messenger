/******************************************************************************
 * Copyright 2022 TypeFox GmbH
 * This program and the accompanying materials are made available under the
 * terms of the MIT License, which is available in the project root.
 ******************************************************************************/

/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-unused-vars */

import { Event } from 'vscode';
import { NotificationType } from 'vscode-messenger-common';
import { Messenger } from '../src';

const TEST_VIEW_TYPE = 'test.view.type';
const simpleNotification: NotificationType<string> = { method: 'simpleNotification' };

describe('Simple test', () => {
    let webView: any;

    beforeAll(() => {
        webView = {
            viewType: TEST_VIEW_TYPE,
            webview: {
                onDidReceiveMessage: (event: Event<string>) => {
                    webView.receivedMassages.push(event);
                    return;
                },
                postMessage: (message: any) => {
                    webView.messages.push(message);
                    return true;
                }
            },
            onDidDispose: () => {
                webView.receivedMassages = [];
                webView.messages = [];
                return;
            },
            visible: false,
            onDidChangeVisibility: undefined,
            show: (preserveFocus?: boolean) => {
                throw new Error('Function not implemented.');
            },
            eventListener: [],
            messages: [],
        };
    });

    test('Send notification to a View', async () => {

        const messenger = new Messenger();
        messenger.registerWebviewView(webView);
        messenger.sendNotification(simpleNotification, { webviewType: TEST_VIEW_TYPE }, 'ping');

        expect(webView.messages[0]).toMatchObject(
            {
                id: 'msgId_0',
                method: 'simpleNotification',
                receiver: {
                    webviewType: 'test.view.type'
                },
                params: 'ping'
            }
        );
    });
});
