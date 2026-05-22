import React, { useEffect, useId, useMemo, useRef, useState } from 'react';
import type { MessengerEvent } from 'vscode-messenger';

export type MessengerEventType = 'request' | 'response' | 'notification';

export interface MessengerSenderStats {
    sender: string;
    count: Record<MessengerEventType, number>;
    size: Record<MessengerEventType, number>;
}

export type ChartLayout = 'stacked' | 'grouped';
export type ChartMetric = 'count' | 'size';

export interface MessengerChartProps {
    data: MessengerSenderStats[];
    metric: ChartMetric;
    layout?: ChartLayout;
    title?: string;
    /** Suffix appended to values in legend/tooltip, e.g. " chars". */
    unitSuffix?: string;
    /** Optional fixed SVG height. When omitted, height is derived from row count. */
    height?: number;
}

const EVENT_TYPES: readonly MessengerEventType[] = ['request', 'response', 'notification'] as const;

// Sourced from CSS custom properties defined on `body` in devtools-view.css.
// The same variables drive the data table's rowType_* classes, so changing them
// in one place updates both the table and the chart.
const TYPE_COLORS: Record<MessengerEventType, string> = {
    request: 'var(--messenger-color-request, #3794ff)',
    response: 'var(--messenger-color-response, #6cc063)',
    notification: 'var(--messenger-color-notification, #d18616)'
};

const STACKED_BAR_HEIGHT = 22;
const STACKED_ROW_GAP = 14;
const GROUPED_BAR_HEIGHT = 9;
const GROUPED_BAR_GAP = 2;
const GROUPED_OUTER_GAP = 14;
const TOP_PADDING = 8;
const BOTTOM_PADDING = 20;
const LEFT_GUTTER = 140;
const RIGHT_PADDING = 56;
const MIN_WIDTH = 280;
const MAX_LABEL_CHARS = 18;

const valueFormatter = new Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 1 });
const fullFormatter = new Intl.NumberFormat('en');

/**
 * Aggregate raw messenger events into per-sender request/response/notification totals.
 */
export function collectSenderStats(events: MessengerEvent[]): MessengerSenderStats[] {
    const map = new Map<string, MessengerSenderStats>();
    const ensure = (sender: string): MessengerSenderStats => {
        let stats = map.get(sender);
        if (!stats) {
            stats = {
                sender,
                count: { request: 0, response: 0, notification: 0 },
                size: { request: 0, response: 0, notification: 0 }
            };
            map.set(sender, stats);
        }
        return stats;
    };

    for (const event of events) {
        const type = event.type as MessengerEventType;
        if (type !== 'request' && type !== 'response' && type !== 'notification') continue;
        const stats = ensure(event.sender ?? 'unknown');
        stats.count[type] += 1;
        stats.size[type] += event.size;
    }

    return Array.from(map.values()).sort((a, b) => a.sender.localeCompare(b.sender));
}

interface NiceScale { max: number; ticks: number[]; }

function niceScale(rawMax: number, tickCount = 4): NiceScale {
    if (rawMax <= 0) {
        return { max: 1, ticks: [0, 1] };
    }
    const exp = Math.floor(Math.log10(rawMax));
    const fraction = rawMax / Math.pow(10, exp);
    let niceFraction: number;
    if (fraction <= 1) niceFraction = 1;
    else if (fraction <= 2) niceFraction = 2;
    else if (fraction <= 5) niceFraction = 5;
    else niceFraction = 10;
    const niceMax = niceFraction * Math.pow(10, exp);
    const step = niceMax / tickCount;
    const ticks: number[] = [];
    for (let i = 0; i <= tickCount; i++) ticks.push(step * i);
    return { max: niceMax, ticks };
}

function truncate(value: string, max: number): string {
    if (value.length <= max) return value;
    const half = Math.floor((max - 1) / 2);
    return value.slice(0, half) + '\u2026' + value.slice(value.length - (max - 1 - half));
}

interface TooltipState {
    x: number;
    y: number;
    sender: string;
    type: MessengerEventType;
    value: number;
}

