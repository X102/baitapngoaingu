// js/tts.js

const TTS = {
    queue: [],
    isPlaying: false,
    isPaused: false,
    cachedText: "",
    cachedLang: "",
    currentSource: "", // 'question' hoặc 'answer'

    // Hàm tách đoạn (Giữ nguyên logic lọc dấu)
    parseText: (fullText, targetLangCode) => {
        const regexRu = /([а-яА-ЯёЁ\u0301\-\s]+)/g; 
        const sentences = fullText.match(/[^.!?\n]+[.!?\n]*/g) || [fullText];
        let chunks = [];

        sentences.forEach(sentence => {
            let s = sentence.trim();
            if (!s) return;
            // Logic tách ngôn ngữ (giữ nguyên như cũ)
            if (targetLangCode === 'ru') {
                const parts = s.split(regexRu); 
                parts.forEach(part => {
                    if(!part.trim()) return;
                    if(/[а-яА-ЯёЁ]/.test(part)) chunks.push({ text: part, lang: 'ru-RU' });
                    else chunks.push({ text: part, lang: 'vi-VN' });
                });
            } else if (targetLangCode === 'en') {
                const isViet = /[àáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđ]/i.test(s);
                if(!isViet && /[a-zA-Z]/.test(s)) chunks.push({text: s, lang: 'en-US'});
                else chunks.push({text: s, lang: 'vi-VN'});
            } else if (targetLangCode === 'zh') {
                 if(/[\u4e00-\u9faf]/.test(s)) chunks.push({text: s, lang: 'zh-CN'});
                 else chunks.push({text: s, lang: 'vi-VN'});
            } else {
                chunks.push({ text: s, lang: 'vi-VN' });
            }
        });
        
        // Gộp các đoạn cùng ngôn ngữ
        let merged = [];
        if(chunks.length > 0) {
            let current = chunks[0];
            for(let i=1; i<chunks.length; i++) {
                if(chunks[i].lang === current.lang) {
                    current.text += " " + chunks[i].text;
                } else {
                    merged.push(current);
                    current = chunks[i];
                }
            }
            merged.push(current);
        }
        return merged;
    },

    // Thêm tham số source để biết đang đọc cái gì
    start: (text, targetLangCode, source = 'answer') => {
        // Nếu đang đọc cái khác thì dừng lại ngay
        if (TTS.currentSource !== source) {
            TTS.stop();
        }
        
        TTS.currentSource = source;
        TTS.cachedText = text;
        TTS.cachedLang = targetLangCode;
        TTS.queue = TTS.parseText(text, targetLangCode);
        TTS.isPlaying = true;
        
        // Hiện Player ngay lập tức
        document.getElementById('audioPlayer').classList.remove('hidden');
        
        TTS.playNext();
        updatePlayerUI(true);
    },

    playNext: () => {
        if (TTS.queue.length === 0 || !TTS.isPlaying) {
            TTS.stop();
            if(document.getElementById('readingStatus')) {
                document.getElementById('readingStatus').innerText = "Đã đọc xong";
            }
            return;
        }
        if (TTS.isPaused) return;

        const chunk = TTS.queue.shift();
        
        // Lọc dấu trọng âm trước khi đọc
        const textToRead = chunk.lang === 'ru-RU' ? Utils.removeStress(chunk.text) : chunk.text;
        const utterance = new SpeechSynthesisUtterance(textToRead);
        
        const voices = window.speechSynthesis.getVoices();
        let voice = voices.find(v => v.lang.includes(chunk.lang) && v.name.includes("Google"));
        if(!voice) voice = voices.find(v => v.lang.includes(chunk.lang));

        if (voice) utterance.voice = voice;
        utterance.rate = 0.95; 
        
        if(document.getElementById('readingStatus')) {
            const sourceName = TTS.currentSource === 'question' ? 'Đề bài' : 'Lời giải';
            const langName = chunk.lang==='ru-RU'?'🇷🇺 Nga':(chunk.lang==='vi-VN'?'🇻🇳 Việt':'Ngoại ngữ');
            document.getElementById('readingStatus').innerText = `[${sourceName}] Đang đọc: ${langName}`;
        }

        utterance.onend = () => TTS.playNext();
        utterance.onerror = () => TTS.playNext(); 

        window.speechSynthesis.speak(utterance);
    },

    toggle: () => {
        if(window.speechSynthesis.speaking && !window.speechSynthesis.paused) {
            window.speechSynthesis.pause();
            TTS.isPaused = true;
            updatePlayerUI(false);
        } else {
            if (window.speechSynthesis.paused) window.speechSynthesis.resume();
            else if (TTS.queue.length > 0) TTS.playNext();
            else if (TTS.cachedText) TTS.start(TTS.cachedText, TTS.cachedLang, TTS.currentSource); // Replay đúng source
            TTS.isPaused = false;
            updatePlayerUI(true);
        }
    },

    stop: () => {
        window.speechSynthesis.cancel();
        TTS.queue = [];
        TTS.isPlaying = false;
        TTS.isPaused = false;
        if(document.getElementById('readingStatus')) document.getElementById('readingStatus').innerText = "Đã dừng";
        updatePlayerUI(false);
    }
};

function updatePlayerUI(isPlaying) {
    const btn = document.getElementById('btnPlay');
    if(btn) btn.innerHTML = isPlaying ? '<i class="fa-solid fa-pause"></i>' : '<i class="fa-solid fa-play"></i>';
}

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