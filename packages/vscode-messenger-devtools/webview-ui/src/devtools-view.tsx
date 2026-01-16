/* eslint-disable @typescript-eslint/no-explicit-any */
import '@vscode/codicons/dist/codicon.css';
import '@vscode/codicons/dist/codicon.ttf';
import { VSCodeBadge } from '@vscode/webview-ui-toolkit/react';
import React from 'react';
import type { ExtensionInfo, MessengerEvent } from 'vscode-messenger';
import type { NotificationType, RequestType } from 'vscode-messenger-common';
import { BROADCAST, HOST_EXTENSION } from 'vscode-messenger-common';
import { Messenger } from 'vscode-messenger-webview';
import '../css/devtools-view.css';
import type { HighlightData } from './components/diagram';
import { Diagram, toLinkId, updateLinks } from './components/diagram';
import { EventTable } from './components/event-table';
import { ReactECharts, collectChartData, createOptions } from './components/react-echart';
import { ViewHeader } from './components/view-header';
import type { DevtoolsComponentState } from './utilities/view-state';
import { restoreState, storeState, vsCodeApi, getVSCodeTheme } from './utilities/view-state';

type DataEvent = {
    extension: string;
    event: MessengerEvent;
};

const PushDataNotification: NotificationType<DataEvent> = {
    method: 'pushData'
};

const ExtensionListRequest: RequestType<boolean, ExtensionData[]> = {
    method: 'extensionList'
};

const SaveFileRequest: RequestType<{ filename: string; content: string; }, boolean> = {
    method: 'saveFile'
};

export interface ExtensionData {
    id: string
    name: string
    active: boolean
    exportsDiagnosticApi: boolean
    info?: ExtensionInfo
    events: ExtendedMessengerEvent[]
}
export interface ExtendedMessengerEvent extends MessengerEvent {
    timeAfterRequest?: number
    payloadInfo?: string
}

const MESSENGER_EXTENSION_ID = 'TypeFox.vscode-messenger-devtools';
export const HOST_EXTENSION_NAME = 'host extension';

class DevtoolsComponent extends React.Component<Record<string, any>, DevtoolsComponentState> {

    messenger: Messenger;
    eventTable: EventTable;
    private themeObserver: MutationObserver | null = null;

    constructor() {
        super({});
        const storedState = restoreState();
        this.state = {
            selectedExtension: storedState?.selectedExtension ?? '',
            datasetSrc: storedState?.datasetSrc ? new Map() : new Map(),
            chartsShown: storedState?.chartsShown ?? false,
            diagramShown: storedState?.diagramShown ?? false,
            theme: storedState?.theme ?? getVSCodeTheme()
        };
        this.eventTable = new EventTable({ gridRowSelected: (e) => this.gridRowSelected(e) });
        this.messenger = new Messenger(vsCodeApi, { debugLog: true });
        this.messenger.onNotification(PushDataNotification, event => this.handleDataPush(event));
        this.messenger.start();
        this.fillExtensionsList(false).then(() => {
            if (this.state.selectedExtension === '' && this.state.datasetSrc.size > 0) {
                // set first not vscode-messenger entry as selected extension
                let extensionToPreset = this.state.datasetSrc.keys().next().value;
                if (this.state.datasetSrc.size > 1) {
                    extensionToPreset = Array.from(this.state.datasetSrc.keys()).filter(key => key !== MESSENGER_EXTENSION_ID)[0] ?? extensionToPreset;
                }
                if (extensionToPreset) {
                    this.updateState({ ...this.state, selectedExtension: extensionToPreset }, true);
                }
            } else {
                this.updateState(this.state, true);
            }
            return;
        }).catch(err => console.error(err));

        // Set up theme change observer
        this.setupThemeObserver();
    }

    componentWillUnmount() {
        // Clean up theme observer
        if (this.themeObserver) {
            this.themeObserver.disconnect();
            this.themeObserver = null;
        }
    }

    private setupThemeObserver() {
        // Watch for changes to the data-vscode-theme-kind attribute
        this.themeObserver = new MutationObserver((mutations) => {
            mutations.forEach((mutation) => {
                if (mutation.type === 'attributes' && mutation.attributeName === 'data-vscode-theme-kind') {
                    const newTheme = getVSCodeTheme();
                    if (newTheme !== this.state.theme) {
                        // Update state with new theme - this will trigger chart re-render
                        // and table will automatically pick up new CSS theme class
                        this.updateState({ ...this.state, theme: newTheme }, true);
                    }
                }
            });
        });

        // Start observing
        this.themeObserver.observe(document.body, {
            attributes: true,
            attributeFilter: ['data-vscode-theme-kind']
        });

    }

