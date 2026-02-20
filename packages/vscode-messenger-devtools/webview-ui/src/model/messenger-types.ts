import type { ExtensionInfo, MessengerEvent } from 'vscode-messenger';
import type { NotificationType, RequestType } from 'vscode-messenger-common';

export type DataEvent = {
    extension: string;
    event: MessengerEvent;
};

export const PushDataNotification: NotificationType<DataEvent> = {
    method: 'pushData'
};

export const ExtensionListRequest: RequestType<boolean, ExtensionData[]> = {
    method: 'extensionList'
};

type SaveFileResult = 'success' | 'cancelled' | 'error';

export const SaveFileRequest: RequestType<{ filename: string; content: string; }, SaveFileResult> = {
    method: 'saveFile'
};

export interface ExtensionData {
    id: string
    name: string
    active: boolean
    exportsDiagnosticApi: boolean
    info?: ExtensionInfo
    events: ExtendedMessengerEvent[]
}

export interface ExtendedMessengerEvent extends MessengerEvent {
    timeAfterRequest?: number
    payloadInfo?: string
}

export const MESSENGER_EXTENSION_ID = 'TypeFox.vscode-messenger-devtools';
export const HOST_EXTENSION_NAME = 'host extension';
