import { ExtensionData } from '../devtools-view';

export const vsCodeApi = acquireVsCodeApi();

export function storeState(uiState: DevtoolsComponentState): void {
    vsCodeApi.setState({
        selectedExtension: uiState.selectedExtension,
        datasetSrc: [...uiState.datasetSrc],
        chartsShown: uiState.chartsShown,
        diagramShown: uiState.diagramShown
    });
}

export  function restoreState(): DevtoolsComponentState | undefined {
    const stored = vsCodeApi.getState() as DevtoolsComponentState;
    if (stored && Array.isArray(stored.datasetSrc)) {
        return {
            selectedExtension: stored.selectedExtension,
            datasetSrc: new Map(stored.datasetSrc),
            chartsShown: stored.chartsShown,
            diagramShown: stored.diagramShown
        };
    }
    return undefined;
}

export interface DevtoolsComponentState {
    selectedExtension: string
    datasetSrc: Map<string, ExtensionData>
    chartsShown: boolean
    diagramShown: boolean
}
