// js/main.js

// --- 1. KHAI BÁO BIẾN TOÀN CỤC (QUAN TRỌNG) ---
const App = {}; // Khởi tạo đối tượng App để chứa các hàm
let currentMode = 'text';
let selectedText = "";

// --- 2. KHỞI TẠO KHI TRANG LOAD XONG ---
document.addEventListener('DOMContentLoaded', () => {
    // Load API Key & Lịch sử
    document.getElementById('apiKey').value = Storage.getKey();
    renderHistory();
    
    // Fix lỗi giọng đọc Chrome
    window.speechSynthesis.onvoiceschanged = () => {};
    
    // Đăng ký sự kiện Popup
    document.addEventListener('mouseup', handleSelection);
    document.addEventListener('scroll', () => {
        const tooltip = document.getElementById('tooltip');
        if(tooltip) tooltip.classList.add('hidden');
    });
});

// Lưu API Key khi nhập
const apiKeyInput = document.getElementById('apiKey');
if(apiKeyInput) {
    apiKeyInput.addEventListener('change', (e) => Storage.setKey(e.target.value));
}

// --- 3. CÁC HÀM CỦA APP ---
document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('apiKey').value = Storage.getKey();
    renderHistory();
    
    TTS.loadVoices();
    window.speechSynthesis.onvoiceschanged = () => TTS.loadVoices();
    
    document.addEventListener('mouseup', handleSelection);
    document.addEventListener('scroll', () => {
        const t = document.getElementById('tooltip');
        if(t) t.classList.add('hidden');
    });

    // --- SỰ KIỆN CẤU HÌNH (CẬP NHẬT NGAY LẬP TỨC) ---
    
    // 1. Đổi ngôn ngữ -> Load lại danh sách giọng
    document.getElementById('targetLang').addEventListener('change', () => {
        TTS.loadVoices();
    });

    // 2. Đổi giọng đọc -> Áp dụng ngay
    document.getElementById('voiceSelect').addEventListener('change', () => {
        TTS.reloadSettings();
    });

    // 3. Kéo thanh tốc độ -> Áp dụng ngay & Hiện số
    const rateInput = document.getElementById('rateInput');
    rateInput.addEventListener('input', (e) => {
        document.getElementById('speedValue').innerText = e.target.value + 'x';
    });
    // Dùng sự kiện 'change' (khi thả chuột) để tránh giật, hoặc 'input' nếu muốn mượt
    rateInput.addEventListener('change', () => {
        TTS.reloadSettings();
    });
});

// document.addEventListener('DOMContentLoaded', () => {
//     document.getElementById('apiKey').value = Storage.getKey();
//     renderHistory();
    
//     // Load voices & Popup
//     TTS.loadVoices();
//     window.speechSynthesis.onvoiceschanged = () => TTS.loadVoices();
//     document.addEventListener('mouseup', handleSelection);
//     document.addEventListener('scroll', () => {
//         const t = document.getElementById('tooltip');
//         if(t) t.classList.add('hidden');
//     });

//     // --- CÁC SỰ KIỆN CẤU HÌNH (MỚI) ---
    
//     // 1. Khi đổi ngôn ngữ -> Load lại danh sách giọng
//     document.getElementById('targetLang').addEventListener('change', () => {
//         TTS.loadVoices();
//     });

//     // 2. Khi đổi giọng đọc -> Áp dụng ngay
//     document.getElementById('voiceSelect').addEventListener('change', () => {
//         TTS.reloadSettings();
//     });

//     // 3. Khi kéo thanh tốc độ -> Áp dụng ngay
//     const rateInput = document.getElementById('rateInput');
//     rateInput.addEventListener('input', (e) => {
//         document.getElementById('speedValue').innerText = e.target.value + 'x';
//     });
//     // Dùng sự kiện 'change' (khi thả chuột ra) hoặc 'input' (kéo tới đâu đổi tới đó)
//     // Khuyên dùng 'change' để đỡ bị giật tiếng liên tục
//     rateInput.addEventListener('change', () => {
//         TTS.reloadSettings();
//     });
// });
// document.addEventListener('DOMContentLoaded', () => {
//     document.getElementById('apiKey').value = Storage.getKey();
//     renderHistory();
    
