export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    // @ts-ignore — optional package, not installed in dev
    await import('../sentry.server.config');
  }
  if (process.env.NEXT_RUNTIME === 'edge') {
    // @ts-ignore — optional package, not installed in dev
    await import('../sentry.edge.config');
  }
}
