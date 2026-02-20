import type { DevtoolsComponentState } from './data-store';

export const vsCodeApi = acquireVsCodeApi();

export function storeState(uiState: DevtoolsComponentState): void {
    vsCodeApi.setState({
        selectedExtension: uiState.selectedExtension,
        datasetSrc: [...uiState.datasetSrc],
        chartsShown: uiState.chartsShown,
        diagramShown: uiState.diagramShown,
        theme: uiState.theme
    });
}

export function restoreState(): DevtoolsComponentState | undefined {
    const stored = vsCodeApi.getState() as DevtoolsComponentState;
    if (stored && Array.isArray(stored.datasetSrc)) {
        return {
            selectedExtension: stored.selectedExtension,
            datasetSrc: new Map(stored.datasetSrc),
            chartsShown: stored.chartsShown,
            diagramShown: stored.diagramShown,
            theme: stored.theme || getVSCodeTheme() // fallback to current theme if not stored
        };
    }
    return undefined;
}

// Helper function to detect VS Code theme
export function getVSCodeTheme(): 'light' | 'dark' {
    const themeKind = document.body.getAttribute('data-vscode-theme-kind');
    return themeKind?.includes('dark') ? 'dark' : 'light';
}
