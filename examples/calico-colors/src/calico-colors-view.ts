/* eslint-disable */
import * as vscode from 'vscode';
import { Messenger } from 'vscode-messenger';
import { NotificationType, RequestType } from "vscode-messenger-common";

// Calico colors view
export const colorSelectType: NotificationType<string> = { method: 'colorSelected' };
export const colorModifyType: NotificationType<string> = { method: 'colorModify' };
export const availableColorsType: RequestType<string, string[]> = { method: 'availableColor' };


export class ColorsViewProvider implements vscode.WebviewViewProvider {

    public static readonly viewType = 'calicoColors.colorsView';

    private _view?: vscode.WebviewView;


    constructor(
        private readonly _extensionUri: vscode.Uri, private readonly messenger: Messenger) {
    }

    public resolveWebviewView(
        webviewView: vscode.WebviewView,
        context: vscode.WebviewViewResolveContext,
        _token: vscode.CancellationToken,
    ) {
        this._view = webviewView;

        webviewView.webview.options = {
            // Allow scripts in the webview
            enableScripts: true,

            localResourceRoots: [
                this._extensionUri
            ]
        };

        webviewView.webview.html = this._getHtmlForWebview(webviewView.webview);

        this.messenger.registerWebviewView(webviewView);

        const disposables: vscode.Disposable[] = [];

        // re-act on view notification when a color was selected
        disposables.push(this.messenger.onNotification<string>(colorSelectType, (params: string) => {
            vscode.window.activeTextEditor?.insertSnippet(new vscode.SnippetString(`#${params}`));
        }));

        // Additional functionality to demonstrate request handler
        disposables.push(this.messenger.onRequest(availableColorsType, async (params: string) => {
            return ['020202', 'f1eeee', 'a85b20', 'daab70', 'efcb99'];
        }));
        webviewView.onDidDispose(() => disposables.forEach(disposable => disposable.dispose()));
    }

    public addColor() {
        if (this._view) {
            this._view.show?.(true); // `show` is not implemented in 1.49 but is for 1.50 insiders
            this.sendNotificationToView('add');
        }
    }

    public clearColors() {
        if (this._view) {
            this.sendNotificationToView('clear');
        }
    }

    private sendNotificationToView(params: string): void {
        this.messenger.sendNotification(colorModifyType, { type: 'webview', webviewType: ColorsViewProvider.viewType }, params);
    }

    private _getHtmlForWebview(webview: vscode.Webview) {
        // Get the local path to main script run in the webview, then convert it to a uri we can use in the webview.
        const scriptUri = webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'media', 'web-view-bundle-calico-colors.js'));

        // Do the same for the stylesheet.
        const styleResetUri = webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'media', 'calico-colors', 'reset.css'));
        const styleVSCodeUri = webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'media', 'calico-colors', 'vscode.css'));
        const styleMainUri = webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'media', 'calico-colors', 'main.css'));

        // Use a nonce to only allow a specific script to be run.
        const nonce = getNonce();

        return `<!DOCTYPE html>
			<html lang="en">
			<head>
				<meta charset="UTF-8">

				<!--
					Use a content security policy to only allow loading images from https or from our extension directory,
					and only allow scripts that have a specific nonce.
				-->
				<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource}; script-src 'nonce-${nonce}';">

				<meta name="viewport" content="width=device-width, initial-scale=1.0">

				<link href="${styleResetUri}" rel="stylesheet">
				<link href="${styleVSCodeUri}" rel="stylesheet">
				<link href="${styleMainUri}" rel="stylesheet">
				
				<title>Cat Colors</title>
			</head>
			<body>
				<ul class="color-list">
				</ul>

				<button class="add-color-button">Add Color</button>

				<script nonce="${nonce}" src="${scriptUri}"></script>
			</body>
			</html>`;
    }
}

function getNonce() {
    let text = '';
    const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    for (let i = 0; i < 32; i++) {
        text += possible.charAt(Math.floor(Math.random() * possible.length));
    }
    return text;
}
