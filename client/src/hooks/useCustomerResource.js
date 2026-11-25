import { useCallback, useEffect, useRef, useState } from 'react';
import { get } from '../api/client.js';
import { createLatestLoader } from '../api/latest.js';

export function useCustomerResource(path, { interval = 0, load } = {}) {
  const [state, setState] = useState({ key: null, data: null, error: null, loading: true });
  const [revision, setRevision] = useState(0), loader = useRef(null);
  loader.current ||= createLatestLoader();
  const reload = useCallback(() => { loader.current.cancel(); setState((old) => ({ ...old, data: null, loading: true, error: null })); setRevision((n) => n + 1); }, []);
  useEffect(() => {
    if (!path) { setState({ key: path, data: null, error: null, loading: false }); return; }
    setState({ key: path, data: null, error: null, loading: true });
    loader.current.run((signal) => load ? load({ signal }) : get(path, { signal }), ({ result, error }) => {
      setState({ key: path, data: result?.data ?? null, error: error || null, loading: false,
        offset: result?.server_time ? Date.parse(result.server_time) - Date.now() : null });
    });
    return () => loader.current.cancel();
  }, [path, revision]);
  useEffect(() => {
    if (!interval) return;
    const timer = setInterval(() => setRevision((n) => n + 1), interval);
    return () => clearInterval(timer);
  }, [path, interval]);
  return { ...(state.key === path ? state : { data: null, error: null, loading: !!path, offset: null }), reload };
}
export function useDebounced(value, delay = 400) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => { const timer = setTimeout(() => setDebounced(value), delay); return () => clearTimeout(timer); }, [value, delay]);
  return debounced;
}
export function useServerNow(offset) {
  const [clock, setClock] = useState(Date.now());
  useEffect(() => { const timer = setInterval(() => setClock(Date.now()), 1000); return () => clearInterval(timer); }, []);
  return clock + (Number.isFinite(offset) ? offset : 0);
}
