import {
  LaqtaIpcError,
  type IpcResult,
  type LaqtaApi,
  type LaqtaBridge,
} from '../../shared/ipc-api';

declare global {
  interface Window {
    readonly laqta: LaqtaBridge;
  }
}

function unwrap<T>(result: IpcResult<T>): T {
  if (result.ok) return result.value;
  throw new LaqtaIpcError(result.error);
}

/** The typed API for components: resolves with the value or throws LaqtaIpcError. */
export const laqta: LaqtaApi = new Proxy({} as LaqtaApi, {
  get(_target, key: keyof LaqtaApi) {
    const bridge = window.laqta;
    const member = bridge[key];
    if (key === 'platform' || key === 'onSessionChanged') return member;
    return async (...args: unknown[]) => {
      const fn = member as (...a: unknown[]) => Promise<IpcResult<unknown>>;
      return unwrap(await fn(...args));
    };
  },
});

export { LaqtaIpcError };