    render() {
        const theme = this.state.theme;
        const charSeries = collectChartData(this.selectedExtensionData()?.events ?? []);
        const optionSize = createOptions(charSeries.series[0], charSeries.senderY, '  (chars)', theme);
        const optionCount = createOptions(charSeries.series[1], charSeries.senderY, '', theme);

        const selectedExt = this.selectedExtensionData();
        const updateState = (selectedId: string) => {
            this.updateState({ ...this.state, selectedExtension: selectedId }, true);
        };

        const headerToggleDiagram = () => {
            this.updateState({ ...this.state, diagramShown: !this.state.diagramShown, chartsShown: false }, false);
            const diagramDiv = document.getElementById('diagram');
            if (diagramDiv) {
                if (diagramDiv.style.display === 'none') {
                    diagramDiv.style.display = 'flex';
                    diagramDiv.style.visibility = 'visible';
                    if (updateLinks)
                        updateLinks([]);
                } else {
                    diagramDiv.style.display = 'none';
                    diagramDiv.style.visibility = 'hidden';
                }
            }
        };
        const onToggleCharts =
            () => {
                this.updateState({ ...this.state, chartsShown: !this.state.chartsShown, diagramShown: false }, false);
                const chartsDiv = document.getElementById('charts');
                if (chartsDiv) {
                    if (chartsDiv.style.display === 'none') {
                        chartsDiv.style.display = 'flex';
                        chartsDiv.style.visibility = 'visible';
                        optionCount.animation = true; // triggers chats resize
                    } else {
                        chartsDiv.style.display = 'none';
                        chartsDiv.style.visibility = 'hidden';
                        optionCount.animation = false;
                    }
                }
            };

        function collectOutdatedViews(selectedExt: ExtensionData | undefined): string[] {
            if (!selectedExt) return [];
            const unknownViews = new Set<string>();
            const isKnown = (id: string): boolean => {
                if (id === BROADCAST.type || id === HOST_EXTENSION_NAME) {
                    return true;
                }
                return selectedExt.info?.webviews.findIndex(view => view.id === id || view.type === id) !== -1;
            };
            selectedExt.events.forEach(event => {
                if (!isKnown(event.sender!)) {
                    unknownViews.add(event.sender!);
                }
                if (!isKnown(event.receiver)) {
                    unknownViews.add(event.receiver);
                }
            });
            return Array.from(unknownViews);
        }

        return (
            <>
                <ViewHeader
                    state={{ selectedExtension: this.state.selectedExtension, extensions: Array.from(this.state.datasetSrc.values()) }}
                    onExtensionSelected={(extId: string) => updateState(extId)}
                    onRefreshClicked={() => this.fillExtensionsList(true)}
                    onClearClicked={async (extId: string | undefined) => await this.clearExtensionData(extId)}
                    onToggleDiagram={headerToggleDiagram}
                    onToggleCharts={onToggleCharts}
                    onExportJSON={() => this.exportTableData('json')}
                    onExportCSV={() => this.exportTableData('csv')}
                />
                <div id='ext-info'>
                    <span className='info-param-name'>Status:</span>
                    <span
                        className={
                            'ext-info-badge codicon codicon-'
                            + (!selectedExt?.active ? 'warning' : (!selectedExt?.exportsDiagnosticApi ? 'stop' : 'pass'))
                        }
                        title={
                            'Extension '
                            + (!selectedExt?.active ? 'is not active' :
                                (!selectedExt?.exportsDiagnosticApi ? "doesn't export diagnostic API" : 'is active and exports diagnostic API.'))
                        } />

                    <span className='info-param-name'>Views:</span>
                    <VSCodeBadge className='ext-info-badge' title={
                        'Registered views:\n' + (selectedExt?.info?.webviews ?? []).map(entry => '  ' + entry.id).join('\n')
                    }>{selectedExt?.info?.webviews.length ?? 0}</VSCodeBadge>

                    <span className='info-param-name'>Listeners:</span>
                    <VSCodeBadge className='ext-info-badge'
                        title='Number of registered diagnostic listeners.'>{selectedExt?.info?.diagnosticListeners ?? 0}</VSCodeBadge>

                    <span className='info-param-name'>Handlers:</span>
                    <VSCodeBadge className='ext-info-badge'
                        title={
                            'Number of added method handlers: \n' + (selectedExt?.info?.handlers ?? []).map(entry => '  ' + entry.method + ': ' + entry.count).join('\n')
                        }>{Array.from(selectedExt?.info?.handlers?.values() ?? []).length}</VSCodeBadge>
                    <span className='info-param-name'>Pending Req.:</span>
                    <VSCodeBadge className='ext-info-badge'
                        title='Number of pending (incoming + outgoing) requests.'>{selectedExt?.info?.pendingRequest ?? 0}</VSCodeBadge>

                    <span className='info-param-name'>Events:</span>
                    <VSCodeBadge className='ext-info-badge'>{selectedExt?.events.length ?? 0}</VSCodeBadge>
                </div>

                {/* Table Component */}
                {this.eventTable.render()}

                {/* Chart Components */}
                <div id='charts' style={{ display: this.state.chartsShown ? 'flex' : 'none' }}>
                    <ReactECharts option={optionCount} />
                    <ReactECharts option={optionSize} />
                </div>
                <div id='diagram' style={{ display: this.state.diagramShown ? 'flex' : 'none', height: '200px', width: '100%' }} >
                    {
                        this.state.diagramShown &&
                        <Diagram extensionName={selectedExt?.name ?? ''}
                            webviews={selectedExt?.info?.webviews ?? []}
                            outdatedWebviews={collectOutdatedViews(selectedExt)}
                            doCenter={this.state.diagramShown}
                        />
                    }
                </div>
            </>
        );
    }

