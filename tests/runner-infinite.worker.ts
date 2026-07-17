self.onmessage = (event: MessageEvent<{ mode: 'loop' | 'echo'; value?: unknown }>) => {
  if (event.data.mode === 'echo') {
    self.postMessage(event.data.value);
    return;
  }
  // Deliberately non-cooperative: only Worker.terminate() can stop this script.
  for (;;) {
    // Keep the loop observable to the JS engine so it is not optimized away.
    Math.random();
  }
};
