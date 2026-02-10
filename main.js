// js/main.js

document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('apiKey').value = Storage.getKey();
    renderHistory();
    window.speechSynthesis.onvoiceschanged = () => {};
    
    // Sự kiện Popup (Quan trọng)
    document.addEventListener('mouseup', handleSelection);
    // Ẩn popup khi cuộn chuột để tránh bị trôi
    document.addEventListener('scroll', () => document.getElementById('tooltip').classList.add('hidden'));
});

document.getElementById('apiKey').addEventListener('change', (e) => Storage.setKey(e.target.value));

// --- CHẾ ĐỘ ---
let currentMode = 'text';
function setMode(mode) {
    currentMode = mode;
    document.getElementById('questionInput').style.display = mode === 'text' ? 'block' : 'none';
    document.getElementById('imageInputArea').style.display = mode === 'image' ? 'block' : 'none';
    
    const active = "px-4 py-2 bg-blue-600 text-white rounded font-bold";
    const inactive = "px-4 py-2 bg-gray-200 text-gray-600 rounded font-bold";
    document.getElementById('btnText').className = mode === 'text' ? active : inactive;
    document.getElementById('btnImage').className = mode === 'image' ? active : inactive;
}
document.getElementById('btnText').onclick = () => setMode('text');
document.getElementById('btnImage').onclick = () => setMode('image');

