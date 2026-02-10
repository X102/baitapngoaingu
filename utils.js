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
    // Hàm mới: Chỉ xoá dấu trọng âm và dấu phụ (giữ lại ký tự gốc)
    removeStress: (str) => {
        return str.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
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
        // Trả về thêm thuộc tính dictCode cho Vtudien
        if (/[а-яА-ЯёЁ]/.test(text)) return { code: 'ru', dictCode: 'nga', lang: 'ru-RU', name: 'Tiếng Nga' };
        if (/[\u4e00-\u9faf]/.test(text)) return { code: 'zh', dictCode: 'trung', lang: 'zh-CN', name: 'Tiếng Trung' };
        if (/[\u3040-\u30ff]/.test(text)) return { code: 'ja', dictCode: 'nhat', lang: 'ja-JP', name: 'Tiếng Nhật' };
        if (/[\uac00-\ud7af]/.test(text)) return { code: 'ko', dictCode: 'han', lang: 'ko-KR', name: 'Tiếng Hàn' };
        if (/[àáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđ]/.test(text)) return { code: 'vi', dictCode: 'viet', lang: 'vi-VN', name: 'Tiếng Việt' };
        return { code: 'en', dictCode: 'anh', lang: 'en-US', name: 'Tiếng Anh' };
    }
};

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
//             prompt: prompt.substring(0, 40) + "...",
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
//     removeAccents: (str) => {
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
//         if (/[а-яА-ЯёЁ]/.test(text)) return { code: 'ru', vdict: 'nga', lang: 'ru-RU', name: 'Tiếng Nga' };
//         if (/[\u4e00-\u9faf]/.test(text)) return { code: 'zh', vdict: 'trung', lang: 'zh-CN', name: 'Tiếng Trung' };
//         if (/[\u3040-\u30ff]/.test(text)) return { code: 'ja', vdict: 'nhat', lang: 'ja-JP', name: 'Tiếng Nhật' };
//         if (/[\uac00-\ud7af]/.test(text)) return { code: 'ko', vdict: 'han', lang: 'ko-KR', name: 'Tiếng Hàn' };
//         if (/[àáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđ]/.test(text)) return { code: 'vi', vdict: 'viet', lang: 'vi-VN', name: 'Tiếng Việt' };
//         // Các ngôn ngữ latin khác
//         if (/[éèêëàâùûüçîï]/.test(text)) return { code: 'fr', vdict: 'phap', lang: 'fr-FR', name: 'Tiếng Pháp' };
//         return { code: 'en', vdict: 'anh', lang: 'en-US', name: 'Tiếng Anh' };
//     }
// };