    private handleDataPush(dataEvent: DataEvent & { event: ExtendedMessengerEvent }): void {
        if (!this.state.datasetSrc.has(dataEvent.extension)) {
            this.updateExtensionData({ id: dataEvent.extension, name: '', active: true, exportsDiagnosticApi: true, events: [] });
        }
        const extensionData = this.state.datasetSrc.get(dataEvent.extension)!;

        const highlight: HighlightData[] = [];
        const isResponse = dataEvent.event.type === 'response';
        if (isResponse && dataEvent.event.timestamp) {
            // Take max 200 entries to look-up
            const request = extensionData.events.slice(0, 200).find(event => event.type === 'request' && event.id === dataEvent.event.id);
            if (request && request.timestamp) {
                dataEvent.event.timeAfterRequest = dataEvent.event.timestamp - request.timestamp;
                highlight.push({ link: toLinkId(dataEvent.event.receiver, dataEvent.event.sender), type: 'request' });
            }
        }

        if (dataEvent.event.parameter) {
            dataEvent.event.payloadInfo = `${isResponse ? 'Response' : 'Parameter'} (max 500 chars):\n ${JSON.stringify(dataEvent.event.parameter, undefined, '  ').substring(0, 499)}`;
        } else {
            dataEvent.event.payloadInfo = 'Payload information is empty or suppressed using diagnostic API options.';
        }

        extensionData.events.unshift(dataEvent.event);

        highlight.push(...this.createHighlightData(extensionData, dataEvent.event));
        this.updateDiagramEventHighlight(...highlight);

        this.updateState(this.state, this.state.selectedExtension === dataEvent.extension);
    }

    updateDiagramEventHighlight(...highlights: HighlightData[]): void {
        if (updateLinks) {
            updateLinks(highlights);
        }
    }

    createHighlightData(extensionData: ExtensionData, msgEvent: ExtendedMessengerEvent): HighlightData[] {
        const viewsByType = extensionData.info?.webviews.filter(view => msgEvent.receiver === BROADCAST.type || view.type === msgEvent.receiver) ?? [];
        if (viewsByType.length > 0) {
            if (msgEvent.receiver === BROADCAST.type) {
                // for broadcast, events first send event to the extension host. Then the host sends the event to all webviews.
                return [
                    { link: toLinkId(msgEvent.sender, HOST_EXTENSION_NAME), type: msgEvent.type },
                    {
                        link: viewsByType.map(targetView => toLinkId(HOST_EXTENSION_NAME, targetView.id)), type: msgEvent.type
                    }

                ];
            }
            // webview type receiver
            return viewsByType.map(view => { return { link: toLinkId(msgEvent.sender, view.id), type: msgEvent.type }; });
        } else {
            return [{ link: toLinkId(msgEvent.sender, msgEvent.receiver), type: msgEvent.type }];
        }
    }

    updateState(newState: DevtoolsComponentState, refreshTable: boolean) {
        this.setState(newState, () => {
            // Callback after `this.state`was updated
            storeState(this.state);
            if (refreshTable) {
                // refresh table
                this.eventTable.getGridApi()?.setRowData(this.selectedExtensionData()?.events ?? []);
            }
        });
    }

