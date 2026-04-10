import { Pane, SplitPane } from 'baukasten-ui';
import 'baukasten-ui/dist/baukasten-base.css';
import 'baukasten-ui/dist/baukasten-vscode.css';
import { Messenger } from 'vscode-messenger-webview';
import '../css/devtools-view.css';
import { EventTable } from './components/data-table';
import { ExtensionInfoPanel } from './components/extension-info';
import { ViewHeader } from './components/view-header';
import { VisualizationComponent } from './components/visualization';
import type { DataEvent, ExtendedMessengerEvent } from './model/messenger-types';
import { PushDataNotification } from './model/messenger-types';
import { useDevtoolsStore } from './utilities/data-store';
import { vsCodeApi } from './utilities/view-state';

const messenger = new Messenger(vsCodeApi, { debugLog: true });
messenger.start();

export function MessengerView(): JSX.Element {

    const updateEvents = useDevtoolsStore((state) => state.updateEvents);
    const updateExtensionData = useDevtoolsStore((state) => state.updateExtensionData);
    const loadedExtensions = useDevtoolsStore(state => state.getExtensions());
    const showDiagram = useDevtoolsStore(state => state.diagramShown);
    const showCharts = useDevtoolsStore(state => state.chartsShown);
    
    messenger.onNotification(PushDataNotification, event => {
        const extension = loadedExtensions.find(ext => ext.id === event.extension);
        if (extension) {
            const updatedEvents = handleDataPush(event, extension.events);
            updateEvents(extension.id, updatedEvents);
        } else {
            // Unknown extension
            updateExtensionData([{
                id: event.extension, name: '',
                active: true,
                exportsDiagnosticApi: true
            }]);
            updateEvents(event.extension, [event.event]);
            console.debug('Received data for unknown extension: ', event.extension);
        }
    });

    return <SplitPane vertical={true} minSize={0} >
        <Pane>
            {/* Header Control Component */}
            <ViewHeader
                state={{ selectedExtension: undefined, extensions: undefined }}
                onExtensionSelected={(_extId) => { }}
                onRefreshClicked={async () => { }}
                onClearClicked={async (_extId: string | undefined) => { }}
                onToggleDiagram={() => { }}
                onToggleCharts={() => { }}
                onExportJSON={() => exportTableData('json')}
                onExportCSV={() => exportTableData('csv')}
                baukastenOnly={true}
                messenger={messenger}
            />

            {/* Extension status Component */}
            <ExtensionInfoPanel selectedExtensionProp={undefined} baukastenOnly={true} />
            <EventTable />
        </Pane>
        <Pane preferredSize={(showCharts || showDiagram)? 200 : 2} maxSize={(showCharts || showDiagram)? 100000 : 2} minSize={(showCharts || showDiagram)? 200 : 2} >
            <VisualizationComponent />
        </Pane>
    </SplitPane>;
}

function handleDataPush(dataEvent: DataEvent & { event: ExtendedMessengerEvent; }, extEvents: ExtendedMessengerEvent[]) {
    //const highlight: HighlightData[] = [];
    const isResponse = dataEvent.event.type === 'response';
    if (isResponse && dataEvent.event.timestamp) {
        // Take max 200 entries to look-up
        const request = extEvents.slice(0, 200).find(event => event.type === 'request' && event.id === dataEvent.event.id);
        if (request && request.timestamp) {
            dataEvent.event.timeAfterRequest = dataEvent.event.timestamp - request.timestamp;
            //highlight.push({link: toLinkId(dataEvent.event.receiver, dataEvent.event.sender), type: 'request' });
        }
    }

    if (dataEvent.event.parameter) {
        dataEvent.event.payloadInfo = `${isResponse ? 'Response' : 'Parameter'} (max 500 chars):\n ${JSON.stringify(dataEvent.event.parameter, undefined, '  ').substring(0, 499)}`;
    } else {
        dataEvent.event.payloadInfo = 'Payload information is empty or suppressed using diagnostic API options.';
    }

    extEvents.unshift(dataEvent.event);
    return extEvents;
}

function exportTableData(format: 'json' | 'csv') {
    console.error('exportTableData not implemented! ', format);
}

