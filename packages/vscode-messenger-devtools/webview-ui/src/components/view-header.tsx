import { VSCodeButton, VSCodeDropdown, VSCodeOption } from '@vscode/webview-ui-toolkit/react';
import type { CodiconName, SelectOption } from 'baukasten-ui';
import { Button, Icon, Select, Tooltip } from 'baukasten-ui';

import type { CSSProperties, MouseEventHandler } from 'react';
import type { ExtensionData } from '../devtools-view';

export function ViewHeader(props: {
    state: { selectedExtension: string | undefined; extensions: ExtensionData[]; },
    onExtensionSelected: (extId: string) => void,
    onRefreshClicked: MouseEventHandler<HTMLElement> | undefined,
    onClearClicked: (extId: string | undefined) => void,
    onToggleCharts: MouseEventHandler<HTMLElement> | undefined,
    onToggleDiagram: () => void,
    onExportJSON?: () => void,
    onExportCSV?: () => void,
}): JSX.Element {
    return (
        <>
            <div id='header'>
                <Tooltip content="List of extensions using vscode-messenger.">
                    <Select
                        value={props.state.selectedExtension ?? ''}
                        placeholder='List of extensions using vscode-messenger'
                        onChange={(value) => props.onExtensionSelected(value)}
                        options={
                            props.state.extensions.map((ext) => (
                                {
                                    label: ext.name,
                                    value: ext.id,
                                    description: ext.id
                                } as SelectOption))
                        }
                    />
                </Tooltip>

                <IconButton icon='refresh' title='Refresh Extension Data' onClick={props.onRefreshClicked} />
                <IconButton icon='trashcan' title='Clear Data' onClick={() => props.onClearClicked(props.state.selectedExtension)} />
                {props.onExportJSON && (
                    <IconButton icon='file-code' title='Export as JSON' onClick={props.onExportJSON} />
                )}
                {props.onExportCSV && (
                    <IconButton icon='file-text' title='Export as CSV' onClick={props.onExportCSV} />
                )}

                <IconButton icon='graph' title='Toggle Charts' sx={{ marginLeft: 'auto' }} onClick={props.onToggleCharts} />
                <IconButton icon='type-hierarchy' title='Toggle Diagram' onClick={props.onToggleDiagram} />
            </div>
            <div id='header'>
                <VSCodeDropdown value={props.state.selectedExtension} title='List of extensions using vscode-messenger.'>
                    {props.state.extensions.map((ext) => (
                        <VSCodeOption key={ext.id} value={ext.id}
                            onClick={() => props.onExtensionSelected(ext.id)}>
                            {ext.name}
                        </VSCodeOption>
                    ))}
                </VSCodeDropdown>

                <VscodeIconButton icon='refresh' title='Refresh Extension Data' onClick={props.onRefreshClicked} />
                <VscodeIconButton icon='trashcan' title='Clear Data' onClick={() => props.onClearClicked(props.state.selectedExtension)} />

                {props.onExportJSON && (
                    <VscodeIconButton icon='file-code' title='Export as JSON' onClick={props.onExportJSON} />
                )}
                {props.onExportCSV && (
                    <VscodeIconButton icon='file-text' title='Export as CSV' onClick={props.onExportCSV} />
                )}

                <VscodeIconButton icon='graph' title='Toggle Charts' sx={{ marginLeft: 'auto' }} onClick={props.onToggleCharts} />
                <VscodeIconButton icon='type-hierarchy' title='Toggle Diagram' onClick={props.onToggleDiagram} />
            </div>
        </>
    );
}

// TODO move back to css file
const buttonStyle = {
    marginLeft: '4px',
    marginTop: 'auto'
};

function IconButton(props: { icon: CodiconName, title: string, onClick: MouseEventHandler<HTMLElement> | undefined, sx?: CSSProperties }): JSX.Element {
    return (
        <Button variant="ghost" style={{ ...buttonStyle, ...props.sx }} onClick={props.onClick} aria-label={props.title}>
            <Icon name={props.icon} title={props.title} />
        </Button>
    );
}

function VscodeIconButton(props: { icon: string, title: string, onClick: MouseEventHandler<HTMLElement> | undefined, sx?: CSSProperties }): JSX.Element {
    return (
        <VSCodeButton appearance='icon' style={{ ...buttonStyle, ...props.sx }} aria-label={props.title} onClick={props.onClick}>
            <span className={'codicon codicon-' + props.icon} title={props.title} />
        </VSCodeButton>
    );
}