// --- ĐỌC ĐỀ BÀI (ĐÃ SỬA DÙNG CHUNG PLAYER) ---
window.readQuestion = () => {
    const text = document.getElementById('questionInput').value;
    if(!text || document.getElementById('questionInput').style.display === 'none') {
        return alert("Vui lòng nhập văn bản đề bài để đọc!");
    }
    const targetCode = document.getElementById('targetLang').options[document.getElementById('targetLang').selectedIndex].getAttribute('data-code');
    
    // Gọi TTS với source là 'question'
    TTS.start(text, targetCode, 'question');
};
// --- THÊM HÀM MỚI: ĐỌC LỜI GIẢI ---
window.readAnswer = () => {
    const text = document.getElementById('outputContent').innerText;
    if(!text) return alert("Chưa có lời giải để đọc!");
    
    const targetCode = document.getElementById('targetLang').options[document.getElementById('targetLang').selectedIndex].getAttribute('data-code');
    
    // Gọi TTS với source là 'answer' -> Nó sẽ tự ngắt đọc đề bài
    TTS.start(text, targetCode, 'answer');
};
// --- GIẢI BÀI TẬP ---
document.getElementById('btnSubmit').onclick = async function() {
    const apiKey = document.getElementById('apiKey').value;
    if(!apiKey) return alert("Vui lòng nhập API Key!");

    const btn = this;
    const provider = document.getElementById('provider').value;
    const targetLang = document.getElementById('targetLang').value;
    const targetCode = document.getElementById('targetLang').options[document.getElementById('targetLang').selectedIndex].getAttribute('data-code');

    btn.disabled = true;
    btn.innerHTML = `<span class="loader"></span> Đang xử lý...`;
    document.getElementById('resultArea').classList.add('hidden');
    TTS.stop(); // Dừng đọc nếu đang đọc dở

    const promptText = `
    Bạn là gia sư ngôn ngữ. Giải bài tập ${targetLang}.
    QUY TẮC TUYỆT ĐỐI:
    1. Tiếng Nga: BẮT BUỘC giữ nguyên dấu trọng âm (U+0301) để hiển thị.
    2. Giải thích chi tiết ngữ pháp.
    3. Từ vựng (Từ - Phiên âm - Nghĩa).
    4. Dịch nghĩa tiếng Việt.
    5. Trình bày Markdown.
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

        // Logic gọi API (Giữ nguyên)
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

        // Tự động đọc Lời giải (source = 'answer')
        TTS.start(document.getElementById('outputContent').innerText, targetCode, 'answer');

    } catch (e) {
        alert("Lỗi: " + e.message);
    } finally {
        btn.disabled = false;
        btn.innerHTML = "🚀 GIẢI BÀI TẬP";
    }
};

function renderHistory() {
    const list = document.getElementById('historyList');
    const history = Storage.getHistory();
    list.innerHTML = "";
    history.forEach(item => {
        const div = document.createElement('div');
        div.className = "history-item";
        div.innerHTML = `<span class="time">${item.timestamp}</span><div class="preview">${item.type === 'image' ? '📷 Ảnh' : '📝 ' + item.prompt}</div>`;
        div.onclick = () => {
            document.getElementById('outputContent').innerHTML = marked.parse(item.result);
            document.getElementById('resultArea').classList.remove('hidden');
            document.getElementById('audioPlayer').classList.remove('hidden');
            if(item.type === 'text') { setMode('text'); document.getElementById('questionInput').value = item.fullPrompt; }
        };
        list.appendChild(div);
    });
}
window.clearHistory = Storage.clearHistory;

document.getElementById('btnPlay').onclick = TTS.toggle;
window.stopReading = TTS.stop;

window.copyContent = async () => {
    try {
        const el = document.getElementById('outputContent');
        const blobHtml = new Blob([el.innerHTML], {type: 'text/html'});
        const blobText = new Blob([el.innerText], {type: 'text/plain'});
        await navigator.clipboard.write([new ClipboardItem({'text/html': blobHtml, 'text/plain': blobText})]);
        alert("Đã copy (giữ định dạng)!");
    } catch(e) {
        navigator.clipboard.writeText(document.getElementById('outputContent').innerText);
        alert("Đã copy văn bản!");
    }
};
// // --- 5. COPY RICH TEXT (FIXED) ---
window.copyRichText = async () => {
    try {
        const content = document.getElementById('outputContent');
        
        // Tạo Blob cho HTML (giữ định dạng) và Text (dự phòng)
        const blobHtml = new Blob([content.innerHTML], { type: 'text/html' });
        const blobText = new Blob([content.innerText], { type: 'text/plain' });
        
        const data = [new ClipboardItem({ 
            'text/html': blobHtml, 
            'text/plain': blobText 
        })];
        
        await navigator.clipboard.write(data);
        alert("✅ Đã copy thành công! Hãy paste vào Word/Docs để thấy định dạng.");
    } catch (err) {
        console.error(err);
        // Fallback cho trình duyệt không hỗ trợ ClipboardItem (ít gặp)
        navigator.clipboard.writeText(document.getElementById('outputContent').innerText);
        alert("⚠️ Trình duyệt chặn copy định dạng. Đã copy văn bản thường.");
    }
};
// --- POPUP THÔNG MINH (FIX TRÀN VIỀN & INPUT) ---
let selectedText = "";
const tooltip = document.getElementById('tooltip');


// --- SỬA LỖI POPUP TRÀN VIỀN (DÙNG FIXED POSITION) ---
function handleSelection(e) {
    const tooltip = document.getElementById('tooltip');
    
    // Nếu click vào chính tooltip thì không làm gì
    if(tooltip.contains(e.target)) return;

    const sel = window.getSelection();
    const text = sel.toString().trim();
    const outputBox = document.getElementById('outputContent');
    const inputBox = document.getElementById('questionInput');

    // Kiểm tra vùng bôi đen hợp lệ
    const isValidSelection = text.length > 0 && (
        outputBox.contains(sel.anchorNode) || 
        inputBox.contains(sel.anchorNode)
    );

    if (isValidSelection) {
        selectedText = text;
        const range = sel.getRangeAt(0);
        const rect = range.getBoundingClientRect(); // Lấy toạ độ so với khung nhìn (Viewport)
        
        // Kích thước cố định của tooltip (để tính toán)
        const tooltipWidth = 280; 
        const tooltipHeight = 50;
        const padding = 10; // Khoảng cách an toàn với mép màn hình

        // 1. Tính toán vị trí mặc định (Căn giữa theo chiều ngang, nằm trên selection)
        let left = rect.left + (rect.width / 2) - (tooltipWidth / 2);
        let top = rect.top - tooltipHeight - 10; // 10px khoảng cách

        // 2. LOGIC "KẸP" (CLAMP) - GIỮ POPUP TRONG MÀN HÌNH
        
        // Chống tràn bên trái
        if (left < padding) {
            left = padding;
        }
        
        // Chống tràn bên phải
        if (left + tooltipWidth > window.innerWidth - padding) {
            left = window.innerWidth - tooltipWidth - padding;
        }

        // Chống tràn bên trên (Nếu sát mép trên quá -> Lật xuống dưới)
        if (top < padding) {
            top = rect.bottom + 10;
        }

        // 3. Áp dụng toạ độ (Dùng Fixed để không phụ thuộc thanh cuộn)
        tooltip.style.position = 'fixed';
        tooltip.style.left = left + "px";
        tooltip.style.top = top + "px";
        tooltip.classList.remove('hidden');
    } else {
        tooltip.classList.add('hidden');
    }
}

// function handleSelection(e) {
//     if(tooltip.contains(e.target)) return;

//     const sel = window.getSelection();
//     const text = sel.toString().trim();
//     const outputBox = document.getElementById('outputContent');
//     const inputBox = document.getElementById('questionInput');

//     // Kiểm tra xem vùng bôi đen nằm trong Output HOẶC Input (đã thêm inputBox.contains)
//     const isInsideInput = inputBox.contains(sel.anchorNode) || (sel.anchorNode && sel.anchorNode.closest && sel.anchorNode.closest('#questionInput'));
//     const isInsideOutput = outputBox.contains(sel.anchorNode);

//     if (text.length > 0 && (isInsideOutput || isInsideInput)) {
//         selectedText = text;
//         const range = sel.getRangeAt(0);
//         const rect = range.getBoundingClientRect();
        
//         const tooltipHeight = 60; // Chiều cao ước lượng của tooltip
//         const tooltipWidth = 260; // Chiều rộng ước lượng
        
//         // Tính toán vị trí mặc định (ở trên)
//         let left = rect.left + (rect.width / 2);
//         let top = rect.top + window.scrollY - tooltipHeight; 

//         // 1. Xử lý tràn viền dưới (Bottom overflow)
//         // Nếu vị trí bôi đen quá thấp so với màn hình, popup sẽ bị che
//         // Logic: Nếu khoảng cách từ đỉnh selection đến mép trên màn hình < chiều cao popup 
//         // -> Đẩy popup xuống dưới selection
//         const viewportTop = rect.top; // Khoảng cách tới mép trên viewport
//         if (viewportTop < tooltipHeight + 10) {
//             // Hiện ở dưới
//             top = rect.bottom + window.scrollY + 10;
//         }

//         // 2. Xử lý tràn viền trái/phải
//         if (left < tooltipWidth / 2) left = tooltipWidth / 2 + 10;
//         if (left > window.innerWidth - (tooltipWidth / 2)) left = window.innerWidth - (tooltipWidth / 2) - 10;

//         tooltip.style.left = left + "px";
//         tooltip.style.top = top + "px";
//         tooltip.classList.remove('hidden');
//     } else {
//         tooltip.classList.add('hidden');
//     }
// }

document.getElementById('btnSpeakSel').onclick = () => {
    const cleanText = Utils.removeStress(selectedText);
    const lang = Utils.detectLang(selectedText);
    const utt = new SpeechSynthesisUtterance(cleanText);
    utt.lang = lang.lang;
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(utt);
};

document.getElementById('btnDict').onclick = () => {
    const clean = Utils.removeStress(selectedText).replace(/\s+/g, '-').toLowerCase();
    const lang = Utils.detectLang(selectedText);
    const url = `https://vtudien.com/${lang.dictCode}-viet/dictionary/nghia-cua-tu-${clean}`;
    window.open(url, '_blank');
};

