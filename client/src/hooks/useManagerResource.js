import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '../contexts/AuthContext.jsx';

export function useManagerResource(load, deps) {
  const { user, loading: restoring } = useAuth();
  const identity = JSON.stringify([user?.id, user?.role, restoring]);
  const [dataIdentity, setDataIdentity] = useState(null);
  const [data, setData] = useState(null), [error, setError] = useState(null), [loading, setLoading] = useState(true);
  const [revision, setRevision] = useState(0);
  const [offset, setOffset] = useState(null);
  const reload = useCallback(() => {
    setData(null); setError(null); setLoading(true); setOffset(null);
    setRevision((n) => n + 1);
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    setDataIdentity(identity);
    setData(null); setError(null); setLoading(true); setOffset(null);
    Promise.resolve().then(() => load({ signal: controller.signal }))
      .then((result) => { if (!controller.signal.aborted) { setData(result?.data ?? null); setOffset(result?.server_time ? Date.parse(result.server_time) - Date.now() : null); } })
      .catch((err) => { if (!controller.signal.aborted) setError(err); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [...deps, identity, revision]);
  return { ...(dataIdentity === identity ? { data, error, loading, offset } : { data: null, error: null, loading: true, offset: null }), reload };
}
