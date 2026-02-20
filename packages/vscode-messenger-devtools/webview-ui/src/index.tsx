import React from 'react';
import ReactDOM from 'react-dom';
import { MessengerView } from './messenger-view';

ReactDOM.render(
    <React.StrictMode>
        <MessengerView />
        {/*
        <DevtoolsComponent />
          */}
    </React.StrictMode>,
    document.getElementById('root')
);