document.getElementById('btnGoogle').onclick = () => {
    const clean = Utils.removeStress(selectedText);
    const lang = Utils.detectLang(selectedText);
    const q = `nghĩa của từ "${clean}" trong ${lang.name}`;
    window.open(`https://www.google.com/search?q=${encodeURIComponent(q)}`, '_blank');
};

// js/main.js

// document.addEventListener('DOMContentLoaded', () => {
//     document.getElementById('apiKey').value = Storage.getKey();
//     renderHistory();
//     window.speechSynthesis.onvoiceschanged = () => {};
    
//     // Sự kiện Popup
//     document.addEventListener('mouseup', handleSelection);
//     // Ẩn popup khi cuộn chuột để tránh bị trôi
//     document.addEventListener('scroll', () => document.getElementById('tooltip').classList.add('hidden'));
// });

// document.getElementById('apiKey').addEventListener('change', (e) => Storage.setKey(e.target.value));

// // --- CHẾ ĐỘ ---
// let currentMode = 'text';
// function setMode(mode) {
//     currentMode = mode;
//     document.getElementById('questionInput').style.display = mode === 'text' ? 'block' : 'none';
//     document.getElementById('imageInputArea').style.display = mode === 'image' ? 'block' : 'none';
    
//     const active = "px-4 py-2 bg-blue-600 text-white rounded font-bold";
//     const inactive = "px-4 py-2 bg-gray-200 text-gray-600 rounded font-bold";
//     document.getElementById('btnText').className = mode === 'text' ? active : inactive;
//     document.getElementById('btnImage').className = mode === 'image' ? active : inactive;
// }
// document.getElementById('btnText').onclick = () => setMode('text');
// document.getElementById('btnImage').onclick = () => setMode('image');