export function MessengerChart({
    data,
    metric,
    layout = 'stacked',
    title,
    unitSuffix,
    height
}: MessengerChartProps): React.JSX.Element {
    const containerRef = useRef<HTMLDivElement | null>(null);
    const clipBaseId = useId();
    const [width, setWidth] = useState(0);
    const [tooltip, setTooltip] = useState<TooltipState | null>(null);

    useEffect(() => {
        const el = containerRef.current;
        if (!el) return;
        const observer = new ResizeObserver(entries => {
            for (const entry of entries) {
                setWidth(entry.contentRect.width);
            }
        });
        observer.observe(el);
        setWidth(el.clientWidth);
        return () => observer.disconnect();
    }, []);

    const senders = data;

    const rawMax = useMemo(() => {
        if (senders.length === 0) return 0;
        if (layout === 'stacked') {
            return senders.reduce((acc, s) => {
                const total = EVENT_TYPES.reduce((sum, t) => sum + s[metric][t], 0);
                return Math.max(acc, total);
            }, 0);
        }
        return senders.reduce(
            (acc, s) => EVENT_TYPES.reduce((sub, t) => Math.max(sub, s[metric][t]), acc),
            0
        );
    }, [senders, metric, layout]);

    const scale = useMemo(() => niceScale(rawMax, 4), [rawMax]);

    const computedRowsHeight = useMemo(() => {
        if (senders.length === 0) return 60;
        if (layout === 'stacked') {
            return senders.length * (STACKED_BAR_HEIGHT + STACKED_ROW_GAP) - STACKED_ROW_GAP;
        }
        const groupHeight = GROUPED_BAR_HEIGHT * 3 + GROUPED_BAR_GAP * 2;
        return senders.length * (groupHeight + GROUPED_OUTER_GAP) - GROUPED_OUTER_GAP;
    }, [senders.length, layout]);

    const svgHeight = height ?? (TOP_PADDING + computedRowsHeight + BOTTOM_PADDING);

    const effectiveWidth = Math.max(MIN_WIDTH, width || MIN_WIDTH);
    const chartWidth = Math.max(40, effectiveWidth - LEFT_GUTTER - RIGHT_PADDING);
    const chartLeft = LEFT_GUTTER;
    const chartRight = chartLeft + chartWidth;

    const valueToX = (v: number): number =>
        chartLeft + (scale.max === 0 ? 0 : (v / scale.max) * chartWidth);

    const handleHover = (
        sender: string,
        type: MessengerEventType,
        value: number,
        event: React.MouseEvent
    ): void => {
        const rect = containerRef.current?.getBoundingClientRect();
        if (!rect) return;
        setTooltip({
            x: event.clientX - rect.left,
            y: event.clientY - rect.top,
            sender,
            type,
            value
        });
    };
    const handleLeave = (): void => setTooltip(null);

    return (
        <div className='messenger-chart' ref={containerRef}>
            {title && <div className='messenger-chart__title'>{title}</div>}
            <div className='messenger-chart__legend' role='list'>
                {EVENT_TYPES.map(type => (
                    <div className='messenger-chart__legend-item' key={type} role='listitem'>
                        <span
                            className='messenger-chart__legend-swatch'
                            style={{ background: TYPE_COLORS[type] }}
                            aria-hidden='true'
                        />
                        <span className='messenger-chart__legend-label'>
                            {type}{unitSuffix ?? ''}
                        </span>
                    </div>
                ))}
            </div>
            <div
                className='messenger-chart__canvas'
                style={{ height: svgHeight }}
                onMouseLeave={handleLeave}
            >
                {senders.length === 0 ? (
                    <div className='messenger-chart__empty'>No events yet</div>
                ) : (
                    <svg
                        className='messenger-chart__svg'
                        width={effectiveWidth}
                        height={svgHeight}
                        viewBox={`0 0 ${effectiveWidth} ${svgHeight}`}
                        preserveAspectRatio='none'
                        role='img'
                        aria-label={title ?? 'Messenger statistics chart'}
                    >
                        <defs>
                            {senders.map((s, idx) => {
                                const rowY = layout === 'stacked'
                                    ? TOP_PADDING + idx * (STACKED_BAR_HEIGHT + STACKED_ROW_GAP)
                                    : 0;
                                return (
                                    <clipPath
                                        key={s.sender}
                                        id={`${clipBaseId}-row-${idx}`}
                                    >
                                        <rect
                                            x={chartLeft}
                                            y={rowY}
                                            width={chartWidth}
                                            height={STACKED_BAR_HEIGHT}
                                            rx={6}
                                            ry={6}
                                        />
                                    </clipPath>
                                );
                            })}
                        </defs>

                        {scale.ticks.map((tick, i) => {
                            const x = valueToX(tick);
                            return (
                                <g key={i}>
                                    <line
                                        x1={x}
                                        x2={x}
                                        y1={TOP_PADDING}
                                        y2={svgHeight - BOTTOM_PADDING}
                                        className='messenger-chart__gridline'
                                    />
                                    <text
                                        x={x}
                                        y={svgHeight - BOTTOM_PADDING + 16}
                                        textAnchor='middle'
                                        className='messenger-chart__tick-label'
                                    >{valueFormatter.format(tick)}</text>
                                </g>
                            );
                        })}

                        {senders.map((s, idx) => (
                            layout === 'stacked'
                                ? renderStackedRow({
                                    s, idx, metric, scale, chartLeft, chartWidth, chartRight,
                                    clipId: `${clipBaseId}-row-${idx}`,
                                    unitSuffix, onHover: handleHover, onLeave: handleLeave
                                })
                                : renderGroupedRow({
                                    s, idx, metric, scale, chartLeft, chartWidth,
                                    onHover: handleHover, onLeave: handleLeave
                                })
                        ))}
                    </svg>
                )}
            </div>
            {tooltip && (
                <div
                    className='messenger-chart__tooltip'
                    style={{ left: tooltip.x + 12, top: tooltip.y + 12 }}
                    role='tooltip'
                >
                    <div className='messenger-chart__tooltip-sender'>{tooltip.sender}</div>
                    <div className='messenger-chart__tooltip-row'>
                        <span
                            className='messenger-chart__legend-swatch'
                            style={{ background: TYPE_COLORS[tooltip.type] }}
                            aria-hidden='true'
                        />
                        <span className='messenger-chart__tooltip-type'>{tooltip.type}</span>
                        <span className='messenger-chart__tooltip-value'>
                            {fullFormatter.format(tooltip.value)}{unitSuffix ?? ''}
                        </span>
                    </div>
                </div>
            )}
        </div>
    );
}

