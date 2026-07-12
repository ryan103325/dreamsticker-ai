/**
 * Error reporting via Sentry (Roadmap §3 錯誤回報).
 *
 * Design constraints:
 * - Opt-in by build config: enabled only when VITE_SENTRY_DSN is set at
 *   build time AND the build is production. Forks/local dev without the
 *   env var ship with reporting fully disabled — no network calls at all.
 * - Lazy: @sentry/react is dynamically imported so it lands in its own
 *   chunk and never delays the initial bundle.
 * - Privacy: users paste their own Gemini/OpenAI/HF API keys into this
 *   app. Every outgoing event and breadcrumb is scrubbed for anything
 *   that looks like a key before it leaves the browser.
 */

let sentryRef: typeof import('@sentry/react') | null = null;

// Key-shaped strings we must never upload. Patterns are deliberately loose
// (better to over-redact an error message than leak a credential).
const SECRET_PATTERNS: RegExp[] = [
    /AIza[0-9A-Za-z_\-]{10,}/g,   // Google API keys
    /sk-[A-Za-z0-9_\-]{16,}/g,    // OpenAI keys
    /hf_[A-Za-z0-9]{16,}/g,       // Hugging Face tokens
];

export const scrubSecrets = (text: string): string => {
    let out = text.replace(/([?&](?:key|api_key|apikey|token)=)[^&\s"'\\]+/gi, '$1[REDACTED]');
    for (const re of SECRET_PATTERNS) out = out.replace(re, '[REDACTED]');
    return out;
};

/** Scrubs an arbitrary JSON-serializable object (Sentry event/breadcrumb). */
export const scrubEvent = <T>(event: T): T => {
    try {
        return JSON.parse(scrubSecrets(JSON.stringify(event)));
    } catch {
        // Non-serializable event: safer to drop it than to leak something
        return null as T;
    }
};

export const initErrorReporting = (): void => {
    const dsn = import.meta.env.VITE_SENTRY_DSN as string | undefined;
    if (!dsn || !import.meta.env.PROD) return;

    import('@sentry/react')
        .then((Sentry) => {
            Sentry.init({
                dsn,
                sendDefaultPii: false,
                beforeSend: (event) => scrubEvent(event),
                beforeBreadcrumb: (breadcrumb) => scrubEvent(breadcrumb),
            });
            sentryRef = Sentry;
        })
        .catch((e) => console.warn('[sentry] init failed', e));
};

/** Manual capture hook for ErrorBoundary / catch blocks. No-op when disabled. */
export const captureError = (error: unknown, context?: Record<string, unknown>): void => {
    try {
        sentryRef?.captureException(error, context ? { extra: scrubEvent(context) } : undefined);
    } catch { /* reporting must never break the app */ }
};
