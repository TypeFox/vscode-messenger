/******************************************************************************
 * Copyright 2022 TypeFox GmbH
 * This program and the accompanying materials are made available under the
 * terms of the MIT License, which is available in the project root.
 ******************************************************************************/

/* eslint-disable @typescript-eslint/no-unused-vars */

import { JsonAny, NotificationType } from 'vscode-messenger-common';
import { Messenger, VsCodeApi } from '../src';

const simpleNotification: NotificationType<string> = { method: 'simpleNotification' };

describe('Simple test', () => {
    let vsCodeApi: VsCodeApi & { messages: JsonAny[] };

    beforeAll(() => {
        window.addEventListener('message', event => {
            console.log(event);
        });
        vsCodeApi = {
            postMessage: (message: JsonAny) => {
                vsCodeApi.messages.push(message);
                return;
            },
            getState: () => { return; },
            setState: () => { return; },
            messages: []
        };
    });

    test('Send notification to extension', async () => {

        const messenger = new Messenger(vsCodeApi);
        messenger.start();
        messenger.sendNotification(simpleNotification, {}, 'ping');
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const message = vsCodeApi.messages[0] as unknown as any;
        delete message.id;
        expect(message).toMatchObject(
            {
                method: 'simpleNotification',
                receiver: '{}',
                params: '"ping"'
            }
        );
    });
});
