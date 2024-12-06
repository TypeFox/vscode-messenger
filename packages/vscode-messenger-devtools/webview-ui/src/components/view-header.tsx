import { VSCodeButton, VSCodeDropdown, VSCodeOption } from '@vscode/webview-ui-toolkit/react';
import type { MouseEventHandler } from 'react';
import type { ExtensionData } from '../devtools-view';

export function ViewHeader(props: {
    state: { selectedExtension: string | undefined; extensions: ExtensionData[]; },
    onExtensionSelected: (extId: string) => void,
    onRefreshClicked: MouseEventHandler<HTMLElement> | undefined,
    onClearClicked: (extId: string | undefined) => void,
    onToggleCharts: MouseEventHandler<HTMLElement> | undefined,
    onToggleDiagram: () => void,
}): JSX.Element {
    return (
        <div id='header'>
            <VSCodeDropdown value={props.state.selectedExtension} title='List of extensions using vscode-messenger.'>
                {props.state.extensions.map((ext) => (
                    <VSCodeOption key={ext.id} value={ext.id} onClick={() => props.onExtensionSelected(ext.id)}>
                        {ext.name}
                    </VSCodeOption>
                ))}
            </VSCodeDropdown>
            <VSCodeButton className='refresh-button' appearance='icon' aria-label='Refresh Extension Data' onClick={props.onRefreshClicked}>
                <span className='codicon codicon-refresh' title='Refresh' />
            </VSCodeButton>
            <VSCodeButton className='clear-button' appearance='icon' aria-label='Clear Data' onClick={() => props.onClearClicked(props.state.selectedExtension)}>
                <span className='codicon codicon-trashcan' title='Clear Data' />
            </VSCodeButton>
            <VSCodeButton className='toggle-charts-button' appearance='icon' aria-label='Toggle Charts' onClick={props.onToggleCharts}>
                <span className='codicon codicon-graph' title='Toggle Charts' />
            </VSCodeButton>
            <VSCodeButton className='toggle-diagram-button' appearance='icon' aria-label='Toggle Diagram' onClick={
                () => {
                    props.onToggleDiagram();
                }
            }>
                <span className='codicon codicon-type-hierarchy' title='Toggle Diagram' />
            </VSCodeButton>
        </div>
    );
}