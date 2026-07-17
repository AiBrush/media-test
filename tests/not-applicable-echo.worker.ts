self.onmessage = (event: MessageEvent<unknown>): void => {
  self.postMessage(event.data);
};
