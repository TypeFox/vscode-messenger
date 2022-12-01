/* eslint-disable @typescript-eslint/no-explicit-any */
//import { VSCodeButton } from '@vscode/webview-ui-toolkit/react';
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
import '../node_modules/@vscode/codicons/dist/codicon.css';
import '../node_modules/@vscode/codicons/dist/codicon.ttf';
import './devtools-view.css';
import { ReactECharts, ReactEChartsProps } from './table/react-echart';
import { vscodeApi } from './utilities/vscode';
interface ExtensionData {
    id: string
    name: string
    active: boolean
    exportsDiagnosticApi: boolean
    info?: ExtensionInfo
    events: MessengerEvent[]
}

interface DevtoolsComponentState {
    selectedExtension: string
    datasetSrc: Map<string, ExtensionData>
}

function storeState(uiState: DevtoolsComponentState): void {
    vscodeApi.setState({
        selectedExtension: uiState.selectedExtension,
        datasetSrc: [...uiState.datasetSrc]
    });
}

function restoreState(): DevtoolsComponentState | undefined {
    const stored = vscodeApi.getState() as any;
    if (stored && Array.isArray(stored.datasetSrc)) {
        return {
            selectedExtension: stored.selectedExt,
            datasetSrc: new Map(stored.datasetSrc)
        };
    }
    return undefined;
}

const columnDefs: ColDef[] = [
    {
        field: 'type',
        width: 110,
        cellRenderer: (params: any) => {
            const error = params.data.error ? <span className='table-cell codicon codicon-stop' title={params.data.error}></span> : undefined;
            return <div style={{display:'flex', alignContent: 'space-between'}}><span style={ { flexGrow:1 }}>{params.value}</span>{error}</div>;
        }
    },
    { field: 'sender', width: 180 },
    { field: 'receiver', width: 180 },
    { field: 'method', width: 135 },
    { field: 'id' },
    { field: 'size' },
    { field: 'error' },
];

type ChartData = Map<string, { notification: number; response: number; request: number; }>;

class DevtoolsComponent extends React.Component<Record<string, any>, DevtoolsComponentState>{

    refObj: React.RefObject<AgGridReact<MessengerEvent>>;
    messenger: Messenger;

