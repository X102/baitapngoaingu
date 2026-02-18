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

