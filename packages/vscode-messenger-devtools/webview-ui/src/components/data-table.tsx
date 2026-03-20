import { type ColumnDef, DataTable, type DataTableProps, Tooltip } from 'baukasten-ui';
import type { ExtendedMessengerEvent } from '../model/messenger-types';
import { useDevtoolsStore } from '../utilities/data-store';

function renderPayloadInfo(payloadInfo: string) {
    const newlineIdx = payloadInfo.indexOf('\n');
    if (newlineIdx === -1) {
        return <span>{payloadInfo}</span>;
    }
    const label = payloadInfo.slice(0, newlineIdx);
    const json = payloadInfo.slice(newlineIdx + 1);
    return (
        <div>
            <div style={{ marginBottom: '4px', fontSize: '11px' }}>{label}</div>
            <pre style={{
                margin: 0,
                fontSize: '10px',
                fontFamily: 'var(--vscode-editor-font-family, monospace)',
                whiteSpace: 'pre',
                maxHeight: '300px',
                maxWidth: '480px',
                overflow: 'auto',
            }}>{json}</pre>
        </div>
    );
}

const columnsDef: Array<ColumnDef<ExtendedMessengerEvent, unknown>> = [
    {
        accessorKey: 'type',
        header: 'Type',
        size: 110,
        cell: ({ row, getValue }) => {
            const data = row.original;
            const rowType = data.type ?? 'unknown';
            const error = data.error ? <span className='table-cell codicon codicon-stop' title={data.error}></span> : undefined;
            const content = <div className={'rowType_' + rowType} style={{ display: 'flex', alignContent: 'space-between' }}><span style={{ flexGrow: 1 }}>{String(getValue())}</span>{error}</div>;
            return data.payloadInfo
                ? <Tooltip content={renderPayloadInfo(data.payloadInfo)} maxWidth='500px'>{content}</Tooltip>
                : content;
        },
    },
    {
        accessorKey: 'sender',
        header: 'Sender',
        size: 180,
    },
    {
        accessorKey: 'receiver',
        header: 'Receiver',
        size: 180,
    },
    {
        accessorKey: 'method',
        header: 'Method',
        size: 135,
        cell: ({ row, getValue }) => {
            const value = String(getValue() ?? '');
            return row.original.payloadInfo
                ? <Tooltip content={renderPayloadInfo(row.original.payloadInfo)} maxWidth='500px'><span>{value}</span></Tooltip>
                : value;
        },
    },
    {
        accessorKey: 'size',
        header: 'Size (Time)',
        size: 135,
        cell: ({ row }) => {
            const event = row.original;
            const charsCount = Intl.NumberFormat('en', { notation: 'compact' }).format(event.size);
            if (event.type === 'response' && typeof event.timeAfterRequest === 'number') {
                const tookMs = event.timeAfterRequest % 1000;
                const tookSec = Math.trunc(event.timeAfterRequest / 1000);
                const secPart = (tookSec > 0) ? `${tookSec}s ` : '';
                return `${charsCount} (${secPart}${tookMs}ms)`;
            }
            return charsCount;
        },
    },
    {
        accessorKey: 'id',
        header: 'ID',
    },
    {
        accessorKey: 'timestamp',
        header: 'Timestamp',
        size: 135,
        cell: ({ getValue }) => {
            const time = getValue() as number;
            if (typeof time === 'number') {
                const date = new Date(time);
                const prependZero = (n: number) => ('0' + n).slice(-2);
                return `${prependZero(date.getHours())}:${prependZero(date.getMinutes())}:${prependZero(date.getSeconds())}-${('00' + date.getMilliseconds()).slice(-3)}`;
            }
            return String(time);
        },
    },
    {
        accessorKey: 'error',
        header: 'Error',
    },
];

export function EventTable() {
    const extensionId = useDevtoolsStore((state) => state.selectedExtension);
    const selectedData = useDevtoolsStore((state) => state.getSelectedExtension());
    const events = selectedData?.events ?? [];
    const tableOptions: Partial<DataTableProps<ExtendedMessengerEvent>> = {
        enableSorting: true,
        enableRowSelection: true,
        enableColumnResizing: true,
        fillHeight: true,
        stickyHeader: true,
        size: 'sm',
        variant: 'zebra',
    };

    // FIXME DataTable is not updating even with different size of selectedEvents, need to force re-render with key for now
    return (
        <DataTable key={events.length}
            data={events}
            columns={columnsDef}
            aria-label={extensionId + '-events'}
            {...tableOptions}
        />
    );
}