// // --- HÀM MỚI: ĐỌC ĐỀ BÀI ---
// window.readQuestion = () => {
//     const text = document.getElementById('questionInput').value;
//     if(!text || document.getElementById('questionInput').style.display === 'none') {
//         return alert("Chỉ đọc được văn bản trong ô nhập đề bài!");
//     }
//     const targetCode = document.getElementById('targetLang').options[document.getElementById('targetLang').selectedIndex].getAttribute('data-code');
//     TTS.start(text, targetCode);
// };

// // --- GIẢI BÀI TẬP ---
// document.getElementById('btnSubmit').onclick = async function() {
//     const apiKey = document.getElementById('apiKey').value;
//     if(!apiKey) return alert("Vui lòng nhập API Key!");

//     const btn = this;
//     const provider = document.getElementById('provider').value;
//     const targetLang = document.getElementById('targetLang').value;
//     const targetCode = document.getElementById('targetLang').options[document.getElementById('targetLang').selectedIndex].getAttribute('data-code');

//     btn.disabled = true;
//     btn.innerHTML = `<span class="loader"></span> Đang xử lý...`;
//     document.getElementById('resultArea').classList.add('hidden');
//     TTS.stop();

//     const promptText = `
//     Bạn là gia sư ngôn ngữ. Giải bài tập ${targetLang}.
//     QUY TẮC TUYỆT ĐỐI:
//     1. Tiếng Nga: BẮT BUỘC giữ nguyên dấu trọng âm (U+0301) để hiển thị.
//     2. Giải thích chi tiết ngữ pháp.
//     3. Từ vựng (Từ - Phiên âm - Nghĩa).
//     4. Dịch nghĩa tiếng Việt.
//     5. Trình bày Markdown.
//     `;

//     try {
//         let resultText = "";
//         let userInput = "";
        
//         if(currentMode === 'text') {
//             userInput = document.getElementById('questionInput').value;
//         } else {
//             const file = document.getElementById('imageFile').files[0];
//             if(!file) throw new Error("Chưa chọn ảnh");
//             userInput = await Utils.fileToBase64(file);
//         }

//         if(provider === 'gemini') {
//             const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`;
//             let parts = [{text: promptText}];
//             if(currentMode==='text') parts.push({text: userInput});
//             else parts.push({text: "Giải ảnh này", inline_data: {mime_type: "image/jpeg", data: userInput}});
            
//             const req = await fetch(url, {method: 'POST', body: JSON.stringify({contents:[{parts}]})});
//             const res = await req.json();
//             resultText = res.candidates?.[0]?.content?.parts?.[0]?.text || "Lỗi API";
//         } else {
//             const baseURL = provider === 'deepseek' ? 'https://api.deepseek.com/chat/completions' : 'https://api.openai.com/v1/chat/completions';
//             const model = provider === 'deepseek' ? 'deepseek-chat' : 'gpt-4o';
//             let msgs = [{role:"system", content: promptText}];
//             if(currentMode === 'text') msgs.push({role:"user", content: userInput});
//             else msgs.push({role:"user", content: [{type:"text", text: "Giải ảnh"}, {type:"image_url", image_url: {url: "data:image/jpeg;base64,"+userInput}}]});
            
