export async function register() {
  const hasDsn = !!(process.env.SENTRY_DSN || process.env.NEXT_PUBLIC_SENTRY_DSN);
  if (!hasDsn) return;

  if (process.env.NEXT_RUNTIME === 'nodejs') {
    // @ts-ignore — optional package, not installed in dev
    await import('../sentry.server.config');
  }
  if (process.env.NEXT_RUNTIME === 'edge') {
    // @ts-ignore — optional package, not installed in dev
    await import('../sentry.edge.config');
  }
}
