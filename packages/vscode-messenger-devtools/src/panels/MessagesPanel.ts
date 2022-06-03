import { Disposable, Webview, WebviewPanel, window, Uri, ViewColumn } from 'vscode';
import { getUri } from '../utilities/getUri';

/**
 * This class manages the state and behavior of HelloWorld webview panels.
 *
 * It contains all the data and methods for:
 *
 * - Creating and rendering HelloWorld webview panels
 * - Properly cleaning up and disposing of webview resources when the panel is closed
 * - Setting the HTML (and by proxy CSS/JavaScript) content of the webview panel
 * - Setting message listeners so data can be passed between the webview and extension
 */
export class MessagesPanel {
    public static currentPanel: MessagesPanel | undefined;
    private readonly _panel: WebviewPanel;
    private _disposables: Disposable[] = [];

    /**
   * The HelloWorldPanel class private constructor (called only from the render method).
   *
   * @param panel A reference to the webview panel
   * @param extensionUri The URI of the directory containing the extension
   */
    private constructor(panel: WebviewPanel, extensionUri: Uri) {
        this._panel = panel;

        // Set an event listener to listen for when the panel is disposed (i.e. when the user closes
        // the panel or when the panel is closed programmatically)
        this._panel.onDidDispose(this.dispose, null, this._disposables);

        // Set the HTML content for the webview panel
        this._panel.webview.html = this._getWebviewContent(this._panel.webview, extensionUri);
    }

    /**
   * Renders the current webview panel if it exists otherwise a new webview panel
   * will be created and displayed.
   *
   * @param extensionUri The URI of the directory containing the extension.
   */
    public static render(extensionUri: Uri): WebviewPanel {
        if (MessagesPanel.currentPanel) {
            // If the webview panel already exists reveal it
            MessagesPanel.currentPanel._panel.reveal(ViewColumn.One);
            return MessagesPanel.currentPanel._panel;
        } else {
            // If a webview panel does not already exist create and show a new one
            const panel = window.createWebviewPanel(
                // Panel view type
                'messengerDevtool',
                // Panel title
                'Messenger Tools',
                // The editor column the panel should be displayed in
                ViewColumn.One,
                // Extra panel configurations
                {
                    // Enable JavaScript in the webview
                    enableScripts: true,
                }
            );

            MessagesPanel.currentPanel = new MessagesPanel(panel, extensionUri);
            return panel;
        }
    }

    /**
   * Cleans up and disposes of webview resources when the webview panel is closed.
   */
    public dispose() {
        MessagesPanel.currentPanel = undefined;
        // Dispose of the current webview panel
        if(!this) {
            return;
        }
        this._panel.dispose();

        // Dispose of all disposables (i.e. commands) for the current webview panel
        while (this._disposables.length) {
            const disposable = this._disposables.pop();
            if (disposable) {
                disposable.dispose();
            }
        }
    }

    /**
   * Defines and returns the HTML that should be rendered within the webview panel.
   *
   * @remarks This is also the place where references to the React webview build files
   * are created and inserted into the webview HTML.
   *
   * @param webview A reference to the extension webview
   * @param extensionUri The URI of the directory containing the extension
   * @returns A template string literal containing the HTML that should be
   * rendered within the webview panel
   */
    private _getWebviewContent(webview: Webview, extensionUri: Uri) {
    // The CSS file from the React build output
        const stylesUri = getUri(webview, extensionUri, ['webview-ui', 'build', 'assets', 'index.css']);
        // The JS file from the React build output
        const scriptUri = getUri(webview, extensionUri, ['webview-ui', 'build', 'assets', 'index.js']);
        const codiconsUri = getUri(webview, extensionUri, ['webview-ui', 'node_modules', '@vscode', 'codicons', 'dist', 'codicon.css']);
        // Tip: Install the es6-string-html VS Code extension to enable code highlighting below
        return /*html*/ `
      <!DOCTYPE html>
      <html lang="en">
        <head>
          <meta charset="UTF-8" />
          <meta name="viewport" content="width=device-width, initial-scale=1.0" />
          <link rel="stylesheet" type="text/css" href="${stylesUri}">
          <link href="${codiconsUri}" rel="stylesheet" />
          <title>Messenger Dev Tools</title>
        </head>
        <body>
          <div id="root"></div>
          <script type="module" src="${scriptUri}"></script>
        </body>
      </html>
    `;
    }
}
