export type TranslationKey = keyof typeof translations.en;

export const translations = {
    en: {
        // Navigation
        dashboard: "Dashboard",
        newShift: "New Shift",
        dsrReport: "DSR Report",
        pendingApprovals: "Pending Approvals",
        updateRates: "Update Rates",
        employees: "Employees",
        virtualLocker: "Virtual Locker",
        attendance: "Attendance",
        logout: "Logout",
        // Roles & Titles
        admin: "Admin",
        manager: "Manager",
        fuelStationSystem: "Fuel Station System",

        // Shift Entry
        date: "Date",
        shift: "Shift",
        managerName: "Manager Name",
        product: "Product",
        nozzleNo: "Nozzle No.",
        openingMeter: "Opening Mtr",
        closingMeter: "Closing Mtr",
        testing: "Testing",
        rate: "Rate",
        saleQty: "Sale Qty",
        amount: "Amount",
        totalMS: "Total MS",
        totalHSD: "Total HSD",
        totalSale: "Total Sale",
        cashReceived: "Cash Received",
        onlineReceived: "Online Received",
        difference: "Difference",
        submitShift: "Submit Shift",
        addNozzle: "Add Nozzle",

        // Status
        pending: "Pending",
        approved: "Approved",
        approve: "Approve",
        approvedBy: "Approved By",
        locked: "Locked",

        // Dashboard Stats
        todaySale: "Today's Sale",
        monthlySale: "Monthly Sale",

        // DSR
        shift1Total: "Shift 1 Total",
        shift2Total: "Shift 2 Total",
        grandTotal: "Grand Total",
        netBalance: "Net Balance",
        downloadPDF: "Download PDF",
    },
    hi: {
        // Navigation
        dashboard: "डैशबोर्ड",
        newShift: "नई शिफ्ट",
        dsrReport: "डीएसआर रिपोर्ट",
        pendingApprovals: "लंबित स्वीकृतियां",
        updateRates: "दरें अपडेट करें",
        employees: "कर्मचारी",
        virtualLocker: "वर्चुअल लॉकर",
        attendance: "उपस्थिति",
        logout: "लॉगआउट",
        // Roles & Titles
        admin: "एडमिन",
        manager: "मैनेजर",
        fuelStationSystem: "पेट्रोल पंप प्रणाली",

        // Shift Entry
        date: "तारीख",
        shift: "शिफ्ट",
        managerName: "मैनेजर का नाम",
        product: "उत्पाद",
        nozzleNo: "नोजल नं.",
        openingMeter: "ओपनिंग मीटर",
        closingMeter: "क्लोजिंग मीटर",
        testing: "टेस्टिंग",
        rate: "रेट",
        saleQty: "बिक्री मात्रा",
        amount: "रकम",
        totalMS: "कुल MS",
        totalHSD: "कुल HSD",
        totalSale: "कुल बिक्री",
        cashReceived: "नकद प्राप्त",
        onlineReceived: "ऑनलाइन प्राप्त",
        difference: "अंतर",
        submitShift: "शिफ्ट सबमिट करें",
        addNozzle: "नोजल जोड़ें",

        // Status
        pending: "लंबित",
        approved: "स्वीकृत",
        approve: "स्वीकृत करें",
        approvedBy: "स्वीकृतकर्ता",
        locked: "लॉक",

        // Dashboard Stats
        todaySale: "आज की बिक्री",
        monthlySale: "मासिक बिक्री",

        // DSR
        shift1Total: "शिफ्ट 1 कुल",
        shift2Total: "शिफ्ट 2 कुल",
        grandTotal: "कुल योग",
        netBalance: "शुद्ध शेष",
        downloadPDF: "पीडीएफ डाउनलोड",
    }
};

export const t = (key: TranslationKey, lang: 'en' | 'hi') => {
    return translations[lang][key] || key;
};
