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

export interface ExtensionData {
    id: string
    name: string
    active: boolean
    exportsDiagnosticApi: boolean
    info?: ExtensionInfo
}
