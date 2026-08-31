/******************************************************************************
 * Copyright 2022 TypeFox GmbH
 * This program and the accompanying materials are made available under the
 * terms of the MIT License, which is available in the project root.
 ******************************************************************************/

/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-unused-vars */

import type { Disposable, MessageParticipant, NotificationType, RequestType, WebviewTypeMessageParticipant } from 'vscode-messenger-common';
import { BROADCAST, CancellationTokenImpl, createCancelRequestMessage, HOST_EXTENSION, isCancelRequestNotification, isRequestMessage } from 'vscode-messenger-common';
import type { MessengerEvent } from '../src/diagnostic-api';
import { Messenger } from '../src/messenger';

const VIEW_TYPE_1 = 'test.view.type.1';
const VIEW_TYPE_2 = 'test.view.type.2';
const FORCE_HANDLER_TO_WAIT_PARAM = 'wait';

const simpleNotification: NotificationType<string> = { method: 'notification' };
const simpleRequest: RequestType<string, string> = { method: 'request' };

function createWebview(viewType: string) {
    const view: any = {
        handlerTimeout: undefined,
        disposeCallback: undefined,
        viewType,
        webview: {
            onDidReceiveMessage: (callback: (msg: unknown) => void) => {
                view.messageCallback = callback;
            },
            postMessage: async (message: any): Promise<boolean> => {
                view.messages.push(message);
                if (isRequestMessage(message)) {
                    const callback = () => view.messageCallback({ receiver: view.responseReceiver, id: message.id, result: 'result:' + message.params });
                    if (message.params === FORCE_HANDLER_TO_WAIT_PARAM) {
                        let timeOut: NodeJS.Timeout;
                        await new Promise((resolve, reject) => {
                            view.handlerReject = reject;
                            timeOut = setTimeout(() => {
                                if (view.messageCallback) {
                                    callback();
                                }
                                resolve('resolved');
                            }, 500);
                        }).catch((error) => clearTimeout(timeOut));
                    } else {
                        callback();
                    }
                } else if (isCancelRequestNotification(message)) {
                    view.handlerReject('Canceled by CancelRequestNotification');
                }
                return Promise.resolve(true);
            }
        },
        onDidDispose: (callback: () => void) => {
            view.disposeCallback = callback;
            return { dispose: () => undefined };
        },
        dispose: () => {
            if (view.disposeCallback) {
                view.disposeCallback();
            }
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

describe('Extension Messenger', () => {
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

    test('Handle notification with multiple handlers', () => {
        const messenger = new Messenger();
        messenger.registerWebviewView(view1);
        let handled1 = '';
        messenger.onNotification(simpleNotification, (params: string) => {
            handled1 = 'handled1:' + params;
        });
        let handled2 = '';
        messenger.onNotification(simpleNotification, (params: string) => {
            handled2 = 'handled2:' + params;
        });
        // Simulate webview notification
        view1.messageCallback({ ...simpleNotification, receiver: HOST_EXTENSION, params: 'test' });
        expect(handled1).toBe('handled1:test');
        expect(handled2).toBe('handled2:test');
    });

    test('Handle notification after removing a handler', () => {
        const messenger = new Messenger();
        messenger.registerWebviewView(view1);
        let handled1 = '';
        const remove1 = messenger.onNotification(simpleNotification, (params: string) => {
            handled1 = 'handled1:' + params;
        });
        let handled2 = '';
        messenger.onNotification(simpleNotification, (params: string) => {
            handled2 = 'handled2:' + params;
        });
        remove1.dispose();
        // Simulate webview notification
        view1.messageCallback({ ...simpleNotification, receiver: HOST_EXTENSION, params: 'test' });
        expect(handled1).toBe('');
        expect(handled2).toBe('handled2:test');
    });

    test('Handle notification with sender filter', () => {
        const messenger = new Messenger();
        const p1 = messenger.registerWebviewView(view1);
        const p2 = messenger.registerWebviewView(view2);
        let handled1 = '';
        messenger.onNotification(simpleNotification, (params: string) => {
            handled1 = 'handled1:' + params;
        }, { sender: p1 });
        let handled2 = '';
        messenger.onNotification(simpleNotification, (params: string) => {
            handled2 = 'handled2:' + params;
        }, { sender: p2 });
        // Simulate webview notification
        view1.messageCallback({ ...simpleNotification, receiver: HOST_EXTENSION, params: 'test' });
        expect(handled1).toBe('handled1:test');
        expect(handled2).toBe('');
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
        // suppress warn logging: "Received request with unknown method: request"
        const warn = jest.spyOn(console, 'warn').mockImplementation(() => null);

        const messenger = new Messenger();
        messenger.registerWebviewView(view1);
        // Simulate webview request
        await view1.messageCallback({ ...simpleRequest, receiver: HOST_EXTENSION, id: 'fake_req_id', params: 'test' });
        expect(view1.messages[0]).toMatchObject({ id: 'fake_req_id', error: { message: 'Unknown method: request' } });
        warn.mockRestore();
    });

    test('Handle request with multiple handlers', async () => {
        const messenger = new Messenger();
        messenger.registerWebviewView(view1);
        messenger.onRequest(simpleRequest, (params: string) => {
            return 'handled1:' + params;
        });
        // Registering a second overlapping request handler for the same method throws immediately.
        expect(() => messenger.onRequest(simpleRequest, (params: string) => {
            return 'handled2:' + params;
        })).toThrow("A request handler is already registered for method 'request' with an overlapping sender scope "
            + '(existing: undefined, new: undefined). '
            + 'Only one request handler is allowed per method and sender scope; dispose the existing handler first or use a non-overlapping sender.');
    });

    test('Registering an onRequest handler for a method already used by onNotification throws', () => {
        const messenger = new Messenger();
        messenger.registerWebviewView(view1);
        messenger.onNotification(simpleRequest, () => undefined);
        expect(() => messenger.onRequest(simpleRequest, (params: string) => 'handled:' + params))
            .toThrow("Cannot register a request handler for method 'request': a notification handler is already registered for the same method. "
                + 'A method must be used exclusively for requests or for notifications.');
    });

    test('Registering an onNotification handler for a method already used by onRequest throws', () => {
        const messenger = new Messenger();
        messenger.registerWebviewView(view1);
        messenger.onRequest(simpleRequest, (params: string) => 'handled:' + params);
        expect(() => messenger.onNotification(simpleRequest, () => undefined))
            .toThrow("Cannot register a notification handler for method 'request': a request handler is already registered for the same method. "
                + 'A method must be used exclusively for requests or for notifications.');
    });

    test('Registering two request handlers with the same webviewId sender scope throws', () => {
        const messenger = new Messenger();
        messenger.registerWebviewView(view1);
        const sender: MessageParticipant = { type: 'webview', webviewId: 'asdf' };
        messenger.onRequest(simpleRequest, (params: string) => 'handled1:' + params, { sender });
        expect(() => messenger.onRequest(simpleRequest, (params: string) => 'handled2:' + params, { sender }))
            .toThrow("A request handler is already registered for method 'request' with an overlapping sender scope "
                + '(existing: asdf, new: asdf). '
                + 'Only one request handler is allowed per method and sender scope; dispose the existing handler first or use a non-overlapping sender.');
    });

    test('Registering two request handlers with the same webviewType sender scope throws', () => {
        const messenger = new Messenger();
        messenger.registerWebviewView(view1);
        const sender: MessageParticipant = { type: 'webview', webviewType: 'asdf' };
        messenger.onRequest(simpleRequest, (params: string) => 'handled1:' + params, { sender });
        expect(() => messenger.onRequest(simpleRequest, (params: string) => 'handled2:' + params, { sender }))
            .toThrow("A request handler is already registered for method 'request' with an overlapping sender scope "
                + '(existing: asdf, new: asdf). '
                + 'Only one request handler is allowed per method and sender scope; dispose the existing handler first or use a non-overlapping sender.');
    });

    test('With uniqueHandlers enabled, a second handler for the same method always throws', () => {
        const messenger = new Messenger({ uniqueHandlers: true });
        messenger.registerWebviewView(view1);
        messenger.onNotification(simpleNotification, () => undefined);
        expect(() => messenger.onNotification(simpleNotification, () => undefined))
            .toThrow("A message handler is already registered for method 'notification'. Registering more than one handler "
                + "for the same method is not allowed because the 'uniqueHandlers' option is enabled.");
    });

    test('Disposing a conflicting request handler allows re-registering an overlapping one', () => {
        const messenger = new Messenger();
        messenger.registerWebviewView(view1);
        const disposable = messenger.onRequest(simpleRequest, (params: string) => 'handled1:' + params);
        disposable.dispose();
        // Same (undefined) sender scope as the disposed handler - should not throw now.
        expect(() => messenger.onRequest(simpleRequest, (params: string) => 'handled2:' + params)).not.toThrow();
    });

    test('Handle request with multiple handlers, but none matching', async () => {
        // suppress "No request handler for request matching sender" warn logging
        const warn = jest.spyOn(console, 'warn').mockImplementation(() => null);

        const messenger = new Messenger();
        messenger.registerWebviewView(view1);
        messenger.onRequest(simpleRequest, (params: string) => {
            return 'handled1:' + params;
        }, { sender: { type: 'webview', webviewId: 'asdf' } });
        messenger.onRequest(simpleRequest, (params: string) => {
            return 'handled2:' + params;
        }, { sender: { type: 'webview', webviewType: 'asdf' } });
        // Simulate webview request
        await view1.messageCallback({ ...simpleRequest, receiver: HOST_EXTENSION, id: 'fake_req_id', params: 'test' });
        expect(view1.messages[0]).toMatchObject({ id: 'fake_req_id', error: { message: 'No matching request handler' } });

        warn.mockRestore();
    });

    test('Handle request with multiple handlers, only one matching', async () => {
        const messenger = new Messenger();
        const p1 = messenger.registerWebviewView(view1);
        messenger.onRequest(simpleRequest, (params: string) => {
            return 'handled1:' + params;
        }, { sender: { type: 'webview', webviewId: 'asdf' } });
        messenger.onRequest(simpleRequest, (params: string) => {
            return 'handled2:' + params;
        }, { sender: p1 });
        // Simulate webview request
        await view1.messageCallback({ ...simpleRequest, receiver: HOST_EXTENSION, id: 'fake_req_id', params: 'test' });
        expect(view1.messages[0]).toMatchObject({ id: 'fake_req_id', result: 'handled2:test' });
    });

    test('Remove handlers associated with disposed webview', () => {
        const messenger = new Messenger();
        const p1 = messenger.registerWebviewView(view1);
        const p2 = messenger.registerWebviewView(view2);

        messenger.onNotification(simpleNotification, () => undefined, { sender: p1 });
        messenger.onNotification(simpleNotification, () => undefined, { sender: p2 });
        messenger.onNotification(simpleNotification, () => undefined);

        const beforeDispose = (messenger as any).handlerRegistry.get(simpleNotification.method);
        expect(beforeDispose).toBeDefined();
        expect(beforeDispose.length).toBe(3);

        view1.dispose();

        const afterDispose = (messenger as any).handlerRegistry.get(simpleNotification.method);
        expect(afterDispose).toBeDefined();
        expect(afterDispose.length).toBe(2);
        expect(afterDispose.every((registration: any) => !registration.sender || registration.sender.webviewId !== p1.webviewId)).toBe(true);
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
                    message: 'Failed to handle request'
                }
            }
        );
    });

    test('Handle async handler error and diagnostic API', async () => {
        const messenger = new Messenger();
        messenger.registerWebviewView(view1);
        messenger.onRequest(simpleRequest, async (params: string, sender: MessageParticipant) => {
            throw new Error('Failed to handle request');
        });

        // Track diagnostic events
        const diagnosticEvents: MessengerEvent[] = [];
        messenger.diagnosticApi().addEventListener((event) => diagnosticEvents.push(event));

        // Simulate webview request
        await view1.messageCallback({ ...simpleRequest, receiver: HOST_EXTENSION, id: 'fake_req_id', params: 'test' });

        // check response error
        expect(view1.messages[0]).toMatchObject(
            {
                id: 'fake_req_id',
                error: {
                    message: 'Failed to handle request'
                }
            }
        );
        // check diagnostic event
        expect(diagnosticEvents[1]).toMatchObject(
            {
                error: 'Failed to handle request',
                id: 'fake_req_id',
                receiver: 'test.view.type.1_0',
                sender: 'host extension',
                type: 'response',
            }
        );
    });

    test('Broadcast notification to all webviews', () => {
        const messenger = new Messenger({ debugLog: true });
        messenger.registerWebviewView(view1, { broadcastMethods: [simpleNotification.method] });
        messenger.registerWebviewView(view2, { broadcastMethods: [] });
        messenger.sendNotification(simpleNotification, BROADCAST, 'ping');

        expect(view1.messages.length).toBe(1);
        expect(view1.messages[0]).toMatchObject(
            {
                method: 'notification',
                receiver: {
                    type: 'broadcast'
                },
                params: 'ping'
            }
        );
        expect(view2.messages.length).toBe(0);
    });

    test('Broadcast from one webview to extension and other webview', async () => {
        const messenger = new Messenger();
        messenger.registerWebviewView(view1, { broadcastMethods: [simpleNotification.method] });
        messenger.registerWebviewView(view2, { broadcastMethods: [simpleNotification.method] });

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

    test('Cancel request-handler', async () => {
        const messenger = new Messenger();
        messenger.registerWebviewView(view1);
        const cancel: CancellationTokenImpl = new CancellationTokenImpl();
        setTimeout(() =>
            cancel.cancel('Test cancel'), 300);
        await messenger.sendRequest(simpleRequest, ViewParticipant(VIEW_TYPE_1), FORCE_HANDLER_TO_WAIT_PARAM, cancel)
            .then(() => {
                throw new Error('Expected to throw error');
            }).catch((error) => {
                expect(error.message).toBe('Test cancel');
            });
        // check the internal cancelation listener attached in `sendRequestToWebview` was removed
        expect((cancel as any).listeners.length).toBe(0);
    });

    test('Cancel request - no reason', async () => {
        const messenger = new Messenger();
        messenger.registerWebviewView(view1);
        const cancel: CancellationTokenImpl = new CancellationTokenImpl();
        setTimeout(() =>
            cancel.cancel(), 300);
        await messenger.sendRequest(simpleRequest, ViewParticipant(VIEW_TYPE_1), FORCE_HANDLER_TO_WAIT_PARAM, cancel)
            .then(() => {
                throw new Error('Expected to throw error');
            }).catch((error) => {
                expect(error.message).toBe('');
            });
        // check the internal cancelation listener attached in `sendRequestToWebview` was removed
        expect((cancel as any).listeners.length).toBe(0);
    });

    test('Handle cancel request', async () => {
        const messenger = new Messenger();
        messenger.registerWebviewView(view1);
        let started = false;
        let handled = false;
        const toDispose: Disposable[] = [];
        messenger.onRequest(simpleRequest, async (params: string, sender, cancelation) => {
            let timeOut: any;
            toDispose.push(cancelation.onCancellationRequested(() => {
                clearTimeout(timeOut);
            }));
            started = true;
            // simulate work in progress
            await new Promise<void>(resolve => {
                timeOut = setTimeout(resolve, 1000);
            });
            handled = true;
            return 'handled:' + params;
        });
        // Simulate webview request
        view1.messageCallback({ ...simpleRequest, receiver: HOST_EXTENSION, id: 'fake_req_id', params: 'test' });

        // Send cancel notification
        const cancelMsg = createCancelRequestMessage(HOST_EXTENSION, { msgId: 'fake_req_id' });
        await view1.messageCallback(cancelMsg);

        toDispose.forEach(disposable => disposable.dispose());
        expect(started).toBe(true);
        expect(handled).toBe(false);
        expect(view1.messages[0]).toBeUndefined(); // don't expect cancelation succeed
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

function ViewParticipant(type: string): WebviewTypeMessageParticipant {
    return { type: 'webview', webviewType: type };
}