interface StackedRowArgs {
    s: MessengerSenderStats;
    idx: number;
    metric: ChartMetric;
    scale: NiceScale;
    chartLeft: number;
    chartWidth: number;
    chartRight: number;
    clipId: string;
    unitSuffix?: string;
    onHover: (sender: string, type: MessengerEventType, value: number, e: React.MouseEvent) => void;
    onLeave: () => void;
}

function renderStackedRow(args: StackedRowArgs): React.JSX.Element {
    const { s, idx, metric, scale, chartLeft, chartWidth, chartRight, clipId, unitSuffix, onHover, onLeave } = args;
    const rowY = TOP_PADDING + idx * (STACKED_BAR_HEIGHT + STACKED_ROW_GAP);
    const total = EVENT_TYPES.reduce((sum, t) => sum + s[metric][t], 0);
    let cursor = chartLeft;
    return (
        <g key={s.sender} className='messenger-chart__row'>
            <text
                x={chartLeft - 8}
                y={rowY + STACKED_BAR_HEIGHT / 2}
                textAnchor='end'
                dominantBaseline='middle'
                className='messenger-chart__sender-label'
            >
                {truncate(s.sender, MAX_LABEL_CHARS)}
            </text>
            <rect
                x={chartLeft}
                y={rowY}
                width={chartWidth}
                height={STACKED_BAR_HEIGHT}
                rx={6}
                ry={6}
                className='messenger-chart__track'
            />
            <g clipPath={`url(#${clipId})`}>
                {EVENT_TYPES.map(type => {
                    const value = s[metric][type];
                    if (value <= 0) return null;
                    const segWidth = scale.max === 0 ? 0 : (value / scale.max) * chartWidth;
                    const x = cursor;
                    cursor += segWidth;
                    return (
                        <rect
                            key={type}
                            x={x}
                            y={rowY}
                            width={Math.max(0, segWidth)}
                            height={STACKED_BAR_HEIGHT}
                            fill={TYPE_COLORS[type]}
                            className='messenger-chart__bar'
                            onMouseMove={e => onHover(s.sender, type, value, e)}
                            onMouseLeave={onLeave}
                        />
                    );
                })}
            </g>
            {total > 0 && (
                <text
                    x={Math.min(chartRight + 6, chartLeft + (total / scale.max) * chartWidth + 6)}
                    y={rowY + STACKED_BAR_HEIGHT / 2}
                    dominantBaseline='middle'
                    className='messenger-chart__value-label'
                >{valueFormatter.format(total)}{unitSuffix ?? ''}</text>
            )}
        </g>
    );
}

interface GroupedRowArgs {
    s: MessengerSenderStats;
    idx: number;
    metric: ChartMetric;
    scale: NiceScale;
    chartLeft: number;
    chartWidth: number;
    onHover: (sender: string, type: MessengerEventType, value: number, e: React.MouseEvent) => void;
    onLeave: () => void;
}

function renderGroupedRow(args: GroupedRowArgs): React.JSX.Element {
    const { s, idx, metric, scale, chartLeft, chartWidth, onHover, onLeave } = args;
    const groupHeight = GROUPED_BAR_HEIGHT * 3 + GROUPED_BAR_GAP * 2;
    const groupY = TOP_PADDING + idx * (groupHeight + GROUPED_OUTER_GAP);
    return (
        <g key={s.sender} className='messenger-chart__row'>
            <text
                x={chartLeft - 8}
                y={groupY + groupHeight / 2}
                textAnchor='end'
                dominantBaseline='middle'
                className='messenger-chart__sender-label'
            >
                {truncate(s.sender, MAX_LABEL_CHARS)}
            </text>
            {EVENT_TYPES.map((type, ti) => {
                const value = s[metric][type];
                const barY = groupY + ti * (GROUPED_BAR_HEIGHT + GROUPED_BAR_GAP);
                const barWidth = scale.max === 0 ? 0 : (value / scale.max) * chartWidth;
                return (
                    <g key={type}>
                        <rect
                            x={chartLeft}
                            y={barY}
                            width={chartWidth}
                            height={GROUPED_BAR_HEIGHT}
                            rx={3}
                            ry={3}
                            className='messenger-chart__track'
                        />
                        <rect
                            x={chartLeft}
                            y={barY}
                            width={Math.max(0, barWidth)}
                            height={GROUPED_BAR_HEIGHT}
                            rx={3}
                            ry={3}
                            fill={TYPE_COLORS[type]}
                            className='messenger-chart__bar'
                            onMouseMove={e => onHover(s.sender, type, value, e)}
                            onMouseLeave={onLeave}
                        />
                    </g>
                );
            })}
        </g>
    );
}
