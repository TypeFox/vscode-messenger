/* eslint-disable @typescript-eslint/no-explicit-any */
import { VSCodeBadge, VSCodeButton, VSCodeDropdown, VSCodeOption } from '@vscode/webview-ui-toolkit/react';
import { CellFocusedEvent, ColDef } from 'ag-grid-community';
import 'ag-grid-community/dist/styles/ag-grid.css';
import 'ag-grid-community/dist/styles/ag-theme-alpine-dark.css';
import 'ag-grid-community/dist/styles/ag-theme-alpine.css';
import { AgGridReact } from 'ag-grid-react';
import React from 'react';
import { ExtensionInfo, MessengerEvent } from 'vscode-messenger';
import { HOST_EXTENSION, BROADCAST } from 'vscode-messenger-common';
import { Messenger } from 'vscode-messenger-webview';
import '../css/devtools-view.css';
import '../node_modules/@vscode/codicons/dist/codicon.css';
import '../node_modules/@vscode/codicons/dist/codicon.ttf';
import { Diagram, HighlightData, updateLinks } from './components/diagram';
import { ReactECharts, collectChartData, createOptions } from './components/react-echart';
import { vscodeApi } from './utilities/vscode';

export interface ExtensionData {
    id: string
    name: string
    active: boolean
    exportsDiagnosticApi: boolean
    info?: ExtensionInfo
    events: ExtendedMessengerEvent[]
}
interface ExtendedMessengerEvent extends MessengerEvent {
    timeAfterRequest?: number
    methodTooltip?: string
}

interface DevtoolsComponentState {
    selectedExtension: string
    datasetSrc: Map<string, ExtensionData>
    chartsShown: boolean
    diagramShown: boolean
}

function storeState(uiState: DevtoolsComponentState): void {
    vscodeApi.setState({
        selectedExtension: uiState.selectedExtension,
        datasetSrc: [...uiState.datasetSrc],
        chartsShown: uiState.chartsShown,
        diagramShown: uiState.diagramShown
    });
}

