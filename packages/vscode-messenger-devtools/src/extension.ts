/******************************************************************************
 * Copyright 2022 TypeFox GmbH
 * This program and the accompanying materials are made available under the
 * terms of the MIT License, which is available in the project root.
 */

import * as vscode from 'vscode';
import { ExtensionInfo, isMessengerDiagnostic, Messenger, MessengerDiagnostic, MessengerEvent } from 'vscode-messenger';
import { MessagesPanel, WEBVIEW_TYPE } from './panels/MessagesPanel';

const msg = new Messenger({ debugLog: true });
const listeners = new Map<string, vscode.Disposable>();

export function activate(context: vscode.ExtensionContext) {

    context.subscriptions.push(vscode.commands.registerCommand('vscode-messenger-devtools.activate', (..._args) => {
        const panel = MessagesPanel.render(context.extensionUri);
        msg.registerWebviewPanel(panel);
        const disposable = msg.onRequest<{ refresh: boolean }, ExtensionData[]>({ method: 'extensionList' }, (params, _sender) => {
            return compatibleExtensions().map(ext => {
                if (params?.refresh) {
                    listenToNotification(ext);
                }
                const supportedApi = ext.isActive && isMessengerDiagnostic(ext.exports);
                return {
                    id: ext.id,
                    name: ext.packageJSON?.displayName ?? ext.id,
                    active: ext.isActive,
                    exportsDiagnosticApi: supportedApi,
                    info: supportedApi ? getExtensionInfo(ext) : undefined
                } as ExtensionData;
            });
        });
        panel.onDidDispose(() =>
            disposable.dispose()
        );
    }));

    context.subscriptions.push(vscode.extensions.onDidChange(_e => {
        listenToNotifications(compatibleExtensions());
    }));

    setImmediate(() => {
        listenToNotifications(compatibleExtensions());
    });
    console.debug('Messenger Devtools activated.');
    return msg.diagnosticApi();
}

export function deactivate(): void {
    listeners.forEach(listener => listener.dispose());
    listeners.clear();
    console.debug('Messenger Devtools deactivated.');
}

function diagnosticApi(ext: vscode.Extension<unknown>): MessengerDiagnostic | undefined {
    if (!ext.isActive) {
        return undefined;
    }
    return isMessengerDiagnostic(ext.exports) ? ext.exports : undefined;
}

function getExtensionInfo(ext: vscode.Extension<unknown>): ExtensionInfo | undefined {
    const publicApi = diagnosticApi(ext);
    return publicApi ? publicApi.extensionInfo() : undefined;
}

function compatibleExtensions(): Array<vscode.Extension<unknown>> {
    const extensions = vscode.extensions.all;
    return extensions.filter(ext => {
        const deps = ext.packageJSON?.dependencies;
        if (deps && deps['vscode-messenger']) {
            return true;
        }
        return false;
    });
}

function listenToNotifications(messengerExts: Array<vscode.Extension<unknown>>): void {
    messengerExts.forEach(ext => listenToNotification(ext));
}

function listenToNotification(extension: vscode.Extension<unknown>): void {
    console.debug(`Extension '${extension.id}' uses vscode-messenger. Extension active: ${extension.isActive}`);
    const publicApi = diagnosticApi(extension);
    if (publicApi && !listeners.has(extension.id)) {
        const eventListener = (event: MessengerEvent) => {
            if (event.method !== 'pushData')
                msg.sendNotification({ method: 'pushData' }, { type: 'webview', webviewType: WEBVIEW_TYPE }, { extension: extension.id, event });
        };
        listeners.set(extension.id, publicApi.addEventListener(eventListener));
        console.debug(`Attached diagnostic listener to '${extension.id}'`);
    }
    if (!extension.isActive && listeners.has(extension.id)) {
        // clean up if an extension was deactivated
        listeners.get(extension.id)!.dispose();
        listeners.delete(extension.id);
    }

}
interface ExtensionData {
    id: string
    name: string
    active: boolean
    exportsDiagnosticApi: boolean
    info?: ExtensionInfo
    events?: MessengerEvent[]
}
