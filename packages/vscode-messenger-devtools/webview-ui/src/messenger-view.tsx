import { Pane, SplitPane } from 'baukasten-ui';
import type { DataTableRef } from 'baukasten-ui/extra';
import 'baukasten-ui/dist/baukasten-base.css';
import 'baukasten-ui/dist/baukasten-vscode.css';
import React, { useRef } from 'react';
import { Messenger } from 'vscode-messenger-webview';
import '../css/devtools-view.css';
import { EventTable } from './components/data-table';
import type { ExtendedMessengerEvent } from './model/messenger-types';
import { ExtensionInfoPanel } from './components/extension-info';
import { ViewHeader } from './components/view-header';
import { VisualizationComponent } from './components/visualization';
import type { DataEvent } from './model/messenger-types';
import { PushDataNotification } from './model/messenger-types';
import { useDevtoolsStore } from './utilities/data-store';
import { vsCodeApi } from './utilities/view-state';
import { TableDataExporter } from './utilities/table-data-export';

const messenger = new Messenger(vsCodeApi, { debugLog: true });
messenger.start();

const tableExport = new TableDataExporter(messenger);

export function MessengerView(): React.JSX.Element {

    const tableRef = useRef<DataTableRef<ExtendedMessengerEvent>>(null);
    const [vizHeight, setVizHeight] = React.useState(200);

    const updateEvents = useDevtoolsStore((state) => state.updateEvents);
    const updateExtensionData = useDevtoolsStore((state) => state.updateExtensionData);
    const loadedExtensions = useDevtoolsStore(state => state.getExtensions());
    const showDiagram = useDevtoolsStore(state => state.diagramShown);
    const showCharts = useDevtoolsStore(state => state.chartsShown);

    messenger.onNotification(PushDataNotification, event => {
        const extension = loadedExtensions.find(ext => ext.id === event.extension);
        if (extension) {
            const processedEvent = processDataEvent(event, extension.events);
            updateEvents(extension.id, [processedEvent, ...extension.events]);
        } else {
            // Unknown extension
            updateExtensionData([{
                id: event.extension, name: '',
                active: true,
                exportsDiagnosticApi: true
            }]);
            const processedEvent = processDataEvent(event, []);
            updateEvents(event.extension, [processedEvent]);
            console.debug('Received data for unknown extension: ', event.extension);
        }
    });

    function exportTableData(format: 'json' | 'csv') {
        const state = useDevtoolsStore.getState();
        const selectedExtensionData = state.getSelectedExtension();
        const allEvents = selectedExtensionData?.events ?? [];
        const selectedEvents = tableRef.current?.getSelectedRows() ?? [];
        tableExport.exportTableData(allEvents, selectedEvents, state.selectedExtension, format);
    }
    return <SplitPane vertical={true} minSize={0} >
        <Pane>
            {/* Header Control Component */}
            <ViewHeader
                state={{ selectedExtension: undefined, extensions: undefined }}
                onExtensionSelected={(_extId) => { }}
                onRefreshClicked={async () => { }}
                onClearClicked={async (extId: string | undefined) => {
                    const id = extId ?? useDevtoolsStore.getState().selectedExtension;
                    if (id) {
                        updateEvents(id, []);
                    }
                }}
                onToggleCharts={() => { }}
                onExportJSON={() => exportTableData('json')}
                onExportCSV={() => exportTableData('csv')}
                messenger={messenger}
            />

            {/* Extension status Component */}
            <ExtensionInfoPanel selectedExtensionProp={undefined} />
            <EventTable ref={tableRef} />
        </Pane>
        <Pane preferredSize={(showCharts || showDiagram) ? vizHeight : 2} maxSize={(showCharts || showDiagram) ? 100000 : 2} minSize={(showCharts || showDiagram) ? vizHeight : 2} >
            <VisualizationComponent onNaturalHeightChange={setVizHeight} />
        </Pane>
    </SplitPane>;
}

/**
 * Process an incoming data event: compute timing for responses and format payload info.
 * Assigns a unique row ID via `ensureRowId`.
 * Returns the processed event (does NOT mutate the events array).
 */
function processDataEvent(dataEvent: DataEvent & { event: ExtendedMessengerEvent }, extEvents: ExtendedMessengerEvent[]): ExtendedMessengerEvent {
    const isResponse = dataEvent.event.type === 'response';
    if (isResponse && dataEvent.event.timestamp) {
        // Take max 200 entries to look-up
        const request = extEvents.slice(0, 200).find(event => event.type === 'request' && event.id === dataEvent.event.id);
        if (request && request.timestamp) {
            dataEvent.event.timeAfterRequest = dataEvent.event.timestamp - request.timestamp;
        }
    }

    if (dataEvent.event.parameter) {
        dataEvent.event.payloadInfo = `${isResponse ? 'Response' : 'Parameter'} (max 500 chars):\n ${JSON.stringify(dataEvent.event.parameter, undefined, '  ').substring(0, 499)}`;
    } else if (dataEvent.event.error) {
        dataEvent.event.payloadInfo = `\u26A0 ${dataEvent.event.error}`;
    } else {
        dataEvent.event.payloadInfo = 'Payload information is empty or suppressed using diagnostic API options.';
    }

    return dataEvent.event;
}
