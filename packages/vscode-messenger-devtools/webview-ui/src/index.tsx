import React from 'react';
import ReactDOM from 'react-dom';
import { MessengerView } from './messenger-view';
import DevtoolsComponent from './devtools-view';
import { SplitPane } from 'baukasten-ui';

ReactDOM.render(
    <React.StrictMode>
        <SplitPane vertical={true} minSize={10} >
            <SplitPane.Pane >
                <MessengerView />
            </SplitPane.Pane>
            <SplitPane.Pane >
                <DevtoolsComponent />
            </SplitPane.Pane>
        </SplitPane>
    </React.StrictMode>,
    document.getElementById('root')
);
