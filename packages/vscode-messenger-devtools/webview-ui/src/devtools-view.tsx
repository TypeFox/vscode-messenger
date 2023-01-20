/* eslint-disable @typescript-eslint/no-explicit-any */
import { VSCodeBadge, VSCodeButton, VSCodeDropdown, VSCodeOption } from '@vscode/webview-ui-toolkit/react';
import { ColDef } from 'ag-grid-community';
import 'ag-grid-community/dist/styles/ag-grid.css';
import 'ag-grid-community/dist/styles/ag-theme-alpine-dark.css';
import 'ag-grid-community/dist/styles/ag-theme-alpine.css';
import { AgGridReact } from 'ag-grid-react';
import React from 'react';
import { ExtensionInfo, MessengerEvent } from 'vscode-messenger';
import { HOST_EXTENSION } from 'vscode-messenger-common';
import { Messenger } from 'vscode-messenger-webview';
import '../css/devtools-view.css';
import '../node_modules/@vscode/codicons/dist/codicon.css';
import '../node_modules/@vscode/codicons/dist/codicon.ttf';
import { collectChartData, createOptions, ReactECharts } from './components/react-echart';
import { vscodeApi } from './utilities/vscode';

interface ExtensionData {
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
}

function storeState(uiState: DevtoolsComponentState): void {
    vscodeApi.setState({
        selectedExtension: uiState.selectedExtension,
        datasetSrc: [...uiState.datasetSrc],
        chartsShown: uiState.chartsShown
    });
}

function restoreState(): DevtoolsComponentState | undefined {
    const stored = vscodeApi.getState() as DevtoolsComponentState;
    if (stored && Array.isArray(stored.datasetSrc)) {
        return {
            selectedExtension: stored.selectedExtension,
            datasetSrc: new Map(stored.datasetSrc),
            chartsShown: stored.chartsShown
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
            if (event.type === 'response' && typeof event.timeAfterRequest === 'number') {
                return `${event.size} (${event.timeAfterRequest}ms)`;
            }
            return String(event.size);

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

    refObj: React.RefObject<AgGridReact<MessengerEvent>>;
    messenger: Messenger;

    constructor() {
        super({});
        const storedState = restoreState();
        this.state = {
            selectedExtension: storedState?.selectedExtension ?? '',
            datasetSrc: new Map(storedState?.datasetSrc) ?? new Map(),
            chartsShown: storedState?.chartsShown ?? false
        };
        this.refObj = React.createRef();
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
        if (dataEvent.event.type === 'response' && dataEvent.event.timestamp) {
            // Take max 200 entries to look-up
            const request = extensionData.events.slice(0, 200).find(event => event.type === 'request' && event.id === dataEvent.event.id);
            if (request && request.timestamp) {
                dataEvent.event.timeAfterRequest = dataEvent.event.timestamp - request.timestamp;
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
        this.updateState(this.state, this.state.selectedExtension === dataEvent.extension);
    }

    updateState(newState: DevtoolsComponentState, refreshTable: boolean) {
        this.setState(newState, () => {
            // Callback after `this.state`was updated
            storeState(this.state);
            if (refreshTable && this.refObj?.current) {
                // refresh table
                this.reloadTableData(this.state.datasetSrc.get(this.state.selectedExtension)?.events);
            }
        });
    }

    protected reloadTableData(rowData: MessengerEvent[] | undefined): void {
        if (this.refObj?.current) {
            // refresh table
            this.refObj.current.api.setRowData(rowData ?? []);
        }
    }

    async fillExtensionsList(refresh: boolean) {
        const extensions = await this.messenger.sendRequest<{ refresh: boolean }, ExtensionData[]>({ method: 'extensionList' }, HOST_EXTENSION, { refresh });
        extensions.forEach(ext => this.updateExtensionData(ext));
        this.updateState(this.state, true);
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
                    <VSCodeButton className='refresh-button' appearance='icon' aria-label='Refresh' onClick={() => this.fillExtensionsList(true)}>
                        <span className='codicon codicon-refresh' title='Refresh' />
                    </VSCodeButton>
                    <VSCodeButton className='toggle-charts-button' appearance='icon' aria-label='Toggle Charts' onClick={
                        () => {
                            this.updateState({ ...this.state, chartsShown: !this.state.chartsShown }, false);
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

                    <span className='info-param-name'>Pend. Requests:</span>
                    <VSCodeBadge className='ext-info-badge'
                        title='Number of pending requests.'>{selectedExt?.info?.pendingRequest ?? 0}</VSCodeBadge>

                    <span className='info-param-name'>Events:</span>
                    <VSCodeBadge className='ext-info-badge'>{selectedExt?.events.length ?? 0}</VSCodeBadge>
                </div>
                <div id='event-table'
                    className={getComputedStyle(document.getElementById('root')!).getPropertyValue('--event-table-class')}>
                    <AgGridReact
                        ref={this.refObj}
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
                    >
                    </AgGridReact>
                </div>
                <div id='charts' style={{ display: this.state.chartsShown ? 'flex' : 'none' }}>
                    <ReactECharts option={optionCount} />
                    <ReactECharts option={optionSize} />
                </div>
            </>
        );
    }
}

export default DevtoolsComponent;
