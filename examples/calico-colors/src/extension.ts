/**
 * See https://github.com/Microsoft/vscode-extension-samples/tree/main/webview-view-sample
 */

import * as vscode from 'vscode';
import { Messenger, MessengerDiagnostic } from 'vscode-messenger';
import { ColorsViewProvider } from './calico-colors-view';
import { CatCodingPanel, getWebviewOptions } from './cat-coding-view';

export function activate(context: vscode.ExtensionContext) {
	const messenger = new Messenger();

	// Calico colors view
	const provider = new ColorsViewProvider(context.extensionUri, messenger);

	context.subscriptions.push(
		vscode.window.registerWebviewViewProvider(ColorsViewProvider.viewType, provider));

	context.subscriptions.push(
		vscode.commands.registerCommand('calicoColors.addColor', () => {
			provider.addColor();
		}));

	context.subscriptions.push(
		vscode.commands.registerCommand('calicoColors.clearColors', () => {
			provider.clearColors();
		}));

	// Coding cat view
	context.subscriptions.push(
		vscode.commands.registerCommand('catCoding.start', () => {
			CatCodingPanel.createOrShow(context.extensionUri, messenger);
		})
	);

	context.subscriptions.push(
		vscode.commands.registerCommand('catCoding.doRefactor', () => {
			if (CatCodingPanel.currentPanel) {
				CatCodingPanel.currentPanel.doRefactor();
			}
		})
	);

	if (vscode.window.registerWebviewPanelSerializer) {
		// Make sure we register a serializer in activation event
		vscode.window.registerWebviewPanelSerializer(CatCodingPanel.viewType, {
			async deserializeWebviewPanel(webviewPanel: vscode.WebviewPanel, state: any) {
				console.log(`Got state: ${state}`);
				// Reset the webview options so we use latest uri for `localResourceRoots`.
				webviewPanel.webview.options = getWebviewOptions(context.extensionUri);
				CatCodingPanel.revive(webviewPanel, context.extensionUri, messenger);
			}
		});
	}

	// Diagnostic registration
	const diagnostics = messenger.diagnosticApi({ withParameterData: true });
	return {
		...diagnostics,
		addEventListener: (listener) => {
			// wrap listener to change the `method` to also contain the passed parameter 
			return diagnostics.addEventListener((e) => {
				if (e.method === 'colorSelected') {
					e.method = `colorSelected(${JSON.stringify(e.parameter)})`;
				}
				listener(e);
			});
		}
	} as MessengerDiagnostic;
}
