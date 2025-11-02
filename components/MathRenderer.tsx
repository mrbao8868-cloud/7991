import React, { useRef, useEffect } from 'react';

// Declare the function provided by KaTeX's auto-render extension.
// This will be available on the window object because it's loaded via a script tag in index.html.
declare const renderMathInElement: (element: HTMLElement, options: any) => void;

const MathRenderer: React.FC<{ content: string, className?: string }> = ({ content, className }) => {
    const containerRef = useRef<HTMLSpanElement>(null);
    
    // This effect will run after the component mounts and whenever the `content` prop changes.
    // It uses KaTeX's auto-render function to find and render all math expressions in the container.
    useEffect(() => {
        const container = containerRef.current;
        // Ensure the container exists and the auto-render function is available on the window object.
        if (container && typeof renderMathInElement === 'function') {
            try {
                renderMathInElement(container, {
                    // Define all the delimiters that should be recognized as math.
                    delimiters: [
                        { left: '$$', right: '$$', display: true },
                        { left: '\\[', right: '\\]', display: true },
                        { left: '\\(', right: '\\)', display: false },
                        { left: '$', right: '$', display: false }
                    ],
                    // This option prevents the app from crashing if the AI generates invalid LaTeX.
                    // Instead, the invalid formula will be displayed as is, but in red.
                    throwOnError: false
                });
            } catch (e) {
                // Log any unexpected errors during the rendering process.
                console.error("MathRenderer: Error calling renderMathInElement:", e);
            }
        }
    }, [content]); // The effect depends on the `content` prop.

    // To handle newlines from the AI's response, we replace them with <br> tags.
    // This content is then set as the inner HTML of our container span.
    const htmlContent = content.replace(/\n/g, '<br />');

    return (
        <span 
            ref={containerRef} 
            className={className} 
            // Let React render the raw HTML content. The useEffect hook will then enhance it.
            dangerouslySetInnerHTML={{ __html: htmlContent }} 
        />
    );
};

export default MathRenderer;