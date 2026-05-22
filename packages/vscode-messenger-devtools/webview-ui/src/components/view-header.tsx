import type { CodiconName } from 'baukasten-ui';
import { Select, Tooltip } from 'baukasten-ui';

import { Icon, IconButton } from 'baukasten-ui/core';
import React, { useEffect, type CSSProperties, type MouseEventHandler } from 'react';
import { HOST_EXTENSION } from 'vscode-messenger-common';
import type { Messenger } from 'vscode-messenger-webview';
import { ExtensionListRequest, MESSENGER_EXTENSION_ID, type ExtensionData } from '../model/messenger-types';
import { useDevtoolsStore } from '../utilities/data-store';

export function ViewHeader(props: {
    messenger: Messenger
    state: { selectedExtension: string | undefined; extensions: ExtensionData[] | undefined; },
    onExtensionSelected: (extId: string) => void,
    onClearClicked: (extId: string | undefined) => void,
    onRefreshClicked: MouseEventHandler<HTMLElement> | undefined,
    onToggleCharts: MouseEventHandler<HTMLElement> | undefined,
    onExportJSON?: () => void,
    onExportCSV?: () => void,
}): React.JSX.Element {

    const selectedExtensionId: string | undefined = props.state.selectedExtension ?? useDevtoolsStore((state) => state.selectedExtension);;

    const loadedExtensions: ExtensionData[] = props.state.extensions ?? useDevtoolsStore((state) => state.getExtensions());
    const updateExtensionData = useDevtoolsStore((state) => state.updateExtensionData);
    const updateEvents = useDevtoolsStore((state) => state.updateEvents);
    const updateSelectedExtension = useDevtoolsStore((state) => state.updateSelectedExtension);
    const updateVisualization = useDevtoolsStore((state) => state.updateVisualizationSelect);

    useEffect(() => {
        // Initial load of extensions
        (async () => {
            const extensions = await props?.messenger?.sendRequest(ExtensionListRequest, HOST_EXTENSION, true);
            if (!extensions) {
                return;
            }
            updateExtensionData(extensions);
            if (selectedExtensionId === '' && extensions.length > 0) {
                // set first not vscode-messenger entry as selected extension
                let extensionToPreset = extensions[0];
                if (extensions.length > 1) {
                    extensionToPreset = extensions.find(ex => ex.id !== MESSENGER_EXTENSION_ID) ?? extensionToPreset;
                }
                if (extensionToPreset) {
                    updateSelectedExtension(extensionToPreset.id);
                }
            }
        })();
    }, []);

    return (
        <>
            <div id='header'>
                <Tooltip content="List of extensions using vscode-messenger.">
                    <Select
                        value={selectedExtensionId ?? ''}
                        placeholder='List of extensions using vscode-messenger'
                        onChange={(value) => {
                            updateSelectedExtension(value);
                        }}
                        options={
                            loadedExtensions.map((ext) => (
                                {
                                    label: ext.name,
                                    value: ext.id,
                                    description: ext.id
                                }))
                        }
                    />
                </Tooltip>

                <BIconButton icon='refresh' title='Refresh Extension Data' onClick={async () => {
                    const extensions = await props.messenger.sendRequest(ExtensionListRequest, HOST_EXTENSION, true);
                    updateExtensionData(extensions);
                }} />
                <BIconButton icon='trashcan' title='Clear Data' onClick={() => {
                    if (selectedExtensionId)
                        updateEvents(selectedExtensionId, []);
                }
                } />
                {props.onExportJSON && (
                    <BIconButton icon='file-code' title='Export as JSON' onClick={props.onExportJSON} />
                )}
                {props.onExportCSV && (
                    <BIconButton icon='file-text' title='Export as CSV' onClick={props.onExportCSV} />
                )}

                <BIconButton icon='graph' title='Toggle Charts' sx={{ marginLeft: 'auto' }} onClick={(e) => {
                    updateVisualization('charts');
                    if (props.onToggleCharts)
                        props.onToggleCharts(e);

                }} />
            </div>
        </>
    );
}

function BIconButton(props: { icon: CodiconName, title: string, onClick: MouseEventHandler<HTMLElement> | undefined, sx?: CSSProperties }): React.JSX.Element {
    return (
        <IconButton onClick={props.onClick} icon={
            <Icon size={'lg'} name={props.icon} title={props.title} />}
            style={{ ...props.sx }}
            variant='ghost' />
    );
}
