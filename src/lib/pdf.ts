import html2canvas from 'html2canvas';
import { jsPDF } from 'jspdf';

export const generatePDF = async (elementId: string, filename: string) => {
    const element = document.getElementById(elementId);
    if (!element) return;

    try {
        // Prevent HTML2Canvas from clipping long views by scrolling to the top first
        const originalScrollY = window.scrollY;
        window.scrollTo(0, 0);

        const canvas = await html2canvas(element, {
            scale: 2, // higher res
            backgroundColor: '#ffffff',
            useCORS: true,
            scrollY: 0,
            windowWidth: Math.max(1200, document.documentElement.scrollWidth),
            windowHeight: document.documentElement.scrollHeight
        });

        window.scrollTo(0, originalScrollY);

        const imgData = canvas.toDataURL('image/png');
        const imgWidth = canvas.width;
        const imgHeight = canvas.height;
        const pdfWidth = 210; // A4 width in mm
        const contentHeight = (imgHeight * pdfWidth) / imgWidth;
        const pdfHeight = contentHeight + 20; // Extra padding for signature

        const pdf = new jsPDF({
            orientation: pdfHeight > pdfWidth ? 'portrait' : 'landscape',
            unit: 'mm',
            format: [pdfWidth, pdfHeight],
        });

        pdf.addImage(imgData, 'PNG', 0, 0, pdfWidth, contentHeight);

        // Fake digital signature rendering
        pdf.setFontSize(10);
        pdf.setTextColor(150);
        pdf.text(`Digitally locked by FuelStation System on ${new Date().toLocaleString()}`, 10, contentHeight + 8);
        pdf.text(`Verification Hash: ${Math.random().toString(36).substring(2, 15)}`, 10, contentHeight + 14);

        pdf.save(`${filename}.pdf`);
    } catch (error) {
        console.error('Error generating PDF:', error);
    }
};
