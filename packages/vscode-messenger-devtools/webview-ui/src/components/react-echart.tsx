import type { ECharts, EChartsOption, SetOptionOpts } from 'echarts';
import { getInstanceByDom, init } from 'echarts';
import type { CSSProperties } from 'react';
import { useEffect, useRef } from 'react';
import { MessengerEvent } from 'vscode-messenger';

export interface ReactEChartsProps {
    option: EChartsOption;
    style?: CSSProperties;
    settings?: SetOptionOpts;
    loading?: boolean;
    theme?: 'light' | 'dark';
}

export type ChartData = Map<string, { notification: [number,number]; response: [number,number]; request: [number,number]; }>;

export function createOptions(charSeries: Array<{ name: string, data: number[] }>, yAxis: string[], legendFormat = ''): ReactEChartsProps['option'] {
    const option: ReactEChartsProps['option'] = {
        tooltip: {
            trigger: 'axis',
            axisPointer: {
                type: 'shadow',
            },
        },
        legend: {
            orient: 'horizontal',
            formatter: `{name}${legendFormat}`
        },
        grid: {
            show: true,
            top: 30,
            left: 1,
            bottom: '2%',
            containLabel: true
        },
        xAxis: {
            type: 'value',
            boundaryGap: [0, 0.01]
        },
        yAxis: {
            type: 'category',
            data: yAxis
        },
        series: charSeries.map((chunk) => {return {...chunk, type: 'bar'};})
    };
    return option;
}

export function collectChartData(renderingData: MessengerEvent[]):
{series:  [Array<{ name: string, data: number[] }>,Array<{ name: string, data: number[] }>], senderY: string[]}
{
    const chartData: ChartData = new Map();
    const charSeries: [Array<{ name: string, data: number[] }>,Array<{ name: string, data: number[] }>] = [[],[]];
    renderingData.map(d => d.sender ?? 'unknown').filter((value, index, self) => self.indexOf(value) === index).sort().forEach((it) => {
        chartData.set(it, {
            notification: [0,0],
            response: [0,0],
            request: [0,0]
        });
    });

    renderingData.forEach((entry) => {
        const value = chartData.get(entry.sender ?? 'unknown');
        if (value) {
            switch (entry.type) {
                case 'request':
                    value.request[0] += entry.size;
                    value.request[1] += 1;
                    break;
                case 'response':
                    value.response[0] += entry.size;
                    value.response[1] += 1;
                    break;
                case 'notification':
                    value.notification[0] += entry.size;
                    value.notification[1] += 1;
                    break;
            }
        }
    });
    ['request', 'response', 'notification'].forEach(type => {
        const data = Array.from(chartData.values()).map(value => {
            if (type === 'request')
                return value.request;
            else if (type === 'response')
                return value.response;
            else if (type === 'notification')
                return value.notification;
            else
                return [0,0];
        });
        charSeries[0].push({
            name: type,
            data: data.map(senderData => senderData[0])
        });
        charSeries[1].push({
            name: type,
            data: data.map(senderData => senderData[1])
        });
    });
    return {series: charSeries, senderY: Array.from(chartData.keys())};
}
export function ReactECharts({
    option,
    style,
    settings,
    loading,
    theme
}: ReactEChartsProps): JSX.Element {
    const chartRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        // Initialize chart
        let chart: ECharts | undefined;
        if (chartRef.current !== null) {
            chart = init(chartRef.current, theme);
        }

        // Add chart resize listener
        // ResizeObserver is leading to a bit janky UX
        function resizeChart() {
            chart?.resize();
        }
        window.addEventListener('resize', resizeChart);

        // Return cleanup function
        return () => {
            chart?.dispose();
            window.removeEventListener('resize', resizeChart);
        };
    }, [theme]);

    useEffect(() => {
        // Update chart
        if (chartRef.current !== null) {
            const chart = getInstanceByDom(chartRef.current);
            if (chart)
                chart.setOption(option, settings);
        }
    }, [option, settings, theme]); // Whenever theme changes we need to add option and setting due to it being deleted in cleanup function

    useEffect(() => {
        // Update chart
        if (chartRef.current !== null) {
            const chart = getInstanceByDom(chartRef.current);
            // eslint-disable-next-line @typescript-eslint/no-unused-expressions
            if (chart)
                loading === true ? chart.showLoading() : chart.hideLoading();
        }
    }, [loading, theme]);
    return <div ref={chartRef} style={{ width: '100%', height: '200px', ...style }} />;
}