function restoreState(): DevtoolsComponentState | undefined {
    const stored = vscodeApi.getState() as DevtoolsComponentState;
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

const columnDefs: ColDef[] = [
    {
        field: 'type',
        initialWidth: 110,
        cellRenderer: (params: any) => {
            const rowType = params.data.type ?? 'unknown';
            const error = params.data.error ? <span className='table-cell codicon codicon-stop' title={params.data.error}></span> : undefined;
            return <div className={'rowType_' + rowType} style={{ display: 'flex', alignContent: 'space-between' }}><span style={{ flexGrow: 1 }}>{params.value}</span>{error}</div>;
        }
    },
    { field: 'sender', initialWidth: 180 },
    { field: 'receiver', initialWidth: 180 },
    {
        field: 'method', initialWidth: 135,
        tooltipField: 'methodTooltip'
    },
    {
        field: 'size', headerName: 'Size (Time)', initialWidth: 135,
        cellRenderer: (params: any) => {
            const event = (params.data as ExtendedMessengerEvent);
            const charsCount = Intl.NumberFormat('en', { notation: 'compact' }).format(event.size);
            if (event.type === 'response' && typeof event.timeAfterRequest === 'number') {
                const tookMs = event.timeAfterRequest % 1000;
                const tookSec = Math.trunc(event.timeAfterRequest / 1000);
                const secPart = (tookSec > 0) ? `${tookSec}s ` : '';
                return `${charsCount} (${secPart}${tookMs}ms)`;
            }
            return charsCount;

        }
    },
    { field: 'id' },
    {
        field: 'timestamp',
        initialWidth: 135,
        cellRenderer: (params: any) => {
            const time = params.data.timestamp;
            if (typeof time === 'number') {
                const date = new Date(time);
                const prependZero = (n: number) => ('0' + n).slice(-2);
                return `${prependZero(date.getHours())}:${prependZero(date.getMinutes())}:${prependZero(date.getSeconds())}-${('00' + date.getMilliseconds()).slice(-3)}`;
            }
            return String(time);
        }
    },
    { field: 'error' },
];
class DevtoolsComponent extends React.Component<Record<string, any>, DevtoolsComponentState>{

    gridRefObj: React.RefObject<AgGridReact<MessengerEvent>>;
    messenger: Messenger;

    constructor() {
        super({});
        const storedState = restoreState();
        this.state = {
            selectedExtension: storedState?.selectedExtension ?? '',
            datasetSrc: new Map(storedState?.datasetSrc) ?? new Map(),
            chartsShown: storedState?.chartsShown ?? false,
            diagramShown: storedState?.diagramShown ?? false
        };
        this.gridRefObj = React.createRef();
        this.messenger = new Messenger(vscodeApi, { debugLog: true });
        this.messenger.onNotification<{ extension: string, event: ExtendedMessengerEvent }>({ method: 'pushData' }, e => this.handleDataPush(e));
        this.messenger.start();
        this.fillExtensionsList(false).then(() => {
            if (this.state.selectedExtension === '' && this.state.datasetSrc.size > 0) {
                // set first entry as selected extension
                this.updateState({ ...this.state, selectedExtension: this.state.datasetSrc.keys().next().value }, true);
            } else {
                this.updateState(this.state, true);
            }
        });
    }

    private handleDataPush(dataEvent: { extension: string, event: ExtendedMessengerEvent }): void {
        if (!this.state.datasetSrc.has(dataEvent.extension)) {
            this.updateExtensionData({ id: dataEvent.extension, name: '', active: true, exportsDiagnosticApi: true, events: [] });
        }
        const extensionData = this.state.datasetSrc.get(dataEvent.extension)!;

        const highlight: HighlightData[] = [];

        if (dataEvent.event.type === 'response' && dataEvent.event.timestamp) {
            // Take max 200 entries to look-up
            const request = extensionData.events.slice(0, 200).find(event => event.type === 'request' && event.id === dataEvent.event.id);
            if (request && request.timestamp) {
                dataEvent.event.timeAfterRequest = dataEvent.event.timestamp - request.timestamp;
                highlight.push({ link: dataEvent.event.receiver + '->' + dataEvent.event.sender, type: 'request' });
            }
        }
        if (dataEvent.event.type === 'notification' || dataEvent.event.type === 'request') {
            if (dataEvent.event.parameter) {
                dataEvent.event.methodTooltip = `Parameter (max 500 chars):\n ${JSON.stringify(dataEvent.event.parameter, undefined, '  ').substring(0, 499)}`;
            } else {
                dataEvent.event.methodTooltip = 'Parameters are empty or suppressed using diagnostic API options.';
            }
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
                // for broadcast, events first send to the extension host
                return [
                    { link: msgEvent.sender + '->' + 'host extension', type: msgEvent.type },
                    ...viewsByType.filter(view => view.id !== msgEvent.sender)
                        .map(view => { return { link: 'host extension->' + view.id, type: msgEvent.type }; })
                ];
            }
            // webview type receiver
            return viewsByType.map(view => { return { link: msgEvent.sender + '->' + view.id, type: msgEvent.type }; });
        } else {
            return [{ link: msgEvent.sender + '->' + msgEvent.receiver, type: msgEvent.type }];
        }
    }

    updateState(newState: DevtoolsComponentState, refreshTable: boolean) {
        this.setState(newState, () => {
            // Callback after `this.state`was updated
            storeState(this.state);
            if (refreshTable && this.gridRefObj?.current) {
                // refresh table
                this.reloadTableData(this.state.datasetSrc.get(this.state.selectedExtension)?.events);
            }
        });
    }

    protected reloadTableData(rowData: MessengerEvent[] | undefined): void {
        if (this.gridRefObj?.current) {
            // refresh table
            this.gridRefObj.current.api.setRowData(rowData ?? []);
        }
    }

    async fillExtensionsList(refresh: boolean): Promise<void> {
        const extensions = await this.messenger.sendRequest<{ refresh: boolean }, ExtensionData[]>({ method: 'extensionList' }, HOST_EXTENSION, { refresh });
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

    gridRowSelected(event: CellFocusedEvent<ExtendedMessengerEvent>): void {
        const selectedExt = this.state.datasetSrc.get(this.state.selectedExtension);
        if (selectedExt && event.rowIndex !== null) {
            const row = event.api.getDisplayedRowAtIndex(event.rowIndex);
            if (row?.data) {
                this.updateDiagramEventHighlight(...this.createHighlightData(selectedExt, row.data));
            }
        }
    }

    render() {
        const renderingData = this.state.datasetSrc.get(this.state.selectedExtension)?.events ?? [];

        const charSeries = collectChartData(renderingData);
        const optionSize = createOptions(charSeries.series[0], charSeries.senderY, '  (chars)');
        const optionCount = createOptions(charSeries.series[1], charSeries.senderY);

        const selectedExt = this.state.datasetSrc.get(this.state.selectedExtension);
        const updateState = (selectedId: string) => {
            this.updateState({ ...this.state, selectedExtension: selectedId }, true);
        };

        return (
            <>
                <div id='header'>
                    <VSCodeDropdown value={this.state.selectedExtension} title='List of extensions using vscode-messenger.'>
                        {Array.from(this.state.datasetSrc.values()).map((ext) => (
                            <VSCodeOption key={ext.id} value={ext.id} onClick={() => updateState(ext.id)}>
                                {ext.name}
                            </VSCodeOption>
                        ))}
                    </VSCodeDropdown>
                    <VSCodeButton className='refresh-button' appearance='icon' aria-label='Refresh Extension Data' onClick={() => this.fillExtensionsList(true)}>
                        <span className='codicon codicon-refresh' title='Refresh' />
                    </VSCodeButton>
                    <VSCodeButton className='clear-button' appearance='icon' aria-label='Clear Data' onClick={() => this.clearExtensionData(selectedExt?.id)}>
                        <span className='codicon codicon-trashcan' title='Clear Data' />
                    </VSCodeButton>
                    <VSCodeButton className='toggle-charts-button' appearance='icon' aria-label='Toggle Charts' onClick={
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
                        }
                    }>
                        <span className='codicon codicon-graph' title='Toggle Charts' />
                    </VSCodeButton>
                    <VSCodeButton className='toggle-diagram-button' appearance='icon' aria-label='Toggle Diagram' onClick={
                        () => {
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
                        }
                    }>
                        <span className='codicon codicon-type-hierarchy' title='Toggle Diagram' />
                    </VSCodeButton>
                </div>
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

                    {/*<span className='info-param-name'>Pend. Requests:</span>
                    <VSCodeBadge className='ext-info-badge'
                        title='Number of pending requests.'>{selectedExt?.info?.pendingRequest ?? 0}</VSCodeBadge>
                    */}
                    <span className='info-param-name'>Events:</span>
                    <VSCodeBadge className='ext-info-badge'>{selectedExt?.events.length ?? 0}</VSCodeBadge>
                </div>
                <div id='event-table'
                    className={getComputedStyle(document.getElementById('root')!).getPropertyValue('--event-table-class')}>
                    <AgGridReact
                        ref={this.gridRefObj}
                        rowData={renderingData}
                        columnDefs={
                            columnDefs.map(col => {
                                return {
                                    filter: true, resizable: true, sortable: true,
                                    cellStyle: (params: any) => {
                                        if (params.value === 'Police') {
                                            //mark police cells as red
                                            return { color: 'red', backgroundColor: 'green' };
                                        }
                                        return null;
                                    },
                                    tooltipField: col.field,
                                    ...col
                                };
                            })}
                        rowHeight={25}
                        headerHeight={28}
                        enableBrowserTooltips={true}
                        onCellFocused={(e) => this.gridRowSelected(e)}
                    >
                    </AgGridReact>
                </div>
                <div id='charts' style={{ display: this.state.chartsShown ? 'flex' : 'none' }}>
                    <ReactECharts option={optionCount} />
                    <ReactECharts option={optionSize} />
                </div>
                <div id='diagram' style={{ display: this.state.diagramShown ? 'flex' : 'none', height: '200px', width: '100%' }} >
                    {
                        this.state.diagramShown &&
                        <Diagram extensionName={selectedExt?.name ?? ''}
                            webviews={selectedExt?.info?.webviews ?? []}
                            doCenter={this.state.diagramShown} />
                    }
                </div>
            </>
        );
    }
}

export default DevtoolsComponent;
