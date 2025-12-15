
import React from 'react';

const MathRenderer: React.FC<{ content: string, className?: string }> = ({ content, className }) => {
    if (!content) return null;

    // Helper to process text: 
    // 1. Converts x^2 to x<sup>2</sup> and H_2 to H<sub>2</sub>
    // 2. Converts * to × (multiplication sign)
    const processMathText = (text: string) => {
        let processed = text;
        
        // Handle Multiplication: * -> × (using spaces for readability)
        // Using unicode times symbol which looks like 'x' but is semantically correct for math
        processed = processed.replace(/\*/g, ' × ');

        // 1. Handle Superscripts (Exponents)
        // Pattern: ^ followed by {content} OR simple alphanumeric chars
        // e.g., "x^2" -> "x<sup>2</sup>", "a^{n+1}" -> "a<sup>n+1</sup>"
        processed = processed.replace(/\^\{([^}]+)\}/g, '<sup>$1</sup>');
        processed = processed.replace(/\^([a-zA-Z0-9+\-(),.]+)/g, '<sup>$1</sup>');

        // 2. Handle Subscripts (Indices/Chemistry)
        // Pattern: _ followed by {content} OR simple alphanumeric chars
        // e.g., "H_2O" -> "H<sub>2</sub>O", "a_{ij}" -> "a<sub>ij</sub>"
        processed = processed.replace(/_\{([^}]+)\}/g, '<sub>$1</sub>');
        processed = processed.replace(/_([a-zA-Z0-9+\-(),.]+)/g, '<sub>$1</sub>');

        return processed;
    };

    return (
        <span 
            className={className}
            style={{ whiteSpace: 'pre-wrap', display: 'inline-block' }} 
            dangerouslySetInnerHTML={{ __html: processMathText(content) }}
        />
    );
};

export default MathRenderer;
