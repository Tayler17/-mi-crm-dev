// No-op stub used when @sentry/nextjs is not installed.
// Webpack resolves this file instead of the missing package.
Object.assign(exports, {
  init:             () => {},
  captureException: () => {},
  captureMessage:   () => {},
  captureEvent:     () => {},
  withScope:        () => {},
  configureScope:   () => {},
  setUser:          () => {},
  setTag:           () => {},
  setExtra:         () => {},
  addBreadcrumb:    () => {},
  startTransaction: () => ({ finish: () => {}, setTag: () => {} }),
  getCurrentHub:    () => ({ configureScope: () => {} }),
});
