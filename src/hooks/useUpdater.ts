import { useCallback, useEffect, useState } from 'react';
import { desktopApi, type UpdateState } from '../lib/desktop';

export interface UpdaterApi {
  state: UpdateState | null;
  check: () => Promise<void>;
  download: () => Promise<void>;
  install: () => Promise<void>;
  openReleasePage: () => Promise<void>;
  setAutoCheck: (enabled: boolean) => Promise<void>;
}

export function useUpdater(): UpdaterApi {
  const [state, setState] = useState<UpdateState | null>(null);
  const api = desktopApi?.updates;

  useEffect(() => {
    if (!api) return;
    let active = true;

    void api
      .getState()
      .then((next) => {
        if (active) setState(next);
      })
      .catch((error) => console.warn('读取更新状态失败', error));

    const dispose = api.onState((next) => {
      if (active) setState(next);
    });

    return () => {
      active = false;
      dispose();
    };
  }, [api]);

  const check = useCallback(async () => {
    if (!api) return;
    try {
      const next = await api.check();
      if (next) setState(next);
    } catch (error) {
      console.warn('检查更新失败', error);
    }
  }, [api]);

  const download = useCallback(async () => {
    if (!api) return;
    try {
      const next = await api.download();
      if (next) setState(next);
    } catch (error) {
      console.warn('下载更新失败', error);
    }
  }, [api]);

  const install = useCallback(async () => {
    if (!api) return;
    try {
      await api.install();
    } catch (error) {
      console.warn('安装更新失败', error);
    }
  }, [api]);

  const openReleasePage = useCallback(async () => {
    await api?.openReleasePage();
  }, [api]);

  const setAutoCheck = useCallback(
    async (enabled: boolean) => {
      if (!api) return;
      try {
        const next = await api.setAutoCheck(enabled);
        if (next) setState(next);
      } catch (error) {
        console.warn('设置自动检查失败', error);
      }
    },
    [api],
  );

  return { state, check, download, install, openReleasePage, setAutoCheck };
}