//             const req = await fetch(baseURL, {method:'POST', headers:{'Content-Type':'application/json', 'Authorization': `Bearer ${apiKey}`}, body: JSON.stringify({model, messages: msgs})});
//             const res = await req.json();
//             resultText = res.choices[0].message.content;
//         }

//         document.getElementById('outputContent').innerHTML = marked.parse(resultText);
//         document.getElementById('resultArea').classList.remove('hidden');
//         document.getElementById('audioPlayer').classList.remove('hidden');
        
//         Storage.addHistory(currentMode === 'text' ? userInput : "[Hình ảnh]", resultText, currentMode);
//         renderHistory();

//         TTS.start(document.getElementById('outputContent').innerText, targetCode);

//     } catch (e) {
//         alert("Lỗi: " + e.message);
//     } finally {
//         btn.disabled = false;
//         btn.innerHTML = "🚀 GIẢI BÀI TẬP";
//     }
// };

// function renderHistory() {
//     const list = document.getElementById('historyList');
//     const history = Storage.getHistory();
//     list.innerHTML = "";
//     history.forEach(item => {
//         const div = document.createElement('div');
//         div.className = "history-item";
//         div.innerHTML = `<span class="time">${item.timestamp}</span><div class="preview">${item.type === 'image' ? '📷 Ảnh' : '📝 ' + item.prompt}</div>`;
//         div.onclick = () => {
//             document.getElementById('outputContent').innerHTML = marked.parse(item.result);
//             document.getElementById('resultArea').classList.remove('hidden');
//             document.getElementById('audioPlayer').classList.remove('hidden');
//             if(item.type === 'text') { setMode('text'); document.getElementById('questionInput').value = item.fullPrompt; }
//         };
//         list.appendChild(div);
//     });
// }
// window.clearHistory = Storage.clearHistory;

// document.getElementById('btnPlay').onclick = TTS.toggle;
// window.stopReading = TTS.stop;

// window.copyContent = async () => {
//     try {
//         const el = document.getElementById('outputContent');
//         const blobHtml = new Blob([el.innerHTML], {type: 'text/html'});
//         const blobText = new Blob([el.innerText], {type: 'text/plain'});
//         await navigator.clipboard.write([new ClipboardItem({'text/html': blobHtml, 'text/plain': blobText})]);
//         alert("Đã copy (giữ định dạng)!");
//     } catch(e) {
//         navigator.clipboard.writeText(document.getElementById('outputContent').innerText);
//         alert("Đã copy văn bản!");
//     }
// };
// // // --- 5. COPY RICH TEXT (FIXED) ---
// window.copyRichText = async () => {
//     try {
//         const content = document.getElementById('outputContent');
        
//         // Tạo Blob cho HTML (giữ định dạng) và Text (dự phòng)
//         const blobHtml = new Blob([content.innerHTML], { type: 'text/html' });
//         const blobText = new Blob([content.innerText], { type: 'text/plain' });
        
//         const data = [new ClipboardItem({ 
//             'text/html': blobHtml, 
//             'text/plain': blobText 
//         })];
        
//         await navigator.clipboard.write(data);
//         alert("✅ Đã copy thành công! Hãy paste vào Word/Docs để thấy định dạng.");
//     } catch (err) {
//         console.error(err);
//         // Fallback cho trình duyệt không hỗ trợ ClipboardItem (ít gặp)
//         navigator.clipboard.writeText(document.getElementById('outputContent').innerText);
//         alert("⚠️ Trình duyệt chặn copy định dạng. Đã copy văn bản thường.");
//     }
// };
// // --- FIX LỖI POPUP TRÀN VIỀN ---
// let selectedText = "";
// const tooltip = document.getElementById('tooltip');

// function handleSelection(e) {
//     if(tooltip.contains(e.target)) return;

//     const sel = window.getSelection();
//     const text = sel.toString().trim();
//     const outputBox = document.getElementById('outputContent');
//     const inputBox = document.getElementById('questionInput');

