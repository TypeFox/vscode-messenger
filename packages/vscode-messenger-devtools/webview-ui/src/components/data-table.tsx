import { DataTable } from 'baukasten-ui';
import { useDevtoolsStore } from '../utilities/data-store';

const columnsDef = [
    { accessorKey: 'type', header: 'Type' },
    { accessorKey: 'sender', header: 'Sender' },
    { accessorKey: 'receiver', header: 'Receiver' },
    { accessorKey: 'method', header: 'Method' },
    { accessorKey: 'size', header: 'Size' },
    { accessorKey: 'id', header: 'ID' },
    { accessorKey: 'timestamp', header: 'Timestamp' },
    { accessorKey: 'error', header: 'Error' },
];

export function EventTable() {
    const extensionId = useDevtoolsStore((state) => state.selectedExtension);
    const selectedData = useDevtoolsStore((state) =>
        state.datasetSrc
    );
    const events = selectedData.get(extensionId ?? '')?.events ?? [];
    // FIXME DataTable is not updating even with different size of selectedEvents, need to force re-render with key for now
    return (
        <DataTable key={events.length} data={events} aria-label={extensionId + '-events'} columns={columnsDef} />
    );
}