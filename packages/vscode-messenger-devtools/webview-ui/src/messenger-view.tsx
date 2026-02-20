import 'baukasten-ui/dist/baukasten-base.css';
import 'baukasten-ui/dist/baukasten-vscode.css';
import { HOST_EXTENSION } from 'vscode-messenger-common';
import { Messenger } from 'vscode-messenger-webview';
import '../css/devtools-view.css';
import { EventTable } from './components/data-table';
import { ExtensionInfoPanel } from './components/extension-info';
import { ViewHeader } from './components/view-header';
import type { DataEvent, ExtendedMessengerEvent } from './model/messenger-types';
import { ExtensionListRequest, PushDataNotification } from './model/messenger-types';
import { useDevtoolsStore } from './utilities/data-store';
import { vsCodeApi } from './utilities/view-state';
import { useEffect } from 'react';

//const storedState = restoreState();
const messenger = new Messenger(vsCodeApi, { debugLog: true });
messenger.start();

export function MessengerView(): JSX.Element {
    const selectedExtension = useDevtoolsStore((state) => state.getSelectedExtension());
    const loadedExtensions = useDevtoolsStore((state) => state.getExtensions());

    const updateExtensionData = useDevtoolsStore((state) => state.updateExtensionData);
    const updateEvents = useDevtoolsStore((state) => state.updateEvents);
    const updateSelectedExtension = useDevtoolsStore((state) => state.updateSelectedExtension);

    useEffect(() => {
        // Initial load of extensions
        (async () => {
            const extensions = await messenger.sendRequest(ExtensionListRequest, HOST_EXTENSION, true);
            updateExtensionData(extensions);
        })();
    }, []);

    messenger.onNotification(PushDataNotification, event => {
        const extension = loadedExtensions.find(ext => ext.id === event.extension);
        if (extension) {
            const updatedEvents = handleDataPush(event, extension.events);
            updateEvents(extension.id, updatedEvents);
        } else {
            // Unknown extension
            updateExtensionData([{
                id: event.extension, name: '',
                events: [event.event],
                active: true,
                exportsDiagnosticApi: true
            }]);
            console.debug('Received data for unknown extension: ', event.extension);
        }
    });

    return <>
        {/* Header Control Component */}
        <ViewHeader
            state={{ selectedExtension: selectedExtension?.id, extensions: loadedExtensions }}
            onExtensionSelected={(extId) => {
                updateSelectedExtension(extId);
            }}
            onRefreshClicked={async () => {
                const extensions = await messenger.sendRequest(ExtensionListRequest, HOST_EXTENSION, true);
                updateExtensionData(extensions);
            }}
            onClearClicked={async (extId: string | undefined) => await clearExtensionData(extId)}
            onToggleDiagram={headerToggleDiagram}
            onToggleCharts={onToggleCharts}
            onExportJSON={() => exportTableData('json')}
            onExportCSV={() => exportTableData('csv')}
            baukastenOnly={true}
        />

        {/* Extension status Component */}
        <ExtensionInfoPanel selectedExtensionProp={undefined} baukastenOnly={true} />
        <EventTable />
    </>;
}

function handleDataPush(dataEvent: DataEvent & { event: ExtendedMessengerEvent; }, extEvents: ExtendedMessengerEvent[]) {
    //const highlight: HighlightData[] = [];
    const isResponse = dataEvent.event.type === 'response';
    if (isResponse && dataEvent.event.timestamp) {
        // Take max 200 entries to look-up
        const request = extEvents.slice(0, 200).find(event => event.type === 'request' && event.id === dataEvent.event.id);
        if (request && request.timestamp) {
            dataEvent.event.timeAfterRequest = dataEvent.event.timestamp - request.timestamp;
            //highlight.push({ link: toLinkId(dataEvent.event.receiver, dataEvent.event.sender), type: 'request' });
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

function onToggleCharts() {
    console.error('onToggleCharts not implemented!');
}

function headerToggleDiagram() {
    console.error('headerToggleDiagram not implemented!');
}

async function clearExtensionData(extId: string | undefined) {
    console.error('clearExtensionData not implemented! ', extId);
}