//     // Chỉ hiện khi bôi đen trong vùng kết quả HOẶC vùng nhập liệu
//     if (text.length > 0 && (outputBox.contains(sel.anchorNode) || inputBox.contains(sel.anchorNode))) {
//         selectedText = text;
//         const range = sel.getRangeAt(0);
//         const rect = range.getBoundingClientRect();
        
//         // Tính toán vị trí trung tâm
//         let left = rect.left + (rect.width / 2);
//         let top = rect.top + window.scrollY - 50; // Mặc định hiện lên trên

//         // 1. Chống tràn bên trái
//         if (left < 130) left = 130; // 130 là nửa chiều rộng tooltip

//         // 2. Chống tràn bên phải
//         if (left > window.innerWidth - 130) left = window.innerWidth - 130;

//         // 3. Chống tràn bên trên (Nếu sát mép trên quá thì hiện xuống dưới)
//         if (rect.top < 60) {
//             top = rect.bottom + window.scrollY + 10;
//         }

//         tooltip.style.left = left + "px";
//         tooltip.style.top = top + "px";
//         tooltip.classList.remove('hidden');
//     } else {
//         tooltip.classList.add('hidden');
//     }
// }

// // Xử lý nút trên tooltip
// document.getElementById('btnSpeakSel').onclick = () => {
//     // Dùng removeStress để đọc từ đơn không bị vấp
//     const cleanText = Utils.removeStress(selectedText);
//     const lang = Utils.detectLang(selectedText);
//     const utt = new SpeechSynthesisUtterance(cleanText);
//     utt.lang = lang.lang;
//     window.speechSynthesis.cancel();
//     window.speechSynthesis.speak(utt);
// };

// document.getElementById('btnDict').onclick = () => {
//     const clean = Utils.removeStress(selectedText).replace(/\s+/g, '-').toLowerCase();
//     const lang = Utils.detectLang(selectedText);
//     const url = `https://vtudien.com/${lang.dictCode}-viet/dictionary/nghia-cua-tu-${clean}`;
//     window.open(url, '_blank');
// };

// document.getElementById('btnGoogle').onclick = () => {
//     const clean = Utils.removeStress(selectedText);
//     const lang = Utils.detectLang(selectedText);
//     const q = `nghĩa của từ "${clean}" trong ${lang.name}`;
//     window.open(`https://www.google.com/search?q=${encodeURIComponent(q)}`, '_blank');
// };

// // js/main.js

// document.addEventListener('DOMContentLoaded', () => {
//     document.getElementById('apiKey').value = Storage.getKey();
//     renderHistory();
//     window.speechSynthesis.onvoiceschanged = () => {};
// });

// document.getElementById('apiKey').addEventListener('change', (e) => Storage.setKey(e.target.value));

// let currentMode = 'text';
// function setMode(mode) {
//     currentMode = mode;
//     document.getElementById('questionInput').style.display = mode === 'text' ? 'block' : 'none';
//     document.getElementById('imageInputArea').style.display = mode === 'image' ? 'block' : 'none';
//     const active = "px-4 py-2 bg-blue-600 text-white rounded font-bold shadow-sm";
//     const inactive = "px-4 py-2 bg-gray-200 text-gray-600 rounded font-bold shadow-sm";
//     document.getElementById('btnText').className = mode === 'text' ? active : inactive;
//     document.getElementById('btnImage').className = mode === 'image' ? active : inactive;
// }
// document.getElementById('btnText').onclick = () => setMode('text');
// document.getElementById('btnImage').onclick = () => setMode('image');

// // --- MAIN LOGIC ---
// document.getElementById('btnSubmit').onclick = async function() {
//     const apiKey = document.getElementById('apiKey').value;
//     if(!apiKey) return alert("⚠️ Vui lòng nhập API Key!");

//     const btn = this;
//     const provider = document.getElementById('provider').value;
//     const targetLang = document.getElementById('targetLang').value;
//     const targetCode = document.getElementById('targetLang').options[document.getElementById('targetLang').selectedIndex].getAttribute('data-code');

//     btn.disabled = true;
//     btn.innerHTML = `<span class="loader mr-2"></span> Đang phân tích...`;
//     document.getElementById('resultArea').classList.add('hidden');
//     TTS.stop();

