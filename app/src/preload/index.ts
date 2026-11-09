import { contextBridge } from 'electron';

// The typed `window.laqta` API over the IPC channels of spec section 3 is added in T-012.
// Until then the bridge exposes an empty, frozen object and nothing else.
contextBridge.exposeInMainWorld('laqta', Object.freeze({}));
