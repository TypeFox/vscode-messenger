# Change Log of `vscode-messenger-devtools`

## v0.6.0 (Jan. 2026)

* **New:** Added data export functionality - export messenger events as JSON or CSV files
  * Export all events for the selected extension or only selected table rows
  * Files are automatically saved with timestamped filenames
  * JSON export preserves full event structure including parameters and metadata
  * CSV export includes all event properties with proper escaping for complex data
* Improved dark theme support for charts and overall UI
* Updated to use vscode-messenger v0.6.0 with enhanced handler management capabilities

## v0.5.1 (Feb. 2025)

* Added response information to table hover. Only available if `withResponseData` property in vscode-messenger's `DiagnosticOptions` is set to `true`.
* New graphical message flow visualization.

## v0.4.5 (March 2023)

* Added parameter information to hover. Only available if `withParameterData` property in vscode-messenger's `DiagnosticOptions` is set to `true`.
* Added "Clear Data" button to clear the messages table.

## v0.4.4 (Dec. 2022)

* Added timestamp information
* Collapsible charts panel
* Estimated response time
