/* eslint-disable no-undef */
/* eslint-disable @typescript-eslint/no-var-requires */

/**
 * See https://github.com/Microsoft/vscode-extension-samples/tree/main/webview-view-sample
 */


// This script will be run within the webview itself
// It cannot access the main VS Code APIs directly.
(function () {
    const vscode = acquireVsCodeApi();
    const vscode_messenger = require("vscode-messenger-webview");
    
    const messenger = new vscode_messenger.Messenger(vscode);

    const oldState = vscode.getState() || { colors: [] };

    /** @type {Array<{ value: string }>} */
    let colors = oldState.colors;

    updateColorList(colors);

    document.querySelector('.add-color-button').addEventListener('click', () => {
        addColor();
    });

    messenger.onNotification({method: 'colorModify'}, (params) => {
        switch(params) {
            case 'add': {
                addColor();
                break;
            }
            case 'clear': {
                colors = [];
                updateColorList(colors);
                break;
            }
        }
    });
    messenger.start();


    /**
     * @param {Array<{ value: string }>} colors
     */
    function updateColorList(colors) {
        const ul = document.querySelector('.color-list');
        ul.textContent = '';
        for (const color of colors) {
            const li = document.createElement('li');
            li.className = 'color-entry';

            const colorPreview = document.createElement('div');
            colorPreview.className = 'color-preview';
            colorPreview.style.backgroundColor = `#${color.value}`;
            colorPreview.addEventListener('click', () => {
                onColorClicked(color.value);
            });
            li.appendChild(colorPreview);

            const input = document.createElement('input');
            input.className = 'color-input';
            input.type = 'text';
            input.value = color.value;
            input.addEventListener('change', (e) => {
                const value = e.target.value;
                if (!value) {
                    // Treat empty value as delete
                    colors.splice(colors.indexOf(color), 1);
                } else {
                    color.value = value;
                }
                updateColorList(colors);
            });
            li.appendChild(input);

            ul.appendChild(li);
        }

        // Update the saved state
        vscode.setState({ colors: colors });
    }

    /** 
     * @param {string} color 
     */
    function onColorClicked(color) {
        messenger.sendNotification({ method: 'colorSelected'}, { type: 'extension' }, color);
    }
    
    /**
     * @returns string
     */
    async function getNewCalicoColor() {
        const colors = await messenger.sendRequest({ method: 'availableColor'}, { type: 'extension' }, '');
        return colors[Math.floor(Math.random() * colors.length)];
    }

    async function addColor() {
        colors.push({ value: await getNewCalicoColor() });
        updateColorList(colors);
    }
}());