//     // PROMPT ĐÃ ĐƯỢC CẢI TIẾN ĐỂ ÉP TRỌNG ÂM
//     const promptText = `
//     Đóng vai trò là một chuyên gia ngôn ngữ học và biên tập viên từ điển. Nhiệm vụ của bạn là giải bài tập ${targetLang} một cách chi tiết.
    
//     YÊU CẦU BẮT BUỘC (CRITICAL):
//     1. **TRỌNG ÂM TIẾNG NGA**: Nếu ngôn ngữ là Tiếng Nga, bạn PHẢI thêm dấu trọng âm (acute accent - U+0301) vào tất cả các từ có nhiều hơn một âm tiết.
//        - Ví dụ ĐÚNG: э́то о́чень хорошо́.
//        - Ví dụ SAI: это очень хорошо.
//        - Đây là yêu cầu quan trọng nhất. Nếu không làm được, câu trả lời coi như vô dụng.
       
//     2. **Định dạng**: Sử dụng Markdown chuẩn.
//        - In đậm các từ khoá quan trọng.
//        - Dùng danh sách (bullet points) cho từ vựng.
       
//     3. **Nội dung**:
//        - Đưa ra đáp án đúng.
//        - Giải thích chi tiết tại sao chọn đáp án đó (phân tích ngữ pháp).
//        - Liệt kê từ vựng mới trong bài (Từ vựng - Phiên âm - Nghĩa).
//        - Dịch toàn bộ sang tiếng Việt.
//     `;

//     try {
//         let resultText = "";
//         let userInput = "";
        
//         if(currentMode === 'text') {
//             userInput = document.getElementById('questionInput').value;
//         } else {
//             const file = document.getElementById('imageFile').files[0];
//             if(!file) throw new Error("Chưa chọn ảnh");
//             userInput = await Utils.fileToBase64(file);
//         }

//         if(provider === 'gemini') {
//             const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`;
//             let parts = [{text: promptText}];
//             if(currentMode==='text') parts.push({text: userInput});
//             else parts.push({text: "Giải chi tiết ảnh này", inline_data: {mime_type: "image/jpeg", data: userInput}});
            
//             const req = await fetch(url, {method: 'POST', body: JSON.stringify({contents:[{parts}]})});
//             const res = await req.json();
//             if(res.error) throw new Error(res.error.message);
//             resultText = res.candidates?.[0]?.content?.parts?.[0]?.text || "Không có phản hồi.";
//         } else {
//             const baseURL = provider === 'deepseek' ? 'https://api.deepseek.com/chat/completions' : 'https://api.openai.com/v1/chat/completions';
//             const model = provider === 'deepseek' ? 'deepseek-chat' : 'gpt-4o';
//             let msgs = [{role:"system", content: promptText}];
//             if(currentMode === 'text') msgs.push({role:"user", content: userInput});
//             else msgs.push({role:"user", content: [{type:"text", text: "Giải ảnh"}, {type:"image_url", image_url: {url: "data:image/jpeg;base64,"+userInput}}]});
            
//             const req = await fetch(baseURL, {method:'POST', headers:{'Content-Type':'application/json', 'Authorization': `Bearer ${apiKey}`}, body: JSON.stringify({model, messages: msgs})});
//             const res = await req.json();
//             resultText = res.choices[0].message.content;
//         }

//         document.getElementById('outputContent').innerHTML = marked.parse(resultText);
//         document.getElementById('resultArea').classList.remove('hidden');
//         document.getElementById('audioPlayer').classList.remove('hidden');
        
//         Storage.addHistory(currentMode === 'text' ? userInput : "[Hình ảnh]", resultText, currentMode);
//         renderHistory();

//         TTS.start(document.getElementById('outputContent').innerText, targetCode);
//         TTS.toggle(); 

//     } catch (e) {
//         alert("Lỗi: " + e.message);
//     } finally {
//         btn.disabled = false;
//         btn.innerHTML = "🚀 GIẢI BÀI TẬP & PHÂN TÍCH";
//     }
// };

