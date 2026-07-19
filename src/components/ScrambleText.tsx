import React, { useEffect, useRef } from 'react';

/**
 * Character-scramble / decode effect (inspired by the kinetics.colorion.co
 * "spring-physics motion" components): each character cycles through random
 * glyphs and resolves left-to-right into the final text on mount.
 *
 * Implementation notes:
 * - Writes to the node's textContent per frame via a ref instead of React
 *   state, so it never re-renders the tree while animating.
 * - The real text is the initial/committed content and the aria-label, so
 *   it stays correct for screen readers and if JS is slow.
 * - Fully honours prefers-reduced-motion (renders the final text, no motion).
 */

const GLYPHS = '!<>-_\\/[]{}—=+*^?#·:;0123456789';

interface ScrambleTextProps {
    text: string;
    className?: string;
    /** Total resolve time in ms. */
    durationMs?: number;
}

export const ScrambleText: React.FC<ScrambleTextProps> = ({ text, className, durationMs = 850 }) => {
    const ref = useRef<HTMLSpanElement>(null);

    useEffect(() => {
        const node = ref.current;
        if (!node) return;
        const reduce = typeof window !== 'undefined'
            && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
        if (reduce) { node.textContent = text; return; }

        let raf = 0;
        const start = performance.now();
        const tick = (now: number) => {
            const p = Math.min(1, (now - start) / durationMs);
            // Ease so early characters lock in quickly, later ones trail.
            const revealed = Math.pow(p, 0.85) * text.length;
            let out = '';
            for (let i = 0; i < text.length; i++) {
                const ch = text[i];
                if (ch === ' ') { out += ' '; continue; }
                out += i < revealed ? ch : GLYPHS[(Math.random() * GLYPHS.length) | 0];
            }
            node.textContent = out;
            if (p < 1) raf = requestAnimationFrame(tick);
            else node.textContent = text;
        };
        raf = requestAnimationFrame(tick);
        return () => cancelAnimationFrame(raf);
    }, [text, durationMs]);

    return <span ref={ref} className={className} aria-label={text}>{text}</span>;
};