    constructor() {
        super({});
        const storedState = restoreState();
        this.state = {
            selectedExtension: storedState?.selectedExtension ?? '',
            datasetSrc: new Map(storedState?.datasetSrc) ?? new Map()
        };
        this.refObj = React.createRef();
        this.messenger = new Messenger(vscodeApi, { debugLog: true });
        this.messenger.onNotification<{ extension: string, event: MessengerEvent }>({ method: 'pushData' }, e => this.handleDataPush(e));
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

    private handleDataPush(dataEvent: { extension: string, event: MessengerEvent }): void {
        if (!this.state.datasetSrc.has(dataEvent.extension)) {
            this.updateExtensionData({ id: dataEvent.extension, name: '', active: true, exportsDiagnosticApi: true, events: [] });
        }
        const extensionData = this.state.datasetSrc.get(dataEvent.extension)!;
        extensionData.events.unshift(dataEvent.event);
        this.updateState(this.state, this.state.selectedExtension === dataEvent.extension);
    }

    updateState(newState: DevtoolsComponentState, refreshTable: boolean) {
        this.setState(newState);
        storeState(this.state);
        if (refreshTable && this.refObj?.current) {
            // refresh table
            this.refObj.current.api.setRowData(this.state.datasetSrc.get(this.state.selectedExtension)?.events ?? []);
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
        const chartData: ChartData = new Map();
        const renderingData = this.state.datasetSrc.get(this.state.selectedExtension)?.events ?? [];
        const charSeries: Array<{ name: string, type: 'bar', data: number[] }> = [];

        this.collectChartData(chartData, renderingData, charSeries);

        const option: ReactEChartsProps['option'] = {
            dataset: { source: renderingData },
            tooltip: {
                trigger: 'axis',
                axisPointer: {
                    type: 'shadow',
                },
            },
            legend: {},
            grid: {
                left: '1%',
                right: '2%',
                top: '2%',
                bottom: '2%',
                containLabel: true
            },
            xAxis: {
                type: 'value',
                boundaryGap: [0, 0.01]
            },
            yAxis: {
                type: 'category',
                data: Array.from(chartData.keys())
            },
            series: charSeries
        };
        const selectedExt = this.state.datasetSrc.get(this.state.selectedExtension);
        const updateState = (selectedId: string) => {
            this.updateState({ ...this.state, selectedExtension: selectedId }, true);
            if (this.refObj?.current) {
                // refresh table
                this.refObj.current.api.setRowData(this.state.datasetSrc.get(selectedId)?.events ?? []);
            }
        };
        return (
            <>
                <div id='header'>
                    <VSCodeDropdown>
                        {Array.from(this.state.datasetSrc.values()).map((ext) => (
                            <VSCodeOption key={ext.id} onClick={() => updateState(ext.id)}>
                                {ext.name}
                            </VSCodeOption>
                        ))}
                    </VSCodeDropdown>
                    <VSCodeButton className='refresh-button' appearance='icon' aria-label='Refresh' onClick={() => this.fillExtensionsList(true)}>
                        <span className='codicon codicon-refresh' title='Refresh' />
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
                    <VSCodeBadge className='ext-info-badge'>{selectedExt?.info?.webviews.length ?? 0}</VSCodeBadge>
                    <span className='info-param-name'>Listeners:</span>
                    <VSCodeBadge className='ext-info-badge'
                        title='Number of registered diagnostic listeners.'>{selectedExt?.info?.diagnosticListeners ?? 0}</VSCodeBadge>
                    <span className='info-param-name'>Pend. Requests:</span>
                    <VSCodeBadge className='ext-info-badge'
                        title='Number of pending requests.'>{selectedExt?.info?.pendingRequest ?? 0}</VSCodeBadge>
                    <span className='info-param-name'>Events:</span>
                    <VSCodeBadge className='ext-info-badge'>{selectedExt?.events.length ?? 0}</VSCodeBadge>
                </div>
                <div id='event-table'
                    className={getComputedStyle(document.getElementById('root')!).getPropertyValue('--event-table-class')}
                    style={{ height: 400, width: 'auto' }}>
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
                                    ...col
                                };
                            })}
                        rowHeight={30}
                        headerHeight={30}
                    >
                    </AgGridReact>
                </div>
                <div>
                    <ReactECharts option={option} />
                </div>
            </>
        );
    }

    collectChartData(chartData: ChartData, renderingData: MessengerEvent[], charSeries: Array<{ name: string, type: 'bar', data: number[] }>) {
        renderingData.map(d => d.sender ?? 'unknown').filter((value, index, self) => self.indexOf(value) === index).sort().forEach((it) => {
            chartData.set(it, {
                notification: 0,
                response: 0,
                request: 0
            });
        });

        renderingData.forEach((entry) => {
            const value = chartData.get(entry.sender ?? 'unknown');
            if (value) {
                switch (entry.type) {
                    case 'request':
                        value.request += entry.size;
                        break;
                    case 'response':
                        value.response += entry.size;
                        break;
                    case 'notification':
                        value.notification += entry.size;
                        break;
                }
            }
        });
        ['request', 'response', 'notification'].forEach(type => {
            const data = Array.from(chartData.values()).map(value => {
                if (type === 'request')
                    return value.request;
                else if (type === 'response')
                    return value.response;
                else if (type === 'notification')
                    return value.notification;
                else
                    return 0;
            });
            charSeries.push({
                name: type,
                type: 'bar',
                data: data
            });
        });
    }
}

export default DevtoolsComponent;
