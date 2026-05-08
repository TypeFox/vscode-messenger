import { createRoot } from 'react-dom/client';
import { MessengerView } from './messenger-view';
import DevtoolsComponent from './devtools-view';
import { SplitPane } from 'baukasten-ui';

const root = createRoot(document.getElementById('root')!);
root.render(
    <SplitPane vertical={true} minSize={10} >
        <SplitPane.Pane >
            <MessengerView />
        </SplitPane.Pane>
        {true &&
            <SplitPane.Pane >
                <DevtoolsComponent />
            </SplitPane.Pane>
        }
    </SplitPane>
);
