/**
 * Google Sign-In via Google Identity Services (GIS).
 *
 * Purely client-side: used for identity/personalization (name + avatar in the
 * navbar). It does NOT replace the Gemini API Key — the Gemini API is billed
 * per-key, so users still provide their own key.
 *
 * Setup: create an OAuth 2.0 Client ID (type "Web application") in Google
 * Cloud Console, add your domains to "Authorized JavaScript origins", and set
 * VITE_GOOGLE_CLIENT_ID at build time. If unset, the login button is hidden.
 */

export interface GoogleProfile {
    name: string;
    email: string;
    picture: string;
}

const PROFILE_KEY = 'google_profile';
const GSI_SRC = 'https://accounts.google.com/gsi/client';

export const GOOGLE_CLIENT_ID: string = import.meta.env.VITE_GOOGLE_CLIENT_ID || '';

export const isGoogleLoginEnabled = () => GOOGLE_CLIENT_ID.length > 0;

let scriptPromise: Promise<void> | null = null;

const loadGsiScript = (): Promise<void> => {
    if (scriptPromise) return scriptPromise;
    scriptPromise = new Promise((resolve, reject) => {
        if (document.querySelector(`script[src="${GSI_SRC}"]`)) return resolve();
        const script = document.createElement('script');
        script.src = GSI_SRC;
        script.async = true;
        script.defer = true;
        script.onload = () => resolve();
        script.onerror = () => reject(new Error('Failed to load Google Identity Services'));
        document.head.appendChild(script);
    });
    return scriptPromise;
};

const decodeJwtPayload = (jwt: string): Record<string, unknown> | null => {
    try {
        const payload = jwt.split('.')[1];
        const normalized = payload.replace(/-/g, '+').replace(/_/g, '/');
        const json = decodeURIComponent(
            atob(normalized)
                .split('')
                .map(c => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
                .join('')
        );
        return JSON.parse(json);
    } catch {
        return null;
    }
};

export const loadGoogleProfile = (): GoogleProfile | null => {
    try {
        const raw = localStorage.getItem(PROFILE_KEY);
        return raw ? JSON.parse(raw) : null;
    } catch {
        return null;
    }
};

export const clearGoogleProfile = () => {
    try { localStorage.removeItem(PROFILE_KEY); } catch { /* ignore */ }
    // Prevent the One Tap auto sign-in from immediately re-selecting the account.
    const g = (window as any).google;
    g?.accounts?.id?.disableAutoSelect?.();
};

/**
 * Renders the official Google Sign-In button into `container` and resolves the
 * decoded profile through `onSignIn` whenever the user completes sign-in.
 */
export const renderGoogleButton = async (
    container: HTMLElement,
    onSignIn: (profile: GoogleProfile) => void
): Promise<void> => {
    if (!isGoogleLoginEnabled()) return;
    await loadGsiScript();

    const g = (window as any).google;
    if (!g?.accounts?.id) throw new Error('Google Identity Services unavailable');

    g.accounts.id.initialize({
        client_id: GOOGLE_CLIENT_ID,
        callback: (response: { credential?: string }) => {
            if (!response.credential) return;
            const payload = decodeJwtPayload(response.credential);
            if (!payload) return;
            const profile: GoogleProfile = {
                name: String(payload.name || ''),
                email: String(payload.email || ''),
                picture: String(payload.picture || ''),
            };
            try { localStorage.setItem(PROFILE_KEY, JSON.stringify(profile)); } catch { /* ignore */ }
            onSignIn(profile);
        },
    });

    g.accounts.id.renderButton(container, {
        theme: 'outline',
        size: 'large',
        shape: 'pill',
        width: 280,
    });
};
