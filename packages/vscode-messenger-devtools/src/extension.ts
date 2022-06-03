/******************************************************************************
 * Copyright 2022 TypeFox GmbH
 * This program and the accompanying materials are made available under the
 * terms of the MIT License, which is available in the project root.
 */
import * as vscode from 'vscode';
export function activate(context: vscode.ExtensionContext) {
    console.log('Messenger Devtools activated.');

    const disposable = vscode.commands.registerCommand('vscode-messenger-devtools.helloWorld', () => {
        vscode.window.showInformationMessage('Hello World from vscode-messenger-devtools!');
    });

    context.subscriptions.push(disposable);
}

// this method is called when your extension is deactivated
/*
export function deactivate() {

}
*/