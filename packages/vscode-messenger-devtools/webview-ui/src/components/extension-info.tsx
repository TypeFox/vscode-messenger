import type { CodiconName } from 'baukasten-ui';
import { Badge, Icon, Text } from 'baukasten-ui';
import React from 'react';
import type { ExtendedExtensionData } from '../model/messenger-types';
import { useDevtoolsStore } from '../utilities/data-store';

interface ExtensionInfoPanelProps {
    selectedExtensionProp?: ExtendedExtensionData;
}

export const ExtensionInfoPanel: React.FC<ExtensionInfoPanelProps> = ({ selectedExtensionProp }) => {
    const selectedExtension = selectedExtensionProp ?? useDevtoolsStore((state) => state.getSelectedExtension());
    const statusData: OptionalInfoBadgeProps =
        (selectedExtension) ?
            {
                icon: !selectedExtension?.active ? 'warning' : (!selectedExtension?.exportsDiagnosticApi ? 'stop' : 'pass'),
                title:
                    'Extension '
                    + (!selectedExtension?.active ? 'is not active' :
                        (!selectedExtension?.exportsDiagnosticApi ? "doesn't export diagnostic API"
                            : 'is active and exports diagnostic API.'))
            }
            : {
                icon: 'question',
                title: 'No extension selected'
            };
    const webviewsData = {
        value: selectedExtension?.info?.webviews?.length ?? 0,
        title: 'Registered views:\n' + (selectedExtension?.info?.webviews ?? []).map(entry => '  ' + entry.id)
            .join('\n')
    };
    const handlersData = {
        value: selectedExtension?.info?.handlers?.length ?? 0,
        title: 'Number of added method handlers: \n'
            + (selectedExtension?.info?.handlers ?? []).map(entry => '  ' + entry.method + ': ' + entry.count)
                .join('\n')
    };
    return (
        <>
            <div id='ext-info'>
                <InfoBadge label='Status:' {...statusData} />
                <InfoBadge label='Views:' {...webviewsData} />
                <InfoBadge label='Listeners:'
                    value={selectedExtension?.info?.diagnosticListeners ?? 0}
                    title='Number of registered diagnostic listeners.'
                />
                <InfoBadge label='Handlers:' {...handlersData} />
                <InfoBadge label='Pending Req.:'
                    value={selectedExtension?.info?.pendingRequest ?? 0}
                    title='Number of pending (incoming + outgoing) requests.'
                />
                <InfoBadge label='Events:' value={selectedExtension?.events?.length ?? 0} />
            </div>
        </>
    );
};

type OptionalInfoBadgeProps = {
    value?: string | number;
    icon?: CodiconName;
    title?: string;
};

function InfoBadge(props: { label: string } & OptionalInfoBadgeProps): React.JSX.Element {
    // TODO move back to css file
    const marginRight = { marginRight: '10px' };
    return (<>
        <Text style={marginRight}>{props.label}</Text>
        {props.icon &&
            <Icon name={props.icon} size={'lg'} title={props.title} style={marginRight} />
        }
        {props.value !== undefined &&
            <Badge title={props.title} size={'sm'} style={marginRight}>
                {props.value ?? '?'}
            </Badge>
        }
    </>);
}
