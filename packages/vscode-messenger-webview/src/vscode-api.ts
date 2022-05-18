/******************************************************************************
 * Copyright 2022 TypeFox GmbH
 * This program and the accompanying materials are made available under the
 * terms of the MIT License, which is available in the project root.
 ******************************************************************************/

/**
 * This API is provided by VS Code when the UI is loaded in a webview.
 */
export declare function acquireVsCodeApi(): VsCodeApi;

export interface VsCodeApi {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    postMessage: (message: any) => void
    getState(): unknown
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    setState(newState: any): void
}
