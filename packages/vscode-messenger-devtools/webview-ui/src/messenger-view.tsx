import { SplitPane } from 'baukasten-ui';
import 'baukasten-ui/dist/baukasten-base.css';
import 'baukasten-ui/dist/baukasten-vscode.css';
import { Messenger } from 'vscode-messenger-webview';
import '../css/devtools-view.css';
import { EventTable } from './components/data-table';
import { ExtensionInfoPanel } from './components/extension-info';
import { collectChartData, createOptions, ReactECharts } from './components/react-echart';
import { ViewHeader } from './components/view-header';
import type { DataEvent, ExtendedMessengerEvent } from './model/messenger-types';
import { PushDataNotification } from './model/messenger-types';
import { useDevtoolsStore } from './utilities/data-store';
import { vsCodeApi } from './utilities/view-state';

//const storedState = restoreState();
const messenger = new Messenger(vsCodeApi, { debugLog: true });
messenger.start();

export function MessengerView(): JSX.Element {

    const updateEvents = useDevtoolsStore((state) => state.updateEvents);
    const updateExtensionData = useDevtoolsStore((state) => state.updateExtensionData);
    const loadedExtensions = useDevtoolsStore(state => state.getExtensions());

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
        <SplitPane.Pane>
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
        </SplitPane.Pane>
        <SplitPane.Pane preferredSize={2}>
            <VisualizationComponent />
        </SplitPane.Pane>
    </SplitPane>;
}

function VisualizationComponent(): JSX.Element {
    const showDiagram = useDevtoolsStore(state => state.diagramShown);
    const showCharts = useDevtoolsStore(state => state.chartsShown);
    const theme = useDevtoolsStore(state => state.theme);

    const _selectedExtension = useDevtoolsStore(state => state.selectedExtension);
    const selectedExt = useDevtoolsStore(state => state.datasetSrc.get(_selectedExtension));

    const charSeries = collectChartData(selectedExt?.events ?? []);
    const optionSize = createOptions(charSeries.series[0], charSeries.senderY, '  (chars)', theme);
    const optionCount = createOptions(charSeries.series[1], charSeries.senderY, '', theme);

    return (
        <div id='visualization-placeholder'>
            {/* Chart Components */}
            <div id='charts' style={{ display: showCharts ? 'flex' : 'none' }}>
                <ReactECharts option={optionCount} />
                <ReactECharts option={optionSize} />
            </div>
            {/* Diagram Components */}
            <div id='diagram' style={{ display: showDiagram ? 'flex' : 'none', height: '200px', width: '100%' }} >
                {
                    showDiagram &&
                    <span>Fancy diagram </span >
                }
            </div>
        </div>
    );
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

