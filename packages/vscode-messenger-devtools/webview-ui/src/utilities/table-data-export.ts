import type { MessengerEvent } from 'vscode-messenger';
import { HOST_EXTENSION } from 'vscode-messenger-common';
import type { Messenger } from 'vscode-messenger-webview';
import type { EventTable } from '../components/event-table';
import type { ExtendedExtensionData, ExtendedMessengerEvent } from '../model/messenger-types';
import { SaveFileRequest } from '../model/messenger-types';

export class TableDataExporter {

    private readonly messenger: Messenger;

    constructor(messenger: Messenger) {
        this.messenger = messenger;
    }

    exportTableData(eventTable: EventTable, selectedExtension: ExtendedExtensionData, format: 'json' | 'csv'): void {
        const api = eventTable.getGridApi();
        if (!api) {
            console.warn('Grid API not available for export');
            return;
        }

        const extensionName = selectedExtension?.id || 'messenger-events';
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const filename = `${extensionName}-${timestamp}`;

        try {
            const dataToExport = api.getSelectedNodes().length > 0 ? api.getSelectedRows() : selectedExtension?.events ?? [];
            if (format === 'json') {
                const jsonData = JSON.stringify(dataToExport, null, 2);
                this.saveFileViaVSCode(`${filename}.json`, jsonData);
            } else if (format === 'csv') {
                const csvData = this.toCsv(dataToExport);
                this.saveFileViaVSCode(`${filename}.csv`, csvData);
            }
        } catch (error) {
            console.error(`Failed to export as ${format}:`, error);
        }
    }

    private toCsv(dataToExport: MessengerEvent[]) {
        if (dataToExport.length === 0) {
            return '';
        }

        // Define headers based on MessengerEvent/ExtendedMessengerEvent properties
        const headers = ['id', 'type', 'sender', 'receiver', 'method', 'error', 'size', 'timestamp', 'parameter', 'timeAfterRequest', 'payloadInfo'];

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const escapeCSVValue = (value: any): string => {
            if (value === null || value === undefined) {
                return '';
            }

            let stringValue: string;
            if (typeof value === 'object') {
                try {
                    stringValue = JSON.stringify(value);
                    // eslint-disable-next-line @typescript-eslint/no-unused-vars
                } catch (_error) {
                    stringValue = String(value);
                }
            } else {
                stringValue = String(value);
            }

            // If value contains comma, newline, or double quote, wrap in quotes and escape internal quotes
            if (stringValue.includes(',') || stringValue.includes('\n') || stringValue.includes('\r') || stringValue.includes('"')) {
                return `"${stringValue.replace(/"/g, '""')}"`;
            }

            return stringValue;
        };

        const rows = dataToExport.map(event => {
            const extendedEvent = event as ExtendedMessengerEvent;
            return headers.map(header =>
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                escapeCSVValue((extendedEvent as any)[header])
            ).join(',');
        });

        return [headers.join(','), ...rows].join('\n');
    }

    private async saveFileViaVSCode(filename: string, content: string): Promise<void> {
        try {
            const result = await this.messenger.sendRequest(SaveFileRequest, HOST_EXTENSION, { filename, content });
            if (result === 'error') {
                console.error('File save failed');
            }
        } catch (error) {
            console.error('Error saving file via VS Code API:', error);
        }
    }
}