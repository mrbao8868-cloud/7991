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

    useEffect(() => {
        const container = containerRef.current;
        if (!container) return;

        // Set the raw text content first. This ensures that if KaTeX fails,
        // the raw formula is still visible to the user.
        container.textContent = content;

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
                        // Do not throw an error on parsing failure, just log it.
                        throwOnError: false
                    });
                } catch (e) {
                    console.error("MathRenderer: Error during KaTeX rendering:", e);
                }
            } else if (container) {
                // This error occurs if the KaTeX auto-render script failed to load or define the function.
                console.error("MathRenderer: Render was called, but 'window.renderMathInElement' is not available.");
            }
        };

        // If the KaTeX ready flag is already set, render immediately.
        if (window.KATE_IS_READY) {
            render();
            return;
        }

        // Otherwise, wait for our custom 'katex-ready' event.
        // The 'once: true' option ensures the listener is automatically removed after firing.
        document.addEventListener('katex-ready', render, { once: true });

        // Cleanup: remove the event listener if the component unmounts before the event fires.
        return () => {
            document.removeEventListener('katex-ready', render);
        };
    }, [content]); // Re-run the effect if the content changes.

    return (
        <span ref={containerRef} className={className} />
    );
};

export default MathRenderer;
