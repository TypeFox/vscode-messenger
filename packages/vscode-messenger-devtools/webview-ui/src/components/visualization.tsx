import React from 'react';
import { useDevtoolsStore } from '../utilities/data-store';
import { collectChartData, createOptions, ReactECharts } from './react-echart';

export function VisualizationComponent(): React.JSX.Element {
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