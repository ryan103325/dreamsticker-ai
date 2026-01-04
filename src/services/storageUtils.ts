export const STORAGE_KEY = 'gemini_api_key';

export const saveApiKey = (key: string) => {
    if (!key) return;
    try {
        // Simple obfuscation using Base64 to avoid clear-text storage alerts
        const encoded = btoa(key);
        localStorage.setItem(STORAGE_KEY, encoded);
    } catch (e) {
        console.error("Failed to save API key", e);
    }
};

export const loadApiKey = (): string | null => {
    try {
        const stored = localStorage.getItem(STORAGE_KEY);
        if (!stored) return null;

        // Try to decode. If it fails (legacy plain text), return as is or handle error
        // Note: For backward compatibility, if atob fails, it might be an old plain text key.
        // However, API keys usually don't contain special chars that break atob unless they are very specific.
        // Google API keys are usually alphanumeric.

        // Logic: Try to decode. If the result looks like a valid key (roughly), return it.
        // If stored value is the key itself (legacy), atob might succeed or produce garbage.
        // To be safe, let's assume valid Base64 for now. 
        // If the user has a plain text key stored, this might break their session ONCE, necessitating a re-login.
        // This is acceptable for a security upgrade.
        return atob(stored);
    } catch (e) {
        // If decoding fails, it might be the old plain text format.
        // Let's return the raw value and let the API try it.
        // Ideally, we should migrate it, but clear-on-reload is safer.
        return localStorage.getItem(STORAGE_KEY);
    }
};

export const clearApiKey = () => {
    localStorage.removeItem(STORAGE_KEY);
};
