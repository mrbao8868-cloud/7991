import React, { useEffect, useRef } from 'react';

// Inform TypeScript that this function will be available on the window object
declare const renderMathInElement: any;

const MathRenderer: React.FC<{ content: string, className?: string }> = ({ content, className }) => {
    const ref = useRef<HTMLSpanElement>(null);

    useEffect(() => {
        if (ref.current && typeof renderMathInElement === 'function') {
            // The content is already in the div from the initial render via dangerouslySetInnerHTML.
            // We just need to run the renderer on it to enhance math expressions.
            try {
                renderMathInElement(ref.current, {
                    delimiters: [
                        { left: "$$", right: "$$", display: true },
                        { left: "\\[", right: "\\]", display: true },
                        { left: "$", right: "$", display: false },
                        { left: "\\(", right: "\\)", display: false }
                    ],
                    throwOnError: false
                });
            } catch (error) {
                console.error("KaTeX rendering error:", error);
            }
        }
    }, [content]);

    // Always render the content initially using dangerouslySetInnerHTML.
    // This prevents a flicker of empty content and ensures text is visible immediately.
    // The useEffect hook will then progressively enhance it with KaTeX rendering.
    return <span ref={ref} className={className} dangerouslySetInnerHTML={{ __html: content }} />;
};

export default MathRenderer;