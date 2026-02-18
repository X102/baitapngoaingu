// js/utils.js

const Storage = {
    getKey: () => localStorage.getItem('api_key') || '',
    setKey: (key) => localStorage.setItem('api_key', key),
    
    getHistory: () => JSON.parse(localStorage.getItem('search_history') || '[]'),
    
    addHistory: (prompt, result, type) => {
        let history = Storage.getHistory();
        const newItem = {
            id: Date.now(),
            timestamp: new Date().toLocaleString(),
            prompt: prompt.substring(0, 50) + "...",
            fullPrompt: prompt,
            result: result,
            type: type
        };
        history.unshift(newItem);
        if(history.length > 20) history.pop();
        localStorage.setItem('search_history', JSON.stringify(history));
        return history;
    },
    
    clearHistory: () => {
        localStorage.removeItem('search_history');
        location.reload();
    }
};

const Utils = {
    // --- SỬA LỖI TẠI ĐÂY ---
    // Hàm xoá dấu trọng âm (Fix lỗi chữ й bị mất dấu thành и)
    removeStress: (str) => {
        // 1. Chuẩn hoá về dạng NFD (tách ký tự và dấu ra riêng)
        // 2. Chỉ thay thế dấu Acute Accent (U+0301 - dấu trọng âm) bằng rỗng
        // 3. Chuẩn hoá ngược lại về NFC để gộp các dấu còn lại (như dấu của chữ й) vào ký tự gốc
        return str.normalize("NFD").replace(/\u0301/g, "").normalize("NFC");
    },

    fileToBase64: (file) => {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.readAsDataURL(file);
            reader.onload = () => resolve(reader.result.split(',')[1]);
            reader.onerror = error => reject(error);
        });
    },

    detectLang: (text) => {
        if (/[а-яА-ЯёЁ]/.test(text)) return { code: 'ru', dictCode: 'nga', lang: 'ru-RU', name: 'Tiếng Nga' };
        if (/[\u4e00-\u9faf]/.test(text)) return { code: 'zh', dictCode: 'trung', lang: 'zh-CN', name: 'Tiếng Trung' };
        if (/[\u3040-\u30ff]/.test(text)) return { code: 'ja', dictCode: 'nhat', lang: 'ja-JP', name: 'Tiếng Nhật' };
        if (/[\uac00-\ud7af]/.test(text)) return { code: 'ko', dictCode: 'han', lang: 'ko-KR', name: 'Tiếng Hàn' };
        if (/[àáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđ]/.test(text)) return { code: 'vi', dictCode: 'viet', lang: 'vi-VN', name: 'Tiếng Việt' };
        return { code: 'en', dictCode: 'anh', lang: 'en-US', name: 'Tiếng Anh' };
    },

    // --- CÁC HÀM ĐỌC FILE ---
    
    readTxt: (file) => {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = (e) => resolve(e.target.result);
            reader.onerror = reject;
            reader.readAsText(file);
        });
    },

    readDocx: (file) => {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = function(e) {
                const arrayBuffer = e.target.result;
                mammoth.extractRawText({arrayBuffer: arrayBuffer})
                    .then(result => resolve(result.value))
                    .catch(reject);
            };
            reader.readAsArrayBuffer(file);
        });
    },

    readPdf: async (file) => {
        const arrayBuffer = await file.arrayBuffer();
        const pdf = await pdfjsLib.getDocument({data: arrayBuffer}).promise;
        let fullText = "";
        
        for (let i = 1; i <= pdf.numPages; i++) {
            const page = await pdf.getPage(i);
            const textContent = await page.getTextContent();
            const pageText = textContent.items.map(item => item.str).join(' ');
            fullText += pageText + "\n\n";
        }
        return fullText;
    }
};


// js/utils.js

// const Storage = {
//     getKey: () => localStorage.getItem('api_key') || '',
//     setKey: (key) => localStorage.setItem('api_key', key),
    
//     getHistory: () => JSON.parse(localStorage.getItem('search_history') || '[]'),
    
//     addHistory: (prompt, result, type) => {
//         let history = Storage.getHistory();
//         const newItem = {
//             id: Date.now(),
//             timestamp: new Date().toLocaleString(),
//             prompt: prompt.substring(0, 50) + "...",
//             fullPrompt: prompt,
//             result: result,
//             type: type
//         };
//         history.unshift(newItem);
//         if(history.length > 20) history.pop();
//         localStorage.setItem('search_history', JSON.stringify(history));
//         return history;
//     },
    
//     clearHistory: () => {
//         localStorage.removeItem('search_history');
//         location.reload();
//     }
// };

// const Utils = {
//     removeStress: (str) => {
//         return str.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
//     },

//     fileToBase64: (file) => {
//         return new Promise((resolve, reject) => {
//             const reader = new FileReader();
//             reader.readAsDataURL(file);
//             reader.onload = () => resolve(reader.result.split(',')[1]);
//             reader.onerror = error => reject(error);
//         });
//     },