    selectedExtensionData(): ExtensionData | undefined {
        return this.state.datasetSrc.get(this.state.selectedExtension);
    }

    async fillExtensionsList(refresh: boolean): Promise<void> {
        const extensions = await this.messenger.sendRequest(ExtensionListRequest, HOST_EXTENSION, refresh);
        extensions.forEach(ext => this.updateExtensionData(ext));
        this.updateState(this.state, true);
    }

    async clearExtensionData(extensionId: string | undefined): Promise<void> {
        if (!extensionId) {
            return;
        }
        const extData = this.state.datasetSrc.get(extensionId);
        if (extData) {
            extData.events = [];
            this.updateState(this.state, true);
        }
    }

    updateExtensionData(ext: ExtensionData) {
        const data = this.state.datasetSrc;
        if (!data.has(ext.id)) {
            data.set(ext.id, { ...ext, events: [] }); // received ExtensionData don't have events
        } else {
            const existing = data.get(ext.id);
            // merge data
            data.set(ext.id, { ...ext, events: existing?.events ?? [] });
        }
    }

    exportTableData(format: 'json' | 'csv'): void {
        const api = this.eventTable.getGridApi();
        if (!api) {
            console.warn('Grid API not available for export');
            return;
        }

        const selectedExtension = this.selectedExtensionData();
        const extensionName = selectedExtension?.id || 'messenger-events';
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const filename = `${extensionName}-${timestamp}`;

        try {
            const dataToExport = api.getSelectedNodes().length > 0 ? api.getSelectedRows() : selectedExtension?.events ?? [];
            if (format === 'json') {
                const jsonData = JSON.stringify(dataToExport, null, 2);
                this.saveFileViaVSCode(`${filename}.json`, jsonData);
            } else if (format === 'csv') {
                const csvData = this.toCsv(dataToExport);
                this.saveFileViaVSCode(`${filename}.csv`, csvData);
            }
        } catch (error) {
            console.error(`Failed to export as ${format}:`, error);
        }
    }

    private toCsv(dataToExport: MessengerEvent[]) {
        if (dataToExport.length === 0) {
            return '';
        }

        // Define headers based on MessengerEvent/ExtendedMessengerEvent properties
        const headers = ['id', 'type', 'sender', 'receiver', 'method', 'error', 'size', 'timestamp', 'parameter', 'timeAfterRequest', 'payloadInfo'];

        const escapeCSVValue = (value: any): string => {
            if (value === null || value === undefined) {
                return '';
            }

            let stringValue: string;
            if (typeof value === 'object') {
                try {
                    stringValue = JSON.stringify(value);
                // eslint-disable-next-line @typescript-eslint/no-unused-vars
                } catch (_error) {
                    stringValue = String(value);
                }
            } else {
                stringValue = String(value);
            }

            // If value contains comma, newline, or double quote, wrap in quotes and escape internal quotes
            if (stringValue.includes(',') || stringValue.includes('\n') || stringValue.includes('\r') || stringValue.includes('"')) {
                return `"${stringValue.replace(/"/g, '""')}"`;
            }

            return stringValue;
        };

        const rows = dataToExport.map(event => {
            const extendedEvent = event as ExtendedMessengerEvent;
            return headers.map(header =>
                escapeCSVValue((extendedEvent as any)[header])
            ).join(',');
        });

        return [headers.join(','), ...rows].join('\n');
    }

    private async saveFileViaVSCode(filename: string, content: string): Promise<void> {
        try {
            const success = await this.messenger.sendRequest(SaveFileRequest, HOST_EXTENSION, { filename, content });
            if (!success) {
                console.error('File save failed');
            }
        } catch (error) {
            console.error('Error saving file via VS Code API:', error);
        }
    }

    gridRowSelected(event: any): void {
        const selectedExt = this.selectedExtensionData();
        if (!selectedExt) return;

        // Handle both CellFocusedEvent and SelectionChangedEvent
        if (event.type === 'selectionChanged') {
            // Handle row selection change - highlight the first selected row
            const selectedNodes = event.api.getSelectedNodes();
            if (selectedNodes.length > 0 && selectedNodes[0].data) {
                this.updateDiagramEventHighlight(...this.createHighlightData(selectedExt, selectedNodes[0].data));
            }
        } else if (event.rowIndex !== null && event.rowIndex !== undefined) {
            // Handle cell focus
            const row = event.api.getDisplayedRowAtIndex(event.rowIndex);
            if (row?.data) {
                this.updateDiagramEventHighlight(...this.createHighlightData(selectedExt, row.data));
            }
        }
    }
}

export default DevtoolsComponent;
