// js/tts.js

const TTS = {
    queue: [],
    isPlaying: false,
    isPaused: false,
    cachedText: "",
    cachedLang: "",
    currentSource: "",
    availableVoices: [],
    currentChunk: null, 

    loadVoices: () => {
        TTS.availableVoices = window.speechSynthesis.getVoices();
        const voiceSelect = document.getElementById('voiceSelect');
        const targetSelect = document.getElementById('targetLang');
        if(!voiceSelect || !targetSelect) return;

        const targetCode = targetSelect.options[targetSelect.selectedIndex].getAttribute('data-code');
        const relevantVoices = TTS.availableVoices.filter(v => v.lang.startsWith(targetCode));
        const currentSelected = voiceSelect.value;

        voiceSelect.innerHTML = '<option value="">-- Mặc định (Tự chọn) --</option>';
        relevantVoices.forEach(voice => {
            const option = document.createElement('option');
            option.value = voice.name;
            option.textContent = `${voice.name} (${voice.lang})`;
            voiceSelect.appendChild(option);
        });

        if(currentSelected) voiceSelect.value = currentSelected;
    },

    // --- LOGIC PHÂN TÍCH VÀ GỘP (CORE) ---
    parseText: (fullText, targetLangCode) => {
        
        // 1. Regex nhận diện ngôn ngữ đích (Chỉ bắt chữ cái, KHÔNG bắt dấu câu ở đây)
        let regexLang;
        if (targetLangCode === 'ru') regexLang = /([а-яА-ЯёЁ\u0301]+)/g;
        else if (targetLangCode === 'zh') regexLang = /([\u4e00-\u9faf]+)/g;
        else if (targetLangCode === 'ja') regexLang = /([\u3040-\u30ff\u4e00-\u9faf]+)/g;
        else if (targetLangCode === 'ko') regexLang = /([\uac00-\ud7af]+)/g;
        else if (targetLangCode === 'en') {
            // Với tiếng Anh, dùng logic riêng để tránh nhầm với tiếng Việt
            return TTS.parseEnglishMixed(fullText); 
        }
        else regexLang = null; // Tiếng Việt hoặc khác

        if (!regexLang) {
            return [{ text: fullText, lang: 'vi-VN' }];
        }

        // 2. Tách chuỗi thô
        const parts = fullText.split(regexLang);
        let rawChunks = [];
        
        // Mã ngôn ngữ chuẩn
        const langMap = { 'ru': 'ru-RU', 'zh': 'zh-CN', 'ja': 'ja-JP', 'ko': 'ko-KR' };
        const targetIso = langMap[targetLangCode] || 'en-US';

        // 3. Phân loại sơ bộ
        parts.forEach(part => {
            if (!part) return;
            
            let type = 'neutral'; // Mặc định là trung tính (số, dấu câu, khoảng trắng)
            
            if (regexLang.test(part)) {
                type = 'target'; // Là ngôn ngữ đích
            } else if (/[a-zA-Zàáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđ]/.test(part)) {
                // Chứa chữ cái Latin/Việt -> Là tiếng nền (Base)
                type = 'base';
            }
            // Nếu chỉ có số và dấu câu -> Vẫn giữ là 'neutral'

            rawChunks.push({ text: part, type: type });
        });

        // 4. Gán ngôn ngữ cho Neutral (dấu câu/số)
        // Logic: Neutral sẽ bám theo ngôn ngữ của đoạn liền trước nó
        let processedChunks = [];
        let currentLang = 'vi-VN'; // Mặc định ban đầu

        rawChunks.forEach(chunk => {
            if (chunk.type === 'target') {
                currentLang = targetIso;
            } else if (chunk.type === 'base') {
                currentLang = 'vi-VN';
            }
            // Nếu là neutral, giữ nguyên currentLang của vòng lặp trước
            
            processedChunks.push({ text: chunk.text, lang: currentLang });
        });

        // 5. GỘP CÁC ĐOẠN CÙNG NGÔN NGỮ (QUAN TRỌNG NHẤT)
        // Bước này sẽ nối liền mạch các dấu câu vào câu thay vì tách ra
        return TTS.mergeChunks(processedChunks);
    },

    // Hàm xử lý riêng cho Tiếng Anh
    parseEnglishMixed: (text) => {
        const vnCharRegex = /[àáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđ]/i;
        
        // Tách theo từ và dấu câu
        const tokens = text.split(/([\s\.,!?:;"«»()]+)/); 
        
        let classifiedTokens = tokens.map(token => {
            if (!token) return null;
            if (/^[\s\.,!?:;"«»()]+$/.test(token)) return { text: token, type: 'neutral' }; // Dấu câu/Space
            if (vnCharRegex.test(token)) return { text: token, type: 'vi' }; // Có dấu VN
            if (/^[0-9]+$/.test(token)) return { text: token, type: 'neutral' }; // Số
            return { text: token, type: 'ambiguous' }; // Từ không dấu (Hello, la, va)
        }).filter(t => t !== null);

        // Smoothing (Vết dầu loang)
        for (let i = 0; i < classifiedTokens.length; i++) {
            if (classifiedTokens[i].type === 'ambiguous') {
                let prev = null, next = null;
                // Tìm láng giềng là từ (bỏ qua dấu/space)
                for (let j = i - 1; j >= 0; j--) { if (classifiedTokens[j].type !== 'neutral') { prev = classifiedTokens[j]; break; } }
                for (let k = i + 1; k < classifiedTokens.length; k++) { if (classifiedTokens[k].type !== 'neutral') { next = classifiedTokens[k]; break; } }

                if (prev && prev.type === 'vi' && next && next.type === 'vi') classifiedTokens[i].type = 'vi';
                else if (prev && prev.type === 'vi' && classifiedTokens[i].text.length <= 3) classifiedTokens[i].type = 'vi';
                else classifiedTokens[i].type = 'en';
            }
        }

        // Gán ngôn ngữ
        let chunks = [];
        let currentLang = 'vi-VN'; // Mặc định nếu đầu câu là số/dấu thì đọc giọng Việt

        classifiedTokens.forEach(token => {
            if (token.type === 'vi') currentLang = 'vi-VN';
            else if (token.type === 'en') currentLang = 'en-US';
            // Neutral giữ nguyên currentLang
            chunks.push({ text: token.text, lang: currentLang });
        });

        return TTS.mergeChunks(chunks);
    },

    // Hàm gộp chung (Dùng cho cả 2 logic trên)
    mergeChunks: (chunks) => {
        if (chunks.length === 0) return [];
        
        let merged = [];
        let current = { text: chunks[0].text, lang: chunks[0].lang };

        for (let i = 1; i < chunks.length; i++) {
            if (chunks[i].lang === current.lang) {
                // Cùng ngôn ngữ -> Nối vào chuỗi hiện tại (Không tạo chunk mới)
                current.text += chunks[i].text; 
            } else {
                // Khác ngôn ngữ -> Đẩy chunk cũ vào mảng, bắt đầu chunk mới
                merged.push(current);
                current = { text: chunks[i].text, lang: chunks[i].lang };
            }
        }
        merged.push(current);
        return merged;
    },

    start: (text, targetLangCode, source = 'answer') => {
        if (TTS.currentSource !== source) TTS.stop();
        TTS.currentSource = source;
        TTS.cachedText = text;
        TTS.cachedLang = targetLangCode;
        TTS.queue = TTS.parseText(text, targetLangCode);
        TTS.isPlaying = true;
        TTS.isPaused = false;
        document.getElementById('audioPlayer').classList.remove('hidden');
        TTS.playNext();
        updatePlayerUI(true);
    },

    playNext: () => {
        if (TTS.queue.length === 0) {
            TTS.isPlaying = false;
            updatePlayerUI(false);
            if(document.getElementById('readingStatus')) document.getElementById('readingStatus').innerText = "Đã đọc xong";
            return;
        }
        if (TTS.isPaused) return;

        TTS.currentChunk = TTS.queue.shift();
        
        // Xoá dấu trọng âm nếu là Nga
        const textToRead = TTS.currentChunk.lang === 'ru-RU' ? Utils.removeStress(TTS.currentChunk.text) : TTS.currentChunk.text;
        const utterance = new SpeechSynthesisUtterance(textToRead);
        
        // Cấu hình giọng và tốc độ
        const userRate = parseFloat(document.getElementById('rateInput').value) || 1.0;
        const userVoiceName = document.getElementById('voiceSelect').value;
        const voices = window.speechSynthesis.getVoices();

        let voice = null;
        if (userVoiceName) voice = voices.find(v => v.name === userVoiceName);
        if (!voice) {
            voice = voices.find(v => v.lang.includes(TTS.currentChunk.lang) && v.name.includes("Google"));
            if(!voice) voice = voices.find(v => v.lang.includes(TTS.currentChunk.lang));
        }

        if (voice) utterance.voice = voice;
        utterance.rate = userRate; 

        if(document.getElementById('readingStatus')) {
            const langName = TTS.currentChunk.lang.includes('ru') ? '🇷🇺' : (TTS.currentChunk.lang.includes('vi') ? '🇻🇳' : '🏳️');
            document.getElementById('readingStatus').innerText = `${langName} Đang đọc... (${userRate}x)`;
        }

        // Sự kiện kết thúc
        utterance.onend = () => {
            if (TTS.isPlaying && !TTS.isPaused) {
                TTS.playNext();
            }
        };
        
        utterance.onerror = (e) => {
            console.error("TTS Error:", e);
            if (TTS.isPlaying && !TTS.isPaused) TTS.playNext(); 
        };

        window.speechSynthesis.speak(utterance);
    },

    toggle: () => {
        if (TTS.isPlaying && !TTS.isPaused) {
            window.speechSynthesis.pause();
            TTS.isPaused = true;
            updatePlayerUI(false);
            if(document.getElementById('readingStatus')) document.getElementById('readingStatus').innerText = "Đã tạm dừng";
        } else if (TTS.isPaused) {
            TTS.isPaused = false;
            updatePlayerUI(true);
            window.speechSynthesis.resume();
            setTimeout(() => {
                if (!window.speechSynthesis.speaking && TTS.queue.length > 0) TTS.playNext();
            }, 500);
        } else if (TTS.cachedText) {
            TTS.start(TTS.cachedText, TTS.cachedLang, TTS.currentSource);
        }
    },

    reloadSettings: () => {
        if (TTS.isPlaying && !TTS.isPaused) {
            window.speechSynthesis.cancel();
            if (TTS.currentChunk) TTS.queue.unshift(TTS.currentChunk);
            TTS.playNext();
        }
    },

    stop: () => {
        window.speechSynthesis.cancel();
        TTS.queue = [];
        TTS.isPlaying = false;
        TTS.isPaused = false;
        if(document.getElementById('readingStatus')) document.getElementById('readingStatus').innerText = "Đã dừng";
        updatePlayerUI(false);
    },
    
    startFromBeginning: () => {
        if(TTS.cachedText) TTS.start(TTS.cachedText, TTS.cachedLang, TTS.currentSource);
    }
};

function updatePlayerUI(isPlaying) {
    const btn = document.getElementById('btnPlay');
    if(btn) btn.innerHTML = isPlaying ? '<i class="fa-solid fa-pause"></i>' : '<i class="fa-solid fa-play"></i>';
}

// // js/tts.js

// const TTS = {
//     queue: [],
//     isPlaying: false,
//     isPaused: false,
//     cachedText: "",
//     cachedLang: "",
//     currentSource: "",
//     availableVoices: [],
//     currentChunk: null, 

//     loadVoices: () => {
//         TTS.availableVoices = window.speechSynthesis.getVoices();
//         const voiceSelect = document.getElementById('voiceSelect');
//         const targetSelect = document.getElementById('targetLang');
//         if(!voiceSelect || !targetSelect) return;

//         const targetCode = targetSelect.options[targetSelect.selectedIndex].getAttribute('data-code');
//         const relevantVoices = TTS.availableVoices.filter(v => v.lang.startsWith(targetCode));
//         const currentSelected = voiceSelect.value;

//         voiceSelect.innerHTML = '<option value="">-- Mặc định (Tự chọn) --</option>';
//         relevantVoices.forEach(voice => {
//             const option = document.createElement('option');
//             option.value = voice.name;
//             option.textContent = `${voice.name} (${voice.lang})`;
//             voiceSelect.appendChild(option);
//         });

//         if(currentSelected) voiceSelect.value = currentSelected;
//     },

//     // --- LOGIC TÁCH NGÔN NGỮ MỚI ---
//     parseText: (fullText, targetLangCode) => {
        
//         // 1. NẾU LÀ TIẾNG ANH (Xử lý xung đột Latin với Tiếng Việt)
//         if (targetLangCode === 'en') {
//             return TTS.parseEnglishMixed(fullText);
//         }

//         // 2. CÁC NGÔN NGỮ KHÁC (Nga, Trung, Nhật, Hàn) - Dùng Regex phân tách rõ ràng
//         let regexLang;
//         // Thêm \d (số) và dấu câu vào regex để chúng đi theo ngôn ngữ đó
//         if (targetLangCode === 'ru') regexLang = /([а-яА-ЯёЁ\u0301\d\.,!?:%;"«»()]+)/g;
//         else if (targetLangCode === 'zh') regexLang = /([\u4e00-\u9faf\d\.,!?:%;"«»()]+)/g;
//         else if (targetLangCode === 'ja') regexLang = /([\u3040-\u30ff\u4e00-\u9faf\d\.,!?:%;"«»()]+)/g;
//         else if (targetLangCode === 'ko') regexLang = /([\uac00-\ud7af\d\.,!?:%;"«»()]+)/g;
//         else return [{ text: fullText, lang: 'vi-VN' }]; // Fallback

//         const parts = fullText.split(regexLang);
//         let chunks = [];
        
//         // Map mã ngôn ngữ chuẩn
//         const langMap = { 'ru': 'ru-RU', 'zh': 'zh-CN', 'ja': 'ja-JP', 'ko': 'ko-KR' };
//         const targetIso = langMap[targetLangCode];

//         parts.forEach(part => {
//             if (!part.trim()) return;
//             // Nếu khớp regex ngôn ngữ đích -> Target Lang
//             if (regexLang.test(part)) {
//                 chunks.push({ text: part, lang: targetIso });
//             } 
//             // Ngược lại -> Tiếng Việt (bao gồm cả các từ Latin giải thích)
//             else {
//                 chunks.push({ text: part, lang: 'vi-VN' });
//             }
//         });
        
//         return TTS.mergeChunks(chunks);
//     },

//     // Hàm xử lý riêng cho Tiếng Anh trộn Tiếng Việt
//     parseEnglishMixed: (text) => {
//         // Regex phát hiện ký tự đặc trưng Tiếng Việt (có dấu)
//         const vnCharRegex = /[àáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđ]/i;
        
//         // Tách câu thành các từ (giữ lại dấu câu)
//         // Split by whitespace but keep delimiters
//         const tokens = text.split(/([\s\.,!?:;"«»()]+)/);
        
//         let classifiedTokens = tokens.map(token => {
//             if (!token.trim()) return { text: token, type: 'space' }; // Khoảng trắng
//             if (vnCharRegex.test(token)) return { text: token, type: 'vi' }; // Chắc chắn là Việt
//             return { text: token, type: 'ambiguous' }; // Không dấu (có thể là Anh hoặc Việt: "Hello" vs "la")
//         });

//         // THUẬT TOÁN SMOOTHING (Vết dầu loang)
//         // Nếu một từ không dấu (ambiguous) nằm cạnh từ Tiếng Việt -> Coi là Tiếng Việt
//         for (let i = 0; i < classifiedTokens.length; i++) {
//             if (classifiedTokens[i].type === 'ambiguous') {
//                 // Kiểm tra hàng xóm (bỏ qua khoảng trắng)
//                 let prev = null, next = null;
                
//                 // Tìm hàng xóm phía trước
//                 for (let j = i - 1; j >= 0; j--) {
//                     if (classifiedTokens[j].type !== 'space') { prev = classifiedTokens[j]; break; }
//                 }
//                 // Tìm hàng xóm phía sau
//                 for (let k = i + 1; k < classifiedTokens.length; k++) {
//                     if (classifiedTokens[k].type !== 'space') { next = classifiedTokens[k]; break; }
//                 }

//                 // Logic quyết định:
//                 // 1. Nếu kẹp giữa 2 từ Việt -> Việt (VD: "đó la sự")
//                 // 2. Nếu đi liền sau từ Việt và là từ ngắn (<=3 ký tự) -> Việt (VD: "là", "và")
//                 // 3. Mặc định còn lại -> Anh (Ưu tiên tiếng Anh để đọc từ vựng chuẩn)
                
//                 if (prev && prev.type === 'vi' && next && next.type === 'vi') {
//                     classifiedTokens[i].type = 'vi';
//                 } else if (prev && prev.type === 'vi' && classifiedTokens[i].text.length <= 3) {
//                     classifiedTokens[i].type = 'vi'; // Các từ nối: và, là, của, do...
//                 } else {
//                     classifiedTokens[i].type = 'en';
//                 }
//             }
//         }

//         // Gom lại thành chunks
//         let chunks = [];
//         classifiedTokens.forEach(token => {
//             let lang = token.type === 'vi' ? 'vi-VN' : (token.type === 'space' ? 'neutral' : 'en-US');
//             chunks.push({ text: token.text, lang: lang });
//         });

//         // Xử lý 'neutral' (khoảng trắng/dấu câu) -> Bám theo thằng trước nó
//         for (let i = 1; i < chunks.length; i++) {
//             if (chunks[i].lang === 'neutral') chunks[i].lang = chunks[i-1].lang;
//         }
//         if (chunks.length > 0 && chunks[0].lang === 'neutral') chunks[0].lang = 'en-US'; // Mặc định đầu câu

//         return TTS.mergeChunks(chunks);
//     },

//     mergeChunks: (chunks) => {
//         let merged = [];
//         if (chunks.length > 0) {
//             let curr = chunks[0];
//             for (let i = 1; i < chunks.length; i++) {
//                 if (chunks[i].lang === curr.lang) {
//                     curr.text += chunks[i].text;
//                 } else {
//                     merged.push(curr);
//                     curr = chunks[i];
//                 }
//             }
//             merged.push(curr);
//         }
//         return merged;
//     },

//     start: (text, targetLangCode, source = 'answer') => {
//         if (TTS.currentSource !== source) TTS.stop();
        
//         TTS.currentSource = source;
//         TTS.cachedText = text;
//         TTS.cachedLang = targetLangCode;
//         TTS.queue = TTS.parseText(text, targetLangCode);
//         TTS.isPlaying = true;
//         TTS.isPaused = false;
        
//         document.getElementById('audioPlayer').classList.remove('hidden');
//         TTS.playNext();
//         updatePlayerUI(true);
//     },

//     playNext: () => {
//         if (TTS.queue.length === 0 || !TTS.isPlaying) {
//             TTS.stop();
//             if(document.getElementById('readingStatus')) document.getElementById('readingStatus').innerText = "Đã đọc xong";
//             return;
//         }
//         if (TTS.isPaused) return;

//         TTS.currentChunk = TTS.queue.shift();
        
//         // Xoá dấu trọng âm nếu là Nga
//         const textToRead = TTS.currentChunk.lang === 'ru-RU' ? Utils.removeStress(TTS.currentChunk.text) : TTS.currentChunk.text;
//         const utterance = new SpeechSynthesisUtterance(textToRead);
        
//         // --- ÁP DỤNG CẤU HÌNH ---
//         const userRate = parseFloat(document.getElementById('rateInput').value) || 1.0;
//         const userVoiceName = document.getElementById('voiceSelect').value;
//         const voices = window.speechSynthesis.getVoices();

//         let voice = null;
//         if (userVoiceName) voice = voices.find(v => v.name === userVoiceName);
//         if (!voice) {
//             voice = voices.find(v => v.lang.includes(TTS.currentChunk.lang) && v.name.includes("Google"));
//             if(!voice) voice = voices.find(v => v.lang.includes(TTS.currentChunk.lang));
//         }

//         if (voice) utterance.voice = voice;
//         utterance.rate = userRate; 

//         if(document.getElementById('readingStatus')) {
//             const langName = TTS.currentChunk.lang.includes('vi') ? '🇻🇳 Việt' : (TTS.currentChunk.lang.includes('en') ? '🇺🇸 Anh' : '🏳️ Ngoại ngữ');
//             document.getElementById('readingStatus').innerText = `Đang đọc: ${langName} (${userRate}x)`;
//         }

//         utterance.onend = () => { if (TTS.isPlaying && !TTS.isPaused) TTS.playNext(); };
//         utterance.onerror = () => { if (TTS.isPlaying && !TTS.isPaused) TTS.playNext(); };

//         window.speechSynthesis.speak(utterance);
//     },

//     // --- FIX LỖI RESUME ---
//     toggle: () => {
//         if (TTS.isPlaying && !TTS.isPaused) {
//             window.speechSynthesis.pause();
//             TTS.isPaused = true;
//             updatePlayerUI(false);
//             if(document.getElementById('readingStatus')) document.getElementById('readingStatus').innerText = "Đã tạm dừng";
//         } else if (TTS.isPaused) {
//             TTS.isPaused = false;
//             updatePlayerUI(true);
//             window.speechSynthesis.resume();
            
//             // Hack fix: Chrome đôi khi không resume được, ta ép đọc lại đoạn tiếp theo sau 500ms nếu nó im lặng
//             setTimeout(() => {
//                 if (!window.speechSynthesis.speaking && TTS.queue.length > 0) {
//                     TTS.playNext();
//                 }
//             }, 500);
//         } else if (TTS.cachedText) {
//             TTS.start(TTS.cachedText, TTS.cachedLang, TTS.currentSource);
//         }
//     },

//     reloadSettings: () => {
//         if (TTS.isPlaying && !TTS.isPaused) {
//             window.speechSynthesis.cancel();
//             if (TTS.currentChunk) TTS.queue.unshift(TTS.currentChunk);
//             TTS.playNext();
//         }
//     },

//     stop: () => {
//         window.speechSynthesis.cancel();
//         TTS.queue = [];
//         TTS.isPlaying = false;
//         TTS.isPaused = false;
//         if(document.getElementById('readingStatus')) document.getElementById('readingStatus').innerText = "Đã dừng";
//         updatePlayerUI(false);
//     },
    
//     startFromBeginning: () => {
//         if(TTS.cachedText) TTS.start(TTS.cachedText, TTS.cachedLang, TTS.currentSource);
//     }
// };

// function updatePlayerUI(isPlaying) {
//     const btn = document.getElementById('btnPlay');
//     if(btn) btn.innerHTML = isPlaying ? '<i class="fa-solid fa-pause"></i>' : '<i class="fa-solid fa-play"></i>';
// }

// // js/tts.js

// const TTS = {
//     queue: [],
//     isPlaying: false,
//     isPaused: false,
//     cachedText: "",
//     cachedLang: "",
//     currentSource: "",
//     availableVoices: [],
//     currentChunk: null, // MỚI: Lưu đoạn văn đang đọc dở

//     loadVoices: () => {
//         TTS.availableVoices = window.speechSynthesis.getVoices();
//         const voiceSelect = document.getElementById('voiceSelect');
//         const targetSelect = document.getElementById('targetLang');
//         if(!voiceSelect || !targetSelect) return;

//         const targetCode = targetSelect.options[targetSelect.selectedIndex].getAttribute('data-code');
//         const relevantVoices = TTS.availableVoices.filter(v => v.lang.startsWith(targetCode));
        
//         // Giữ lại giọng đang chọn nếu có
//         const currentSelected = voiceSelect.value;

//         voiceSelect.innerHTML = '<option value="">-- Mặc định (Tự chọn) --</option>';
//         relevantVoices.forEach(voice => {
//             const option = document.createElement('option');
//             option.value = voice.name;
//             option.textContent = `${voice.name} (${voice.lang})`;
//             voiceSelect.appendChild(option);
//         });

//         // Restore selection
//         if(currentSelected) voiceSelect.value = currentSelected;
//     },

//     parseText: (fullText, targetLangCode) => {
//         // Regex nhận diện ngôn ngữ (bao gồm số và dấu câu đi kèm)
//         let regexLang;
//         if (targetLangCode === 'ru') regexLang = /([а-яА-ЯёЁ\u0301\d\.,!?:%;"«»()]+)/g;
//         else if (targetLangCode === 'zh') regexLang = /([\u4e00-\u9faf\d\.,!?:%;"«»()]+)/g;
//         else if (targetLangCode === 'ja') regexLang = /([\u3040-\u30ff\u4e00-\u9faf\d\.,!?:%;"«»()]+)/g;
//         else if (targetLangCode === 'ko') regexLang = /([\uac00-\ud7af\d\.,!?:%;"«»()]+)/g;
//         else if (targetLangCode === 'en') regexLang = /([a-zA-Z\d\.,!?:%;"«»()]+)/g;
//         else regexLang = null;

//         if (!regexLang) return [{ text: fullText, lang: 'vi-VN' }];

//         const parts = fullText.split(regexLang);
//         let rawChunks = [];
        
//         parts.forEach(part => {
//             if (!part) return;
//             let type = 'neutral';
//             if (regexLang.test(part)) type = 'target';
//             else if (/[a-zA-Zàáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđ]/.test(part) && targetLangCode !== 'en') type = 'base';
//             rawChunks.push({ text: part, type: type });
//         });

//         let processedChunks = [];
//         let currentLang = 'vi-VN';
//         let targetIso = 'en-US';
        
//         if (targetLangCode === 'ru') targetIso = 'ru-RU';
//         else if (targetLangCode === 'zh') targetIso = 'zh-CN';
//         else if (targetLangCode === 'ja') targetIso = 'ja-JP';
//         else if (targetLangCode === 'ko') targetIso = 'ko-KR';

//         rawChunks.forEach(chunk => {
//             if (chunk.type === 'target') currentLang = targetIso;
//             else if (chunk.type === 'base') currentLang = 'vi-VN';
//             processedChunks.push({ text: chunk.text, lang: currentLang });
//         });

//         let merged = [];
//         if (processedChunks.length > 0) {
//             let curr = processedChunks[0];
//             for (let i = 1; i < processedChunks.length; i++) {
//                 if (processedChunks[i].lang === curr.lang) curr.text += processedChunks[i].text;
//                 else { merged.push(curr); curr = processedChunks[i]; }
//             }
//             merged.push(curr);
//         }
//         return merged;
//     },

//     start: (text, targetLangCode, source = 'answer') => {
//         if (TTS.currentSource !== source) TTS.stop();
        
//         TTS.currentSource = source;
//         TTS.cachedText = text;
//         TTS.cachedLang = targetLangCode;
//         TTS.queue = TTS.parseText(text, targetLangCode);
//         TTS.isPlaying = true;
//         TTS.isPaused = false;
        
//         document.getElementById('audioPlayer').classList.remove('hidden');
//         TTS.playNext();
//         updatePlayerUI(true);
//     },

//     playNext: () => {
//         // Nếu hàng đợi rỗng
//         if (TTS.queue.length === 0) {
//             TTS.isPlaying = false;
//             updatePlayerUI(false);
//             if(document.getElementById('readingStatus')) document.getElementById('readingStatus').innerText = "Đã đọc xong";
//             return;
//         }
        
//         if (TTS.isPaused) return;

//         // Lấy đoạn tiếp theo và lưu vào currentChunk
//         TTS.currentChunk = TTS.queue.shift();
        
//         const textToRead = TTS.currentChunk.lang === 'ru-RU' ? Utils.removeStress(TTS.currentChunk.text) : TTS.currentChunk.text;
//         const utterance = new SpeechSynthesisUtterance(textToRead);
        
//         // --- ÁP DỤNG CÀI ĐẶT ---
//         const userRate = parseFloat(document.getElementById('rateInput').value) || 1.0;
//         const userVoiceName = document.getElementById('voiceSelect').value;
//         const voices = window.speechSynthesis.getVoices();

//         let voice = null;
//         if (userVoiceName) voice = voices.find(v => v.name === userVoiceName);
//         if (!voice) {
//             voice = voices.find(v => v.lang.includes(TTS.currentChunk.lang) && v.name.includes("Google"));
//             if(!voice) voice = voices.find(v => v.lang.includes(TTS.currentChunk.lang));
//         }

//         if (voice) utterance.voice = voice;
//         utterance.rate = userRate; 

//         if(document.getElementById('readingStatus')) {
//             const langName = TTS.currentChunk.lang.includes('ru') ? '🇷🇺' : (TTS.currentChunk.lang.includes('vi') ? '🇻🇳' : '🏳️');
//             document.getElementById('readingStatus').innerText = `${langName} Đang đọc... (${userRate}x)`;
//         }

//         utterance.onend = () => {
//             // Chỉ đọc tiếp nếu người dùng không bấm Pause giữa chừng
//             if (TTS.isPlaying && !TTS.isPaused) {
//                 TTS.playNext();
//             }
//         };
        
//         utterance.onerror = (e) => {
//             console.error("TTS Error:", e);
//             if (TTS.isPlaying && !TTS.isPaused) TTS.playNext(); 
//         };

//         window.speechSynthesis.speak(utterance);
//     },

//     // --- SỬA LỖI TẠM DỪNG / TIẾP TỤC ---
//     toggle: () => {
//         if (TTS.isPlaying && !TTS.isPaused) {
//             // Đang đọc -> Tạm dừng
//             window.speechSynthesis.pause();
//             TTS.isPaused = true;
//             updatePlayerUI(false);
//             if(document.getElementById('readingStatus')) document.getElementById('readingStatus').innerText = "Đã tạm dừng";
//         } else if (TTS.isPaused) {
//             // Đang dừng -> Tiếp tục
//             TTS.isPaused = false;
//             updatePlayerUI(true);
//             window.speechSynthesis.resume();
            
//             // Fix lỗi: Đôi khi resume() không chạy nếu trình duyệt bị lag
//             // Nếu sau 500ms mà vẫn không speaking thì ép đọc lại
//             setTimeout(() => {
//                 if (!window.speechSynthesis.speaking && TTS.queue.length > 0) {
//                     TTS.playNext();
//                 }
//             }, 500);
//         } else if (!TTS.isPlaying && TTS.cachedText) {
//             // Đã dừng hẳn -> Đọc lại từ đầu
//             TTS.start(TTS.cachedText, TTS.cachedLang, TTS.currentSource);
//         }
//     },

//     // --- TÍNH NĂNG MỚI: CẬP NHẬT CÀI ĐẶT NGAY LẬP TỨC ---
//     reloadSettings: () => {
//         if (TTS.isPlaying && !TTS.isPaused) {
//             // 1. Dừng câu đang đọc dở
//             window.speechSynthesis.cancel();
            
//             // 2. Trả câu đang đọc dở về đầu hàng đợi
//             if (TTS.currentChunk) {
//                 TTS.queue.unshift(TTS.currentChunk);
//             }
            
//             // 3. Đọc lại ngay lập tức (sẽ nhận voice/speed mới trong playNext)
//             TTS.playNext();
//         }
//     },

//     stop: () => {
//         window.speechSynthesis.cancel();
//         TTS.queue = [];
//         TTS.isPlaying = false;
//         TTS.isPaused = false;
//         if(document.getElementById('readingStatus')) document.getElementById('readingStatus').innerText = "Đã dừng";
//         updatePlayerUI(false);
//     },
    
//     startFromBeginning: () => {
//         if(TTS.cachedText) TTS.start(TTS.cachedText, TTS.cachedLang, TTS.currentSource);
//     }
// };

// function updatePlayerUI(isPlaying) {
//     const btn = document.getElementById('btnPlay');
//     if(btn) btn.innerHTML = isPlaying ? '<i class="fa-solid fa-pause"></i>' : '<i class="fa-solid fa-play"></i>';
// }

// // js/tts.js

// const TTS = {
//     queue: [],
//     isPlaying: false,
//     isPaused: false,
//     cachedText: "",
//     cachedLang: "",
//     currentSource: "",
//     availableVoices: [],

//     // Load giọng đọc
//     loadVoices: () => {
//         TTS.availableVoices = window.speechSynthesis.getVoices();
//         const voiceSelect = document.getElementById('voiceSelect');
//         const targetSelect = document.getElementById('targetLang');
//         if(!voiceSelect || !targetSelect) return;

//         const targetCode = targetSelect.options[targetSelect.selectedIndex].getAttribute('data-code');
//         const relevantVoices = TTS.availableVoices.filter(v => v.lang.startsWith(targetCode));
        
//         voiceSelect.innerHTML = '<option value="">-- Mặc định (Tự chọn) --</option>';
//         relevantVoices.forEach(voice => {
//             const option = document.createElement('option');
//             option.value = voice.name;
//             option.textContent = `${voice.name} (${voice.lang})`;
//             voiceSelect.appendChild(option);
//         });
//     },

//     // --- THUẬT TOÁN TÁCH ĐOẠN THÔNG MINH (SMART PARSER) ---
//     parseText: (fullText, targetLangCode) => {
//         // 1. Regex chỉ bắt CHỮ CÁI của ngôn ngữ đích (không bắt dấu câu/số ở đây nữa)
//         let regexLang;
//         if (targetLangCode === 'ru') regexLang = /([а-яА-ЯёЁ\u0301]+)/g; // Tiếng Nga
//         else if (targetLangCode === 'zh') regexLang = /([\u4e00-\u9faf]+)/g; // Trung
//         else if (targetLangCode === 'ja') regexLang = /([\u3040-\u30ff\u4e00-\u9faf]+)/g; // Nhật
//         else if (targetLangCode === 'ko') regexLang = /([\uac00-\ud7af]+)/g; // Hàn
//         else if (targetLangCode === 'en') regexLang = /([a-zA-Z]+)/g; // Anh (sơ bộ)
//         else regexLang = null; // Tiếng Việt hoặc khác

//         // Nếu không có regex đặc biệt (ví dụ đang chọn Tiếng Việt), đọc cả bài là 1 cục
//         if (!regexLang) {
//             return [{ text: fullText, lang: 'vi-VN' }];
//         }

//         // 2. Tách chuỗi dựa trên ngôn ngữ đích
//         // Ví dụ: "Năm 1990 (tiếng Nga: год)" -> ["Năm 1990 (tiếng Nga: ", "год", ")"]
//         const parts = fullText.split(regexLang);
        
//         let rawChunks = [];
//         parts.forEach(part => {
//             if (!part) return;
            
//             // Xác định loại của đoạn text này
//             let type = 'neutral'; // Mặc định là trung tính (số, dấu, khoảng trắng)
            
//             if (regexLang.test(part)) {
//                 type = 'target'; // Là ngôn ngữ đích (Nga/Anh/Trung...)
//             } else if (/[a-zA-Zàáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđ]/.test(part)) {
//                 // Nếu chứa ký tự Latin/Việt -> Là tiếng Việt/Anh nền
//                 // Lưu ý: Nếu target là EN thì logic này cần tinh chỉnh, nhưng với RU/ZH thì ổn
//                 if (targetLangCode !== 'en') type = 'base'; 
//                 else type = 'target'; // Nếu đang học Anh thì chữ Latin là target
//             }

//             rawChunks.push({ text: part, type: type });
//         });

//         // 3. Gán ngôn ngữ cho các đoạn Trung tính (Neutral)
//         // Logic: Ký tự trung tính (số, dấu) sẽ "bám" theo ngôn ngữ của đoạn văn bản liền trước nó.
//         let processedChunks = [];
//         let currentLang = 'vi-VN'; // Mặc định bắt đầu là Việt

//         // Map mã ngôn ngữ
//         let targetIso = 'en-US';
//         if (targetLangCode === 'ru') targetIso = 'ru-RU';
//         if (targetLangCode === 'zh') targetIso = 'zh-CN';
//         if (targetLangCode === 'ja') targetIso = 'ja-JP';
//         if (targetLangCode === 'ko') targetIso = 'ko-KR';

//         rawChunks.forEach(chunk => {
//             if (chunk.type === 'target') {
//                 currentLang = targetIso;
//             } else if (chunk.type === 'base') {
//                 currentLang = 'vi-VN';
//             } 
//             // Nếu là 'neutral' thì giữ nguyên currentLang của vòng lặp trước
            
//             processedChunks.push({ text: chunk.text, lang: currentLang });
//         });

//         // 4. Gộp các đoạn cùng ngôn ngữ lại (Merge)
//         // Để tránh máy đọc bị giật cục giữa các từ
//         let merged = [];
//         if (processedChunks.length > 0) {
//             let curr = processedChunks[0];
//             for (let i = 1; i < processedChunks.length; i++) {
//                 if (processedChunks[i].lang === curr.lang) {
//                     curr.text += processedChunks[i].text; // Nối chuỗi
//                 } else {
//                     merged.push(curr);
//                     curr = processedChunks[i];
//                 }
//             }
//             merged.push(curr);
//         }

//         return merged;
//     },

//     start: (text, targetLangCode, source = 'answer') => {
//         if (TTS.currentSource !== source) TTS.stop();
        
//         TTS.currentSource = source;
//         TTS.cachedText = text;
//         TTS.cachedLang = targetLangCode;
        
//         // Gọi hàm parse mới
//         TTS.queue = TTS.parseText(text, targetLangCode);
        
//         TTS.isPlaying = true;
//         document.getElementById('audioPlayer').classList.remove('hidden');
//         TTS.playNext();
//         updatePlayerUI(true);
//     },

//     playNext: () => {
//         if (TTS.queue.length === 0 || !TTS.isPlaying) {
//             TTS.stop();
//             if(document.getElementById('readingStatus')) document.getElementById('readingStatus').innerText = "Đã đọc xong";
//             return;
//         }
//         if (TTS.isPaused) return;

//         const chunk = TTS.queue.shift();
        
//         // Lọc dấu trọng âm nếu là tiếng Nga (để máy đọc mượt)
//         const textToRead = chunk.lang === 'ru-RU' ? Utils.removeStress(chunk.text) : chunk.text;
        
//         const utterance = new SpeechSynthesisUtterance(textToRead);
        
//         // Cấu hình giọng và tốc độ
//         const userRate = parseFloat(document.getElementById('rateInput').value) || 1.0;
//         const userVoiceName = document.getElementById('voiceSelect').value;
//         const voices = window.speechSynthesis.getVoices();

//         let voice = null;
//         if (userVoiceName) {
//              voice = voices.find(v => v.name === userVoiceName);
//         }
//         if (!voice) {
//             // Ưu tiên giọng Google
//             voice = voices.find(v => v.lang.includes(chunk.lang) && v.name.includes("Google"));
//             // Fallback
//             if(!voice) voice = voices.find(v => v.lang.includes(chunk.lang));
//         }

//         if (voice) utterance.voice = voice;
//         utterance.rate = userRate; 

//         // Hiển thị trạng thái
//         if(document.getElementById('readingStatus')) {
//             const langName = chunk.lang.includes('ru') ? '🇷🇺 Nga' : (chunk.lang.includes('vi') ? '🇻🇳 Việt' : 'Ngoại ngữ');
//             const sourceName = TTS.currentSource === 'question' ? 'Đề bài' : 'Lời giải';
//             document.getElementById('readingStatus').innerText = `[${sourceName}] Đang đọc: ${langName}`;
//         }

//         utterance.onend = () => TTS.playNext();
//         utterance.onerror = () => TTS.playNext(); 

//         window.speechSynthesis.speak(utterance);
//     },

//     toggle: () => {
//         if(window.speechSynthesis.speaking && !window.speechSynthesis.paused) {
//             window.speechSynthesis.pause();
//             TTS.isPaused = true;
//             updatePlayerUI(false);
//         } else {
//             if (window.speechSynthesis.paused) window.speechSynthesis.resume();
//             else if (TTS.queue.length > 0) TTS.playNext();
//             else if (TTS.cachedText) TTS.start(TTS.cachedText, TTS.cachedLang, TTS.currentSource);
//             TTS.isPaused = false;
//             updatePlayerUI(true);
//         }
//     },

//     stop: () => {
//         window.speechSynthesis.cancel();
//         TTS.queue = [];
//         TTS.isPlaying = false;
//         TTS.isPaused = false;
//         if(document.getElementById('readingStatus')) document.getElementById('readingStatus').innerText = "Đã dừng";
//         updatePlayerUI(false);
//     }
// };

// function updatePlayerUI(isPlaying) {
//     const btn = document.getElementById('btnPlay');
//     if(btn) btn.innerHTML = isPlaying ? '<i class="fa-solid fa-pause"></i>' : '<i class="fa-solid fa-play"></i>';
// }


// // js/tts.js

// const TTS = {
//     queue: [],
//     isPlaying: false,
//     isPaused: false,
//     cachedText: "",
//     cachedLang: "",
//     currentSource: "",
//     availableVoices: [],

//     // Load danh sách giọng đọc
//     loadVoices: () => {
//         TTS.availableVoices = window.speechSynthesis.getVoices();
//         const voiceSelect = document.getElementById('voiceSelect');
//         const targetSelect = document.getElementById('targetLang');
//         if(!voiceSelect || !targetSelect) return;

//         const targetCode = targetSelect.options[targetSelect.selectedIndex].getAttribute('data-code');
        
//         // Lọc giọng theo ngôn ngữ
//         const relevantVoices = TTS.availableVoices.filter(v => v.lang.startsWith(targetCode));
        
//         voiceSelect.innerHTML = '<option value="">-- Mặc định (Tự chọn) --</option>';
//         relevantVoices.forEach(voice => {
//             const option = document.createElement('option');
//             option.value = voice.name;
//             option.textContent = `${voice.name} (${voice.lang})`;
//             voiceSelect.appendChild(option);
//         });
//     },

//     parseText: (fullText, targetLangCode) => {
//         // --- SỬA LỖI TẠI ĐÂY ---
//         // Thêm \d (số) và \.,!?:% (dấu câu) vào Regex tiếng Nga
//         // Để khi gặp số "1990" nó vẫn hiểu là thuộc cụm tiếng Nga
//         const regexRu = /([а-яА-ЯёЁ\u0301\-\s\d\.,!?:%;"«»()]+)/g; 
        
//         const sentences = fullText.match(/[^.!?\n]+[.!?\n]*/g) || [fullText];
//         let chunks = [];

//         sentences.forEach(sentence => {
//             let s = sentence.trim();
//             if (!s) return;

//             if (targetLangCode === 'ru') {
//                 const parts = s.split(regexRu); 
//                 parts.forEach(part => {
//                     if(!part.trim()) return;
//                     // Kiểm tra: Nếu chứa ký tự Nga HOẶC là số thì coi là Nga
//                     if(/[а-яА-ЯёЁ]/.test(part) || (/^[\d\.,\s]+$/.test(part) && /[а-яА-ЯёЁ]/.test(s))) {
//                          chunks.push({ text: part, lang: 'ru-RU' });
//                     } 
//                     // Trường hợp chỉ có số đứng riêng lẻ, ưu tiên đọc theo Target Language (Nga)
//                     else if (/^[\d\W]+$/.test(part)) {
//                          chunks.push({ text: part, lang: 'ru-RU' });
//                     }
//                     else {
//                          chunks.push({ text: part, lang: 'vi-VN' });
//                     }
//                 });
//             } else if (targetLangCode === 'en') {
//                 // Logic tiếng Anh (giữ nguyên hoặc cập nhật tương tự nếu cần)
//                 const isViet = /[àáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđ]/i.test(s);
//                 if(!isViet && /[a-zA-Z]/.test(s)) chunks.push({text: s, lang: 'en-US'});
//                 else chunks.push({text: s, lang: 'vi-VN'});
//             } else if (targetLangCode === 'zh') {
//                  if(/[\u4e00-\u9faf]/.test(s)) chunks.push({text: s, lang: 'zh-CN'});
//                  else chunks.push({text: s, lang: 'vi-VN'});
//             } else {
//                 chunks.push({ text: s, lang: 'vi-VN' });
//             }
//         });
        
//         // Gộp các đoạn cùng ngôn ngữ để đọc liền mạch
//         let merged = [];
//         if(chunks.length > 0) {
//             let current = chunks[0];
//             for(let i=1; i<chunks.length; i++) {
//                 if(chunks[i].lang === current.lang) {
//                     current.text += " " + chunks[i].text;
//                 } else {
//                     merged.push(current);
//                     current = chunks[i];
//                 }
//             }
//             merged.push(current);
//         }
//         return merged;
//     },

//     start: (text, targetLangCode, source = 'answer') => {
//         if (TTS.currentSource !== source) TTS.stop();
        
//         TTS.currentSource = source;
//         TTS.cachedText = text;
//         TTS.cachedLang = targetLangCode;
//         TTS.queue = TTS.parseText(text, targetLangCode);
//         TTS.isPlaying = true;
        
//         document.getElementById('audioPlayer').classList.remove('hidden');
//         TTS.playNext();
//         updatePlayerUI(true);
//     },

//     playNext: () => {
//         if (TTS.queue.length === 0 || !TTS.isPlaying) {
//             TTS.stop();
//             if(document.getElementById('readingStatus')) document.getElementById('readingStatus').innerText = "Đã đọc xong";
//             return;
//         }
//         if (TTS.isPaused) return;

//         const chunk = TTS.queue.shift();
        
//         // Lọc bỏ dấu trọng âm trước khi đọc
//         const textToRead = chunk.lang === 'ru-RU' ? Utils.removeStress(chunk.text) : chunk.text;
//         const utterance = new SpeechSynthesisUtterance(textToRead);
        
//         // Cấu hình giọng và tốc độ
//         const userRate = parseFloat(document.getElementById('rateInput').value) || 1.0;
//         const userVoiceName = document.getElementById('voiceSelect').value;
//         const voices = window.speechSynthesis.getVoices();

//         let voice = null;
//         if (userVoiceName) {
//              voice = voices.find(v => v.name === userVoiceName);
//         }
//         if (!voice) {
//             voice = voices.find(v => v.lang.includes(chunk.lang) && v.name.includes("Google"));
//             if(!voice) voice = voices.find(v => v.lang.includes(chunk.lang));
//         }

//         if (voice) utterance.voice = voice;
//         utterance.rate = userRate; 

//         if(document.getElementById('readingStatus')) {
//             const langName = chunk.lang==='ru-RU'?'🇷🇺 Nga':(chunk.lang==='vi-VN'?'🇻🇳 Việt':'Ngoại ngữ');
//             document.getElementById('readingStatus').innerText = `Đang đọc: ${langName}`;
//         }

//         utterance.onend = () => TTS.playNext();
//         utterance.onerror = () => TTS.playNext(); 

//         window.speechSynthesis.speak(utterance);
//     },

//     toggle: () => {
//         if(window.speechSynthesis.speaking && !window.speechSynthesis.paused) {
//             window.speechSynthesis.pause();
//             TTS.isPaused = true;
//             updatePlayerUI(false);
//         } else {
//             if (window.speechSynthesis.paused) window.speechSynthesis.resume();
//             else if (TTS.queue.length > 0) TTS.playNext();
//             else if (TTS.cachedText) TTS.start(TTS.cachedText, TTS.cachedLang, TTS.currentSource);
//             TTS.isPaused = false;
//             updatePlayerUI(true);
//         }
//     },

//     stop: () => {
//         window.speechSynthesis.cancel();
//         TTS.queue = [];
//         TTS.isPlaying = false;
//         TTS.isPaused = false;
//         if(document.getElementById('readingStatus')) document.getElementById('readingStatus').innerText = "Đã dừng";
//         updatePlayerUI(false);
//     }
// };

// function updatePlayerUI(isPlaying) {
//     const btn = document.getElementById('btnPlay');
//     if(btn) btn.innerHTML = isPlaying ? '<i class="fa-solid fa-pause"></i>' : '<i class="fa-solid fa-play"></i>';
// }

// // js/tts.js

// const TTS = {
//     queue: [],
//     isPlaying: false,
//     isPaused: false,
//     cachedText: "",
//     cachedLang: "",
//     currentSource: "",
    
//     // Lưu danh sách giọng đọc có sẵn
//     availableVoices: [],

//     // 1. Hàm load giọng đọc (MỚI)
//     loadVoices: () => {
//         TTS.availableVoices = window.speechSynthesis.getVoices();
//         const voiceSelect = document.getElementById('voiceSelect');
//         const targetCode = document.getElementById('targetLang').options[document.getElementById('targetLang').selectedIndex].getAttribute('data-code');
        
//         // Lọc giọng theo ngôn ngữ đang chọn
//         const relevantVoices = TTS.availableVoices.filter(v => v.lang.startsWith(targetCode));
        
//         voiceSelect.innerHTML = '<option value="">-- Mặc định (Tự chọn) --</option>';
//         relevantVoices.forEach(voice => {
//             const option = document.createElement('option');
//             option.value = voice.name;
//             option.textContent = `${voice.name} (${voice.lang})`;
//             voiceSelect.appendChild(option);
//         });
//     },

//     parseText: (fullText, targetLangCode) => {
//         const regexRu = /([а-яА-ЯёЁ\u0301\-\s]+)/g; 
//         const sentences = fullText.match(/[^.!?\n]+[.!?\n]*/g) || [fullText];
//         let chunks = [];

//         sentences.forEach(sentence => {
//             let s = sentence.trim();
//             if (!s) return;
//             if (targetLangCode === 'ru') {
//                 const parts = s.split(regexRu); 
//                 parts.forEach(part => {
//                     if(!part.trim()) return;
//                     if(/[а-яА-ЯёЁ]/.test(part)) chunks.push({ text: part, lang: 'ru-RU' });
//                     else chunks.push({ text: part, lang: 'vi-VN' });
//                 });
//             } else if (targetLangCode === 'en') {
//                 const isViet = /[àáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđ]/i.test(s);
//                 if(!isViet && /[a-zA-Z]/.test(s)) chunks.push({text: s, lang: 'en-US'});
//                 else chunks.push({text: s, lang: 'vi-VN'});
//             } else if (targetLangCode === 'zh') {
//                  if(/[\u4e00-\u9faf]/.test(s)) chunks.push({text: s, lang: 'zh-CN'});
//                  else chunks.push({text: s, lang: 'vi-VN'});
//             } else {
//                 chunks.push({ text: s, lang: 'vi-VN' });
//             }
//         });
        
//         let merged = [];
//         if(chunks.length > 0) {
//             let current = chunks[0];
//             for(let i=1; i<chunks.length; i++) {
//                 if(chunks[i].lang === current.lang) {
//                     current.text += " " + chunks[i].text;
//                 } else {
//                     merged.push(current);
//                     current = chunks[i];
//                 }
//             }
//             merged.push(current);
//         }
//         return merged;
//     },

//     start: (text, targetLangCode, source = 'answer') => {
//         if (TTS.currentSource !== source) TTS.stop();
        
//         TTS.currentSource = source;
//         TTS.cachedText = text;
//         TTS.cachedLang = targetLangCode;
//         TTS.queue = TTS.parseText(text, targetLangCode);
//         TTS.isPlaying = true;
        
//         document.getElementById('audioPlayer').classList.remove('hidden');
//         TTS.playNext();
//         updatePlayerUI(true);
//     },

//     playNext: () => {
//         if (TTS.queue.length === 0 || !TTS.isPlaying) {
//             TTS.stop();
//             if(document.getElementById('readingStatus')) document.getElementById('readingStatus').innerText = "Đã đọc xong";
//             return;
//         }
//         if (TTS.isPaused) return;

//         const chunk = TTS.queue.shift();
//         const textToRead = chunk.lang === 'ru-RU' ? Utils.removeStress(chunk.text) : chunk.text;
//         const utterance = new SpeechSynthesisUtterance(textToRead);
        
//         // --- 2. CẤU HÌNH GIỌNG ĐỌC & TỐC ĐỘ (MỚI) ---
//         const userRate = parseFloat(document.getElementById('rateInput').value) || 1.0;
//         const userVoiceName = document.getElementById('voiceSelect').value;
//         const voices = window.speechSynthesis.getVoices();

//         let voice = null;

//         // Nếu người dùng đã chọn giọng cụ thể trong menu và chunk hiện tại khớp ngôn ngữ đó
//         if (userVoiceName && chunk.lang.startsWith(document.getElementById('targetLang').options[document.getElementById('targetLang').selectedIndex].getAttribute('data-code'))) {
//              voice = voices.find(v => v.name === userVoiceName);
//         }
        
//         // Nếu không chọn hoặc không khớp, dùng logic tự động cũ
//         if (!voice) {
//             voice = voices.find(v => v.lang.includes(chunk.lang) && v.name.includes("Google"));
//             if(!voice) voice = voices.find(v => v.lang.includes(chunk.lang));
//         }

//         if (voice) utterance.voice = voice;
//         utterance.rate = userRate; 

//         // Hiển thị trạng thái
//         if(document.getElementById('readingStatus')) {
//             const langName = chunk.lang==='ru-RU'?'🇷🇺 Nga':(chunk.lang==='vi-VN'?'🇻🇳 Việt':'Ngoại ngữ');
//             document.getElementById('readingStatus').innerText = `Đang đọc: ${langName} (${userRate}x)`;
//         }

//         utterance.onend = () => TTS.playNext();
//         utterance.onerror = () => TTS.playNext(); 

//         window.speechSynthesis.speak(utterance);
//     },

//     toggle: () => {
//         if(window.speechSynthesis.speaking && !window.speechSynthesis.paused) {
//             window.speechSynthesis.pause();
//             TTS.isPaused = true;
//             updatePlayerUI(false);
//         } else {
//             if (window.speechSynthesis.paused) window.speechSynthesis.resume();
//             else if (TTS.queue.length > 0) TTS.playNext();
//             else if (TTS.cachedText) TTS.start(TTS.cachedText, TTS.cachedLang, TTS.currentSource);
//             TTS.isPaused = false;
//             updatePlayerUI(true);
//         }
//     },

//     stop: () => {
//         window.speechSynthesis.cancel();
//         TTS.queue = [];
//         TTS.isPlaying = false;
//         TTS.isPaused = false;
//         if(document.getElementById('readingStatus')) document.getElementById('readingStatus').innerText = "Đã dừng";
//         updatePlayerUI(false);
//     }
// };

// function updatePlayerUI(isPlaying) {
//     const btn = document.getElementById('btnPlay');
//     if(btn) btn.innerHTML = isPlaying ? '<i class="fa-solid fa-pause"></i>' : '<i class="fa-solid fa-play"></i>';
// }


// js/tts.js

// const TTS = {
//     queue: [],
//     isPlaying: false,
//     isPaused: false,
//     cachedText: "",
//     cachedLang: "",
//     currentSource: "", // 'question' hoặc 'answer'

//     // Hàm tách đoạn (Giữ nguyên logic lọc dấu)
//     parseText: (fullText, targetLangCode) => {
//         const regexRu = /([а-яА-ЯёЁ\u0301\-\s]+)/g; 
//         const sentences = fullText.match(/[^.!?\n]+[.!?\n]*/g) || [fullText];
//         let chunks = [];

//         sentences.forEach(sentence => {
//             let s = sentence.trim();
//             if (!s) return;
//             // Logic tách ngôn ngữ (giữ nguyên như cũ)
//             if (targetLangCode === 'ru') {
//                 const parts = s.split(regexRu); 
//                 parts.forEach(part => {
//                     if(!part.trim()) return;
//                     if(/[а-яА-ЯёЁ]/.test(part)) chunks.push({ text: part, lang: 'ru-RU' });
//                     else chunks.push({ text: part, lang: 'vi-VN' });
//                 });
//             } else if (targetLangCode === 'en') {
//                 const isViet = /[àáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđ]/i.test(s);
//                 if(!isViet && /[a-zA-Z]/.test(s)) chunks.push({text: s, lang: 'en-US'});
//                 else chunks.push({text: s, lang: 'vi-VN'});
//             } else if (targetLangCode === 'zh') {
//                  if(/[\u4e00-\u9faf]/.test(s)) chunks.push({text: s, lang: 'zh-CN'});
//                  else chunks.push({text: s, lang: 'vi-VN'});
//             } else {
//                 chunks.push({ text: s, lang: 'vi-VN' });
//             }
//         });
        
//         // Gộp các đoạn cùng ngôn ngữ
//         let merged = [];
//         if(chunks.length > 0) {
//             let current = chunks[0];
//             for(let i=1; i<chunks.length; i++) {
//                 if(chunks[i].lang === current.lang) {
//                     current.text += " " + chunks[i].text;
//                 } else {
//                     merged.push(current);
//                     current = chunks[i];
//                 }
//             }
//             merged.push(current);
//         }
//         return merged;
//     },

//     // Thêm tham số source để biết đang đọc cái gì
//     start: (text, targetLangCode, source = 'answer') => {
//         // Nếu đang đọc cái khác thì dừng lại ngay
//         if (TTS.currentSource !== source) {
//             TTS.stop();
//         }
        
//         TTS.currentSource = source;
//         TTS.cachedText = text;
//         TTS.cachedLang = targetLangCode;
//         TTS.queue = TTS.parseText(text, targetLangCode);
//         TTS.isPlaying = true;
        
//         // Hiện Player ngay lập tức
//         document.getElementById('audioPlayer').classList.remove('hidden');
        
//         TTS.playNext();
//         updatePlayerUI(true);
//     },

//     playNext: () => {
//         if (TTS.queue.length === 0 || !TTS.isPlaying) {
//             TTS.stop();
//             if(document.getElementById('readingStatus')) {
//                 document.getElementById('readingStatus').innerText = "Đã đọc xong";
//             }
//             return;
//         }
//         if (TTS.isPaused) return;

//         const chunk = TTS.queue.shift();
        
//         // Lọc dấu trọng âm trước khi đọc
//         const textToRead = chunk.lang === 'ru-RU' ? Utils.removeStress(chunk.text) : chunk.text;
//         const utterance = new SpeechSynthesisUtterance(textToRead);
        
//         const voices = window.speechSynthesis.getVoices();
//         let voice = voices.find(v => v.lang.includes(chunk.lang) && v.name.includes("Google"));
//         if(!voice) voice = voices.find(v => v.lang.includes(chunk.lang));

//         if (voice) utterance.voice = voice;
//         utterance.rate = 0.95; 
        
//         if(document.getElementById('readingStatus')) {
//             const sourceName = TTS.currentSource === 'question' ? 'Đề bài' : 'Lời giải';
//             const langName = chunk.lang==='ru-RU'?'🇷🇺 Nga':(chunk.lang==='vi-VN'?'🇻🇳 Việt':'Ngoại ngữ');
//             document.getElementById('readingStatus').innerText = `[${sourceName}] Đang đọc: ${langName}`;
//         }

//         utterance.onend = () => TTS.playNext();
//         utterance.onerror = () => TTS.playNext(); 

//         window.speechSynthesis.speak(utterance);
//     },

//     toggle: () => {
//         if(window.speechSynthesis.speaking && !window.speechSynthesis.paused) {
//             window.speechSynthesis.pause();
//             TTS.isPaused = true;
//             updatePlayerUI(false);
//         } else {
//             if (window.speechSynthesis.paused) window.speechSynthesis.resume();
//             else if (TTS.queue.length > 0) TTS.playNext();
//             else if (TTS.cachedText) TTS.start(TTS.cachedText, TTS.cachedLang, TTS.currentSource); // Replay đúng source
//             TTS.isPaused = false;
//             updatePlayerUI(true);
//         }
//     },

//     stop: () => {
//         window.speechSynthesis.cancel();
//         TTS.queue = [];
//         TTS.isPlaying = false;
//         TTS.isPaused = false;
//         if(document.getElementById('readingStatus')) document.getElementById('readingStatus').innerText = "Đã dừng";
//         updatePlayerUI(false);
//     }
// };

// function updatePlayerUI(isPlaying) {
//     const btn = document.getElementById('btnPlay');
//     if(btn) btn.innerHTML = isPlaying ? '<i class="fa-solid fa-pause"></i>' : '<i class="fa-solid fa-play"></i>';
// }

// js/tts.js

// const TTS = {
//     queue: [],
//     isPlaying: false,
//     isPaused: false,
//     cachedText: "",
//     cachedLang: "",

//     parseText: (fullText, targetLangCode) => {
//         // Regex giữ lại ký tự Nga và dấu trọng âm (U+0301)
//         const regexRu = /([а-яА-ЯёЁ\u0301\-\s]+)/g; 
//         const sentences = fullText.match(/[^.!?\n]+[.!?\n]*/g) || [fullText];
        
//         let chunks = [];

//         sentences.forEach(sentence => {
//             let s = sentence.trim();
//             if (!s) return;

//             if (targetLangCode === 'ru') {
//                 const parts = s.split(regexRu); 
//                 parts.forEach(part => {
//                     if(!part.trim()) return;
//                     if(/[а-яА-ЯёЁ]/.test(part)) chunks.push({ text: part, lang: 'ru-RU' });
//                     else chunks.push({ text: part, lang: 'vi-VN' });
//                 });
//             } else if (targetLangCode === 'en') {
//                 const isViet = /[àáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđ]/i.test(s);
//                 if(!isViet && /[a-zA-Z]/.test(s)) chunks.push({text: s, lang: 'en-US'});
//                 else chunks.push({text: s, lang: 'vi-VN'});
//             } else if (targetLangCode === 'zh') {
//                  if(/[\u4e00-\u9faf]/.test(s)) chunks.push({text: s, lang: 'zh-CN'});
//                  else chunks.push({text: s, lang: 'vi-VN'});
//             } else {
//                 chunks.push({ text: s, lang: 'vi-VN' });
//             }
//         });
        
//         let merged = [];
//         if(chunks.length > 0) {
//             let current = chunks[0];
//             for(let i=1; i<chunks.length; i++) {
//                 if(chunks[i].lang === current.lang) {
//                     current.text += " " + chunks[i].text;
//                 } else {
//                     merged.push(current);
//                     current = chunks[i];
//                 }
//             }
//             merged.push(current);
//         }
//         return merged;
//     },

//     start: (text, targetLangCode) => {
//         TTS.stop();
//         if(!text) return;
        
//         TTS.cachedText = text;
//         TTS.cachedLang = targetLangCode;
//         TTS.queue = TTS.parseText(text, targetLangCode);
//         TTS.isPlaying = true;
//         TTS.playNext();
//         updatePlayerUI(true);
//     },

//     playNext: () => {
//         if (TTS.queue.length === 0 || !TTS.isPlaying) {
//             TTS.stop();
//             if(document.getElementById('readingStatus')) document.getElementById('readingStatus').innerText = "Đã đọc xong";
//             return;
//         }
//         if (TTS.isPaused) return;

//         const chunk = TTS.queue.shift();
        
//         // --- SỬA LỖI ĐỌC TIẾNG NGA ---
//         // Nếu là tiếng Nga, dùng Utils.removeStress để lột bỏ dấu trọng âm
//         // Máy sẽ nhận từ "trơn" để đọc liền mạch, trong khi màn hình vẫn hiện dấu
//         const textToRead = chunk.lang === 'ru-RU' ? Utils.removeStress(chunk.text) : chunk.text;
        
//         const utterance = new SpeechSynthesisUtterance(textToRead);
        
//         const voices = window.speechSynthesis.getVoices();
//         // Ưu tiên giọng Google
//         let voice = voices.find(v => v.lang.includes(chunk.lang) && v.name.includes("Google"));
//         if(!voice) voice = voices.find(v => v.lang.includes(chunk.lang));

//         if (voice) utterance.voice = voice;
//         utterance.rate = 0.95; 
        
//         if(document.getElementById('readingStatus')) {
//             const langName = chunk.lang==='ru-RU'?'🇷🇺 Nga':(chunk.lang==='vi-VN'?'🇻🇳 Việt':'Ngoại ngữ');
//             document.getElementById('readingStatus').innerText = `Đang đọc: ${langName}`;
//         }

//         utterance.onend = () => TTS.playNext();
//         utterance.onerror = () => TTS.playNext(); 

//         window.speechSynthesis.speak(utterance);
//     },

//     toggle: () => {
//         if(window.speechSynthesis.speaking && !window.speechSynthesis.paused) {
//             window.speechSynthesis.pause();
//             TTS.isPaused = true;
//             updatePlayerUI(false);
//         } else {
//             if (window.speechSynthesis.paused) window.speechSynthesis.resume();
//             else if (TTS.queue.length > 0) TTS.playNext();
//             else if (TTS.cachedText) TTS.start(TTS.cachedText, TTS.cachedLang);
//             TTS.isPaused = false;
//             updatePlayerUI(true);
//         }
//     },

//     stop: () => {
//         window.speechSynthesis.cancel();
//         TTS.queue = [];
//         TTS.isPlaying = false;
//         TTS.isPaused = false;
//         if(document.getElementById('readingStatus')) document.getElementById('readingStatus').innerText = "Đã dừng";
//         updatePlayerUI(false);
//     }
// };

// function updatePlayerUI(isPlaying) {
//     const btn = document.getElementById('btnPlay');
//     if(btn) btn.innerHTML = isPlaying ? '<i class="fa-solid fa-pause"></i>' : '<i class="fa-solid fa-play"></i>';
// }

// // js/tts.js
// const TTS = {
//     queue: [],
//     isPlaying: false,
//     isPaused: false,
//     fullTextCache: "",
//     targetLangCache: "",

//     parseText: (fullText, targetLangCode) => {
//         const regexRu = /([а-яА-ЯёЁ\u0301\-\s]+)/g; 
//         const sentences = fullText.match(/[^.!?\n]+[.!?\n]*/g) || [fullText];
//         let chunks = [];

//         sentences.forEach(sentence => {
//             let s = sentence.trim();
//             if (!s) return;
//             if (targetLangCode === 'ru') {
//                 const parts = s.split(regexRu); 
//                 parts.forEach(part => {
//                     if(!part.trim()) return;
//                     if(/[а-яА-ЯёЁ]/.test(part)) chunks.push({ text: part, lang: 'ru-RU' });
//                     else chunks.push({ text: part, lang: 'vi-VN' });
//                 });
//             } else if (targetLangCode === 'en') {
//                 const isViet = /[àáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđ]/i.test(s);
//                 if(!isViet && /[a-zA-Z]/.test(s)) chunks.push({text: s, lang: 'en-US'});
//                 else chunks.push({text: s, lang: 'vi-VN'});
//             } else if (targetLangCode === 'zh') {
//                 if(/[\u4e00-\u9faf]/.test(s)) chunks.push({text: s, lang: 'zh-CN'});
//                 else chunks.push({text: s, lang: 'vi-VN'});
//             } else {
//                 chunks.push({ text: s, lang: 'vi-VN' });
//             }
//         });
        
//         let merged = [];
//         if(chunks.length > 0) {
//             let current = chunks[0];
//             for(let i=1; i<chunks.length; i++) {
//                 if(chunks[i].lang === current.lang) current.text += " " + chunks[i].text;
//                 else { merged.push(current); current = chunks[i]; }
//             }
//             merged.push(current);
//         }
//         return merged;
//     },

//     start: (text, targetLangCode) => {
//         TTS.stop();
//         TTS.fullTextCache = text;
//         TTS.targetLangCache = targetLangCode;
//         TTS.queue = TTS.parseText(text, targetLangCode);
//         TTS.isPlaying = true;
//         TTS.playNext();
//         updatePlayerUI(true);
//     },

//     startFromBeginning: () => {
//         if(TTS.fullTextCache) TTS.start(TTS.fullTextCache, TTS.targetLangCache);
//     },

//     playNext: () => {
//         if (TTS.queue.length === 0 || !TTS.isPlaying) { TTS.stop(); return; }
//         if (TTS.isPaused) return;

//         const chunk = TTS.queue.shift();
//         const utterance = new SpeechSynthesisUtterance(chunk.text);
//         const voices = window.speechSynthesis.getVoices();
//         let voice = voices.find(v => v.lang.includes(chunk.lang) && v.name.includes("Google")) || voices.find(v => v.lang.includes(chunk.lang));
//         if (voice) utterance.voice = voice;
//         utterance.rate = 0.95; 
        
//         const statusEl = document.getElementById('readingStatus');
//         if(statusEl) statusEl.innerText = `Đang đọc: ${chunk.lang === 'ru-RU' ? '🇷🇺 Nga' : (chunk.lang==='vi-VN'?'🇻🇳 Việt':'Ngoại ngữ')}`;

//         utterance.onend = () => TTS.playNext();
//         utterance.onerror = () => TTS.playNext();
//         window.speechSynthesis.speak(utterance);
//     },

//     toggle: () => {
//         if(window.speechSynthesis.speaking && !window.speechSynthesis.paused) {
//             window.speechSynthesis.pause();
//             TTS.isPaused = true;
//             updatePlayerUI(false);
//         } else {
//             if (window.speechSynthesis.paused) window.speechSynthesis.resume();
//             else if (TTS.queue.length > 0) TTS.playNext();
//             TTS.isPaused = false;
//             updatePlayerUI(true);
//         }
//     },

//     stop: () => {
//         window.speechSynthesis.cancel();
//         TTS.queue = [];
//         TTS.isPlaying = false;
//         TTS.isPaused = false;
//         if(document.getElementById('readingStatus')) document.getElementById('readingStatus').innerText = "Đã dừng";
//         updatePlayerUI(false);
//     }
// };

// function updatePlayerUI(isPlaying) {
//     const btn = document.getElementById('btnPlay');
//     if(btn) btn.innerHTML = isPlaying ? '<i class="fa-solid fa-pause"></i>' : '<i class="fa-solid fa-play ml-1"></i>';
// }