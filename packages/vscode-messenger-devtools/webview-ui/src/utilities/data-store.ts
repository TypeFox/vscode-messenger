import create from 'zustand';
import type { ExtendedMessengerEvent, ExtensionData } from '../model/messenger-types';

export interface DevtoolsComponentState {
  selectedExtension: string
  datasetSrc: Map<string, ExtensionData>
  chartsShown: boolean
  diagramShown: boolean
  theme: 'light' | 'dark'
}

type Accessors = {
  getSelectedExtension: () => ExtensionData | undefined
  getExtensions: () => ExtensionData[]

  updateSelectedExtension: (extId: string) => void
  updateExtensionData: (extensionData: ExtensionData[]) => void
  updateEvents: (extId: string, events: ExtendedMessengerEvent[]) => void
  updateTheme: (theme: 'light' | 'dark') => void
  updateVisualizationSelect: (kind: 'charts' | 'diag') => void
}

export const useDevtoolsStore = create<DevtoolsComponentState & Accessors>((set, get) => ({
  selectedExtension: '',
  datasetSrc: new Map(),
  chartsShown: false,
  diagramShown: false,
  theme: 'dark',

  getSelectedExtension: () => get().datasetSrc.get(get().selectedExtension) ?? undefined,
  getExtensions: () => Array.from(get().datasetSrc.values()),

  updateExtensionData(extensions) {
    const newDatasetSrc = new Map(get().datasetSrc);
    extensions.forEach(ext => {
      const data = newDatasetSrc;
      if (!data.has(ext.id)) {
        // received ExtensionData don't have events
        data.set(ext.id, { ...ext, events: [] });
      } else {
        const existing = data.get(ext.id);
        // merge data
        data.set(ext.id, { ...ext, events: existing?.events ?? [] });
      }
    });
    set({ datasetSrc: newDatasetSrc });
  },
  updateEvents(extId, events) {
    const datasetSrc = get().datasetSrc;
    if (datasetSrc.has(extId)) {
      const extData = datasetSrc.get(extId)!;
      const newDatasetSrc = new Map(datasetSrc);
      newDatasetSrc.set(extId, { ...extData, events });
      set({ datasetSrc: newDatasetSrc });
    } else {
      console.warn(`Trying to update events for unknown extension: ${extId}`);
    }
  },
  updateSelectedExtension: (extId: string) => set({ selectedExtension: extId }),
  updateVisualizationSelect: (kind: 'charts' | 'diag') => {
    if (kind === 'charts') {
      set((state) => ({
        chartsShown: !state.chartsShown,
        diagramShown: !state.chartsShown ? false : state.diagramShown
      }));
    } else if (kind === 'diag') {
      set((state) => ({
        diagramShown: !state.diagramShown,
        chartsShown: !state.diagramShown ? false : state.chartsShown
      }));
    }
  },
  updateTheme: (theme: 'light' | 'dark') => set({ theme })
}));