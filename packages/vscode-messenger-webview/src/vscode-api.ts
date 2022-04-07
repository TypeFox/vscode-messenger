/******************************************************************************
 * Copyright 2022 TypeFox GmbH
 * This program and the accompanying materials are made available under the
 * terms of the MIT License, which is available in the project root.
 ******************************************************************************/

import { JsonAny } from 'vscode-messenger-common';

/**
 * This API is provided by VS Code when the UI is loaded in a webview.
 */
export declare function acquireVsCodeApi(): VsCodeApi;

export interface VsCodeApi {
    postMessage: (message: JsonAny) => void
    getState(): unknown
    setState(newState: JsonAny): void
}
