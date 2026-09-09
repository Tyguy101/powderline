import { BUILD_ID } from '../app/build';

type SentryApi = typeof import('@sentry/browser');

let sentry: SentryApi | null = null;

function runtimeContext(): Record<string, unknown> {
  return {
    build_id: BUILD_ID,
    viewport: `${window.innerWidth}x${window.innerHeight}`,
    device_pixel_ratio: window.devicePixelRatio,
    webgpu_available: 'gpu' in navigator,
    user_agent: navigator.userAgent,
  };
}

export async function initializeSentry(): Promise<void> {
  const dsn = import.meta.env.VITE_SENTRY_DSN;
  if (!dsn) return;

  try {
    sentry = await import('@sentry/browser');
    sentry.init({
      dsn,
      release: `powderline@${import.meta.env.VITE_APP_VERSION ?? '0.1.0'}+${BUILD_ID}`,
      environment: import.meta.env.MODE,
      sendDefaultPii: false,
      maxBreadcrumbs: 20,
    });
    sentry.setTag('build_id', BUILD_ID);
    sentry.setContext('runtime', runtimeContext());
  } catch (error) {
    // Monitoring must never prevent the game from starting.
    console.warn('Sentry initialization failed', error);
  }
}

export function reportStartupFailure(error: unknown, phase: string): void {
  if (!sentry) return;
  sentry.withScope((scope) => {
    scope.setTag('startup_phase', phase);
    scope.setContext('runtime', runtimeContext());
    sentry?.captureException(error);
  });
}