//     // Load voices khi trình duyệt sẵn sàng
//     TTS.loadVoices();
//     window.speechSynthesis.onvoiceschanged = () => TTS.loadVoices();
    
//     // Sự kiện Popup
//     document.addEventListener('mouseup', handleSelection);
//     document.addEventListener('scroll', () => {
//         const tooltip = document.getElementById('tooltip');
//         if(tooltip) tooltip.classList.add('hidden');
//     });

//     // Sự kiện thay đổi ngôn ngữ -> Load lại danh sách giọng
//     document.getElementById('targetLang').addEventListener('change', TTS.loadVoices);

//     // Sự kiện thay đổi tốc độ -> Cập nhật số hiển thị
//     document.getElementById('rateInput').addEventListener('input', (e) => {
//         document.getElementById('speedValue').innerText = e.target.value + 'x';
//     });
// });
// Chế độ nhập liệu (Text/Image)
App.setMode = (mode) => {
    currentMode = mode;
    document.getElementById('questionInput').style.display = mode === 'text' ? 'block' : 'none';
    document.getElementById('imageInputArea').style.display = mode === 'image' ? 'block' : 'none';
    
    const active = "px-3 py-1.5 bg-white border shadow-sm rounded text-sm font-bold text-blue-600";
    const inactive = "px-3 py-1.5 bg-transparent text-gray-600 hover:bg-gray-200 rounded text-sm font-bold";
    document.getElementById('btnText').className = mode === 'text' ? active : inactive;
    document.getElementById('btnImage').className = mode === 'image' ? active : inactive;
};

// Chuyển đổi Tab (Tutor / Reader)
App.switchTab = (tabName) => {
    const viewTutor = document.getElementById('viewTutor');
    const viewReader = document.getElementById('viewReader');
    const tabTutor = document.getElementById('tabTutor');
    const tabReader = document.getElementById('tabReader');

    if (tabName === 'tutor') {
        viewTutor.classList.remove('hidden');
        viewReader.classList.add('hidden');
        tabTutor.className = "px-6 py-2 rounded-md font-bold text-sm bg-blue-100 text-blue-700 transition";
        tabReader.className = "px-6 py-2 rounded-md font-bold text-sm text-gray-600 hover:bg-gray-50 transition";
    } else {
        viewTutor.classList.add('hidden');
        viewReader.classList.remove('hidden');
        tabTutor.className = "px-6 py-2 rounded-md font-bold text-sm text-gray-600 hover:bg-gray-50 transition";
        tabReader.className = "px-6 py-2 rounded-md font-bold text-sm bg-blue-100 text-blue-700 transition";
    }
    TTS.stop();
};

// Xử lý Upload file
App.handleFileUpload = async (input) => {
    const file = input.files[0];
    if (!file) return;

    const readerArea = document.getElementById('readerArea');
    const contentDiv = document.getElementById('readerContent');
    contentDiv.innerHTML = '<span class="loader"></span> Đang đọc file...';
    readerArea.classList.remove('hidden');

    try {
        let text = "";
        const ext = file.name.split('.').pop().toLowerCase();

        if (ext === 'txt') {
            text = await Utils.readTxt(file);
        } else if (ext === 'docx') {
            text = await Utils.readDocx(file);
        } else if (ext === 'pdf') {
            text = await Utils.readPdf(file);
        } else {
            alert("Định dạng file không hỗ trợ! (Chỉ nhận .txt, .docx, .pdf)");
            readerArea.classList.add('hidden');
            return;
        }

        contentDiv.innerText = text;
        input.value = ''; // Reset input

    } catch (error) {
        alert("Lỗi đọc file: " + error.message);
        contentDiv.innerText = "";
        readerArea.classList.add('hidden');
    }
};

