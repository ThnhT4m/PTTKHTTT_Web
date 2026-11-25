import { useCallback, useEffect, useState } from 'react';
import { get } from '../api/client.js';

export function useResource(path, deps = []) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [revision, setRevision] = useState(0);
  const reload = useCallback(() => setRevision((n) => n + 1), []);
  useEffect(() => {
    if (!path) {
      setLoading(false);
      setData(null);
      setError('');
      return;
    }
    const controller = new AbortController();
    setLoading(true);
    setError('');
    setData(null);
    get(path, { signal: controller.signal })
      .then((r) => {
        if (!controller.signal.aborted) setData(r.data);
      })
      .catch((e) => {
        if (!controller.signal.aborted && e.name !== 'AbortError') setError(e.message);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [path, revision, ...deps]);
  return { data, loading, error, reload, setData };
}
