/******************************************************************************
 * Copyright 2022 TypeFox GmbH
 * This program and the accompanying materials are made available under the
 * terms of the MIT License, which is available in the project root.
 ******************************************************************************/

/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-unused-vars */

import crypto from 'crypto';
import { CancellationTokenImpl, createCancelRequestMessage, Disposable, HOST_EXTENSION, isRequestMessage, Message, MessageParticipant, NotificationType, RequestType } from 'vscode-messenger-common';
import { createCancellationToken, Messenger, VsCodeApi } from '../src';

Object.defineProperty(globalThis, 'crypto', {
    value: {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
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
                }, 100);
            });
            return 'handled:' + await promise;
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
        new Messenger(vsCodeApi).onRequest(stringRequest, async (param: string, sender, cancelation) => {
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
        }).start();

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
});