// function renderHistory() {
//     const list = document.getElementById('historyList');
//     const history = Storage.getHistory();
//     list.innerHTML = "";
//     history.forEach(item => {
//         const div = document.createElement('div');
//         div.className = "cursor-pointer p-3 rounded-lg hover:bg-blue-50 border border-transparent hover:border-blue-200 transition";
//         div.innerHTML = `<div class="text-xs text-gray-500">${item.timestamp}</div><div class="font-medium truncate text-gray-700">${item.type==='image'?'📷 Ảnh':item.prompt}</div>`;
//         div.onclick = () => {
//             document.getElementById('outputContent').innerHTML = marked.parse(item.result);
//             document.getElementById('resultArea').classList.remove('hidden');
//             document.getElementById('audioPlayer').classList.remove('hidden');
//             if(item.type==='text') { setMode('text'); document.getElementById('questionInput').value = item.fullPrompt; }
//         };
//         list.appendChild(div);
//     });
// }
// window.clearHistory = Storage.clearHistory;

// // --- 4. PLAYER & TTS ---
// document.getElementById('btnPlay').onclick = TTS.toggle;
// window.stopReading = TTS.stop;

// // --- 5. COPY RICH TEXT (FIXED) ---
// window.copyRichText = async () => {
//     try {
//         const content = document.getElementById('outputContent');
        
//         // Tạo Blob cho HTML (giữ định dạng) và Text (dự phòng)
//         const blobHtml = new Blob([content.innerHTML], { type: 'text/html' });
//         const blobText = new Blob([content.innerText], { type: 'text/plain' });
        
//         const data = [new ClipboardItem({ 
//             'text/html': blobHtml, 
//             'text/plain': blobText 
//         })];
        
//         await navigator.clipboard.write(data);
//         alert("✅ Đã copy thành công! Hãy paste vào Word/Docs để thấy định dạng.");
//     } catch (err) {
//         console.error(err);
//         // Fallback cho trình duyệt không hỗ trợ ClipboardItem (ít gặp)
//         navigator.clipboard.writeText(document.getElementById('outputContent').innerText);
//         alert("⚠️ Trình duyệt chặn copy định dạng. Đã copy văn bản thường.");
//     }
// };

// // --- 6. TOOLTIP TRA CỨU ---
// const tooltip = document.getElementById('tooltip');
// let selectedText = "";

// document.addEventListener('mouseup', (e) => {
//     const sel = window.getSelection();
//     if(tooltip.contains(e.target)) return;

//     if (sel.toString().trim().length > 0 && document.getElementById('outputContent').contains(sel.anchorNode)) {
//         selectedText = sel.toString().trim();
//         const range = sel.getRangeAt(0);
//         const rect = range.getBoundingClientRect();
        
//         tooltip.style.left = (rect.left + rect.width / 2) + "px";
//         tooltip.style.top = (rect.top + window.scrollY - 60) + "px";
//         tooltip.classList.remove('hidden');
//     } else {
//         tooltip.classList.add('hidden');
//     }
// });

// document.getElementById('btnSpeakSel').onclick = () => {
//     const langData = Utils.detectLang(selectedText);
//     const utt = new SpeechSynthesisUtterance(selectedText);
//     utt.lang = langData.lang;
//     window.speechSynthesis.cancel();
//     window.speechSynthesis.speak(utt);
// };

// document.getElementById('btnDict').onclick = () => {
//     // Logic link Vtudien: nga-viet, anh-viet...
//     const langData = Utils.detectLang(selectedText);
//     const cleanWord = Utils.removeAccents(selectedText).replace(/\s+/g, '-').toLowerCase();
    
//     // Sử dụng mã vdict từ Utils (nga, anh, trung...)
//     const url = `https://vtudien.com/${langData.vdict}-viet/dictionary/nghia-cua-tu-${cleanWord}`;
//     window.open(url, '_blank');
// };

// document.getElementById('btnGoogle').onclick = () => {
//     const langData = Utils.detectLang(selectedText);
//     const cleanWord = Utils.removeAccents(selectedText);
//     const q = `nghĩa của từ "${cleanWord}" trong ${langData.name}`;
//     window.open(`https://www.google.com/search?q=${encodeURIComponent(q)}`, '_blank');
// };