/* eslint-disable no-undef */
/* eslint-disable @typescript-eslint/no-var-requires */

const { BROADCAST } = require("vscode-messenger-common");

// This script will be run within the webview itself
// It cannot access the main VS Code APIs directly.

(function () {
    const vscode = acquireVsCodeApi();
    const vscode_messenger = require("vscode-messenger-webview");

    const oldState = /** @type {{ count: number} | undefined} */ (vscode.getState());

    const counter = /** @type {HTMLElement} */ (document.getElementById('lines-of-code-counter'));
    console.log('Initial state', oldState);

    let currentCount = (oldState && oldState.count) || 0;
    counter.textContent = `${currentCount}`;


    // create new messenger instance
    const messenger = new vscode_messenger.Messenger(vscode);

    setInterval(() => {
        counter.textContent = `${currentCount++} `;

        // Update state
        vscode.setState({ count: currentCount });

        // Alert the extension when the cat introduces a bug
        if (Math.random() < Math.min(0.001 * currentCount, 0.05)) {
            // Send a broadcast message to all
            messenger.sendNotification({ method: 'bugIntroduced' }, BROADCAST, {
                command: 'alert',
                text: '🐛  on line ' + currentCount
            });
        }
    }, 100);

    // Handle messages sent from the extension to the webview
    messenger.onNotification({ method: 'refactor' }, event => {
        const message = event.command; // The json data that the extension sent
        if (message.command) {
            currentCount = Math.ceil(currentCount * 0.5);
            counter.textContent = `${currentCount}`;
        }
    });

    // start listening for messages
    messenger.start();
}());