//     detectLang: (text) => {
//         if (/[а-яА-ЯёЁ]/.test(text)) return { code: 'ru', dictCode: 'nga', lang: 'ru-RU', name: 'Tiếng Nga' };
//         if (/[\u4e00-\u9faf]/.test(text)) return { code: 'zh', dictCode: 'trung', lang: 'zh-CN', name: 'Tiếng Trung' };
//         if (/[\u3040-\u30ff]/.test(text)) return { code: 'ja', dictCode: 'nhat', lang: 'ja-JP', name: 'Tiếng Nhật' };
//         if (/[\uac00-\ud7af]/.test(text)) return { code: 'ko', dictCode: 'han', lang: 'ko-KR', name: 'Tiếng Hàn' };
//         if (/[àáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđ]/.test(text)) return { code: 'vi', dictCode: 'viet', lang: 'vi-VN', name: 'Tiếng Việt' };
//         return { code: 'en', dictCode: 'anh', lang: 'en-US', name: 'Tiếng Anh' };
//     },

//     // --- MỚI: CÁC HÀM ĐỌC FILE ---
    
//     readTxt: (file) => {
//         return new Promise((resolve, reject) => {
//             const reader = new FileReader();
//             reader.onload = (e) => resolve(e.target.result);
//             reader.onerror = reject;
//             reader.readAsText(file);
//         });
//     },

//     readDocx: (file) => {
//         return new Promise((resolve, reject) => {
//             const reader = new FileReader();
//             reader.onload = function(e) {
//                 const arrayBuffer = e.target.result;
//                 mammoth.extractRawText({arrayBuffer: arrayBuffer})
//                     .then(result => resolve(result.value))
//                     .catch(reject);
//             };
//             reader.readAsArrayBuffer(file);
//         });
//     },

//     readPdf: async (file) => {
//         const arrayBuffer = await file.arrayBuffer();
//         const pdf = await pdfjsLib.getDocument({data: arrayBuffer}).promise;
//         let fullText = "";
        
//         for (let i = 1; i <= pdf.numPages; i++) {
//             const page = await pdf.getPage(i);
//             const textContent = await page.getTextContent();
//             const pageText = textContent.items.map(item => item.str).join(' ');
//             fullText += pageText + "\n\n";
//         }
//         return fullText;
//     }
// };


// // js/utils.js

// const Storage = {
//     getKey: () => localStorage.getItem('api_key') || '',
//     setKey: (key) => localStorage.setItem('api_key', key),
    
//     getHistory: () => JSON.parse(localStorage.getItem('search_history') || '[]'),
    
//     addHistory: (prompt, result, type) => {
//         let history = Storage.getHistory();
//         const newItem = {
//             id: Date.now(),
//             timestamp: new Date().toLocaleString(),
//             prompt: prompt.substring(0, 50) + "...",
//             fullPrompt: prompt,
//             result: result,
//             type: type
//         };
//         history.unshift(newItem);
//         if(history.length > 20) history.pop();
//         localStorage.setItem('search_history', JSON.stringify(history));
//         return history;
//     },
    
//     clearHistory: () => {
//         localStorage.removeItem('search_history');
//         location.reload();
//     }
// };

// const Utils = {
//     // Hàm mới: Chỉ xoá dấu trọng âm và dấu phụ (giữ lại ký tự gốc)
//     removeStress: (str) => {
//         return str.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
//     },

//     fileToBase64: (file) => {
//         return new Promise((resolve, reject) => {
//             const reader = new FileReader();
//             reader.readAsDataURL(file);
//             reader.onload = () => resolve(reader.result.split(',')[1]);
//             reader.onerror = error => reject(error);
//         });
//     },

//     detectLang: (text) => {
//         // Trả về thêm thuộc tính dictCode cho Vtudien
//         if (/[а-яА-ЯёЁ]/.test(text)) return { code: 'ru', dictCode: 'nga', lang: 'ru-RU', name: 'Tiếng Nga' };
//         if (/[\u4e00-\u9faf]/.test(text)) return { code: 'zh', dictCode: 'trung', lang: 'zh-CN', name: 'Tiếng Trung' };
//         if (/[\u3040-\u30ff]/.test(text)) return { code: 'ja', dictCode: 'nhat', lang: 'ja-JP', name: 'Tiếng Nhật' };
//         if (/[\uac00-\ud7af]/.test(text)) return { code: 'ko', dictCode: 'han', lang: 'ko-KR', name: 'Tiếng Hàn' };
//         if (/[àáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđ]/.test(text)) return { code: 'vi', dictCode: 'viet', lang: 'vi-VN', name: 'Tiếng Việt' };
//         return { code: 'en', dictCode: 'anh', lang: 'en-US', name: 'Tiếng Anh' };
//     }
// };
