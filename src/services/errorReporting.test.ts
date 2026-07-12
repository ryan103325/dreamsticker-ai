import { describe, it, expect } from 'vitest';
import { scrubSecrets, scrubEvent } from './errorReporting';

describe('scrubSecrets', () => {
    it('redacts Google API keys', () => {
        const out = scrubSecrets('Error: 403 for key AIzaSyB1234567890abcdefghijklmnopqrstuvw');
        expect(out).not.toContain('AIzaSy');
        expect(out).toContain('[REDACTED]');
    });

    it('redacts OpenAI keys', () => {
        const out = scrubSecrets('Authorization: Bearer sk-proj-abc123DEF456ghi789JKL012');
        expect(out).not.toContain('sk-proj-abc');
        expect(out).toContain('[REDACTED]');
    });

    it('redacts Hugging Face tokens', () => {
        const out = scrubSecrets('using token hf_ABCdefGHIjklMNOpqrSTUvwx');
        expect(out).not.toContain('hf_ABC');
    });

    it('redacts key-like query parameters', () => {
        const out = scrubSecrets('fetch failed: https://example.com/v1/models?alt=json&key=SECRETVALUE123');
        expect(out).not.toContain('SECRETVALUE123');
        expect(out).toContain('key=[REDACTED]');
    });

    it('leaves normal error text untouched', () => {
        const msg = 'TypeError: Cannot read properties of undefined (reading "Mat")';
        expect(scrubSecrets(msg)).toBe(msg);
    });
});

describe('scrubEvent', () => {
    it('scrubs nested fields of a serializable event', () => {
        const event = {
            message: 'boom',
            breadcrumbs: [{ data: { url: 'https://api.example.com?key=AIzaSyB1234567890abcdefghijklmnopqrstuvw' } }],
        };
        const out = scrubEvent(event) as typeof event;
        expect(JSON.stringify(out)).not.toContain('AIzaSy');
        expect(out.message).toBe('boom');
    });

    it('drops non-serializable events instead of leaking them', () => {
        const cyclic: any = {};
        cyclic.self = cyclic;
        expect(scrubEvent(cyclic)).toBeNull();
    });
});