// Xử lý Paste văn bản thủ công
App.processManualText = () => {
    const text = document.getElementById('manualPaste').value;
    if (!text.trim()) return alert("Vui lòng paste nội dung vào!");
    
    document.getElementById('readerContent').innerText = text;
    document.getElementById('readerArea').classList.remove('hidden');
};

// Xoá nội dung phòng đọc
App.clearReader = () => {
    document.getElementById('readerContent').innerText = "";
    document.getElementById('readerArea').classList.add('hidden');
    document.getElementById('manualPaste').value = "";
    TTS.stop();
};

// --- CÁC HÀM TOÀN CỤC (WINDOW) ---

window.readDocument = () => {
    const text = document.getElementById('readerContent').innerText;
    if(!text) return;
    const targetCode = document.getElementById('targetLang').options[document.getElementById('targetLang').selectedIndex].getAttribute('data-code');
    TTS.start(text, targetCode, 'document');
};

window.readQuestion = () => {
    const text = document.getElementById('questionInput').value;
    if(!text || document.getElementById('questionInput').style.display === 'none') {
        return alert("Chỉ đọc được văn bản trong ô nhập đề bài!");
    }
    const targetCode = document.getElementById('targetLang').options[document.getElementById('targetLang').selectedIndex].getAttribute('data-code');
    TTS.start(text, targetCode, 'question');
};

window.readAnswer = () => {
    const text = document.getElementById('outputContent').innerText;
    if(!text) return alert("Chưa có lời giải để đọc!");
    const targetCode = document.getElementById('targetLang').options[document.getElementById('targetLang').selectedIndex].getAttribute('data-code');
    TTS.start(text, targetCode, 'answer');
};

window.stopReading = TTS.stop;

window.copyContent = async () => {
    try {
        const el = document.getElementById('outputContent');
        const blobHtml = new Blob([el.innerHTML], {type: 'text/html'});
        const blobText = new Blob([el.innerText], {type: 'text/plain'});
        await navigator.clipboard.write([new ClipboardItem({'text/html': blobHtml, 'text/plain': blobText})]);
        alert("Đã copy (giữ định dạng)!");
    } catch(e) {
        const el = document.getElementById('outputContent');
        if(el) {
            navigator.clipboard.writeText(el.innerText);
            alert("Đã copy văn bản!");
        }
    }
};

window.clearHistory = Storage.clearHistory;

