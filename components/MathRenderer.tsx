import React from 'react';

// Khai báo katex sẽ có sẵn trên đối tượng window
declare const katex: any;

const MathRenderer: React.FC<{ content: string, className?: string }> = ({ content, className }) => {
    // Nếu katex chưa tải hoặc không có nội dung, trả về văn bản thuần túy
    if (typeof katex === 'undefined' || !content) {
        return <span className={className}>{content}</span>;
    }

    try {
        // Regex để tìm và tách chuỗi bằng các dấu phân cách LaTeX \\(...\\)
        const parts = content.split(/(\\\(.*?\\\))/g);

        return (
            <span className={className}>
                {parts.map((part, index) => {
                    // Kiểm tra xem phần hiện tại có phải là một biểu thức LaTeX không
                    if (part.startsWith('\\(') && part.endsWith('\\)')) {
                        // Trích xuất nội dung toán học từ giữa các dấu phân cách
                        const math = part.substring(2, part.length - 2);
                        // Render công thức toán học thành một chuỗi HTML một cách đồng bộ
                        const html = katex.renderToString(math, {
                            throwOnError: false,
                            displayMode: false,
                        });
                        // Sử dụng dangerouslySetInnerHTML để render HTML do KaTeX tạo ra
                        return <span key={index} dangerouslySetInnerHTML={{ __html: html }} />;
                    }
                    // Nếu không phải là một phần toán học, render nó như văn bản thuần túy
                    return part;
                })}
            </span>
        );
    } catch (e) {
        console.error("MathRenderer không thể render:", e);
        // Dự phòng, hiển thị nội dung gốc nếu có bất kỳ lỗi nào xảy ra trong quá trình render
        return <span className={className}>{content}</span>;
    }
};

export default MathRenderer;
