
import React from 'react';

interface MathKeyboardProps {
    onInsert: (latex: string) => void;
}

const symbols = [
    { label: 'x²', latex: '^{2}' },
    { label: 'xⁿ', latex: '^{}' },
    { label: 'x₂', latex: '_{2}' },
    { label: 'xₙ', latex: '_{}' },
    { label: 'a/b', latex: '\\frac{}{}' },
    { label: '√x', latex: '\\sqrt{}' },
    { label: '×', latex: '\\times' },
    { label: '÷', latex: '\\div' },
    { label: 'π', latex: '\\pi' },
    { label: 'α', latex: '\\alpha' },
    { label: 'β', latex: '\\beta' },
    { label: 'Δ', latex: '\\Delta' },
    { label: 'Ω', latex: '\\Omega' },
    { label: '°', latex: '^{\\circ}' },
    { label: '→', latex: '\\rightarrow' },
    { label: '⇒', latex: '\\Rightarrow' },
    { label: '≤', latex: '\\le' },
    { label: '≥', latex: '\\ge' },
    { label: '≈', latex: '\\approx' },
    { label: '≠', latex: '\\ne' },
    { label: '∞', latex: '\\infty' },
    { label: '∑', latex: '\\sum' },
    { label: '∈', latex: '\\in' },
    { label: '⊂', latex: '\\subset' },
];

const MathKeyboard: React.FC<MathKeyboardProps> = ({ onInsert }) => {
    return (
        <div className="grid grid-cols-8 sm:grid-cols-12 gap-1 p-2 bg-slate-100 rounded-md border border-slate-300 mb-2">
            {symbols.map((sym, idx) => (
                <button
                    key={idx}
                    type="button"
                    onClick={() => onInsert(sym.latex)}
                    className="flex items-center justify-center p-1.5 bg-white border border-slate-300 rounded hover:bg-primary-50 hover:border-primary-300 hover:text-primary-700 text-xs sm:text-sm font-medium transition-colors"
                    title={`Chèn ${sym.label}`}
                >
                    {sym.label}
                </button>
            ))}
        </div>
    );
};

export default MathKeyboard;
