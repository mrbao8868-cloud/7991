
import React, { useRef, useEffect } from 'react';

// Declare KaTeX's auto-render function and our custom flag on the global window object for TypeScript.
declare global {
    interface Window {
        renderMathInElement: (element: HTMLElement, options: any) => void;
        KATE_IS_READY?: boolean;
    }
}

const MathRenderer: React.FC<{ content: string, className?: string }> = ({ content, className }) => {
    const containerRef = useRef<HTMLSpanElement>(null);

    // Pre-process content to fix common AI formatting errors
    const formatContent = (raw: string) => {
        if (!raw) return '';
        let processed = raw;

        // 1. Fix broken delimiters often output by AI (e.g., "\ [" instead of "\[")
        processed = processed.replace(/\\\s+\[/g, '\\['); // Fix \ [ -> \[
        processed = processed.replace(/\\\s+\]/g, '\\]'); // Fix \ ] -> \]
        processed = processed.replace(/\\\s+\(/g, '\\('); // Fix \ ( -> \(
        processed = processed.replace(/\\\s+\)/g, '\\)'); // Fix \ ) -> \)

        // 2. Wrap standalone \ce{...} commands in \( ... \) so KaTeX can render them.
        // This regex matches \ce{...} allowing for whitespace like \ce { H2O } and simple nested braces.
        // We attempt to avoid double-wrapping if it's already wrapped.
        processed = processed.replace(/(\\ce\s*\{[^{}]*(?:\{[^{}]*\}[^{}]*)*\})/g, (match, p1, offset, string) => {
             // Simple check to see if it's likely already inside a delimiter
             const preceding = string.slice(Math.max(0, offset - 5), offset);
             if (preceding.match(/\\\($/) || preceding.match(/\\\[$/) || preceding.match(/\$\$$/)) {
                 return match;
             }
             return `\\(${match}\\)`;
        });

        // 3. Clean up any accidental double wrappers like \( \( \ce{...} \) \)
        processed = processed.replace(/\\\(\s*\\\(\s*\\ce/g, '\\(\\ce');
        processed = processed.replace(/\\\}\s*\\\)\s*\\\)/g, '\\}\\)');

        return processed;
    };

    const formattedContent = formatContent(content);

    useEffect(() => {
        const container = containerRef.current;
        if (!container) return;

        // Set the text content directly.
        // CSS 'white-space: pre-wrap' handles the newlines ('\n') automatically.
        container.innerText = formattedContent || '';

        const render = () => {
            if (container && typeof window.renderMathInElement === 'function') {
                try {
                    // Call the KaTeX function to render math in the container.
                    window.renderMathInElement(container, {
                        delimiters: [
                            { left: '$$', right: '$$', display: true },
                            { left: '\\[', right: '\\]', display: true },
                            { left: '\\(', right: '\\)', display: false },
                            { left: '$', right: '$', display: false }
                        ],
                        throwOnError: false,
                        // Allow mhchem to work
                        trust: true,
                        strict: false
                    });
                } catch (e) {
                    console.error("MathRenderer: Error during KaTeX rendering:", e);
                }
            }
        };

        if (window.KATE_IS_READY) {
            render();
            return;
        }

        document.addEventListener('katex-ready', render, { once: true });
        return () => {
            document.removeEventListener('katex-ready', render);
        };
    }, [formattedContent]); 

    return (
        <span 
            ref={containerRef} 
            className={className}
            style={{ whiteSpace: 'pre-wrap', display: 'inline-block' }} 
        />
    );
};

export default MathRenderer;
