import React from 'react';
import { useDevtoolsStore } from '../utilities/data-store';
import { collectSenderStats, MessengerChart } from './messenger-chart';

export function VisualizationComponent(): React.JSX.Element {
    const showDiagram = useDevtoolsStore(state => state.diagramShown);
    const showCharts = useDevtoolsStore(state => state.chartsShown);

    const _selectedExtension = useDevtoolsStore(state => state.selectedExtension);
    const selectedExt = useDevtoolsStore(state => state.datasetSrc.get(_selectedExtension));

    const stats = collectSenderStats(selectedExt?.events ?? []);

    return (
        <div id='visualization-placeholder'>
            {/* Chart Components */}
            <div id='charts' style={{ display: showCharts ? 'flex' : 'none' }}>
                <MessengerChart data={stats} metric='count' title='Message count' />
                <MessengerChart data={stats} metric='size' title='Payload size' unitSuffix=' chars' />
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
