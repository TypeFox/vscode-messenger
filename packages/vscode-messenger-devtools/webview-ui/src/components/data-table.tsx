import { type ColumnDef, DataTable, type DataTableProps } from 'baukasten-ui';
import type { ExtendedMessengerEvent } from '../model/messenger-types';
import { useDevtoolsStore } from '../utilities/data-store';

const columnsDef: Array<ColumnDef<ExtendedMessengerEvent, unknown>> = [
    {
        accessorKey: 'type',
        header: 'Type',
        size: 110,
        cell: ({ row, getValue }) => {
            const data = row.original;
            const rowType = data.type ?? 'unknown';
            const error = data.error ? <span className='table-cell codicon codicon-stop' title={data.error}></span> : undefined;
            return <div className={'rowType_' + rowType} style={{ display: 'flex', alignContent: 'space-between' }}><span style={{ flexGrow: 1 }}>{String(getValue())}</span>{error}</div>;
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
        enableColumnResizing: true,
        fillHeight: true,
        stickyHeader: true,
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