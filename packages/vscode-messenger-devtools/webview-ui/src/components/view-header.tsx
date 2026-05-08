import { VSCodeButton, VSCodeDropdown, VSCodeOption } from '@vscode/webview-ui-toolkit/react';
import type { CodiconName } from 'baukasten-ui';
import { Button, Icon, Select, Tooltip } from 'baukasten-ui';

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
    onToggleDiagram: () => void,
    onExportJSON?: () => void,
    onExportCSV?: () => void,
    baukastenOnly?: boolean,
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

                <IconButton icon='refresh' title='Refresh Extension Data' onClick={async () => {
                    const extensions = await props.messenger.sendRequest(ExtensionListRequest, HOST_EXTENSION, true);
                    updateExtensionData(extensions);
                }} />
                <IconButton icon='trashcan' title='Clear Data' onClick={() => {
                    if (selectedExtensionId)
                        updateEvents(selectedExtensionId, []);
                }
                } />
                {props.onExportJSON && (
                    <IconButton icon='file-code' title='Export as JSON' onClick={props.onExportJSON} />
                )}
                {props.onExportCSV && (
                    <IconButton icon='file-text' title='Export as CSV' onClick={props.onExportCSV} />
                )}

                <IconButton icon='graph' title='Toggle Charts' sx={{ marginLeft: 'auto' }} onClick={(e) => {
                    updateVisualization('charts');
                    if (props.onToggleCharts)
                        props.onToggleCharts(e);

                }} />
                <IconButton icon='type-hierarchy' title='Toggle Diagram' onClick={() => {
                    updateVisualization('diag');
                    if (props.onToggleDiagram)
                        props.onToggleDiagram();

                }} />
            </div>
            {!props.baukastenOnly && <div id='header'>
                <VSCodeDropdown value={selectedExtensionId} title='List of extensions using vscode-messenger.'>
                    {loadedExtensions.map((ext) => (
                        <VSCodeOption key={ext.id} value={ext.id}
                            onClick={() => props.onExtensionSelected(ext.id)}>
                            {ext.name}
                        </VSCodeOption>
                    ))}
                </VSCodeDropdown>

                <VscodeIconButton icon='refresh' title='Refresh Extension Data' onClick={props.onRefreshClicked} />
                <VscodeIconButton icon='trashcan' title='Clear Data' onClick={() => props.onClearClicked(selectedExtensionId)} />

                {props.onExportJSON && (
                    <VscodeIconButton icon='file-code' title='Export as JSON' onClick={props.onExportJSON} />
                )}
                {props.onExportCSV && (
                    <VscodeIconButton icon='file-text' title='Export as CSV' onClick={props.onExportCSV} />
                )}

                <VscodeIconButton icon='graph' title='Toggle Charts' sx={{ marginLeft: 'auto' }} onClick={() => { }} />
                <VscodeIconButton icon='type-hierarchy' title='Toggle Diagram' onClick={() => { }} />
            </div>
            }
        </>
    );
}

// TODO move back to css file
const buttonStyle = {
    marginLeft: '4px',
    marginTop: 'auto'
};

function IconButton(props: { icon: CodiconName, title: string, onClick: MouseEventHandler<HTMLElement> | undefined, sx?: CSSProperties }): React.JSX.Element {
    return (
        <Button variant="ghost" style={{ ...buttonStyle, ...props.sx }} onClick={props.onClick} aria-label={props.title}>
            <Icon size={'sm'} name={props.icon} title={props.title} />
        </Button>
    );
}

function VscodeIconButton(props: { icon: string, title: string, onClick: MouseEventHandler<HTMLElement> | undefined, sx?: CSSProperties }): React.JSX.Element {
    return (
        <VSCodeButton appearance='icon' style={{ ...buttonStyle, ...props.sx }} aria-label={props.title} onClick={props.onClick}>
            <span className={'codicon codicon-' + props.icon} title={props.title} />
        </VSCodeButton>
    );
}