// This utility uses pdf.js, which is loaded from a CDN in index.html.
// We declare pdfjsLib to inform TypeScript that it will be available on the window object at runtime.
declare const pdfjsLib: any;

/**
 * Processes a PDF file and converts each page into a base64 encoded JPEG image.
 * @param file The PDF file to process.
 * @param startPage Optional. The first page to process (1-indexed).
 * @param endPage Optional. The last page to process (inclusive).
 * @returns A promise that resolves to an array of base64 encoded image strings.
 */
export const processPdfToImages = async (
    file: File, 
    startPage?: number, 
    endPage?: number
): Promise<string[]> => {
    // Set the worker source for pdf.js
    pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.mjs`;

    const images: string[] = [];
    const fileReader = new FileReader();

    return new Promise((resolve, reject) => {
        fileReader.onload = async (event) => {
            if (!event.target?.result) {
                return reject(new Error("Failed to read file."));
            }

            try {
                const typedarray = new Uint8Array(event.target.result as ArrayBuffer);
                const pdf = await pdfjsLib.getDocument(typedarray).promise;

                const firstPage = startPage && startPage > 0 ? Math.min(startPage, pdf.numPages) : 1;
                const lastPage = endPage && endPage <= pdf.numPages ? Math.max(firstPage, endPage) : pdf.numPages;

                for (let i = firstPage; i <= lastPage; i++) {
                    const page = await pdf.getPage(i);
                    const viewport = page.getViewport({ scale: 1.5 });
                    
                    const canvas = document.createElement('canvas');
                    const context = canvas.getContext('2d');
                    
                    if (!context) {
                        return reject(new Error("Could not create canvas context."));
                    }

                    canvas.height = viewport.height;
                    canvas.width = viewport.width;

                    await page.render({ canvasContext: context, viewport: viewport }).promise;
                    
                    // Reduce image quality to 85% to prevent oversized payloads which can cause network errors.
                    const base64Image = canvas.toDataURL('image/jpeg', 0.85).split(',')[1];
                    images.push(base64Image);
                }
                resolve(images);
            } catch (error) {
                console.error("Error processing PDF:", error);
                reject(new Error("Could not parse the PDF file. It might be corrupted or in an unsupported format."));
            }
        };

        fileReader.onerror = () => {
            reject(new Error("Failed to read the file."));
        };

        fileReader.readAsArrayBuffer(file);
    });
};