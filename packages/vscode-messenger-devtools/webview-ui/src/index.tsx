import { SplitPane } from 'baukasten-ui';
import { createRoot } from 'react-dom/client';
import { MessengerView } from './messenger-view';

const root = createRoot(document.getElementById('root')!);
root.render(
    <SplitPane vertical={true} minSize={10} >
        <SplitPane.Pane >
            <MessengerView />
        </SplitPane.Pane>
    </SplitPane>
);
