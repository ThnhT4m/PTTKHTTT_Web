// Use request identity as well as AbortSignal: some adapters can finish after cancellation.
export function createLatestLoader() {
  let revision = 0, controller;
  return {
    async run(load, publish) {
      controller?.abort();
      const current = ++revision;
      controller = new AbortController();
      try {
        const result = await load(controller.signal);
        if (current === revision) publish({ result });
      } catch (error) {
        if (current === revision && error.name !== 'AbortError') publish({ error });
      }
    },
    cancel() { revision++; controller?.abort(); },
  };
}
