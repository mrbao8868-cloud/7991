import React, { useMemo } from 'react';

// KaTeX được tải toàn cục từ CDN trong index.html
declare const katex: any;

const MathRenderer: React.FC<{ content: string, className?: string }> = ({ content, className }) => {
    // useMemo đảm bảo rằng nội dung chỉ được render lại khi prop `content` thay đổi.
    const renderedHtml = useMemo(() => {
        if (!content || typeof katex === 'undefined') {
            return content;
        }

        // Biểu thức chính quy này tìm tất cả các chuỗi có dạng \(...\) và thay thế chúng.
        // Đây là cách tiếp cận mạnh mẽ để xử lý nhiều công thức trong cùng một khối văn bản.
        return content.replace(/\\((.*?)\\)/g, (match, latex) => {
            try {
                // renderToString là hàm cốt lõi từ thư viện KaTeX.
                return katex.renderToString(latex, {
                    throwOnError: false, // Không báo lỗi, chỉ hiển thị văn bản gốc nếu thất bại.
                    displayMode: false,
                });
            } catch (e) {
                console.error("KaTeX rendering error:", e);
                // Trong trường hợp có lỗi, trả về văn bản gốc chưa được render.
                return match;
            }
        });
    }, [content]);

    // dangerouslySetInnerHTML là cần thiết ở đây vì KaTeX xuất ra mã HTML thô.
    // Quá trình này an toàn vì chúng ta đang kiểm soát đầu vào và chỉ xử lý LaTeX.
    return <span className={className} dangerouslySetInnerHTML={{ __html: renderedHtml }} />;
};

export default MathRenderer;