// --- GIẢI BÀI TẬP (CẬP NHẬT PROMPT) ---
const btnSubmit = document.getElementById('btnSubmit');
if(btnSubmit) {
    btnSubmit.onclick = async function() {
        const apiKey = document.getElementById('apiKey').value;
        if(!apiKey) return alert("Vui lòng nhập API Key!");

        const btn = this;
        const provider = document.getElementById('provider').value;
        const targetLang = document.getElementById('targetLang').value;
        const targetCode = document.getElementById('targetLang').options[document.getElementById('targetLang').selectedIndex].getAttribute('data-code');

        btn.disabled = true;
        btn.innerHTML = `<span class="loader"></span> Đang xử lý...`;
        document.getElementById('resultArea').classList.add('hidden');
        TTS.stop();


        const promptText = `
        Bạn là một giáo viên ngôn ngữ người Việt Nam thân thiện. Hãy giải bài tập ${targetLang} này cho học sinh Việt Nam.
        
        QUY TẮC QUAN TRỌNG:
        1. **Phong cách giải thích**: Dùng tiếng Việt tự nhiên, dễ hiểu. Tránh dùng từ chuyên ngành khó hiểu.
        2. **Ngôn ngữ**: 
           - Khi trích dẫn tiếng ${targetLang}, hãy kèm theo nghĩa tiếng Việt ngay bên cạnh (Song ngữ). Ví dụ: "Từ vựng (nghĩa)".
           - TUYỆT ĐỐI KHÔNG dùng Tiếng Anh để giải thích.
           - Với Tiếng Nga: KHÔNG dùng phiên âm Latin, dùng ký tự Cyrillic gốc.
        3. **Yêu cầu BẮT BUỘC cho Tiếng Nga**:
           - Phải thêm dấu trọng âm (U+0301) vào TẤT CẢ các từ tiếng Nga có trên 1 âm tiết. (VD: э́то о́чень хорошо́).
        
        CẤU TRÚC TRẢ LỜI:
        - **Đáp án đúng**: (Ghi rõ ràng).
        - **Dịch nghĩa song ngữ từng câu và Giải thích chi tiết**:  Dịch toàn bộ lần lượt từng câu hỏi và câu trả lời sang tiếng Việt mượt mà (vẫn kèm nguyên văn câu gốc). Giải thích tại sao chọn đáp án này? Phân tích ngữ pháp bằng tiếng Việt đơn giản. So sánh với các đáp án sai.
        - **Từ vựng quan trọng**: Lập bảng gồm: Từ gốc (có trọng âm) - Loại từ - Nghĩa Việt.
        `;

        try {
            let resultText = "";
            let userInput = "";
            
            if(currentMode === 'text') {
                userInput = document.getElementById('questionInput').value;
            } else {
                const file = document.getElementById('imageFile').files[0];
                if(!file) throw new Error("Chưa chọn ảnh");
                userInput = await Utils.fileToBase64(file);
            }

            if(provider === 'gemini') {
                const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`;
                let parts = [{text: promptText}];
                if(currentMode==='text') parts.push({text: userInput});
                else parts.push({text: "Giải ảnh này", inline_data: {mime_type: "image/jpeg", data: userInput}});
                
                const req = await fetch(url, {method: 'POST', body: JSON.stringify({contents:[{parts}]})});
                const res = await req.json();
                resultText = res.candidates?.[0]?.content?.parts?.[0]?.text || "Lỗi API";
            } else {
                const baseURL = provider === 'deepseek' ? 'https://api.deepseek.com/chat/completions' : 'https://api.openai.com/v1/chat/completions';
                const model = provider === 'deepseek' ? 'deepseek-chat' : 'gpt-4o';
                let msgs = [{role:"system", content: promptText}];
                if(currentMode === 'text') msgs.push({role:"user", content: userInput});
                else msgs.push({role:"user", content: [{type:"text", text: "Giải ảnh"}, {type:"image_url", image_url: {url: "data:image/jpeg;base64,"+userInput}}]});
                
                const req = await fetch(baseURL, {method:'POST', headers:{'Content-Type':'application/json', 'Authorization': `Bearer ${apiKey}`}, body: JSON.stringify({model, messages: msgs})});
                const res = await req.json();
                resultText = res.choices[0].message.content;
            }

            document.getElementById('outputContent').innerHTML = marked.parse(resultText);
            document.getElementById('resultArea').classList.remove('hidden');
            document.getElementById('audioPlayer').classList.remove('hidden');
            
            Storage.addHistory(currentMode === 'text' ? userInput : "[Hình ảnh]", resultText, currentMode);
            renderHistory();

            TTS.start(document.getElementById('outputContent').innerText, targetCode, 'answer');

        } catch (e) {
            alert("Lỗi: " + e.message);
        } finally {
            btn.disabled = false;
            btn.innerHTML = "🚀 GIẢI BÀI TẬP";
        }
    };
}

// --- XỬ LÝ LOGIC CHÍNH (GIẢI BÀI TẬP) ---
// const btnSubmit = document.getElementById('btnSubmit');
// if(btnSubmit) {
//     btnSubmit.onclick = async function() {
//         const apiKey = document.getElementById('apiKey').value;
//         if(!apiKey) return alert("Vui lòng nhập API Key!");

//         const btn = this;
//         const provider = document.getElementById('provider').value;
//         const targetLang = document.getElementById('targetLang').value;
//         const targetCode = document.getElementById('targetLang').options[document.getElementById('targetLang').selectedIndex].getAttribute('data-code');

//         btn.disabled = true;
//         btn.innerHTML = `<span class="loader"></span> Đang xử lý...`;
//         document.getElementById('resultArea').classList.add('hidden');
//         TTS.stop();

//         const promptText = `
//         Bạn là gia sư ngôn ngữ. Giải bài tập ${targetLang}.
//         QUY TẮC TUYỆT ĐỐI:
//         1. Tiếng Nga: BẮT BUỘC giữ nguyên dấu trọng âm (U+0301) để hiển thị.
//         2. Giải thích chi tiết ngữ pháp.
//         3. Từ vựng (Từ - Phiên âm - Nghĩa).
//         4. Dịch nghĩa tiếng Việt.
//         5. Trình bày Markdown.
//         `;

//         try {
//             let resultText = "";
//             let userInput = "";
            
//             if(currentMode === 'text') {
//                 userInput = document.getElementById('questionInput').value;
//             } else {
//                 const file = document.getElementById('imageFile').files[0];
//                 if(!file) throw new Error("Chưa chọn ảnh");
//                 userInput = await Utils.fileToBase64(file);
//             }

//             if(provider === 'gemini') {
//                 const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`;
//                 let parts = [{text: promptText}];
//                 if(currentMode==='text') parts.push({text: userInput});
//                 else parts.push({text: "Giải ảnh này", inline_data: {mime_type: "image/jpeg", data: userInput}});
                
//                 const req = await fetch(url, {method: 'POST', body: JSON.stringify({contents:[{parts}]})});
//                 const res = await req.json();
//                 resultText = res.candidates?.[0]?.content?.parts?.[0]?.text || "Lỗi API";
//             } else {
//                 const baseURL = provider === 'deepseek' ? 'https://api.deepseek.com/chat/completions' : 'https://api.openai.com/v1/chat/completions';
//                 const model = provider === 'deepseek' ? 'deepseek-chat' : 'gpt-4o';
//                 let msgs = [{role:"system", content: promptText}];
//                 if(currentMode === 'text') msgs.push({role:"user", content: userInput});
//                 else msgs.push({role:"user", content: [{type:"text", text: "Giải ảnh"}, {type:"image_url", image_url: {url: "data:image/jpeg;base64,"+userInput}}]});
                
//                 const req = await fetch(baseURL, {method:'POST', headers:{'Content-Type':'application/json', 'Authorization': `Bearer ${apiKey}`}, body: JSON.stringify({model, messages: msgs})});
//                 const res = await req.json();
//                 resultText = res.choices[0].message.content;
//             }

//             document.getElementById('outputContent').innerHTML = marked.parse(resultText);
//             document.getElementById('resultArea').classList.remove('hidden');
//             document.getElementById('audioPlayer').classList.remove('hidden');
            
//             Storage.addHistory(currentMode === 'text' ? userInput : "[Hình ảnh]", resultText, currentMode);
//             renderHistory();

//             TTS.start(document.getElementById('outputContent').innerText, targetCode, 'answer');

//         } catch (e) {
//             alert("Lỗi: " + e.message);
//         } finally {
//             btn.disabled = false;
//             btn.innerHTML = "🚀 GIẢI BÀI TẬP";
//         }
//     };
// }

// Hàm render lịch sử
function renderHistory() {
    const list = document.getElementById('historyList');
    if(!list) return;
    const history = Storage.getHistory();
    list.innerHTML = "";
    history.forEach((item, index) => { // Thêm index vào đây
        const div = document.createElement('div');
        div.className = "history-item";
        div.innerHTML = `<span class="time">${item.timestamp}</span><div class="preview">${item.type === 'image' ? '📷 Ảnh' : '📝 ' + item.prompt}</div>`;
        div.onclick = () => {
            App.switchTab('tutor');
            const outputContent = document.getElementById('outputContent');
            const resultArea = document.getElementById('resultArea');
            const audioPlayer = document.getElementById('audioPlayer');
            
            if(outputContent) outputContent.innerHTML = marked.parse(item.result);
            if(resultArea) resultArea.classList.remove('hidden');
            if(audioPlayer) audioPlayer.classList.remove('hidden');
            
            if(item.type === 'text') { 
                App.setMode('text'); 
                const qInput = document.getElementById('questionInput');
                if(qInput) qInput.value = item.fullPrompt; 
            }
        };
        list.appendChild(div);
    });
}

// Xử lý nút Play/Pause
const btnPlay = document.getElementById('btnPlay');
if(btnPlay) btnPlay.onclick = TTS.toggle;

// --- XỬ LÝ POPUP THÔNG MINH ---
function handleSelection(e) {
    const tooltip = document.getElementById('tooltip');
    if(!tooltip) return;
    if(tooltip.contains(e.target)) return;

    const sel = window.getSelection();
    const text = sel.toString().trim();
    
    const outputBox = document.getElementById('outputContent');
    const inputBox = document.getElementById('questionInput');
    const readerBox = document.getElementById('readerContent');

    // Kiểm tra vùng bôi đen
    const isValidSelection = text.length > 0 && (
        (outputBox && outputBox.contains(sel.anchorNode)) || 
        (inputBox && inputBox.contains(sel.anchorNode)) ||
        (readerBox && readerBox.contains(sel.anchorNode))
    );

    if (isValidSelection) {
        selectedText = text;
        const range = sel.getRangeAt(0);
        const rect = range.getBoundingClientRect();
        
        const tooltipWidth = 280; 
        const tooltipHeight = 50;
        const padding = 10;

        let left = rect.left + (rect.width / 2) - (tooltipWidth / 2);
        let top = rect.top - tooltipHeight - 10;

        if (left < padding) left = padding;
        if (left + tooltipWidth > window.innerWidth - padding) left = window.innerWidth - tooltipWidth - padding;
        if (top < padding) top = rect.bottom + 10;

        tooltip.style.position = 'fixed';
        tooltip.style.left = left + "px";
        tooltip.style.top = top + "px";
        tooltip.classList.remove('hidden');
    } else {
        tooltip.classList.add('hidden');
    }
}

// Xử lý các nút trên tooltip
const btnSpeakSel = document.getElementById('btnSpeakSel');
if(btnSpeakSel) {
    btnSpeakSel.onclick = () => {
        const cleanText = Utils.removeStress(selectedText);
        const lang = Utils.detectLang(selectedText);
        const utt = new SpeechSynthesisUtterance(cleanText);
        utt.lang = lang.lang;
        window.speechSynthesis.cancel();
        window.speechSynthesis.speak(utt);
    };
}

const btnDict = document.getElementById('btnDict');
if(btnDict) {
    btnDict.onclick = () => {
        const clean = Utils.removeStress(selectedText).replace(/\s+/g, '-').toLowerCase();
        const lang = Utils.detectLang(selectedText);
        const url = `https://vtudien.com/${lang.dictCode}-viet/dictionary/nghia-cua-tu-${clean}`;
        window.open(url, '_blank');
    };
}

const btnGoogle = document.getElementById('btnGoogle');
if(btnGoogle) {
    btnGoogle.onclick = () => {
        const clean = Utils.removeStress(selectedText);
        const lang = Utils.detectLang(selectedText);
        const q = `nghĩa của từ "${clean}" trong ${lang.name}`;
        window.open(`https://www.google.com/search?q=${encodeURIComponent(q)}`, '_blank');
    };
}