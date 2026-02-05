(function () {
    // Initialize logger first
    let logger;
    if (typeof window !== 'undefined' && window.logger) {
        logger = window.logger;
    } else {
        // Fallback logger if not loaded yet
        logger = {
            debugLog: console.log,
            debugLogWithEmoji: (emoji, ...args) => console.log(emoji, ...args),
            log: console.log,
            logWithEmoji: (emoji, ...args) => console.log(emoji, ...args)
        };
    }
    
    const currentUrl = window.location.href;
    // Chờ trang load ổn định
    window.addEventListener("load", () => {
        if (currentUrl.includes("/mod/quiz/review.php")) {
            saveFullQuestions();
        }
    });
    let usernameEhou = "";
    
    
    if (currentUrl.startsWith("https://learning.ehou.edu.vn")) {
        window.onload = async function () {
            const userPictureEl = document.getElementsByClassName("userpicture")[0];
            if (!userPictureEl) return;

            const anchor = userPictureEl.querySelector("a");
            if (!anchor) return;

            const img = anchor.querySelector("img");
            if (!img || !img.src) return;

            usernameEhou = img.src.split("/").pop().split(".")[0];
            
            // Encode username to opaqueKey and store securely
            const opaqueKey = await encodeUsername(usernameEhou);
            if (opaqueKey) {
                chrome.storage.local.set({ 
                    opaqueKey: opaqueKey,
                    usernameEhou: usernameEhou
                });
            }
        };
    }
})();

// OpaqueKey functions (delegated to background script for security)
async function encodeUsername(username) {
    return new Promise((resolve) => {
        chrome.runtime.sendMessage({ type: "encodeUsername", username }, (response) => {
            if (response && response.success) {
                resolve(response.opaqueKey);
            } else {
                resolve(null);
            }
        });
    });
}

async function decodeUsername(opaqueKey) {
    return new Promise((resolve) => {
        chrome.runtime.sendMessage({ type: "decodeUsername", opaqueKey }, (response) => {
            if (response && response.success) {
                resolve(response.username);
            } else {
                resolve(null);
            }
        });
    });
}

// Helper function to highlight elements
function highlightElement(element) {
    if (!element) return;
    element.classList.add('ehou-highlight');
    setTimeout(() => {
        element.classList.remove('ehou-highlight');
    }, 2500); // Highlight for 2.5 seconds
}

// Helper function to validate opaqueKey format
function isValidOpaqueKey(opaqueKey) {
    if (!opaqueKey || typeof opaqueKey !== 'string') return false;
    
    // Check if it contains exactly one dot (separating payload and signature)
    const parts = opaqueKey.split('.');
    if (parts.length !== 2) return false;
    
    // Check if both parts are valid base64url strings
    const base64urlRegex = /^[A-Za-z0-9_-]+$/;
    return base64urlRegex.test(parts[0]) && base64urlRegex.test(parts[1]);
}

// Helper function to get learningAccount from storage (dev can modify this)
async function getLearningAccount() {
    const { usernameEhou } = await new Promise((resolve, reject) => {
        try {
            chrome.storage.local.get("usernameEhou", (result) => {
                if (chrome.runtime.lastError) {
                    logger.debugLogWithEmoji("❌ Chrome storage error for getLearningAccount:", chrome.runtime.lastError);
                    reject(chrome.runtime.lastError);
                } else {
                    resolve(result);
                }
            });
        } catch (error) {
            logger.debugLogWithEmoji("❌ Error accessing chrome.storage.local for getLearningAccount:", error);
            reject(error);
        }
    });
    return usernameEhou || "";
}

// Helper function to get opaqueKey from storage
async function getOpaqueKey() {
    try {
        const { opaqueKey } = await new Promise((resolve, reject) => {
            try {
                chrome.storage.local.get("opaqueKey", (result) => {
                    if (chrome.runtime.lastError) {
                        logger.debugLogWithEmoji("❌ Chrome storage error:", chrome.runtime.lastError);
                        reject(chrome.runtime.lastError);
                    } else {
                        resolve(result);
                    }
                });
            } catch (error) {
                logger.debugLogWithEmoji("❌ Error accessing chrome.storage.local:", error);
                reject(error);
            }
        });
        
        return opaqueKey || null;
    } catch (error) {
        logger.debugLogWithEmoji("❌ Error getting opaqueKey:", error);
        return null;
    }
}

// Helper function to get usernameEhou from storage or page (backward compatibility)
async function getUsernameEhou() {
    // Lấy usernameEhou từ chrome.storage.local
    let { usernameEhou } = await new Promise(resolve => {
        chrome.storage.local.get("usernameEhou", resolve);
    });
    
    // Nếu không có usernameEhou hoặc rỗng, lấy từ trang web
    if (!usernameEhou || usernameEhou === "") {
        const userPictureEl = document.getElementsByClassName("userpicture")[0];
        if (userPictureEl) {
            const anchor = userPictureEl.querySelector("a");
            if (anchor) {
                const img = anchor.querySelector("img");
                if (img && img.src) {
                    usernameEhou = img.src.split("/").pop().split(".")[0];
                    // Lưu vào storage để lần sau không cần lấy lại
                    chrome.storage.local.set({ usernameEhou });
                }
            }
        }
    }
    
    return usernameEhou || "";
}

// Add CSS for highlight and widget effects
(function addCustomCss() {
    const styleId = 'ehou-custom-styles';
    if (document.getElementById(styleId)) return; // Avoid adding multiple times

    const style = document.createElement('style');
    style.id = styleId;
    style.textContent = `
        .ehou-highlight {
            background-color: #fff3cd !important;
            border: 2px solid #ffc107 !important;
            border-radius: 8px;
            box-shadow: 0 0 15px rgba(255, 193, 7, 0.7);
            transition: all 0.3s ease-in-out;
            scroll-margin-top: 150px; /* Add margin when scrolling into view */
        }
        
        #fill-result-widget, #fill-result-bubble {
            transition: opacity 0.25s ease-in-out, transform 0.25s ease-in-out;
            will-change: transform, opacity; /* Performance hint */
        }
        
        .ehou-hidden {
            opacity: 0 !important;
            transform: scale(0.95) !important;
            pointer-events: none !important;
        }
    `;
    document.head.appendChild(style);
})();

(function setupSelectionListener() {
    let iconEl = null;

    async function showSearchIcon(e) {
        const selectedText = window.getSelection().toString().trim();

        if (!selectedText) return;
        chrome.storage.local.get("access_token", (data) => {
            if (!data.access_token) return; // ❌ Chưa login thì dừng luôn

            const sel = window.getSelection();
            if (!sel.rangeCount) return;

            if (!iconEl) {
                iconEl = document.createElement("div");
                iconEl.style.position = "absolute";
                iconEl.style.width = "28px";
                iconEl.style.height = "28px";
                iconEl.style.background = "#fff";
                iconEl.style.border = "2px solid #000";
                iconEl.style.borderRadius = "8px";
                iconEl.style.display = "flex";
                iconEl.style.alignItems = "center";
                iconEl.style.justifyContent = "center";
                iconEl.style.cursor = "pointer";
                iconEl.style.zIndex = 9999;

                const img = document.createElement("img");
                img.src = chrome.runtime.getURL("images/ai-agent.png");
                img.style.width = "24px";
                img.style.height = "24px";

                iconEl.appendChild(img);
                document.body.appendChild(iconEl);
            }

            const range = sel.getRangeAt(0);
            const rects = range.getClientRects();
            const rect = rects[rects.length - 1] || range.getBoundingClientRect();

            const offsetX = 12;
            const offsetY = 12;

            iconEl.style.top = `${rect.bottom + window.scrollY + offsetY}px`;
            iconEl.style.left = `${rect.right + window.scrollX + offsetX}px`;
            iconEl.style.display = "block";


            iconEl.onclick = async () => {
                iconEl.style.display = "none";
                const subjectCode = await getSubjectCodeWithFallback();
                searchAndShowPopup(selectedText, subjectCode, rect);
            };
        });
    }

    document.addEventListener("mouseup", (e) => {
        const selectedText = window.getSelection().toString().trim();
        if (selectedText.length > 0) showSearchIcon(e);
        else if (iconEl) iconEl.style.display = "none";
    });

    document.addEventListener("contextmenu", (e) => {
        setTimeout(() => {
            const selectedText = window.getSelection().toString().trim();
            if (selectedText.length > 0) showSearchIcon(e);
        }, 10);
    });

})();

function getCurrentPageUsername() {
    const img = document.querySelector('.userinfo .userpicture img');
    if (!img) return null;
    const alt = img.getAttribute('alt') || '';
    const match = alt.match(/Hình của ([^"]+)/);
    return match ? match[1] : null;
}

document.addEventListener('DOMContentLoaded', getCurrentPageUsername);

function escapeHtml(text) {
    if (!text) return '';
    return text
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

// Hàm escape HTML nhưng giữ nguyên các placeholder media và thẻ HTML thực tế
function escapeHtmlExceptMedia(text) {
    if (!text) return '';
    
    // Tách text thành các phần: text thường, placeholder media, và thẻ HTML thực tế
    const parts = [];
    const mediaPattern = /\[(IMG|AUDIO):([^\]]+)\]/g;
    const htmlTagPattern = /<(img|audio|video|br|hr|p|div|span|b|i|u|strong|em)[^>]*>/gi;
    
    let lastIndex = 0;
    let match;
    
    // Tìm tất cả các match (placeholder media và thẻ HTML)
    const allMatches = [];
    
    // Tìm placeholder media
    while ((match = mediaPattern.exec(text)) !== null) {
        allMatches.push({
            index: match.index,
            endIndex: match.index + match[0].length,
            type: 'media',
            content: match[0]
        });
    }
    
    // Reset pattern
    mediaPattern.lastIndex = 0;
    
    // Tìm thẻ HTML thực tế
    while ((match = htmlTagPattern.exec(text)) !== null) {
        allMatches.push({
            index: match.index,
            endIndex: match.index + match[0].length,
            type: 'html',
            content: match[0]
        });
    }
    
    // Sắp xếp theo thứ tự xuất hiện
    allMatches.sort((a, b) => a.index - b.index);
    
    // Xử lý từng phần
    for (const match of allMatches) {
        // Thêm text trước match (escape HTML)
        if (match.index > lastIndex) {
            const textBefore = text.substring(lastIndex, match.index);
            parts.push({ type: 'text', content: escapeHtml(textBefore) });
        }
        
        // Thêm match (không escape)
        parts.push({ type: match.type, content: match.content });
        
        lastIndex = match.endIndex;
    }
    
    // Thêm text còn lại (escape HTML)
    if (lastIndex < text.length) {
        const remainingText = text.substring(lastIndex);
        parts.push({ type: 'text', content: escapeHtml(remainingText) });
    }
    
    // Ghép lại thành string
    return parts.map(part => part.content).join('');
}

// Hàm kiểm tra xem thẻ HTML có thực sự chứa nội dung media hay chỉ là text
function isValidMediaTag(tagContent) {
    if (!tagContent) return false;
    
    // Kiểm tra thẻ img
    if (tagContent.match(/<img[^>]*>/i)) {
        // Kiểm tra có src, data-src, hoặc data attribute không
        const hasSrc = tagContent.match(/src\s*=\s*["'][^"']+["']/i);
        const hasDataSrc = tagContent.match(/data-src\s*=\s*["'][^"']+["']/i);
        const hasData = tagContent.match(/data\s*=\s*["'][^"']+["']/i);
        
        // Kiểm tra src có chứa URL thực tế không (không phải empty hoặc placeholder)
        if (hasSrc) {
            const srcMatch = tagContent.match(/src\s*=\s*["']([^"']+)["']/i);
            if (srcMatch) {
                const srcValue = srcMatch[1];
                // Kiểm tra src có phải là URL thực tế không
                const isValidUrl = srcValue && 
                    (srcValue.startsWith('http://') || 
                     srcValue.startsWith('https://') || 
                     srcValue.startsWith('data:') ||
                     srcValue.startsWith('/') ||
                     srcValue.includes('.') && (srcValue.includes('.jpg') || srcValue.includes('.jpeg') || srcValue.includes('.png') || srcValue.includes('.gif') || srcValue.includes('.webp')));
                
                if (!isValidUrl) {
                    return false; // src không hợp lệ
                }
            }
        }
        
        return !!(hasSrc || hasDataSrc || hasData);
    }
    
    // Kiểm tra thẻ audio
    if (tagContent.match(/<audio[^>]*>/i)) {
        // Kiểm tra có src, data-src, hoặc source tag không
        const hasSrc = tagContent.match(/src\s*=\s*["'][^"']+["']/i);
        const hasDataSrc = tagContent.match(/data-src\s*=\s*["'][^"']+["']/i);
        const hasSource = tagContent.match(/<source[^>]*>/i);
        
        // Kiểm tra src có chứa URL thực tế không
        if (hasSrc) {
            const srcMatch = tagContent.match(/src\s*=\s*["']([^"']+)["']/i);
            if (srcMatch) {
                const srcValue = srcMatch[1];
                const isValidUrl = srcValue && 
                    (srcValue.startsWith('http://') || 
                     srcValue.startsWith('https://') || 
                     srcValue.startsWith('data:') ||
                     srcValue.startsWith('/') ||
                     srcValue.includes('.') && (srcValue.includes('.mp3') || srcValue.includes('.wav') || srcValue.includes('.ogg') || srcValue.includes('.m4a')));
                
                if (!isValidUrl) {
                    return false; // src không hợp lệ
                }
            }
        }
        
        return !!(hasSrc || hasDataSrc || hasSource);
    }
    
    // Kiểm tra thẻ video
    if (tagContent.match(/<video[^>]*>/i)) {
        // Kiểm tra có src, data-src, hoặc source tag không
        const hasSrc = tagContent.match(/src\s*=\s*["'][^"']+["']/i);
        const hasDataSrc = tagContent.match(/data-src\s*=\s*["'][^"']+["']/i);
        const hasSource = tagContent.match(/<source[^>]*>/i);
        
        // Kiểm tra src có chứa URL thực tế không
        if (hasSrc) {
            const srcMatch = tagContent.match(/src\s*=\s*["']([^"']+)["']/i);
            if (srcMatch) {
                const srcValue = srcMatch[1];
                const isValidUrl = srcValue && 
                    (srcValue.startsWith('http://') || 
                     srcValue.startsWith('https://') || 
                     srcValue.startsWith('data:') ||
                     srcValue.startsWith('/') ||
                     srcValue.includes('.') && (srcValue.includes('.mp4') || srcValue.includes('.webm') || srcValue.includes('.ogg') || srcValue.includes('.avi')));
                
                if (!isValidUrl) {
                    return false; // src không hợp lệ
                }
            }
        }
        
        return !!(hasSrc || hasDataSrc || hasSource);
    }
    
    // Các thẻ HTML khác (br, hr, p, div, span, b, i, u, strong, em) KHÔNG hợp lệ nữa
    return false;
}

// Hàm escape HTML nhưng chỉ giữ nguyên các thẻ HTML có nội dung thực tế
function escapeHtmlExceptValidMedia(text) {
    if (!text) return '';
    
    // Tách text thành các phần: text thường, placeholder media, và thẻ HTML hợp lệ
    const parts = [];
    const mediaPattern = /\[(IMG|AUDIO):([^\]]+)\]/g;
    // Tìm tất cả các thẻ HTML, nhưng chỉ giữ nguyên các thẻ media thực sự
    const htmlTagPattern = /<[^>]+>/gi;
    
    let lastIndex = 0;
    let match;
    
    // Tìm tất cả các match (placeholder media và thẻ HTML)
    const allMatches = [];
    
    // Tìm placeholder media
    while ((match = mediaPattern.exec(text)) !== null) {
        allMatches.push({
            index: match.index,
            endIndex: match.index + match[0].length,
            type: 'media',
            content: match[0]
        });
    }
    
    // Reset pattern
    mediaPattern.lastIndex = 0;
    
    // Tìm tất cả thẻ HTML
    while ((match = htmlTagPattern.exec(text)) !== null) {
        allMatches.push({
            index: match.index,
            endIndex: match.index + match[0].length,
            type: 'html',
            content: match[0],
            isValid: isValidMediaTag(match[0])
        });
    }
    
    // Sắp xếp theo thứ tự xuất hiện
    allMatches.sort((a, b) => a.index - b.index);
    
    // Xử lý từng phần
    for (const match of allMatches) {
        // Thêm text trước match (escape HTML)
        if (match.index > lastIndex) {
            const textBefore = text.substring(lastIndex, match.index);
            parts.push({ type: 'text', content: escapeHtml(textBefore) });
        }
        
        // Thêm match (escape HTML nếu không hợp lệ)
        if (match.type === 'media') {
            parts.push({ type: 'media', content: match.content });
        } else if (match.type === 'html') {
            if (match.isValid) {
                parts.push({ type: 'html', content: match.content });
            } else {
                // Nếu thẻ HTML không hợp lệ, escape nó
                parts.push({ type: 'text', content: escapeHtml(match.content) });
            }
        }
        
        lastIndex = match.endIndex;
    }
    
    // Thêm text còn lại (escape HTML)
    if (lastIndex < text.length) {
        const remainingText = text.substring(lastIndex);
        parts.push({ type: 'text', content: escapeHtml(remainingText) });
    }
    
    // Ghép lại thành string
    return parts.map(part => part.content).join('');
}

// Hàm xử lý placeholder media sau khi đã escape HTML
function processMediaPlaceholders(text, item) {
    if (!text) return text;
    
    // Pattern để tìm [IMG:hash] hoặc [AUDIO:hash] (chỉ placeholder, không phải thẻ HTML thực tế)
    const pattern = /\[(IMG|AUDIO):([^\]]+)\]/g;
    
    return text.replace(pattern, (match, type, hash) => {
        if (type === 'IMG') {
            // Tìm URL hình ảnh tương ứng với hash
            const imageUrl = findImageUrlByHash(hash, item);
            if (imageUrl) {
                return `<img src="${imageUrl}" class="hover-zoom-image" style="max-width:240px;max-height:240px;margin:4px 0;display:block;" />`;
            }
        } else if (type === 'AUDIO') {
            // Tìm URL audio tương ứng với hash
            const audioUrl = findAudioUrlByHash(hash, item);
            if (audioUrl) {
                return `<audio controls style="margin:4px 0;"><source src="${audioUrl}" type="audio/mpeg">Your browser does not support the audio element.</audio>`;
            }
        }
        return match; // Giữ nguyên nếu không tìm thấy
    });
}

// Simple popup to show search results on legacy site (mirror new site behavior)
function showResultPopup(x, y, dataList) {
    const old = document.querySelector("#quiz-result-popup");
    if (old) old.remove();

    const popup = document.createElement("div");
    popup.id = "quiz-result-popup";

    popup.innerHTML = dataList.map((item, idx) => {
        // ⚠️ Chưa đăng nhập
        if (item.ai === null) {
            return `
            <div style="margin: 12px;">
                <b>🔐 ${escapeHtml(item.explanation)}</b>
                <div style="margin-top: 6px;">Vui lòng đăng nhập để sử dụng chức năng này.</div>
            </div>
        `;
        }
        // 📡 AI phân tích
        if (item.ai === true) {
            return `
                <div style="margin-bottom: 12px;">
                    <div><b>🤖 AI phân tích</b></div>
                    <div style="font-weight: bold;">${idx + 1}. ${processMediaPlaceholders(escapeHtmlExceptValidMedia(item.content || ''), item)}</div>
                    <div style="font-size: 12px; color: #666; margin-bottom: 6px;">📝 ${item.typeDisplay || 'Chọn một câu trả lời'}</div>
                    <div>${item.questionImagesHtml || ''}</div>
                    <div>${item.questionAudioHtml || ''}</div>
                    <div style="margin-left: 10px; margin-top: 6px;">
                        ${item.choicesHtml || ''}
                    </div>
                    <div style="margin-top: 6px; font-style: italic; color: #222;">
                        🧠 Giải thích: ${processMediaPlaceholders(escapeHtmlExceptValidMedia(item.explanation), item)}
                    </div>
                </div>
            `;
        }

        const explanationText = (item && item.explanation && typeof item.explanation === 'object')
            ? (item.explanation.text || '')
            : (item?.explanation || '');
        return `
            <div style="margin-bottom: 14px;">
                <div style="font-weight: bold;">${idx + 1}. ${processMediaPlaceholders(escapeHtmlExceptValidMedia(item.content || ''), item)}</div>
                <div style="font-size: 12px; color: #666; margin-bottom: 6px;">📝 ${item.typeDisplay || 'Chọn một câu trả lời'}</div>
                <div>${item.questionImagesHtml || ''}</div>
                <div>${item.questionAudioHtml || ''}</div>
                <div style="margin-left: 10px; margin-top: 6px;">
                    ${item.choicesHtml || ''}
                </div>
                ${explanationText ? `<div style=\"margin-top: 6px; font-style: italic; color: #222;\">🧠 Giải thích: ${processMediaPlaceholders(escapeHtmlExceptValidMedia(explanationText), item)}</div>` : ''}
            </div>
        `;
    }).join("<hr style='margin: 12px 0;'>");

    Object.assign(popup.style, {
        position: "absolute",
        top: `${y + window.scrollY + 20}px`,
        left: `${x + window.scrollX}px`,
        padding: "14px",
        background: "linear-gradient(to right, #ffffff, #e3f2fd)",
        color: "#000",
        fontSize: "14px",
        borderRadius: "12px",
        zIndex: 10000,
        boxShadow: "0 4px 12px rgba(0,0,0,0.3)",
        width: "420px",
        maxWidth: "90%",
        whiteSpace: "normal",
        lineHeight: "1.5"
    });

    document.body.appendChild(popup);

    // ✅ Đóng khi click ra ngoài
    setTimeout(() => {
        document.addEventListener("click", function removePopup(ev) {
            if (!popup.contains(ev.target)) {
                popup.remove();
                document.removeEventListener("click", removePopup);
            }
        });
    }, 10);
}

function searchAndShowPopup(questionText, subjectCode, rect) {
    // Kiểm tra username trước khi search
    const pageUsername = getCurrentPageUsername();
    chrome.storage.local.get(['profile'], async function(data) {
        const extUsername = data.profile?.username || data.profile?.userName || '';
        const role = data.profile?.role || '';
        // Nếu là admin thì bỏ qua check
        if (typeof role === 'string' && ['admin', 'partner'].includes(role.trim().toLowerCase())) {
            // Cho phép search luôn
        } else if (pageUsername && extUsername && pageUsername !== extUsername) {
            alert(`Vui lòng đăng nhập vào tài khoản học là ${extUsername} thì mới được dùng các chức năng này!`);
            return;
        }
        // Nếu khớp thì tiếp tục search như cũ
        if (!questionText) return;

        const learningAccount = await getLearningAccount();
        const opaqueKey = await getOpaqueKey();
        
        // Validate opaqueKey
        if (!opaqueKey) {
            showToast("⚠️ Không thể tạo khóa bảo mật. Vui lòng đăng nhập lại vào hệ thống học và thử lại!", "error");
            return;
        }

        chrome.runtime.sendMessage({
            type: "searchQuestion",
            payload: {
                question: questionText, 
                subjectCode, 
                learningAccount: learningAccount,
                opaqueKey: opaqueKey
            }
        }, (response) => {
            const dataList = response?.data || [];

            // Xử lý dữ liệu để thêm hình ảnh và audio
            const processedData = dataList.map(item => {
                // Get question type display text
                const getTypeDisplay = (type) => {
                    switch(type) {
                        case 'SINGLE_CHOICE': return 'Chọn một câu trả lời';
                        case 'MULTIPLE_CHOICE': return 'Chọn nhiều câu trả lời';
                        case 'TRUE_FALSE': return 'Đúng/Sai';
                        case 'COMPLETION_WITH_CHOICES': return 'Điền vào chỗ trống';
                        default: return 'Chọn một câu trả lời';
                    }
                };

                // Xử lý hiển thị hình ảnh theo pattern cho câu hỏi
                const { processedContent, questionImagesHtml } = processContentWithImages(item.content || '', item);

                // Xử lý audio câu hỏi
                let questionAudioHtml = '';
                if (item.content && item.content.audios && item.content.audios.length) {
                    questionAudioHtml = item.content.audios.map(audio =>
                        `<audio controls style="max-width:220px;margin:8px 0;display:block;">
                            <source src="${audio.url}" type="audio/mp3">
                            <a href="${audio.url}" target="_blank">${audio.title || 'Audio'}</a>
                        </audio>`
                    ).join("");
                }

                // Xử lý hình ảnh và audio trong các lựa chọn
                const letters = ['a', 'b', 'c', 'd', 'e', 'f'];
                const choices = (item.choices || []).map((c, i) => {
                    // Xử lý hiển thị hình ảnh theo pattern cho text lựa chọn
                    const { processedText, choiceImagesHtml } = processChoiceTextWithImages(c.text || '', c);
                    
                    let audioHtml = "";
                    if (c.audios && c.audios.length) {
                        audioHtml = c.audios.map(audio =>
                            `<audio controls style="max-width:80px;max-height:40px;margin-left:8px;vertical-align:middle;">
                                <source src="${audio.url}" type="audio/mp3">
                            </audio>`
                        ).join("");
                    }
                    
                    const isCorrect = i === item.correctAnswer;
                    return `<div>${letters[i]}. ${processedText.replace(/\n/g, '<br>')} ${choiceImagesHtml} ${audioHtml} ${isCorrect ? "✅" : ""}</div>`;
                }).join("");

                return {
                    ...item,
                    content: processedContent, // Cập nhật content đã được xử lý
                    typeDisplay: getTypeDisplay(item.type),
                    questionImagesHtml,
                    questionAudioHtml,
                    choicesHtml: choices
                };
            });

            const finalData = processedData.length > 0 ? processedData : [{ai: true, explanation: "Không tìm thấy kết quả."}];
            showResultPopup(rect.right, rect.bottom, finalData);
        });
    });
}

function decodeHTMLEntities(text) {
    const textarea = document.createElement('textarea');
    textarea.innerHTML = text;
    return textarea.value;
}

// Helper function to check if image is a system image
function isSystemImage(url) {
    return url.includes('/theme/image.php/coursemos/core/') || 
           url.includes('grade_correct') ||
           url.includes('grade_incorrect');
}

// Helper function to check if audio is a system audio
function isSystemAudio(url) {
    return url.includes('/theme/') || 
           url.includes('notification') ||
           url.includes('system');
}

// Helper function to create SHA-256 hash
async function createHash(str) {
    const encoder = new TextEncoder();
    const data = encoder.encode(str);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

// Hàm xử lý nội dung với hình ảnh theo pattern
function processContentWithImages(content, item) {
    if (!content) return { processedContent: '', questionImagesHtml: '' };

    // Pattern để tìm [IMG:hash] hoặc [AUDIO:hash]
    const pattern = /\[(IMG|AUDIO):([^\]]+)\]/g;
    let processedContent = content;
    let questionImagesHtml = '';
    let hasPattern = false;

    // Kiểm tra xem có pattern không
    if (pattern.test(content)) {
        hasPattern = true;
        // Reset pattern để sử dụng lại
        pattern.lastIndex = 0;
    }

    if (hasPattern) {
        // Nếu có pattern, thay thế pattern bằng hình ảnh tương ứng
        processedContent = content.replace(pattern, (match, type, hash) => {
            if (type === 'IMG') {
                // Tìm URL hình ảnh tương ứng với hash
                const imageUrl = findImageUrlByHash(hash, item);
                if (imageUrl) {
                    return `<img src="${imageUrl}" style="max-width:220px;max-height:220px;margin:8px 0;display:block;" />`;
                }
            } else if (type === 'AUDIO') {
                // Xử lý audio nếu cần
                return `<audio controls style="margin:4px 0;"><source src="${hash}" type="audio/mpeg">Your browser does not support the audio element.</audio>`;
            }
            return match; // Giữ nguyên nếu không tìm thấy
        });
    } else {
        // Nếu không có pattern, hiển thị hình ảnh ở cuối câu
        // Xử lý các cấu trúc dữ liệu khác nhau
        let imageUrls = [];
        
        // Cấu trúc mới: item.content.images
        if (item.content && item.content.images && Array.isArray(item.content.images)) {
            imageUrls = item.content.images.map(img => img.url || img).filter(Boolean);
        }
        // Cấu trúc cũ: item.imageUrls
        else if (Array.isArray(item.imageUrls)) {
            imageUrls = item.imageUrls;
        }
        // Cấu trúc khác: item.images
        else if (Array.isArray(item.images)) {
            imageUrls = item.images.map(img => img.url || img).filter(Boolean);
        }
        
        if (imageUrls.length) {
            questionImagesHtml = imageUrls.map(url =>
                `<img src="${url}" style="max-width:220px;max-height:220px;margin:8px 0;display:block;" />`
            ).join("");
        }
    }

    return { processedContent, questionImagesHtml };
}

// Hàm xử lý nội dung với hình ảnh trong text lựa chọn
function processChoiceTextWithImages(text, choice) {
    if (!text) return { processedText: '', choiceImagesHtml: '' };

    // Pattern để tìm [IMG:hash] hoặc [AUDIO:hash] trong text lựa chọn
    const pattern = /\[(IMG|AUDIO):([^\]]+)\]/g;
    let processedText = text;
    let choiceImagesHtml = '';
    let hasPattern = false;

    // Kiểm tra xem có pattern không
    if (pattern.test(text)) {
        hasPattern = true;
        // Reset pattern để sử dụng lại
        pattern.lastIndex = 0;
    }

    if (hasPattern) {
        // Nếu có pattern, thay thế pattern bằng hình ảnh tương ứng
        processedText = text.replace(pattern, (match, type, hash) => {
            if (type === 'IMG') {
                // Tìm URL hình ảnh tương ứng với hash
                const imageUrl = findImageUrlByHash(hash, choice);
                if (imageUrl) {
                    return `<img src="${imageUrl}" style="max-width:80px;max-height:80px;margin-left:8px;vertical-align:middle;" />`;
                }
            } else if (type === 'AUDIO') {
                // Xử lý audio nếu cần
                return `<audio controls style="margin:4px 0;"><source src="${hash}" type="audio/mpeg">Your browser does not support the audio element.</audio>`;
            }
            return match; // Giữ nguyên nếu không tìm thấy
        });
    } else {
        // Nếu không có pattern, hiển thị hình ảnh ở cuối câu
        // Xử lý các cấu trúc dữ liệu khác nhau
        let imageUrls = [];
        
        // Cấu trúc mới: choice.content.imageHashes và choice.content.imageUrls
        if (choice.content && choice.content.imageHashes && choice.content.imageUrls) {
            imageUrls = choice.content.imageUrls.map(img => img.url || img).filter(Boolean);
        }
        // Cấu trúc cũ: choice.imageHashes và choice.imageUrls
        else if (Array.isArray(choice.imageHashes) && Array.isArray(choice.imageUrls)) {
            imageUrls = choice.imageUrls;
        }
        // Cấu trúc khác: choice.images
        else if (Array.isArray(choice.images)) {
            imageUrls = choice.images.map(img => img.url || img).filter(Boolean);
        }
        
        if (imageUrls.length) {
            choiceImagesHtml = imageUrls.map(url =>
                `<img src="${url}" style="max-width:80px;max-height:80px;margin-left:8px;vertical-align:middle;" />`
            ).join("");
        }
    }

    return { processedText, choiceImagesHtml };
}

// Hàm tìm URL hình ảnh theo hash
function findImageUrlByHash(hash, item) {
    // Xử lý các cấu trúc dữ liệu khác nhau
    let imageHashes = [];
    let imageUrls = [];
    
    // Cấu trúc mới: item.content.imageHashes và item.content.imageUrls
    if (item.content && item.content.imageHashes && item.content.imageUrls) {
        imageHashes = item.content.imageHashes;
        imageUrls = item.content.imageUrls.map(img => img.url || img).filter(Boolean);
    }
    // Cấu trúc cũ: item.imageHashes và item.imageUrls
    else if (Array.isArray(item.imageHashes) && Array.isArray(item.imageUrls)) {
        imageHashes = item.imageHashes;
        imageUrls = item.imageUrls;
    }
    // Cấu trúc khác: item.images
    else if (Array.isArray(item.images)) {
        imageHashes = item.images.map(img => img.hash || img).filter(Boolean);
        imageUrls = item.images.map(img => img.url || img).filter(Boolean);
    }
    
    // Tìm index của hash trong mảng imageHashes
    const hashIndex = imageHashes.indexOf(hash);
    if (hashIndex !== -1 && imageUrls[hashIndex]) {
        return imageUrls[hashIndex];
    }
    
    return null;
}

// Hàm tìm URL audio theo hash
function findAudioUrlByHash(hash, item) {
    // Xử lý các cấu trúc dữ liệu khác nhau
    let audioHashes = [];
    let audioUrls = [];
    
    // Cấu trúc mới: item.content.audioHashes và item.content.audioUrls
    if (item.content && item.content.audioHashes && item.content.audioUrls) {
        audioHashes = item.content.audioHashes;
        audioUrls = item.content.audioUrls.map(audio => audio.url || audio).filter(Boolean);
    }
    // Cấu trúc cũ: item.audioHashes và item.audioUrls
    else if (Array.isArray(item.audioHashes) && Array.isArray(item.audioUrls)) {
        audioHashes = item.audioHashes;
        audioUrls = item.audioUrls;
    }
    // Cấu trúc khác: item.audios
    else if (Array.isArray(item.audios)) {
        audioHashes = item.audios.map(audio => audio.hash || audio).filter(Boolean);
        audioUrls = item.audios.map(audio => audio.url || audio).filter(Boolean);
    }
    
    // Tìm index của hash trong mảng audioHashes
    const hashIndex = audioHashes.indexOf(hash);
    if (hashIndex !== -1 && audioUrls[hashIndex]) {
        return audioUrls[hashIndex];
    }
    
    return null;
}

// Helper function to process images with improved structure
async function processImages(images) {
    if (!images || !images.length) return null;
    
    // Filter out system images and invalid URLs
    const validImages = images.filter(url => {
        const isSystem = isSystemImage(url);
        const isValidUrl = url && 
            (url.startsWith('http://') || 
             url.startsWith('https://') || 
             url.startsWith('data:') ||
             url.startsWith('/') ||
             url.includes('.') && (url.includes('.jpg') || url.includes('.jpeg') || url.includes('.png') || url.includes('.gif') || url.includes('.webp')));
        
        return !isSystem && isValidUrl;
    });
    
    if (!validImages.length) return null;

    const processedImages = await Promise.all(validImages.map(async (url) => {
        try {
            const response = await fetch(url);
            if (!response.ok) {
                throw new Error(`Image fetch not ok: ${response.status}`);
            }
            const blob = await response.blob();
            const base64 = await new Promise((resolve) => {
                const reader = new FileReader();
                reader.onloadend = () => resolve(reader.result.split(',')[1]);
                reader.readAsDataURL(blob);
            });
            
            // Create SHA-256 hash from the image data
            const hash = await createHash(base64);
            
            return {
                url,
                base64,
                hash,
                type: 'image',
                filename: url.split('/').pop() || 'image.jpg'
            };
        } catch (error) {
            return null;
        }
    }));

    const result = processedImages.filter(Boolean);
    return result;
}

// Simple cache for processed audio files to avoid reprocessing
const audioProcessingCache = new Map();

// Helper function to process audio files (with base64 to create unique hash)
// Benefits of using base64 hash:
// 1. Ensures uniqueness - same file content = same hash regardless of URL
// 2. Prevents duplicate uploads - identical files will have identical hashes
// 3. More reliable than URL-based hashing - URLs can change but content remains same
async function processAudio(audioElements) {
    if (!audioElements || !audioElements.length) return null;
    
    // Use Set to track processed URLs and avoid duplicates
    const processedUrls = new Set();
    const validAudios = [];
    
    for (const audio of audioElements) {
        // Handle both direct audio elements and audio within spans
        let src = null;
        if (audio.tagName === 'AUDIO') {
            src = audio.src || audio.querySelector('source')?.src;
        } else if (audio.classList.contains('mediaplugin_mp3') || audio.classList.contains('mediaplugin')) {
            const audioElement = audio.querySelector('audio');
            if (audioElement) {
                src = audioElement.src || audioElement.querySelector('source')?.src;
            }
        }
        
        // Only process if src exists, is not system audio, and hasn't been processed yet
        if (src && !isSystemAudio(src) && !processedUrls.has(src)) {
            processedUrls.add(src);
            validAudios.push({ audio, src });
        }
    }
    
    if (!validAudios.length) return null;

    // Process files in parallel with concurrency limit for better performance
    const concurrencyLimit = 8; // Process 8 files at a time
    const processedAudios = [];
    
    for (let i = 0; i < validAudios.length; i += concurrencyLimit) {
        const batch = validAudios.slice(i, i + concurrencyLimit);
        const batchPromises = batch.map(async ({ audio, src }) => {
            try {
                // Check cache first
                if (audioProcessingCache.has(src)) {
                    return audioProcessingCache.get(src);
                }
                
                let title = null;
                
                // Handle different audio structures
                if (audio.tagName === 'AUDIO') {
                    title = audio.title || audio.getAttribute('title') || 'audio';
                } else if (audio.classList.contains('mediaplugin_mp3') || audio.classList.contains('mediaplugin')) {
                    const audioElement = audio.querySelector('audio');
                    if (audioElement) {
                        title = audioElement.title || audioElement.getAttribute('title') || 'audio';
                    }
                }
                
                // Fetch the audio file and create base64 with timeout
                const controller = new AbortController();
                const timeoutId = setTimeout(() => controller.abort(), 15000); // 15 second timeout
                
                const response = await fetch(src, { signal: controller.signal });
                clearTimeout(timeoutId);
                
                if (!response.ok) {
                    throw new Error(`Failed to fetch audio: ${response.statusText}`);
                }
                
                const blob = await response.blob();
                
                const base64 = await new Promise((resolve) => {
                    const reader = new FileReader();
                    reader.onloadend = () => resolve(reader.result.split(',')[1]);
                    reader.readAsDataURL(blob);
                });
                
                // Create SHA-256 hash from the base64 content
                const hash = await createHash(base64);
                
                const result = {
                    url: src,
                    base64: base64, // Include base64 for hash creation
                    hash,
                    type: 'audio',
                    filename: src.split('/').pop() || 'audio.mp3',
                    title: title
                };
                
                // Cache the result
                audioProcessingCache.set(src, result);
                
                return result;
            } catch (error) {
                return null;
            }
        });
        
        const batchResults = await Promise.all(batchPromises);
        processedAudios.push(...batchResults.filter(Boolean));
        
        // Small delay between batches to avoid overwhelming the server
        if (i + concurrencyLimit < validAudios.length) {
            await new Promise(resolve => setTimeout(resolve, 200)); // 200ms delay between batches
        }
    }
    
    return processedAudios;
}

// Helper function to extract text with media placeholders using hash
async function extractTextWithMediaPlaceholders(element, removePrefix = false) {
    if (!element) return '';
    
    // Clone the element to avoid modifying the original
    const clone = element.cloneNode(true);
    
    // Remove script tags and CDATA sections
    const scripts = clone.querySelectorAll('script');
    scripts.forEach(script => script.remove());
    
    // Remove CDATA comments
    const walker = document.createTreeWalker(
        clone,
        NodeFilter.SHOW_COMMENT,
        null,
        false
    );
    const commentsToRemove = [];
    let comment;
    while (comment = walker.nextNode()) {
        if (comment.textContent.includes('CDATA')) {
            commentsToRemove.push(comment);
        }
    }
    commentsToRemove.forEach(comment => comment.remove());
    
    // Replace images with hash placeholders (only valid images)
    const images = clone.querySelectorAll('img');
    
    for (let i = 0; i < images.length; i++) {
        const img = images[i];
        const imgSrc = img.src;
        const imgTag = img.outerHTML;
        
        // Kiểm tra xem thẻ img có hợp lệ không
        if (imgSrc && !isSystemImage(imgSrc) && isValidMediaTag(imgTag)) {
            try {
                const response = await fetch(imgSrc);
                if (!response.ok) {
                    throw new Error(`Image fetch not ok: ${response.status}`);
                }
                const blob = await response.blob();
                const base64 = await new Promise((resolve) => {
                    const reader = new FileReader();
                    reader.onloadend = () => resolve(reader.result.split(',')[1]);
                    reader.readAsDataURL(blob);
                });
                const hash = await createHash(base64);
                
                const placeholder = document.createElement('span');
                placeholder.textContent = `[IMG:${hash}]`;
                placeholder.setAttribute('data-img-hash', hash);
                placeholder.setAttribute('data-img-src', imgSrc);
                img.parentNode.replaceChild(placeholder, img);
            } catch (error) {
                // If error, just remove the image
                img.remove();
            }
        } else {
            // Remove invalid or system images
            img.remove();
        }
    }
    
    // Replace audio with hash placeholders (only valid audio)
    const audios = clone.querySelectorAll('audio');
    for (let i = 0; i < audios.length; i++) {
        const audio = audios[i];
        const src = audio.src || audio.querySelector('source')?.src;
        const audioTag = audio.outerHTML;
        
        
        // Kiểm tra xem thẻ audio có hợp lệ không
        if (src && !isSystemAudio(src) && isValidMediaTag(audioTag)) {
            try {
                // Fetch the audio file and create base64 for hash
                const response = await fetch(src);
                if (!response.ok) {
                    throw new Error(`Failed to fetch audio: ${response.statusText}`);
                }
                
                const blob = await response.blob();
                const base64 = await new Promise((resolve) => {
                    const reader = new FileReader();
                    reader.onloadend = () => resolve(reader.result.split(',')[1]);
                    reader.readAsDataURL(blob);
                });
                
                // Create hash from base64 content
                const hash = await createHash(base64);
                
                const placeholder = document.createElement('span');
                placeholder.textContent = `[AUDIO:${hash}]`;
                placeholder.setAttribute('data-audio-hash', hash);
                placeholder.setAttribute('data-audio-src', src);
                audio.parentNode.replaceChild(placeholder, audio);
            } catch (error) {
                // If error, just remove the audio
                audio.remove();
            }
        } else {
            // Remove invalid or system audio
            audio.remove();
        }
    }
    
    // Alternative approach: Process all audio elements first, then replace their parent spans
    const allAudioElements = clone.querySelectorAll('audio');
    
    for (let i = 0; i < allAudioElements.length; i++) {
        const audio = allAudioElements[i];
        const src = audio.src || audio.querySelector('source')?.src;
        const audioTag = audio.outerHTML;
        
        // Kiểm tra xem thẻ audio có hợp lệ không
        if (src && !isSystemAudio(src) && isValidMediaTag(audioTag)) {
            try {
                // Fetch the audio file and create base64 for hash
                const response = await fetch(src);
                if (!response.ok) {
                    throw new Error(`Failed to fetch audio: ${response.statusText}`);
                }
                
                const blob = await response.blob();
                const base64 = await new Promise((resolve) => {
                    const reader = new FileReader();
                    reader.onloadend = () => resolve(reader.result.split(',')[1]);
                    reader.readAsDataURL(blob);
                });
                
                // Create hash from base64 content
                const hash = await createHash(base64);
                
                // Find the parent span that contains this audio
                let parentSpan = audio.closest('span');
                if (parentSpan && (parentSpan.classList.contains('mediaplugin_mp3') || 
                                  parentSpan.classList.contains('mediaplugin'))) {
                    const placeholder = document.createElement('span');
                    placeholder.textContent = `[AUDIO:${hash}]`;
                    placeholder.setAttribute('data-audio-hash', hash);
                    placeholder.setAttribute('data-audio-src', src);
                    parentSpan.parentNode.replaceChild(placeholder, parentSpan);
                } else {
                    // If no parent span, replace the audio directly
                    const placeholder = document.createElement('span');
                    placeholder.textContent = `[AUDIO:${hash}]`;
                    placeholder.setAttribute('data-audio-hash', hash);
                    placeholder.setAttribute('data-audio-src', src);
                    audio.parentNode.replaceChild(placeholder, audio);
                }
            } catch (error) {
                // If error, just remove the audio
            }
        }
    }
    
    // Extract text while preserving line breaks from HTML structure
    let result = '';
    
    // Process each element to preserve line breaks
    const processNode = (node) => {
        if (node.nodeType === Node.TEXT_NODE) {
            return node.textContent || '';
        } else if (node.nodeType === Node.ELEMENT_NODE) {
            const tagName = node.tagName.toLowerCase();
            let content = '';
            
            // Process child nodes
            for (let child of node.childNodes) {
                content += processNode(child);
            }
            
            // Add line breaks for block elements
            if (['p', 'div', 'br', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'li'].includes(tagName)) {
                return content + '\n';
            }
            
            return content;
        }
        return '';
    };
    
    result = processNode(clone).trim();
    
    // Fallback to innerText if processing fails
    if (!result) {
        result = clone.innerText || clone.textContent || '';
    }
    
    // Check if audio placeholders are present
    const audioPlaceholders = result.match(/\[AUDIO:[^\]]+\]/g);
    if (audioPlaceholders) {
        // Try alternative text extraction method
        const alternativeResult = clone.textContent || '';
        const alternativePlaceholders = alternativeResult.match(/\[AUDIO:[^\]]+\]/g);
        if (alternativePlaceholders) {
            result = alternativeResult; // Use alternative result
        }
    }
    
    // Remove prefix if requested (for choices)
    if (removePrefix) {
        result = result.replace(/^[a-zA-Z]\.\s*/, '').trim();
    }
    
    return result;
}

// Helper function: extract normalized text for hashing
// - Keep bold as [BOLD:...]
// - Replace <img> with [IMG:hash] using image content hash
// - Replace <audio> with [AUDIO:hash] using audio content hash
// - Optionally replace inputs with [GAP] (for gapfill)
// - Optionally remove prefix like "A. " for options
async function extractNormalizedTextForHash(element, options = {}) {
    const { replaceInputsWithGap = false, removePrefix = false } = options;
    if (!element) return '';

    const clone = element.cloneNode(true);

    // Remove scripts and CDATA comments
    clone.querySelectorAll('script').forEach(s => s.remove());
    const walker = document.createTreeWalker(clone, NodeFilter.SHOW_COMMENT, null, false);
    const comments = [];
    let c;
    while (c = walker.nextNode()) {
        if (c.textContent.includes('CDATA')) comments.push(c);
    }
    comments.forEach(n => n.remove());

    // Remove dynamic IDs and attributes that can vary between attempts
    clone.querySelectorAll('*').forEach(el => {
        // Remove dynamic IDs (like yui_3_17_2_3_1761151068624_xxx)
        if (el.id && (el.id.includes('yui_') || el.id.includes('_') && /\d+/.test(el.id))) {
            el.removeAttribute('id');
        }
        
        // Remove dynamic attributes that can change
        el.removeAttribute('style');
        el.removeAttribute('data-sequencecheck');
        
        // Remove classes that indicate state (correct, incorrect, etc.)
        if (el.classList) {
            el.classList.remove('correct', 'incorrect', 'notyetanswered', 'answered', 'deferredfeedback');
            el.classList.remove('ui-draggable', 'ui-draggable-handle', 'ui-droppable');
        }
    });

    // Remove input values BEFORE replacing with [GAP] to ensure consistency
    clone.querySelectorAll('input, textarea, select').forEach(inp => {
        inp.removeAttribute('value');
        inp.value = ''; // Also clear the value property
    });

    // Remove grading/feedback elements that differ across attempts
    clone.querySelectorAll('.aftergapfeedback, .rightanswer, [title="Correct answer"]').forEach(e => e.remove());

    // Only normalize element order for gapfill questions (when replaceInputsWithGap is true)
    const isGapfillQuestion = options?.replaceInputsWithGap === true;

    if (isGapfillQuestion) {
        const wordBankSelectors = [
            '.draggable',
            '.drag',
            '.answers',
            '.wordbank',
            '.choices',
            '.dragitems',
            '.dropzones'
        ];
        wordBankSelectors.forEach(selector => {
            clone.querySelectorAll(selector).forEach(el => el.remove());
        });
    }

    const draggableContainer = isGapfillQuestion ? clone.querySelector('.formulation') : null;
    if (draggableContainer) {
        // Try multiple selectors to find draggable elements
        const allElements = [
            ...draggableContainer.querySelectorAll('.draggable, .drag'),
            ...draggableContainer.querySelectorAll('[class*="draggable"]'),
            ...draggableContainer.querySelectorAll('[class*="drag"]'),
            // Also look for elements that might contain draggable words
            ...draggableContainer.querySelectorAll('span, div, p').filter(el => {
                const text = (el.textContent || '').trim();
                return text && text.length < 20 && !text.includes(' ') && 
                       !text.includes('Complete') && !text.includes('sentences') &&
                       !text.includes('word') && !text.includes('box') &&
                       !text.includes('Mô tả') && !text.includes('câu hỏi');
            })
        ];
        
        // Remove duplicates and filter out empty elements
        const draggables = [...new Set(allElements)].filter(el => {
            const text = (el.textContent || '').trim();
            return text && text.length > 0;
        });
        
        
        if (draggables.length > 0) {
            // Sort by text content (case-insensitive for better consistency)
            // Also normalize whitespace to handle &nbsp; and other whitespace differences
            draggables.sort((a, b) => {
                const textA = (a.textContent || '').replace(/\s+/g, ' ').trim().toLowerCase();
                const textB = (b.textContent || '').replace(/\s+/g, ' ').trim().toLowerCase();
                return textA.localeCompare(textB);
            });
            
            
            // Re-append in sorted order
            const parent = draggables[0].parentNode;
            draggables.forEach(el => parent.appendChild(el));
            
            // Also normalize the text content in the parent to ensure consistent text extraction
            
            // Normalize whitespace in the parent text content
            const walker = document.createTreeWalker(
                parent,
                NodeFilter.SHOW_TEXT,
                null,
                false
            );
            
            let node;
            while (node = walker.nextNode()) {
                if (node.textContent) {
                    node.textContent = node.textContent.replace(/\s+/g, ' ').trim();
                }
            }
            
        } else {
            // If no draggables found, try to normalize text content in the entire formulation
            
            // Use TreeWalker to normalize text content in the entire formulation
            const walker = document.createTreeWalker(
                draggableContainer,
                NodeFilter.SHOW_TEXT,
                null,
                false
            );
            
            let node;
            while (node = walker.nextNode()) {
                if (node.textContent) {
                    node.textContent = node.textContent.replace(/\s+/g, ' ').trim();
                }
            }
            
            
            // Try to sort text content by finding word-like elements and sorting them
            const wordElements = [...draggableContainer.querySelectorAll('*')].filter(el => {
                const text = (el.textContent || '').trim();
                return text && text.length < 20 && !text.includes(' ') && 
                       !text.includes('Complete') && !text.includes('sentences') &&
                       !text.includes('word') && !text.includes('box') &&
                       !text.includes('Mô tả') && !text.includes('câu hỏi') &&
                       !text.includes('Put') && !text.includes('There') &&
                       !text.includes('Why') && !text.includes('I am') &&
                       !text.includes('When') && !text.includes('something') &&
                       !text.includes('warm') && !text.includes('cold') &&
                       !text.includes('today') && !text.includes('ice-cream') &&
                       !text.includes('freezer') && !text.includes('clothes') &&
                       !text.includes('floor') && !text.includes('Please') &&
                       !text.includes('pick') && !text.includes('them') &&
                       !text.includes('going') && !text.includes('take') &&
                       !text.includes('dog') && !text.includes('walk') &&
                       !text.includes('country');
            });
            
            if (wordElements.length > 0) {
                
                // Sort by text content
                wordElements.sort((a, b) => {
                    const textA = (a.textContent || '').replace(/\s+/g, ' ').trim().toLowerCase();
                    const textB = (b.textContent || '').replace(/\s+/g, ' ').trim().toLowerCase();
                    return textA.localeCompare(textB);
                });
                
                
                // Re-append in sorted order
                const parent = wordElements[0].parentNode;
                wordElements.forEach(el => parent.appendChild(el));
            }
        }
    }
    
    // Additional text node sorting for gapfill questions (if not already handled above)
    if (isGapfillQuestion) {
        // Find all text nodes and sort them by content
        const textNodes = [];
        const walker = document.createTreeWalker(
            clone,
            NodeFilter.SHOW_TEXT,
            null,
            false
        );
        
        let node;
        while (node = walker.nextNode()) {
            const text = node.textContent?.trim();
            if (text && text.length < 20 && !text.includes(' ') && 
                !text.includes('Complete') && !text.includes('sentences') &&
                !text.includes('word') && !text.includes('box') &&
                !text.includes('Mô tả') && !text.includes('câu hỏi') &&
                !text.includes('Put') && !text.includes('There') &&
                !text.includes('Why') && !text.includes('I am') &&
                !text.includes('When') && !text.includes('something') &&
                !text.includes('warm') && !text.includes('cold') &&
                !text.includes('today') && !text.includes('ice-cream') &&
                !text.includes('freezer') && !text.includes('clothes') &&
                !text.includes('floor') && !text.includes('Please') &&
                !text.includes('pick') && !text.includes('them') &&
                !text.includes('going') && !text.includes('take') &&
                !text.includes('dog') && !text.includes('walk') &&
                !text.includes('country')) {
                textNodes.push({ node, text });
            }
        }
        
        if (textNodes.length > 0) {
            // Sort by text content
            textNodes.sort((a, b) => {
                const textA = a.text.toLowerCase();
                const textB = b.text.toLowerCase();
                return textA.localeCompare(textB);
            });
            
            // Re-append in sorted order with spaces
            const parent = textNodes[0].node.parentNode;
            textNodes.forEach(({ node }, index) => {
                parent.appendChild(node);
                // Add space between words (except for the last one)
                if (index < textNodes.length - 1) {
                    const spaceNode = document.createTextNode(' ');
                    parent.appendChild(spaceNode);
                }
            });
        }
    }

    // Mark bold text
    const bolds = clone.querySelectorAll('strong, b');
    bolds.forEach(b => {
        const text = (b.innerText || b.textContent || '').trim();
        const span = document.createElement('span');
        span.textContent = text ? `[BOLD:${text}]` : '';
        b.parentNode.replaceChild(span, b);
    });

    // Replace inputs with [GAP] if requested
    if (replaceInputsWithGap) {
        clone.querySelectorAll('input, textarea, select').forEach(inp => {
            // Only textual gaps (avoid radio/checkbox)
            const type = (inp.getAttribute('type') || '').toLowerCase();
            if (!type || ['text','search','tel','number','email','url','password'].includes(type) || inp.tagName === 'TEXTAREA') {
                const span = document.createElement('span');
                span.textContent = '[GAP]';
                // Ensure consistent replacement regardless of input value
                inp.parentNode.replaceChild(span, inp);
            }
        });
    }

    // Replace valid <img> with [IMG:hash]
    const imgs = clone.querySelectorAll('img');
    for (let i = 0; i < imgs.length; i++) {
        const img = imgs[i];
        const src = img.src;
        const tag = img.outerHTML;
        if (src && !isSystemImage(src) && isValidMediaTag(tag)) {
            try {
                const res = await fetch(src);
                if (!res.ok) {
                    throw new Error(`Failed to fetch: ${response.statusText}`);
                }
                const blob = await res.blob();
                const base64 = await new Promise((resolve) => {
                    const reader = new FileReader();
                    reader.onloadend = () => resolve(reader.result.split(',')[1]);
                    reader.readAsDataURL(blob);
                });
                const hash = await createHash(base64);
                const span = document.createElement('span');
                span.textContent = `[IMG:${hash}]`;
                img.parentNode.replaceChild(span, img);
            } catch {
                img.remove();
            }
        } else {
            img.remove();
        }
    }

    // Replace valid <audio> with [AUDIO:hash]
    const audios = clone.querySelectorAll('audio');
    for (let i = 0; i < audios.length; i++) {
        const audio = audios[i];
        const src = audio.src || audio.querySelector('source')?.src;
        const tag = audio.outerHTML;
        if (src && !isSystemAudio(src) && isValidMediaTag(tag)) {
            try {
                const res = await fetch(src);
                if (!res.ok) throw new Error('fetch audio failed');
                const blob = await res.blob();
                const base64 = await new Promise((resolve) => {
                    const reader = new FileReader();
                    reader.onloadend = () => resolve(reader.result.split(',')[1]);
                    reader.readAsDataURL(blob);
                });
                const hash = await createHash(base64);
                const span = document.createElement('span');
                span.textContent = `[AUDIO:${hash}]`;
                // Replace closest wrapper span if Moodle wraps audio
                let parentSpan = audio.closest('span');
                if (parentSpan && (parentSpan.classList.contains('mediaplugin_mp3') || parentSpan.classList.contains('mediaplugin'))) {
                    parentSpan.parentNode.replaceChild(span, parentSpan);
                } else {
                    audio.parentNode.replaceChild(span, audio);
                }
            } catch {
                audio.remove();
            }
        } else {
            audio.remove();
        }
    }

    // Extract text while preserving line breaks from HTML structure
    let text = '';
    
    // Check if this is question 8 for debugging (already declared above)
    
    // Debug: Log the HTML content before processing
    
    // Process each element to preserve line breaks
    const processNode = (node) => {
        if (node.nodeType === Node.TEXT_NODE) {
            return node.textContent || '';
        } else if (node.nodeType === Node.ELEMENT_NODE) {
            const tagName = node.tagName.toLowerCase();
            let content = '';
            
            // Process child nodes
            for (let child of node.childNodes) {
                content += processNode(child);
            }
            
            // Add line breaks for block elements
            if (['p', 'div', 'br', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'li'].includes(tagName)) {
                return content + '\n';
            }
            
            return content;
        }
        return '';
    };
    
    text = processNode(clone).trim();
    
    
    // Fallback to innerText if processing fails
    if (!text) {
        text = clone.innerText || clone.textContent || '';
    }
    
    // Normalize spaces around [GAP]
    text = text.replace(/\s*\[GAP\]\s*/g, ' [GAP] ');
    if (removePrefix) text = text.replace(/^[a-zA-Z]\.[\s\u00A0]+/, '').trim();
    
    // For hashing, we still normalize multiple spaces to single spaces
    // but preserve line breaks by replacing them with a special marker first
    return text
        .replace(/\n/g, ' [LINEBREAK] ')
        .replace(/\s+/g, ' ')
        .replace(/\[LINEBREAK\]/g, '\n')
        .trim();
}

function normalizeForCompare(str) {
    return (str || '')
        .toLowerCase()
        .replace(/\s+/g, ' ')
        .trim();
}

async function computeMultichoiceHash(questionElement) {
    const stemEl = questionElement.querySelector('.qtext');
    const stem = await extractNormalizedTextForHash(stemEl, { replaceInputsWithGap: false, removePrefix: false });

    const labels = [...questionElement.querySelectorAll('.answer label')];
    const options = [];
    for (const label of labels) {
        const txt = await extractNormalizedTextForHash(label, { removePrefix: true });
        if (txt) options.push(txt);
    }
    const sorted = options
        .map(o => normalizeForCompare(o))
        .sort((a,b) => a.localeCompare(b));
    const payload = `${stem}\nOPTIONS:\n${sorted.join('\n')}`;
    return await createHash(payload);
}

function collectWordBank(questionElement) {
    const items = [...questionElement.querySelectorAll('.draggable, .drag, .wordbank .draggable, .choices .drag')];
    const words = items.map(i => (i.innerText || i.textContent || '').replace(/\s+/g, ' ').trim()).filter(Boolean);
    
    // Sort words alphabetically (case-insensitive) to ensure consistent hash regardless of DOM order
    // Use same normalization as extractNormalizedTextForHash
    const sortedWords = words.sort((a, b) => {
        const normalizedA = a.replace(/\s+/g, ' ').trim().toLowerCase();
        const normalizedB = b.replace(/\s+/g, ' ').trim().toLowerCase();
        return normalizedA.localeCompare(normalizedB);
    });
    
    return sortedWords;
}

async function computeGapfillHash(questionElement) {
    const formulation = questionElement.querySelector('.formulation') || questionElement;
    const stemWithGaps = await extractNormalizedTextForHash(formulation, { replaceInputsWithGap: true, questionElement: questionElement });
    
    // Remove correctness icons/images and hidden states that vary
    // (handled inside extractNormalizedTextForHash via element clone cleanup)
    const bank = collectWordBank(questionElement).map(w => normalizeForCompare(w)).sort((a,b) => a.localeCompare(b));
    
    const payload = bank.length ? `${stemWithGaps}\nBANK:\n${bank.join('\n')}` : stemWithGaps;
    
    const hash = await createHash(payload);
    
    return hash;
}

async function computeQuestionHash(questionElement, questionType) {
    if (questionType === 'COMPLETION_WITH_CHOICES') {
        return await computeGapfillHash(questionElement);
    }
    return await computeMultichoiceHash(questionElement);
}

// Hàm chuẩn hóa cấu trúc dữ liệu cho tất cả loại câu hỏi
function normalizeQuestionStructure(question) {
    const baseStructure = {
        questionHash: question.questionHash || null,
        stemSample: question.stemSample || null,
        gaps: question.gaps || null,
        content: question.content || null,
        type: question.type || null,
        choices: question.choices || null,
        correctAnswer: question.correctAnswer || null,
        explanation: question.explanation || null,
        wrongAnswer: question.wrongAnswer || null
    };
    
    return baseStructure;
}

// Hàm tính kích thước ước tính của một question (bytes)
function estimateQuestionSize(question) {
    try {
        // JSON.stringify để ước tính kích thước
        const jsonString = JSON.stringify(question);
        // Base64 thường tăng kích thước ~33%, nhưng để an toàn ta dùng kích thước thực tế
        return new Blob([jsonString]).size;
    } catch (error) {
        // Fallback: ước tính dựa trên base64 length
        let size = 1000; // Base size cho metadata
        
        // Tính kích thước từ base64 strings
        const countBase64Size = (arr) => {
            if (!Array.isArray(arr)) return 0;
            return arr.reduce((sum, item) => {
                if (typeof item === 'string') {
                    // Base64 string size (mỗi 4 base64 chars = 3 bytes)
                    return sum + (item.length * 3 / 4);
                }
                return sum;
            }, 0);
        };
        
        // Content base64
        if (question.content) {
            size += countBase64Size(question.content.audioBase64 || []);
            size += countBase64Size(question.content.imageBase64 || []);
        }
        
        // Choices base64
        if (question.choices && Array.isArray(question.choices)) {
            question.choices.forEach(choice => {
                size += countBase64Size(choice.audioBase64 || []);
                size += countBase64Size(choice.imageBase64 || []);
            });
        }
        
        // Explanation base64
        if (question.explanation) {
            size += countBase64Size(question.explanation.audioBase64 || []);
            size += countBase64Size(question.explanation.imageBase64 || []);
        }
        
        // Correct/Wrong answer base64
        if (question.correctAnswer) {
            size += countBase64Size(question.correctAnswer.audioBase64 || []);
            size += countBase64Size(question.correctAnswer.imageBase64 || []);
        }
        
        if (question.wrongAnswer) {
            size += countBase64Size(question.wrongAnswer.audioBase64 || []);
            size += countBase64Size(question.wrongAnswer.imageBase64 || []);
        }
        
        return size;
    }
}

// Hàm tách questions thành các batch với kích thước tối đa
// MAX_BATCH_SIZE: 500KB (512000 bytes) để tránh vượt quá giới hạn Tomcat/Spring Boot
function splitQuestionsIntoBatches(questions, subjectCode, subjectName) {
    const MAX_BATCH_SIZE = 500 * 1024; // 500KB
    const batches = [];
    let currentBatch = [];
    let currentBatchSize = 0;
    
    // Kích thước metadata cho mỗi request (subjectCode, subjectName, wrapper)
    const metadataSize = JSON.stringify({
        subjectCode: subjectCode || '',
        subjectName: subjectName || '',
        questions: []
    }).length;
    
    questions.forEach((question, index) => {
        const questionSize = estimateQuestionSize(question);
        
        // Nếu question đơn lẻ đã vượt quá MAX_BATCH_SIZE, tách riêng
        if (questionSize > MAX_BATCH_SIZE) {
            // Nếu đang có batch chưa gửi, lưu lại trước
            if (currentBatch.length > 0) {
                batches.push([...currentBatch]);
                currentBatch = [];
                currentBatchSize = 0;
            }
            
            // Tách question lớn thành batch riêng
            batches.push([question]);
            logger.debugLogWithEmoji('⚠️', `Question ${index + 1} quá lớn (${(questionSize / 1024).toFixed(2)}KB), tách riêng`);
        } else {
            // Kiểm tra nếu thêm question này có vượt quá giới hạn không
            const estimatedNewSize = currentBatchSize + questionSize + (currentBatch.length === 0 ? metadataSize : 0);
            
            if (estimatedNewSize > MAX_BATCH_SIZE && currentBatch.length > 0) {
                // Lưu batch hiện tại và bắt đầu batch mới
                batches.push([...currentBatch]);
                currentBatch = [question];
                currentBatchSize = questionSize + metadataSize;
            } else {
                // Thêm vào batch hiện tại
                currentBatch.push(question);
                currentBatchSize = estimatedNewSize;
            }
        }
    });
    
    // Thêm batch cuối cùng nếu còn
    if (currentBatch.length > 0) {
        batches.push(currentBatch);
    }
    
    logger.debugLogWithEmoji('📦', `Đã tách thành ${batches.length} batch(es) từ ${questions.length} câu hỏi`);
    batches.forEach((batch, index) => {
        const batchSize = JSON.stringify({
            subjectCode: subjectCode || '',
            subjectName: subjectName || '',
            questions: batch
        }).length;
        logger.debugLogWithEmoji('   ', `Batch ${index + 1}: ${batch.length} câu hỏi, ~${(batchSize / 1024).toFixed(2)}KB`);
    });
    
    return batches;
}

// Hàm gửi các batch tuần tự với progress tracking
async function sendQuestionBatches(batches, subjectCode, subjectName) {
    if (!batches || batches.length === 0) {
        logger.debugLogWithEmoji('⚠️', 'Không có batch nào để gửi');
        return;
    }
    
    const totalBatches = batches.length;
    let successCount = 0;
    let failCount = 0;
    const errors = [];
    
    // Hiển thị thông báo bắt đầu
    if (totalBatches > 1) {
        await showUploadStatus(`📤 Đang gửi ${totalBatches} phần dữ liệu...`, 'info');
    }
    
    // Gửi từng batch tuần tự
    for (let i = 0; i < batches.length; i++) {
        const batch = batches[i];
        const batchNumber = i + 1;
        
        try {
            // Hiển thị progress nếu có nhiều batch
            if (totalBatches > 1) {
                const progress = ((batchNumber / totalBatches) * 100).toFixed(0);
                await showUploadStatus(`📤 Đang gửi phần ${batchNumber}/${totalBatches} (${progress}%)...`, 'info');
            }
            
            // Gửi batch
            const response = await new Promise((resolve, reject) => {
                chrome.runtime.sendMessage({
                    type: "saveQuestions",
                    data: {
                        questions: batch,
                        subjectCode,
                        subjectName,
                        batchInfo: {
                            currentBatch: batchNumber,
                            totalBatches: totalBatches,
                            isLastBatch: batchNumber === totalBatches
                        }
                    }
                }, (response) => {
                    if (chrome.runtime.lastError) {
                        reject(new Error(chrome.runtime.lastError.message));
                    } else if (response && response.success) {
                        resolve(response);
                    } else {
                        reject(new Error(response?.error || 'Failed to save questions'));
                    }
                });
            });
            
            successCount++;
            logger.debugLogWithEmoji('✅', `Batch ${batchNumber}/${totalBatches} đã gửi thành công`);
            
            // Delay nhỏ giữa các batch để tránh quá tải server
            if (i < batches.length - 1) {
                await new Promise(resolve => setTimeout(resolve, 300));
            }
            
        } catch (error) {
            failCount++;
            const errorMsg = `Batch ${batchNumber}/${totalBatches}: ${error.message}`;
            errors.push(errorMsg);
            logger.debugLogWithEmoji('❌', errorMsg);
            console.error(`Failed to send batch ${batchNumber}:`, error);
            
            // Tiếp tục gửi các batch còn lại ngay cả khi một batch lỗi
        }
    }
    
    // Hiển thị kết quả cuối cùng
    if (totalBatches > 1) {
        if (failCount === 0) {
            await showUploadStatus(`✅ Đã gửi thành công ${successCount}/${totalBatches} phần!`, 'success');
        } else if (successCount === 0) {
            await showUploadStatus(`❌ Gửi thất bại tất cả ${failCount} phần!`, 'error');
        } else {
            await showUploadStatus(`⚠️ Đã gửi ${successCount}/${totalBatches} phần, ${failCount} phần lỗi!`, 'warning');
        }
    } else {
        // Chỉ có 1 batch, hiển thị thông báo đơn giản
        if (successCount > 0) {
            await showUploadStatus('✅ Đã lưu câu hỏi thành công!', 'success');
        } else {
            await showUploadStatus('❌ Lỗi khi lưu câu hỏi!', 'error');
        }
    }
    
    // Log chi tiết lỗi nếu có
    if (errors.length > 0) {
        console.error('Errors while sending batches:', errors);
    }
}

async function saveFullQuestions() {
    const subjectCode = await getSubjectCodeWithFallback();
    const subjectName = getSubjectNameFromTitle();

    if (!subjectCode) return;

    // Sử dụng getQuestions để lấy dữ liệu cơ bản (đã có escape HTML)
    getQuestions().then(async (questions) => {
        // Thêm thông tin đáp án đúng/sai và explanation
        const enhancedQuestionsPromises = questions.map(async (question, index) => {
            const questionElement = document.querySelectorAll('.que')[index];
            if (!questionElement) return question;

            // Handle completion questions differently
            if (question.gaps) {
                // This is a completion question, return as-is
                return question;
            }

            // For regular questions, add explanation and correct/wrong answers
            // Tìm đáp án đúng và sai
            const answerDivs = [...questionElement.querySelectorAll('.answer > div')];
            const correctAnswerIndex = answerDivs.findIndex(div =>
                div.classList.contains('correct') &&
                div.querySelector('img[alt="Câu trả lời đúng"]')
            );
            const wrongAnswerIndex = answerDivs.findIndex(div =>
                div.classList.contains('incorrect') &&
                div.querySelector('img[alt="Câu trả lời không đúng"]')
            );

            // Lấy explanation và escape HTML
            const explanationElement = questionElement.querySelector('.specificfeedback');
            const explanationText = explanationElement ? await extractTextWithMediaPlaceholders(explanationElement) : null;
            const escapedExplanationText = escapeHtmlExceptValidMedia(explanationText);

            // Process explanation images (nếu có)
            const explanationImages = [...questionElement.querySelectorAll('.specificfeedback img')].map(img => img.src);
            const processedExplanationImages = await processImages(explanationImages);

            // Process explanation audio (nếu có)
            const explanationAudios = questionElement.querySelectorAll('.specificfeedback audio, .specificfeedback span.mediaplugin_mp3, .specificfeedback span.mediaplugin');
            const processedExplanationAudios = await processAudio(explanationAudios);

            // Tạo explanation với cấu trúc mới (hỗ trợ images và audio)
            const explanationData = {
                text: escapedExplanationText,
                imageUrls: [], // Không cần imageUrls cho images
                imageBase64: processedExplanationImages?.map(img => img.base64) || [],
                imageHashes: processedExplanationImages?.map(img => img.hash) || [],
                audioUrls: processedExplanationAudios?.map(audio => audio.url) || [],
                audioHashes: processedExplanationAudios?.map(audio => audio.hash) || []
            };

            // Tạo đáp án đúng/sai với cấu trúc mới
            const correctAnswer = correctAnswerIndex >= 0 && question.choices[correctAnswerIndex] ? {
                text: question.choices[correctAnswerIndex].text || null,
                imageUrls: [], // Không cần imageUrls cho images
                imageBase64: question.choices[correctAnswerIndex].imageBase64 || [],
                imageHashes: question.choices[correctAnswerIndex].imageHashes || [],
                audioUrls: question.choices[correctAnswerIndex].audioUrls || [],
                // audioBase64: question.choices[correctAnswerIndex].audioBase64 || [],
                audioBase64: [],
                audioHashes: question.choices[correctAnswerIndex].audioHashes || []
            } : null;
            
            const wrongAnswer = wrongAnswerIndex >= 0 && question.choices[wrongAnswerIndex] ? {
                text: question.choices[wrongAnswerIndex].text || null,
                imageUrls: [], // Không cần imageUrls cho images
                imageBase64: question.choices[wrongAnswerIndex].imageBase64 || [],
                imageHashes: question.choices[wrongAnswerIndex].imageHashes || [],
                audioUrls: question.choices[wrongAnswerIndex].audioUrls || [],
                // audioBase64: question.choices[wrongAnswerIndex].audioBase64 || [],
                audioBase64: [],
                audioHashes: question.choices[wrongAnswerIndex].audioHashes || []
            } : null;

            return {
                questionHash: question.questionHash,
                content: {
                    text: question.content.text || null,
                    imageUrls: [], // Không cần imageUrls cho images
                    imageBase64: question.content.imageBase64 || [],
                    imageHashes: question.content.imageHashes || [],
                    audioUrls: question.content.audioUrls || [],
                    // audioBase64: question.content.audioBase64 || [],
                    audioBase64: [],
                    audioHashes: question.content.audioHashes || []
                },
                correctAnswer,
                explanation: explanationData,
                choices: question.choices.map(choice => ({
                    text: choice.text || null,
                    imageUrls: [], // Không cần imageUrls cho images
                    imageBase64: choice.imageBase64 || [],
                    imageHashes: choice.imageHashes || [],
                    audioUrls: choice.audioUrls || [],
                    // audioBase64: choice.audioBase64 || [],
                    audioBase64: [],
                    audioHashes: choice.audioHashes || []
                })),
                type: question.type || 'SINGLE_CHOICE',
                wrongAnswer
            };
        });
        
        // Đợi tất cả các promises
        const enhancedQuestions = await Promise.all(enhancedQuestionsPromises);
        
        // Lọc bỏ câu hỏi không hợp lệ
        const filteredQuestions = enhancedQuestions.filter(question => {
            if (question.gaps) {
                // For completion questions, check if they have gaps
                return question && question.gaps && question.gaps.length > 0;
            } else {
                // For regular questions, check if they have content
                return question && question.content && question.content.text;
            }
        });
        
        // Lấy kết quả upload từ getQuestions để cập nhật URL
        // getQuestions đã xử lý audio files và trả về questions với audio đã được upload
        // Nhưng chúng ta cần cập nhật URL cho tất cả các câu hỏi có cùng hash audio
        
        // Collect all audio files for explanation và correct/wrong answers (only for regular questions)
        const allAudioFiles = [];
        
        filteredQuestions.forEach(question => {
            // Skip completion questions
            if (question.gaps) return;
            
            // Add explanation audios
            if (question.explanation && question.explanation.audioUrls && question.explanation.audioHashes) {
                question.explanation.audioUrls.forEach((url, index) => {
                    if (url && question.explanation.audioHashes[index]) {
                        allAudioFiles.push({
                            url: url,
                            hash: question.explanation.audioHashes[index]
                        });
                    }
                });
            }
            
            // Add correct answer audios
            if (question.correctAnswer && question.correctAnswer.audioUrls && question.correctAnswer.audioHashes) {
                question.correctAnswer.audioUrls.forEach((url, index) => {
                    if (url && question.correctAnswer.audioHashes[index]) {
                        allAudioFiles.push({
                            url: url,
                            hash: question.correctAnswer.audioHashes[index]
                        });
                    }
                });
            }
            
            // Add wrong answer audios
            if (question.wrongAnswer && question.wrongAnswer.audioUrls && question.wrongAnswer.audioHashes) {
                question.wrongAnswer.audioUrls.forEach((url, index) => {
                    if (url && question.wrongAnswer.audioHashes[index]) {
                        allAudioFiles.push({
                            url: url,
                            hash: question.wrongAnswer.audioHashes[index]
                        });
                    }
                });
            }
        });
        
        // Remove duplicate audio files based on hash
        const uniqueAudioFiles = [];
        const seenHashes = new Set();
        allAudioFiles.forEach(audio => {
            if (!seenHashes.has(audio.hash)) {
                seenHashes.add(audio.hash);
                uniqueAudioFiles.push(audio);
            }
        });
        
        // Upload explanation và correct/wrong answer audio files
        let uploadResults = [];
        if (uniqueAudioFiles.length > 0) {
            uploadResults = await uploadAudiosToCloudinary(uniqueAudioFiles);
        }
        
        // Update audio URLs in all questions with Cloudinary URLs (only for regular questions)
        const finalQuestions = filteredQuestions.map(question => {
            let processedQuestion;
            if (question.gaps) {
                // Return completion questions as-is
                processedQuestion = question;
            } else {
                // Update audio URLs for regular questions
                processedQuestion = updateAudioUrlsInQuestion(question, uploadResults);
            }
            
            // Chuẩn hóa cấu trúc dữ liệu cho tất cả loại câu hỏi
            return normalizeQuestionStructure(processedQuestion);
        });
        
        // Tách questions thành các batch nhỏ để tránh request quá lớn
        const questionBatches = splitQuestionsIntoBatches(finalQuestions, subjectCode, subjectName);
        
        // Gửi từng batch tuần tự
        await sendQuestionBatches(questionBatches, subjectCode, subjectName);
    }).catch(error => {
        console.error('Error in saveFullQuestions:', error);
    });
}

// Lấy danh sách câu hỏi từ trang (có xử lý hình ảnh và audio)
async function getQuestions() {
    const questions = [...document.querySelectorAll('.que')].map(async q => {
        // Get question type first
        const questionType = getQuestionType(q);
        
        // Compute stable question hash from normalized HTML (instead of qid)
        const questionHash = await computeQuestionHash(q, questionType);
        
        let questionText = '';
        let escapedQuestionText = '';
        
        if (questionType === 'COMPLETION_WITH_CHOICES') {
            // For completion questions, get text from p tags in .formulation
            const formulation = q.querySelector('.formulation');
            if (formulation) {
                const pElements = formulation.querySelectorAll('p');
                const textParts = [];
                for (const p of pElements) {
                    const text = await extractTextWithMediaPlaceholders(p);
                    if (text && text.trim()) {
                        textParts.push(text.trim());
                    }
                }
                questionText = textParts.join(' ');
            }
        } else {
            // For other question types, get text from .qtext
            const questionElement = q.querySelector('.qtext');
            questionText = await extractTextWithMediaPlaceholders(questionElement);
        }
        
        // Escape HTML cho text thông thường, nhưng giữ nguyên placeholder media
        escapedQuestionText = escapeHtmlExceptValidMedia(questionText);
        
        // Get stemSample for completion questions
        const stemNorm = normalizeText(escapedQuestionText);
        const stemSample = stemNorm.slice(0, 120);
        
        // Process question images (chỉ lấy base64, không upload lên Cloudinary)
        let questionImages = [];
        if (questionType === 'COMPLETION_WITH_CHOICES') {
            // For completion questions, get images from .formulation
            questionImages = [...q.querySelectorAll('.formulation img')].map(img => img.src);
        } else {
            // For other question types, get images from .qtext
            questionImages = [...q.querySelectorAll('.qtext img')].map(img => img.src);
        }
        const processedQuestionImages = await processImages(questionImages);

        // Process question audio (vẫn upload lên Cloudinary)
        let questionAudios = [];
        if (questionType === 'COMPLETION_WITH_CHOICES') {
            // For completion questions, get audio from .formulation
            questionAudios = q.querySelectorAll('.formulation audio, .formulation span.mediaplugin_mp3, .formulation span.mediaplugin');
        } else {
            // For other question types, get audio from .qtext
            questionAudios = q.querySelectorAll('.qtext audio, .qtext span.mediaplugin_mp3, .qtext span.mediaplugin');
        }
        const processedQuestionAudios = await processAudio(questionAudios);

        // Handle different question types
        if (questionType === 'COMPLETION_WITH_CHOICES') {
            // For completion questions, extract gaps instead of choices
            const gaps = extractGapfill(q);
            
            // If no gaps extracted but we have inputs, create placeholder gaps
            if (gaps.length === 0) {
                const inputs = q.querySelectorAll('input[type="text"], input[type="search"], input[type="tel"], textarea');
                
                // Create placeholder gaps based on input structure
                inputs.forEach((inp, index) => {
                    const idx = getGapIndexFromName(inp.name);
                    if (idx != null) {
                        gaps.push({ index: idx, correctValues: [] });
                    }
                });
            }
            
            return {
                questionHash: questionHash,
                stemSample: stemSample,
                gaps: gaps,
                content: {
                    text: escapedQuestionText,
                    imageUrls: [],
                    imageBase64: processedQuestionImages?.map(img => img.base64) || [],
                    imageHashes: processedQuestionImages?.map(img => img.hash) || [],
                    audioUrls: processedQuestionAudios?.map(audio => audio.url) || [],
                    // audioBase64: processedQuestionAudios?.map(audio => audio.base64) || [],
                    audioBase64: [],
                    audioHashes: processedQuestionAudios?.map(audio => audio.hash) || []
                },
                type: questionType,
                choices: null,
                correctAnswer: null,
                explanation: null,
                wrongAnswer: null
            };
        } else {
            // For other question types, use the existing logic
            const answerDivs = [...q.querySelectorAll('.answer > div')];
            const choices = await Promise.all(answerDivs.map(async div => {
                const label = div.querySelector('label');
                if (!label) return null;
                
                const text = await extractTextWithMediaPlaceholders(label, true); // Remove prefix for choices
                // Escape HTML cho text thông thường, nhưng giữ nguyên placeholder media
                const escapedText = escapeHtmlExceptValidMedia(text);
                
                // Chỉ lấy hình ảnh trong label, không lấy trong specificfeedback
                const images = [...label.querySelectorAll('img')].map(img => img.src);
                const processedImages = await processImages(images);
                
                // Chỉ lấy audio trong label, không lấy trong specificfeedback
                const audios = label.querySelectorAll('audio, span.mediaplugin_mp3, span.mediaplugin');
                const processedAudios = await processAudio(audios);

                return {
                    text: escapedText,
                    imageUrls: [], // Không cần imageUrls cho images
                    imageBase64: processedImages?.map(img => img.base64) || [],
                    imageHashes: processedImages?.map(img => img.hash) || [],
                    audioUrls: processedAudios?.map(audio => audio.url) || [],
                    // audioBase64: processedAudios?.map(audio => audio.base64) || [],
                    audioBase64: [],
                    audioHashes: processedAudios?.map(audio => audio.hash) || []
                };
            }));

            return {
                questionHash: questionHash,
                stemSample: stemSample,
                gaps: null,
                content: {
                    text: escapedQuestionText,
                    imageUrls: [], // Không cần imageUrls cho images
                    imageBase64: processedQuestionImages?.map(img => img.base64) || [],
                    imageHashes: processedQuestionImages?.map(img => img.hash) || [],
                    audioUrls: processedQuestionAudios?.map(audio => audio.url) || [],
                    // audioBase64: processedQuestionAudios?.map(audio => audio.base64) || [],
                    audioBase64: [],
                    audioHashes: processedQuestionAudios?.map(audio => audio.hash) || []
                },
                type: questionType,
                choices: choices.filter(Boolean).map(choice => ({
                    text: choice.text,
                    imageUrls: choice.imageUrls || [],
                    imageBase64: choice.imageBase64 || [],
                    imageHashes: choice.imageHashes || [],
                    audioUrls: choice.audioUrls || [],
                    // audioBase64: choice.audioBase64 || [],
                    audioBase64: [],
                    audioHashes: choice.audioHashes || []
                })),
                correctAnswer: null,
                explanation: null,
                wrongAnswer: null
            };
        }
    });
    
    const processedQuestions = await Promise.all(questions);
    
    // Filter out completion questions for audio processing (they don't have audio)
    const nonCompletionQuestions = processedQuestions.filter(q => q.type && q.type !== 'COMPLETION_WITH_CHOICES');
    
    // Collect all audio files for upload (chỉ audio, không phải images)
    const allAudioFiles = [];
    
    nonCompletionQuestions.forEach(question => {
        // Add question content audios
        if (question.content && question.content.audioUrls && question.content.audioHashes) {
            question.content.audioUrls.forEach((url, index) => {
                if (url && question.content.audioHashes[index]) {
                    allAudioFiles.push({
                        url: url,
                        hash: question.content.audioHashes[index]
                    });
                }
            });
        }
        
        // Add choices audios
        if (question.choices) {
            question.choices.forEach(choice => {
                if (choice.audioUrls && choice.audioHashes) {
                    choice.audioUrls.forEach((url, index) => {
                        if (url && choice.audioHashes[index]) {
                            allAudioFiles.push({
                                url: url,
                                hash: choice.audioHashes[index]
                            });
                        }
                    });
                }
            });
        }
    });
    
    // Remove duplicate audio files based on hash
    const uniqueAudioFiles = [];
    const seenHashes = new Set();
    allAudioFiles.forEach(audio => {
        if (!seenHashes.has(audio.hash)) {
            seenHashes.add(audio.hash);
            uniqueAudioFiles.push(audio);
        }
    });
    
    // Upload all audio files to Cloudinary (chỉ audio, không phải images)
    let uploadResults = [];
    if (uniqueAudioFiles.length > 0) {
        uploadResults = await uploadAudiosToCloudinary(uniqueAudioFiles);
    }
    
    // Update audio URLs in all questions with Cloudinary URLs (chỉ audio)
    const updatedQuestions = processedQuestions.map(question => {
        if (question.type && question.type !== 'COMPLETION_WITH_CHOICES') {
            return updateAudioUrlsInQuestion(question, uploadResults);
        }
        return question; // Return completion questions as-is
    });
    
    return updatedQuestions;
}

function normalizeTextForSearch(str) {
    return (str || '')
        .replace(/[.,;:!?…]+$/g, '')
        .trim();
}

// Enhanced normalization function for better key matching
function normalizeTextForMatching(str) {
    if (!str) return '';
    
    // Decode HTML entities first
    let normalized = decodeHTMLEntities(str);
    
    // Convert to lowercase
    normalized = normalized.toLowerCase();
    
    // Normalize mathematical symbols and arrows
    normalized = normalized
        .replace(/-->/g, '->')  // Normalize double arrow to single arrow
        .replace(/→/g, '->')    // Normalize Unicode arrow to single arrow
        .replace(/⇒/g, '->')    // Normalize double line arrow to single arrow
        .replace(/⟶/g, '->');   // Normalize long arrow to single arrow
    
    // Normalize whitespace and newlines
    normalized = normalized
        .replace(/\s+/g, ' ')
        .replace(/\n+/g, ' ')
        .trim();
    
    // Remove trailing punctuation
    normalized = normalized.replace(/[.,;:!?…]+$/g, '');
    
    return normalized;
}

// Function to extract mathematical structure from text
function extractMathStructure(str) {
    if (!str) return '';
    
    const normalized = normalizeTextForMatching(str);
    
    // Look for patterns like F={...} or similar mathematical expressions
    const mathPatterns = [
        /f\s*=\s*\{[^}]*\}/gi,
        /\{[^}]*\}/g,
        /[a-z]\s*->\s*[a-z]/gi,
        /[a-z]\s*→\s*[a-z]/gi
    ];
    
    const structures = [];
    mathPatterns.forEach(pattern => {
        const matches = normalized.match(pattern);
        if (matches) {
            structures.push(...matches);
        }
    });
    
    return structures.join(' ').trim();
}

// Function to check if two texts have similar mathematical structure
function hasSimilarMathStructure(text1, text2) {
    const structure1 = extractMathStructure(text1);
    const structure2 = extractMathStructure(text2);
    
    if (!structure1 || !structure2) return false;
    
    // Check if they contain similar mathematical patterns
    const hasMathPattern1 = /f\s*=\s*\{|->|→/.test(structure1);
    const hasMathPattern2 = /f\s*=\s*\{|->|→/.test(structure2);
    
    if (!hasMathPattern1 || !hasMathPattern2) return false;
    
    // Calculate similarity of the mathematical structures
    const similarity = calculateSimilarity(structure1, structure2);
    return similarity >= 0.7; // 70% similarity threshold for math structures
}

function getSubjectCodeFromTitle() {
    const text = document.querySelector(".coursename.home-coursename h2 a")?.innerText || "";
    const match = text.match(/- .*?([A-Z]+\d+\.\d+)/);
    return match ? match[1] : null;
}

// Helper function to get subjectCode with fallback to storage (chỉ dành cho admin)
async function getSubjectCodeWithFallback() {
    // Ưu tiên lấy từ trang web
    let subjectCode = getSubjectCodeFromTitle();
    
    if (subjectCode) {
        // Lấy được từ trang web, lưu vào storage để dùng cho lần sau
        chrome.storage.local.set({ currentSubjectCode: subjectCode });
        return subjectCode;
    }
    
    // Nếu không lấy được từ trang web, chỉ admin mới được dùng từ storage
    return new Promise((resolve) => {
        chrome.storage.local.get(["currentSubjectCode", "profile"], (data) => {
            const storedSubjectCode = data.currentSubjectCode;
            const role = data.profile?.role || '';
            
            // Chỉ admin mới được phép dùng subjectCode từ storage
            const isAdmin = typeof role === 'string' && ['admin', 'partner'].includes(role.trim().toLowerCase());
            
            if (!storedSubjectCode) {
                resolve(""); // Không có gì để dùng
                return;
            }
            
            if (!isAdmin) {
                // Không phải admin, không cho phép dùng từ storage
                resolve("");
                return;
            }
            
            // Admin: cần xác nhận trước khi dùng subjectCode từ storage
            const confirmed = confirm(
                `⚠️ ADMIN: Không lấy được mã môn từ trang web.\n\n` +
                `Mã môn đã lưu trước: ${storedSubjectCode}\n\n` +
                `Bạn có muốn sử dụng mã môn này?`
            );
            
            if (confirmed) {
                resolve(storedSubjectCode);
            } else {
                resolve(""); // Admin từ chối
            }
        });
    });
}

// Lấy tên môn học từ tiêu đề trang
function getSubjectNameFromTitle() {
    const text = document.querySelector(".coursename.home-coursename h2 a")?.innerText || "";
    return text.split(" - ")[0].trim();
}

// Tự động điền đáp án đúng từ dữ liệu backend
async function fillAnswers(answerMap, hashAnswerMap) {
    let filledCount = 0;
    let exactMatches = 0;
    let fuzzyMatches = 0;
    let notFound = 0;
    let aiAnswers = 0;
    let dbAnswers = 0;
    let details = [];

    // Lấy tất cả câu hỏi từ trang
    const questionElements = document.querySelectorAll('.que');

    for (const [index, questionElement] of questionElements.entries()) {
        // Gán ID duy nhất cho câu hỏi để scroll tới
        const questionId = `ehou-quiz-question-${index}`;
        questionElement.id = questionId;

        // Lấy text câu hỏi và chuẩn hóa
        const questionTextElement = questionElement.querySelector('.qtext');
        const rawQuestionText = await extractTextWithMediaPlaceholders(questionTextElement);
        const escapedText = escapeHtml(rawQuestionText.trim());
        const questionText = normalizeTextForSearch(escapedText);
        // Ưu tiên hash ổn định từ nội dung câu hỏi
        const detectedType = getQuestionType(questionElement);
        const stableHash = await computeQuestionHash(questionElement, detectedType);
        const currentQid = getQid(questionElement); // fallback legacy

        // Xử lý hình ảnh trong câu hỏi
        const questionImages = [...questionElement.querySelectorAll('.qtext img')].map(img => img.src);
        const processedQuestionImages = await processImages(questionImages);
        const questionImageHashes = processedQuestionImages?.map(img => img.hash) || [];

        // Xử lý audio trong câu hỏi
        const questionAudios = questionElement.querySelectorAll('.qtext audio, .qtext span.mediaplugin_mp3, .qtext span.mediaplugin');
        const processedQuestionAudios = await processAudio(questionAudios);
        const questionAudioHashes = processedQuestionAudios?.map(audio => audio.hash) || [];

        // Tạo key để tìm câu hỏi trong answerMap
        let questionKey;
        let questionKeyType = 'default';
        
        // Phương pháp 1: JSON format với image hashes
        if (questionImageHashes.length > 0) {
            questionKey = JSON.stringify({
                text: questionText,
                imageHashes: questionImageHashes
            });
            questionKeyType = 'json_with_images';
        } else if (questionAudioHashes.length > 0) {
            questionKey = JSON.stringify({
                text: questionText,
                audioHashes: questionAudioHashes
            });
            questionKeyType = 'json_with_audio';
        } else {
            questionKey = questionText;
            questionKeyType = 'plain_text';
        }

        // Tìm danh sách đáp án: Ưu tiên theo questionHash (stableHash), fallback qid
        let answerList = [];
        
        // Header để phân biệt câu hỏi
        logger.debugLogWithEmoji('', '='.repeat(80));
        logger.debugLogWithEmoji('📝', 'CÂU HỎI:', questionText);
        logger.debugLogWithEmoji('', '='.repeat(80));
        logger.debugLogWithEmoji('🔍', '[DEBUG] questionKey:', questionKey);
        logger.debugLogWithEmoji('🔍', '[DEBUG] stableHash:', stableHash);
        logger.debugLogWithEmoji('🔍', '[DEBUG] currentQid:', currentQid);
        
        if (stableHash && hashAnswerMap && hashAnswerMap[stableHash]) {
            const ans = hashAnswerMap[stableHash];
            if (Array.isArray(ans)) answerList = ans.slice(); else answerList = [ans];
            logger.debugLogWithEmoji('✅', '[DEBUG] Tìm thấy answers theo stableHash:', answerList.length);
        } else if (currentQid && hashAnswerMap && hashAnswerMap[currentQid]) {
            const ans = hashAnswerMap[currentQid];
            if (Array.isArray(ans)) answerList = ans.slice(); else answerList = [ans];
            logger.debugLogWithEmoji('✅', '[DEBUG] Tìm thấy answers theo currentQid:', answerList.length);
        }
        
        // Nếu không có theo hash hoặc BE hash=null thì fallback theo logic hiện tại
        if (answerList.length === 0) {
            const fromMap = Array.isArray(answerMap[questionKey]) ? answerMap[questionKey] : [];
            logger.debugLogWithEmoji('🔍', '[DEBUG] Thử tìm theo questionKey trong answerMap:', questionKey);
            logger.debugLogWithEmoji('🔍', '[DEBUG] fromMap found:', fromMap.length);
            if (fromMap.length) {
                answerList = fromMap.slice();
                logger.debugLogWithEmoji('✅', '[DEBUG] Tìm thấy answers theo questionKey:', answerList.length);
            }
        }
        
        // Nếu không tìm thấy, thử các phương pháp fallback
        if (answerList.length === 0) {
            logger.debugLogWithEmoji('🔄', 'BẮT ĐẦU FALLBACK SEARCH');
            logger.debugLog('-'.repeat(60));
            
            // Hiển thị tất cả keys trong answerMap để debug
            const allAnswerMapKeys = Object.keys(answerMap);
            logger.debugLogWithEmoji('📊', 'Tổng số keys trong answerMap:', allAnswerMapKeys.length);
            logger.debugLogWithEmoji('📋', 'Tất cả keys trong answerMap:', allAnswerMapKeys);
            
            // Hiển thị một số keys mẫu trong answerMap để debug
            const sampleKeys = allAnswerMapKeys.slice(0, 10);
            logger.debugLogWithEmoji('🔍', 'Sample keys (10 đầu tiên):', sampleKeys);
            
            // Fallback 1: Tìm kiếm theo text đơn giản (không có JSON wrapper)
            logger.debugLogWithEmoji('1️⃣', 'FALLBACK 1: Text đơn giản');
            const simpleTextKey = questionText;
            const simpleTextAnswers = Array.isArray(answerMap[simpleTextKey]) ? answerMap[simpleTextKey] : [];
            
            logger.debugLogWithEmoji('   ', 'Key:', simpleTextKey);
            logger.debugLogWithEmoji('   ', 'Answers found:', simpleTextAnswers.length);
            logger.debugLogWithEmoji('   ', 'Key tồn tại:', answerMap.hasOwnProperty(simpleTextKey));
            
            if (simpleTextAnswers.length > 0) {
                answerList.push(...simpleTextAnswers);
                logger.debugLogWithEmoji('   ✅', 'Thành công - thêm', simpleTextAnswers.length, 'answers');
            } else {
                logger.debugLogWithEmoji('   ❌', 'Không tìm thấy');
            }
            
            // Fallback 2: Tìm kiếm theo text có audio placeholder
            logger.debugLogWithEmoji('2️⃣', 'FALLBACK 2: Audio placeholder');
            const audioPlaceholderPattern = /\[AUDIO:[^\]]+\]/g;
            const hasAudio = audioPlaceholderPattern.test(questionText);
            logger.debugLogWithEmoji('   ', 'Có audio placeholder:', hasAudio);
            
            if (hasAudio) {
                const textWithoutAudio = questionText.replace(audioPlaceholderPattern, '').trim();
                logger.debugLogWithEmoji('   ', 'Text sau khi remove audio:', textWithoutAudio);
                
                // Tìm tất cả keys có chứa audio placeholder
                const keysWithAudio = Object.keys(answerMap).filter(key => 
                    key.includes('[AUDIO:') && 
                    key.includes(textWithoutAudio)
                );
                
                logger.debugLogWithEmoji('   Keys with audio found:', keysWithAudio.length);
                logger.debugLogWithEmoji('   Keys:', keysWithAudio);
                                
                keysWithAudio.forEach(key => {
                    const answers = Array.isArray(answerMap[key]) ? answerMap[key] : [];
                    answerList.push(...answers);
                    logger.debugLogWithEmoji('   ✅ Thêm', answers.length, 'answers từ key:', key);
                });
                
                if (keysWithAudio.length === 0) {
                    logger.debugLogWithEmoji('   ❌', 'Không tìm thấy keys với audio');
                }
            } else {
                logger.debugLogWithEmoji('   ⏭️', 'Bỏ qua (không có audio)');
            }
            
            // Fallback 3: Tìm kiếm theo text chính (không có phần mở rộng)
            logger.debugLogWithEmoji('3️⃣', 'FALLBACK 3: Text chính (dòng đầu)');
            const mainQuestionText = questionText.split('\n')[0].trim();
            const mainTextAnswers = Array.isArray(answerMap[mainQuestionText]) ? answerMap[mainQuestionText] : [];
            
            logger.debugLogWithEmoji('   ', 'Key:', mainQuestionText);
            logger.debugLogWithEmoji('   ', 'Answers found:', mainTextAnswers.length);
            logger.debugLogWithEmoji('   ', 'Key tồn tại:', answerMap.hasOwnProperty(mainQuestionText));
            
            if (mainTextAnswers.length > 0) {
                answerList.push(...mainTextAnswers);
                logger.debugLogWithEmoji('   ✅', 'Thành công - thêm', mainTextAnswers.length, 'answers');
            } else {
                logger.debugLogWithEmoji('   ❌', 'Không tìm thấy');
            }
            
            // Fallback 4: Tìm kiếm fuzzy theo độ tương đồng cao
            logger.debugLogWithEmoji('4️⃣', 'FALLBACK 4: Fuzzy search (≥90%)');
            
            const allKeys = Object.keys(answerMap);
            logger.debugLogWithEmoji('   ', 'Tổng keys:', allKeys.length);
            
            const similarKeys = allKeys.filter(key => {
                const similarity = calculateSimilarity(questionText, key);
                if (similarity >= 0.8) { // Giảm threshold để xem nhiều kết quả hơn
                    logger.debugLogWithEmoji('   ', 'Key tương đồng:', key, '| Similarity:', similarity.toFixed(4));
                }
                return similarity >= 0.9; // Độ tương đồng 90% trở lên
            });
            
            logger.debugLogWithEmoji('   ', 'Similar keys found:', similarKeys.length);
            
            // Hiển thị top 5 keys có độ tương đồng cao nhất (ngay cả khi < 90%)
            const allSimilarities = allKeys.map(key => ({
                key: key,
                similarity: calculateSimilarity(questionText, key)
            })).sort((a, b) => b.similarity - a.similarity).slice(0, 5);
            
            logger.debugLogWithEmoji('   ', 'Top 5 keys có độ tương đồng cao nhất:');
            allSimilarities.forEach((item, index) => {
                logger.debugLogWithEmoji('     ', `${index + 1}. "${item.key}" - Similarity: ${item.similarity.toFixed(4)}`);
            });
            
            similarKeys.forEach(key => {
                const answers = Array.isArray(answerMap[key]) ? answerMap[key] : [];
                answerList.push(...answers);
                logger.debugLogWithEmoji('   ✅', 'Thêm', answers.length, 'answers từ key:', key);
            });
            
            if (similarKeys.length === 0) {
                logger.debugLogWithEmoji('   ❌', 'Không tìm thấy keys tương đồng ≥90%');
            }
            
            // Fallback 5: Thử so sánh với text đã được decode từ database
            logger.debugLogWithEmoji('5️⃣', 'FALLBACK 5: Decoded text search (≥90%)');
            const decodedQuestionText = normalizeText(decodeHTMLEntities(rawQuestionText));
            logger.debugLogWithEmoji('   ', 'Raw text:', rawQuestionText);
            logger.debugLogWithEmoji('   ', 'Decoded text:', decodedQuestionText);
            
            const decodedSimilarKeys = allKeys.filter(key => {
                const similarity = calculateSimilarity(decodedQuestionText, key);
                if (similarity >= 0.8) { // Giảm threshold để xem nhiều kết quả hơn
                    logger.debugLogWithEmoji('   ', 'Key tương đồng với decoded text:', key, '| Similarity:', similarity.toFixed(4));
                }
                return similarity >= 0.9;
            });
            
            logger.debugLogWithEmoji('   ', 'Decoded similar keys found:', decodedSimilarKeys.length);
            
            // Hiển thị top 5 keys có độ tương đồng cao nhất với decoded text
            const allDecodedSimilarities = allKeys.map(key => ({
                key: key,
                similarity: calculateSimilarity(decodedQuestionText, key)
            })).sort((a, b) => b.similarity - a.similarity).slice(0, 5);
            
            logger.debugLogWithEmoji('   ', 'Top 5 keys có độ tương đồng cao nhất với decoded text:');
            allDecodedSimilarities.forEach((item, index) => {
                logger.debugLogWithEmoji('     ', `${index + 1}. "${item.key}" - Similarity: ${item.similarity.toFixed(4)}`);
            });
            
            decodedSimilarKeys.forEach(key => {
                const answers = Array.isArray(answerMap[key]) ? answerMap[key] : [];
                answerList.push(...answers);
                logger.debugLogWithEmoji('   ✅', 'Thêm', answers.length, 'answers từ key:', key);
            });
            
            if (decodedSimilarKeys.length === 0) {
                logger.debugLogWithEmoji('   ❌', 'Không tìm thấy keys tương đồng ≥90% với decoded text');
            }
            
            // Fallback 6: Enhanced normalization matching
            logger.debugLogWithEmoji('6️⃣', 'FALLBACK 6: Enhanced normalization matching');
            const enhancedNormalizedQuestion = normalizeTextForMatching(rawQuestionText);
            logger.debugLogWithEmoji('   ', 'Enhanced normalized question:', enhancedNormalizedQuestion);
            
            const enhancedSimilarKeys = allKeys.filter(key => {
                const normalizedKey = normalizeTextForMatching(key);
                const similarity = calculateSimilarity(enhancedNormalizedQuestion, normalizedKey);
                if (similarity >= 0.8) {
                    logger.debugLogWithEmoji('   ', 'Key tương đồng (enhanced):', key, '| Similarity:', similarity.toFixed(4));
                }
                return similarity >= 0.8; // Lower threshold for enhanced matching
            });
            
            logger.debugLogWithEmoji('   ', 'Enhanced keys found:', enhancedSimilarKeys.length);
            logger.debugLogWithEmoji('   ', 'Enhanced keys:', enhancedSimilarKeys);
            
            enhancedSimilarKeys.forEach(key => {
                const answers = Array.isArray(answerMap[key]) ? answerMap[key] : [];
                answerList.push(...answers);
                logger.debugLogWithEmoji('   ✅', 'Thêm', answers.length, 'answers từ enhanced key:', key);
            });
            
            if (enhancedSimilarKeys.length === 0) {
                logger.debugLogWithEmoji('   ❌', 'Không tìm thấy keys tương đồng với enhanced normalization');
            }
            
            // Fallback 7: Mathematical structure matching
            logger.debugLogWithEmoji('7️⃣', 'FALLBACK 7: Mathematical structure matching');
            const mathStructureKeys = allKeys.filter(key => {
                const hasSimilarMath = hasSimilarMathStructure(rawQuestionText, key);
                if (hasSimilarMath) {
                    logger.debugLogWithEmoji('   ', 'Math structure match:', key);
                }
                return hasSimilarMath;
            });
            
            logger.debugLogWithEmoji('   ', 'Math structure keys found:', mathStructureKeys.length);
            logger.debugLogWithEmoji('   ', 'Math structure keys:', mathStructureKeys);
            
            mathStructureKeys.forEach(key => {
                const answers = Array.isArray(answerMap[key]) ? answerMap[key] : [];
                answerList.push(...answers);
                logger.debugLogWithEmoji('   ✅', 'Thêm', answers.length, 'answers từ math structure key:', key);
            });
            
            if (mathStructureKeys.length === 0) {
                logger.debugLogWithEmoji('   ❌', 'Không tìm thấy keys có cấu trúc toán học tương tự');
            }
            
            // Loại bỏ duplicates
            logger.debugLogWithEmoji('🔄', 'XỬ LÝ KẾT QUẢ');
            logger.debugLogWithEmoji('   ', 'Trước khi loại bỏ duplicates:', answerList.length);
            
            const uniqueAnswers = [];
            const seenKeys = new Set();
            answerList.forEach(answer => {
                const answerKey = JSON.stringify(answer);
                if (!seenKeys.has(answerKey)) {
                    seenKeys.add(answerKey);
                    uniqueAnswers.push(answer);
                }
            });
            
            answerList.length = 0;
            answerList.push(...uniqueAnswers);
            
            logger.debugLogWithEmoji('   Sau khi loại bỏ duplicates:', answerList.length);
            logger.debugLogWithEmoji('   Kết quả cuối cùng:', answerList);
        }
        
        logger.debugLogWithEmoji('', '='.repeat(80));
        logger.debugLogWithEmoji('✅', 'KẾT THÚC XỬ LÝ CÂU HỎI');
        logger.debugLogWithEmoji('', '='.repeat(80));

        // Nếu là câu điền chỗ trống (COMPLETION_WITH_CHOICES) và backend có gaps thì điền ngay
        const questionType = getQuestionType(questionElement);
        if (questionType === 'COMPLETION_WITH_CHOICES') {
            const completionData = (answerList || []).find(a => Array.isArray(a.gaps) && a.gaps.length > 0);
            if (completionData) {
                const filledGaps = applyGapAnswers(questionElement, completionData.gaps);
                if (filledGaps.filled > 0) {
                    filledCount++;
                    exactMatches++;
                    // cập nhật chi tiết
                    details.push({
                        question: questionText.substring(0, 100) + (questionText.length > 100 ? '...' : ''),
                        rawQuestion: rawQuestionText,
                        images: processedQuestionImages || [],
                        audios: processedQuestionAudios || [],
                        status: 'exact',
                        answer: `Gaps filled: ${filledGaps.filled}/${filledGaps.total}`,
                        similarity: 1,
                        isAi: completionData.ai === true,
                        questionId: questionId,
                        answerImages: [],
                        answerAudios: []
                    });
                    if (completionData.ai === true) aiAnswers++; else dbAnswers++;
                    continue; // chuyển sang câu tiếp theo
                }
            }
        }

        const choiceElements = questionElement.querySelectorAll('.answer > div');
        let foundCorrectAnswer = false;
        let questionDetail = {
            question: questionText.substring(0, 100) + (questionText.length > 100 ? '...' : ''),
            rawQuestion: rawQuestionText, // Lưu trữ text gốc có placeholder để xử lý
            // Lưu trữ thông tin hình ảnh và audio để xử lý placeholder
            images: processedQuestionImages || [],
            audios: processedQuestionAudios || [],
            status: 'not_found',
            answer: '',
            similarity: 0,
            isAi: false,
            questionId: questionId,
            // Thêm thông tin hình ảnh cho câu trả lời
            answerImages: [],
            answerAudios: []
        };

        for (const answerData of answerList) {
            if (foundCorrectAnswer) break;
            // Kiểm tra nếu có dữ liệu đáp án hợp lệ
            if (typeof answerData.correctAnswer === 'number' && 
                answerData.choices && 
                Array.isArray(answerData.choices) && 
                answerData.correctAnswer >= 0 && 
                answerData.correctAnswer < answerData.choices.length) {

                // Lấy dữ liệu lựa chọn đúng
                const correctAnswerData = answerData.choices[answerData.correctAnswer];

                // Xử lý từng lựa chọn trên trang
                let foundExactMatch = false; // Biến để theo dõi có tìm thấy khớp chính xác không
                let bestMatch = null;
                let bestSimilarity = 0;
                
                // VÒNG 1: Tìm khớp chính xác 100% với text thuần
                for (let i = 0; i < choiceElements.length; i++) {
                    const choiceElement = choiceElements[i];
                    const label = choiceElement.querySelector('label');
                    if (!label) continue;

                    // Lấy text lựa chọn và loại bỏ prefix
                    const choiceText = await extractTextWithMediaPlaceholders(label, true);

                    // Xử lý hình ảnh trong lựa chọn
                    const choiceImages = [...choiceElement.querySelectorAll('img')].map(img => img.src);
                    const processedChoiceImages = await processImages(choiceImages);
                    const choiceImageHashes = processedChoiceImages?.map(img => img.hash) || [];

                    // PHƯƠNG PHÁP 1: So sánh text thuần trước (không qua normalizeText)
                    if (choiceText && correctAnswerData.text && choiceText === correctAnswerData.text) {
                        foundExactMatch = true;
                        bestMatch = { choiceElement, choiceText, similarity: 1.0 };
                        bestSimilarity = 1.0;
                        break; // Tìm thấy khớp chính xác, thoát vòng lặp
                    }
                }

                // VÒNG 2: Nếu không tìm thấy khớp chính xác, thử với text đã decode
                if (!foundExactMatch) {
                    for (let i = 0; i < choiceElements.length; i++) {
                        const choiceElement = choiceElements[i];
                        const label = choiceElement.querySelector('label');
                        if (!label) continue;

                        const choiceText = await extractTextWithMediaPlaceholders(label, true);
                        
                        if (choiceText && correctAnswerData.text) {
                            const decodedChoiceText = decodeHTMLEntities(choiceText);
                            const decodedCorrectText = decodeHTMLEntities(correctAnswerData.text);
                            
                            if (decodedChoiceText === decodedCorrectText) {
                                foundExactMatch = true;
                                bestMatch = { choiceElement, choiceText, similarity: 1.0 };
                                bestSimilarity = 1.0;
                                break;
                            }
                        }
                    }
                }

                // VÒNG 3: Nếu vẫn không tìm thấy khớp chính xác, thử loại bỏ audio placeholder
                if (!foundExactMatch) {
                    for (let i = 0; i < choiceElements.length; i++) {
                        const choiceElement = choiceElements[i];
                        const label = choiceElement.querySelector('label');
                        if (!label) continue;

                        const choiceText = await extractTextWithMediaPlaceholders(label, true);
                        
                        if (choiceText && correctAnswerData.text) {
                            // Loại bỏ [AUDIO:{hash}] từ cả hai text
                            const cleanChoiceText = choiceText.replace(/\[AUDIO:[^\]]+\]/g, '').trim();
                            const cleanCorrectText = correctAnswerData.text.replace(/\[AUDIO:[^\]]+\]/g, '').trim();

                            if (cleanChoiceText === cleanCorrectText) {
                                foundExactMatch = true;
                                bestMatch = { choiceElement, choiceText, similarity: 1.0 };
                                bestSimilarity = 1.0;
                                break;
                            }
                        }
                    }
                }

                // VÒNG 4: Chỉ khi không tìm thấy khớp chính xác nào, mới áp dụng normalizeText để tìm khớp fuzzy
                if (!foundExactMatch) {
                    for (let i = 0; i < choiceElements.length; i++) {
                        const choiceElement = choiceElements[i];
                        const label = choiceElement.querySelector('label');
                        if (!label) continue;

                        const choiceText = await extractTextWithMediaPlaceholders(label, true);

                        // Xử lý hình ảnh trong lựa chọn
                        const choiceImages = [...choiceElement.querySelectorAll('img')].map(img => img.src);
                        const processedChoiceImages = await processImages(choiceImages);
                        const choiceImageHashes = processedChoiceImages?.map(img => img.hash) || [];

                        let currentSimilarity = 0;

                        // Hàm tính Levenshtein distance
                        function levenshtein(a, b) {
                            const matrix = [];
                            let i;
                            for (i = 0; i <= b.length; i++) { matrix[i] = [i]; }
                            let j;
                            for (j = 0; j <= a.length; j++) { matrix[0][j] = j; }
                            for (i = 1; i <= b.length; i++) {
                                for (j = 1; j <= a.length; j++) {
                                    if (b.charAt(i - 1) === a.charAt(j - 1)) {
                                        matrix[i][j] = matrix[i - 1][j - 1];
                                    } else {
                                        matrix[i][j] = Math.min(
                                            matrix[i - 1][j - 1] + 1,
                                            Math.min(matrix[i][j - 1] + 1, matrix[i - 1][j] + 1)
                                        );
                                    }
                                }
                            }
                            return matrix[b.length][a.length];
                        }
                        
                        // Hàm tính tỉ lệ giống nhau
                        function similarity(a, b) {
                            let longer = a, shorter = b;
                            if (a.length < b.length) {
                                longer = b; shorter = a;
                            }
                            const longerLength = longer.length;
                            if (longerLength === 0) return 1.0;
                            return (longerLength - levenshtein(longer, shorter)) / parseFloat(longerLength);
                        }

                        if (choiceText && correctAnswerData.text) {
                            // Áp dụng normalizeText để tìm khớp fuzzy
                            const normChoiceText = normalizeText(escapeHtml(choiceText));
                            const normCorrectText = normalizeText(escapeHtml(correctAnswerData.text));
                            
                            currentSimilarity = similarity(normChoiceText, normCorrectText);
                            if (currentSimilarity >= 0.995) {
                                // Cập nhật best match nếu có độ tương đồng cao hơn
                                if (currentSimilarity > bestSimilarity) {
                                    bestMatch = { choiceElement, choiceText, similarity: currentSimilarity };
                                    bestSimilarity = currentSimilarity;
                                }
                            }
                        }
                    }
                }

                // So khớp hình ảnh và audio nếu có và text đã khớp
                if (bestMatch) {
                    // So khớp hình ảnh
                    if (Array.isArray(correctAnswerData.imageHashes) &&
                        correctAnswerData.imageHashes.length > 0 &&
                        bestMatch.choiceElement) {
                        
                        const choiceImages = [...bestMatch.choiceElement.querySelectorAll('img')].map(img => img.src);
                        const processedChoiceImages = await processImages(choiceImages);
                        const choiceImageHashes = processedChoiceImages?.map(img => img.hash) || [];
                        
                        const allImageHashesMatch = correctAnswerData.imageHashes.every(hash => 
                            choiceImageHashes.includes(hash)
                        );
                        
                        if (!allImageHashesMatch) {
                            bestMatch = null;
                            bestSimilarity = 0;
                        }
                    }
                    
                    // So khớp audio (nếu có trong backend data)
                    if (bestMatch && Array.isArray(correctAnswerData.audioHashes) &&
                        correctAnswerData.audioHashes.length > 0) {
                        
                        // Lấy audio hashes từ choice (nếu có)
                        const choiceAudios = bestMatch.choiceElement.querySelectorAll('audio, span.mediaplugin_mp3, span.mediaplugin');
                        const processedChoiceAudios = await processAudio(choiceAudios);
                        const choiceAudioHashes = processedChoiceAudios?.map(audio => audio.hash) || [];
                        
                        const allAudioHashesMatch = correctAnswerData.audioHashes.every(hash => 
                            choiceAudioHashes.includes(hash)
                        );
                        
                        if (!allAudioHashesMatch) {
                            bestMatch = null;
                            bestSimilarity = 0;
                        }
                    }
                }

                // Sử dụng best match để đánh dấu input
                if (bestMatch) {
                    const input = bestMatch.choiceElement.querySelector('input[type="radio"], input[type="checkbox"]');
                        if (input) {
                            input.checked = true;
                            foundCorrectAnswer = true;
                            filledCount++;
                        
                        // Cập nhật thông tin chi tiết
                        questionDetail.status = bestMatch.similarity === 1.0 ? 'exact' : 'fuzzy';
                        questionDetail.answer = bestMatch.choiceText;
                        questionDetail.similarity = bestMatch.similarity;
                        questionDetail.isAi = answerData.ai === true;
                        
                        // Lưu thông tin hình ảnh và audio của câu trả lời được chọn
                        const choiceElement = bestMatch.choiceElement;
                        const choiceImages = [...choiceElement.querySelectorAll('img')].map(img => img.src);
                        const processedChoiceImages = await processImages(choiceImages);
                        const choiceAudios = choiceElement.querySelectorAll('audio, span.mediaplugin_mp3, span.mediaplugin');
                        const processedChoiceAudios = await processAudio(choiceAudios);
                        
                        questionDetail.answerImages = processedChoiceImages || [];
                        questionDetail.answerAudios = processedChoiceAudios || [];
                        
                        if (bestMatch.similarity === 1.0) {
                            exactMatches++;
                        } else {
                            fuzzyMatches++;
                        }
                        
                        // Thống kê AI vs Database
                        if (answerData.ai === true) {
                            aiAnswers++;
                        } else {
                            dbAnswers++;
                        }
                        
                        break;
                    }
                }
            }
        }

        if (!foundCorrectAnswer) {
            notFound++;
        }
        
        // Thêm chi tiết câu hỏi vào danh sách
        details.push(questionDetail);
    }

    const nextPageButton = document.querySelector('.submitbtns input[name="next"][value="Tiếp theo"]');

    // Kiểm tra cài đặt trước khi hiển thị widget
    chrome.storage.local.get('showResultWidget', (data) => {
        // Mặc định là true nếu chưa được cài đặt
        const showWidget = data.showResultWidget === undefined ? true : data.showResultWidget;
        
        if (showWidget) {
            // Hiển thị popup kết quả
            createOrUpdateFillResultWidget({
                totalQuestions: questionElements.length,
                filledCount,
                exactMatches,
                fuzzyMatches,
                notFound,
                aiAnswers,
                dbAnswers,
                details: details, // Pass the raw details array
                hasNextPage: !!nextPageButton // Pass the existence of the next button
            });
        } else {
            // Nếu cài đặt là tắt, đảm bảo widget bị xóa
            const widget = document.getElementById('fill-result-widget');
            const bubble = document.getElementById('fill-result-bubble');
            if (widget) widget.remove();
            if (bubble) bubble.remove();
        }
    });
}

// Hàm tạo và quản lý widget kết quả
function createOrUpdateFillResultWidget(results) {
    const widgetId = 'fill-result-widget';
    const bubbleId = 'fill-result-bubble';
    let widget = document.getElementById(widgetId);
    let bubble = document.getElementById(bubbleId);

    // 1. CREATE WIDGET AND BUBBLE IF THEY DON'T EXIST
    if (!widget) {
        // Create the main widget
        widget = document.createElement('div');
        widget.id = widgetId;
        Object.assign(widget.style, {
            position: 'fixed',
            top: '15%',
            left: '50%',
            transform: 'translateX(-50%)',
            background: 'white',
            border: '2px solid #2196F3',
            borderRadius: '8px',
            boxShadow: '0 4px 20px rgba(0,0,0,0.3)',
            zIndex: 10001,
            maxWidth: '500px',
            width: '90%',
            maxHeight: '80vh',
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden' // To contain rounded corners
        });

        widget.innerHTML = `
            <div id="fill-result-header" style="padding: 8px 12px; background: #2196F3; color: white; cursor: move; border-top-left-radius: 6px; border-top-right-radius: 6px; display: flex; justify-content: space-between; align-items: center;">
                <h3 style="margin: 0; font-size: 16px; color: white;">📊 Kết quả điền đáp án</h3>
                <div>
                    <button id="minimize-fill-result" title="Thu nhỏ" style="background:none; border:none; color:white; font-size:20px; cursor:pointer; padding:0 5px;">—</button>
                    <button id="close-fill-result" title="Đóng" style="background:none; border:none; color:white; font-size:20px; cursor:pointer; padding:0 5px;">×</button>
                </div>
            </div>
            <div id="fill-result-content" style="padding: 16px; overflow-y: auto; background: #fff;">
                <!-- Content will be injected here -->
            </div>
        `;
        document.body.appendChild(widget);

        // Create the bubble (minimized state)
        bubble = document.createElement('div');
        bubble.id = bubbleId;
        bubble.title = 'Hiện lại kết quả';
        bubble.innerHTML = '📊';
        // Start hidden
        bubble.classList.add('ehou-hidden');
        Object.assign(bubble.style, {
            position: 'fixed',
            bottom: '30px',
            right: '30px',
            width: '50px',
            height: '50px',
            background: '#2196F3',
            color: 'white',
            borderRadius: '50%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '24px',
            cursor: 'pointer',
            boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
            zIndex: 10000
        });
        document.body.appendChild(bubble);

        // Add event listeners for widget controls
        document.getElementById('minimize-fill-result').addEventListener('click', () => {
            widget.classList.add('ehou-hidden');
            bubble.classList.remove('ehou-hidden');
        });

        document.getElementById('close-fill-result').addEventListener('click', () => {
            widget.remove();
            bubble.remove();
        });

        bubble.addEventListener('click', () => {
            widget.classList.remove('ehou-hidden');
            bubble.classList.add('ehou-hidden');
        });

        // Make the widget draggable
        makeDraggable(widget);
        
        // Hide it initially for the entry animation
        widget.classList.add('ehou-hidden');
    }

    // 2. UPDATE WIDGET CONTENT
    const { 
        totalQuestions, filledCount, exactMatches, fuzzyMatches, notFound, 
        aiAnswers, dbAnswers, details, hasNextPage 
    } = results;

    const contentEl = document.getElementById('fill-result-content');
    
    contentEl.innerHTML = `
        <div style="margin-bottom: 8px;"><span style="font-weight: bold;">Tổng số câu hỏi:</span> ${totalQuestions}</div>
        <div style="margin-bottom: 8px;"><span style="font-weight: bold; color: #4CAF50;">✅ Đã điền:</span> ${filledCount} câu</div>
        <div style="margin-bottom: 8px;"><span style="font-weight: bold; color: #2196F3;">🎯 Khớp chính xác 100%:</span> ${exactMatches} câu</div>
        <div style="margin-bottom: 8px;">
            <span style="font-weight: bold; color: #FF9800;">⚠️ Khớp fuzzy 99.5%:</span> ${fuzzyMatches} câu
            <div style="font-size: 12px; color: #666; margin-top: 4px;">Vui lòng kiểm tra lại các câu này!</div>
        </div>
        <div style="margin-bottom: 12px;"><span style="font-weight: bold; color: #F44336;">❌ Không tìm thấy:</span> ${notFound} câu</div>
        <hr style="margin: 12px 0; border: 1px solid #ddd;">
        <div style="margin-bottom: 8px;"><span style="font-weight: bold; color: #9C27B0;">🤖 Đáp án từ AI:</span> ${aiAnswers} câu</div>
        <div style="margin-bottom: 8px;"><span style="font-weight: bold; color: #607D8B;">💾 Đáp án từ Dữ liệu:</span> ${dbAnswers} câu</div>
        
        ${details && details.length > 0 ? `
            <div style="max-height: 200px; overflow-y: auto; border: 1px solid #ddd; padding: 8px; background: #f9f9f9; margin-top: 12px;">
                <div style="font-weight: bold; margin-bottom: 6px;">Chi tiết:</div>
                ${details.map((detail, index) => {
                    const statusIcon = detail.status === 'exact' ? '🎯' : detail.status === 'fuzzy' ? '⚠️' : '❌';
                    const statusColor = detail.status === 'exact' ? '#4CAF50' : detail.status === 'fuzzy' ? '#FF9800' : '#F44336';
                    const similarityText = detail.similarity > 0 ? ` (${(detail.similarity * 100).toFixed(1)}%)` : '';
                    const aiIcon = detail.isAi ? '🤖' : '💾';
                    const aiText = detail.isAi ? 'AI' : 'DB';
                    
                    // Xử lý nội dung câu hỏi để hiển thị hình ảnh/audio thay vì placeholder
                    let processedQuestionText = detail.question;
                    let questionImagesHtml = '';
                    let questionAudioHtml = '';
                    let processedAnswerText = detail.answer || ''; // Định nghĩa ở scope cao hơn
                    
                    // Nếu có placeholder [IMG:hash] hoặc [AUDIO:hash], xử lý chúng
                    if (detail.rawQuestion && (detail.rawQuestion.includes('[IMG:') || detail.rawQuestion.includes('[AUDIO:'))) {
                        
                        // Tạo một object giả để truyền vào processContentWithImages
                        const fakeItem = {
                            content: {
                                text: detail.rawQuestion,
                                images: detail.images || [],
                                audios: detail.audios || []
                            }
                        };
                        
                        // Thử nhiều cấu trúc dữ liệu khác nhau cho images
                        let imageUrls = [];
                        let imageHashes = [];
                        
                        if (Array.isArray(detail.images)) {
                            // Cấu trúc: detail.images là array của objects
                            detail.images.forEach(img => {
                                if (typeof img === 'object') {
                                    if (img.url) imageUrls.push(img.url);
                                    if (img.hash) imageHashes.push(img.hash);
                                } else if (typeof img === 'string') {
                                    imageUrls.push(img);
                                }
                            });
                        }
                                                
                        // Cập nhật fakeItem với dữ liệu thực tế
                        fakeItem.content.images = imageUrls.map(url => ({ url }));
                        fakeItem.content.imageHashes = imageHashes;
                        
                        const result = processContentWithImages(detail.rawQuestion, fakeItem);
                        processedQuestionText = result.processedContent;
                        questionImagesHtml = result.questionImagesHtml;
                        
                        // Nếu vẫn còn placeholder, thử xử lý thủ công
                        if (processedQuestionText.includes('[IMG:') || processedQuestionText.includes('[AUDIO:')) {
                            
                            // Thay thế placeholder thủ công
                            processedQuestionText = detail.rawQuestion.replace(/\[IMG:([^\]]+)\]/g, (match, hash) => {
                                
                                // Tìm index của hash trong imageHashes
                                const hashIndex = imageHashes.indexOf(hash);
                                
                                if (hashIndex !== -1 && imageUrls[hashIndex]) {
                                    const imageUrl = imageUrls[hashIndex];
                                    return `<img src="${imageUrl}" style="max-width:80px;max-height:80px;margin:4px 0;display:inline-block;vertical-align:middle;" />`;
                                } else {
                                    return match; // Giữ nguyên nếu không tìm thấy
                                }
                            });
                            
                            processedQuestionText = processedQuestionText.replace(/\[AUDIO:([^\]]+)\]/g, (match, hash) => {
                                return `<audio controls style="max-width:80px;max-height:40px;margin:4px 0;display:inline-block;vertical-align:middle;"><source src="${hash}" type="audio/mpeg"></audio>`;
                            });
                            
                        }
                        
                        // Cắt ngắn text nếu cần (chỉ text thuần, không có HTML)
                        const tempDiv = document.createElement('div');
                        tempDiv.innerHTML = processedQuestionText;
                        const plainText = tempDiv.textContent || tempDiv.innerText || '';
                        if (plainText.length > 100) {
                            // Tạo text cắt ngắn và giữ lại HTML hình ảnh
                            const shortText = plainText.substring(0, 100) + '...';
                            processedQuestionText = shortText + questionImagesHtml;
                        }
                        
                        // Xử lý placeholder cho đáp án được chọn
                        let processedAnswerText = detail.answer || '';
                        
                        if (detail.answer && (detail.answer.includes('[IMG:') || detail.answer.includes('[AUDIO:'))) {                        
                            
                            // Sử dụng answerImages thay vì images cho câu trả lời
                            let answerImageUrls = [];
                            let answerImageHashes = [];
                            
                            if (Array.isArray(detail.answerImages)) {
                                detail.answerImages.forEach(img => {
                                    if (typeof img === 'object') {
                                        if (img.url) answerImageUrls.push(img.url);
                                        if (img.hash) answerImageHashes.push(img.hash);
                                    } else if (typeof img === 'string') {
                                        answerImageUrls.push(img);
                                    }
                                });
                            }
                            
                            // Tìm tất cả placeholder trong answer
                            processedAnswerText = detail.answer.replace(/\[IMG:([^\]]+)\]/g, (match, hash) => {
                                const hashIndex = answerImageHashes.indexOf(hash);
                                
                                if (hashIndex !== -1 && answerImageUrls[hashIndex]) {
                                    const imageUrl = answerImageUrls[hashIndex];
                                    return `<img src="${imageUrl}" style="max-width:60px;max-height:60px;margin:2px 0;display:inline-block;vertical-align:middle;border:1px solid red;" onload="logger.debugLogWithEmoji('Answer image loaded successfully:', '${imageUrl}')" onerror="logger.debugLogWithEmoji('Answer image failed to load:', '${imageUrl}')" />`;
                                } else {                                                                
                                    // Thử tìm trong detail.answerImages nếu không tìm thấy trong answerImageHashes
                                    if (Array.isArray(detail.answerImages)) {
                                        for (let i = 0; i < detail.answerImages.length; i++) {
                                            const img = detail.answerImages[i];
                                            if (typeof img === 'object' && img.hash === hash) {
                                                return `<img src="${img.url}" style="max-width:60px;max-height:60px;margin:2px 0;display:inline-block;vertical-align:middle;border:1px solid red;" onload="logger.debugLogWithEmoji('Answer image loaded successfully (fallback):', '${img.url}')" onerror="logger.debugLogWithEmoji('Answer image failed to load (fallback):', '${img.url}')" />`;
                                            }
                                        }
                                    }
                                    
                                    return match;
                                }
                            });
                            
                            processedAnswerText = processedAnswerText.replace(/\[AUDIO:([^\]]+)\]/g, (match, hash) => {
                                return `<audio controls style="max-width:60px;max-height:30px;margin:2px 0;display:inline-block;vertical-align:middle;"><source src="${hash}" type="audio/mpeg"></audio>`;
                            });                                        
                        }
                    }
  
                    if (detail.answer && (detail.answer.includes('[IMG:') || detail.answer.includes('[AUDIO:'))) {
                        // Nếu không có placeholder trong câu hỏi, vẫn xử lý đáp án nếu cần
                        processedAnswerText = detail.answer || '';

                        if (detail.answer && (detail.answer.includes('[IMG:') || detail.answer.includes('[AUDIO:'))) {
                            // Tạo lại answerImageHashes và answerImageUrls từ detail.answerImages
                            let answerImageUrls = [];
                            let answerImageHashes = [];

                            if (Array.isArray(detail.answerImages)) {
                                detail.answerImages.forEach(img => {
                                    if (typeof img === 'object') {
                                        if (img.url) answerImageUrls.push(img.url);
                                        if (img.hash) answerImageHashes.push(img.hash);
                                    } else if (typeof img === 'string') {
                                        answerImageUrls.push(img);
                                    }
                                });
                            }

                            processedAnswerText = detail.answer.replace(/\[IMG:([^\]]+)\]/g, (match, hash) => {
                                const hashIndex = answerImageHashes.indexOf(hash);
                                if (hashIndex !== -1 && answerImageUrls[hashIndex]) {
                                    const imageUrl = answerImageUrls[hashIndex];
                                    return `<img src="${imageUrl}" style="max-width:60px;max-height:60px;margin:2px 0;display:inline-block;vertical-align:middle;border:1px solid blue;" onload="logger.debugLogWithEmoji('Fallback answer image loaded successfully:', '${imageUrl}')" onerror="logger.debugLogWithEmoji('Fallback answer image failed to load:', '${imageUrl}')" />`;
                                } else {
                                    return match;
                                }
                            });

                            processedAnswerText = processedAnswerText.replace(/\[AUDIO:([^\]]+)\]/g, (match, hash) => {
                                return `<audio controls style="max-width:60px;max-height:30px;margin:2px 0;display:inline-block;vertical-align:middle;"><source src="${hash}" type="audio/mpeg"></audio>`;
                            });
                        }
                    }
                    
                    // Debug: Log the complete HTML structure being generated
                    const detailHtml = `
                        <div class="fill-result-detail-item" 
                             data-question-id="${detail.questionId}"
                             style="margin-bottom: 4px; font-size: 12px; cursor: pointer; padding: 4px 6px; border-radius: 4px;"
                             onmouseover="this.style.background='#f0f8ff'"
                             onmouseout="this.style.background='transparent'">
                            <span style="color: ${statusColor}; font-weight: bold;">${statusIcon} Câu ${index + 1}:</span> 
                            <span style="color: #666; font-weight: bold;">${aiIcon} ${aiText}</span>
                            ${processMediaPlaceholders(escapeHtmlExceptValidMedia(processedQuestionText), detail)}
                            ${questionImagesHtml}
                            ${questionAudioHtml}
                            ${detail.answer ? `<br><span style="margin-left: 20px;">→ ${processMediaPlaceholders(escapeHtmlExceptValidMedia(processedAnswerText), detail)}${similarityText}</span>` : ''}
                        </div>`;                                    
                    return detailHtml;
                }).join('')}
            </div>
        ` : ''}
        
        ${hasNextPage ? `
            <div style="text-align: center; margin-top: 15px; padding-top: 15px; border-top: 1px solid #eee;">
                <button id="widget-next-page-btn" style="background: linear-gradient(to right, #28a745, #218838); color: white; border: none; padding: 10px 20px; border-radius: 8px; cursor: pointer; font-size: 16px; font-weight: bold; width: 100%;">
                    Trang Tiếp Theo &rarr;
                </button>
            </div>
        ` : ''}
    `;
    
    // Add event listener for click-to-scroll on updated content
    contentEl.querySelectorAll('.fill-result-detail-item').forEach(item => {
        item.addEventListener('click', () => {
            const questionId = item.dataset.questionId;
            const questionElement = document.getElementById(questionId);
            if (questionElement) {
                questionElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
                highlightElement(questionElement);
            }
        });
    });

    // Add listener for the new next page button
    if (hasNextPage) {
        const widgetNextBtn = contentEl.querySelector('#widget-next-page-btn');
        if (widgetNextBtn) {
            widgetNextBtn.addEventListener('click', () => {
                const originalNextBtn = document.querySelector('.submitbtns input[name="next"][value="Tiếp theo"]');
                if (originalNextBtn) {
                    originalNextBtn.click();
                }
            });
        }
    }

    // 3. ENSURE WIDGET IS VISIBLE AFTER UPDATE
    // Use a timeout to allow the DOM to update before triggering the animation
    setTimeout(() => {
        widget.classList.remove('ehou-hidden');
        if (bubble) bubble.classList.add('ehou-hidden');
    }, 50);
}

// Helper function to make an element draggable
function makeDraggable(element) {
    const header = element.querySelector('#fill-result-header');
    if (!header) return;
    let pos1 = 0, pos2 = 0, pos3 = 0, pos4 = 0;

    header.onmousedown = dragMouseDown;

    function dragMouseDown(e) {
        e = e || window.event;
        e.preventDefault();
        pos3 = e.clientX;
        pos4 = e.clientY;
        document.onmouseup = closeDragElement;
        document.onmousemove = elementDrag;
    }

    function elementDrag(e) {
        e = e || window.event;
        e.preventDefault();
        pos1 = pos3 - e.clientX;
        pos2 = pos4 - e.clientY;
        pos3 = e.clientX;
        pos4 = e.clientY;
        element.style.top = (element.offsetTop - pos2) + "px";
        element.style.left = (element.offsetLeft - pos1) + "px";
        element.style.transform = 'none'; // Override the centering transform
    }

    function closeDragElement() {
        document.onmouseup = null;
        document.onmousemove = null;
    }
}

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    switch (request.type) {
        case "getQuestions": {
            getQuestions().then(async questions => {
                const subjectCode = await getSubjectCodeWithFallback();
                sendResponse({questions, subjectCode});
            });
            return true; // Đảm bảo trả về bất đồng bộ
        }
        case "saveQuestions":
            saveFullQuestions().then((result) => {
                sendResponse(result);
            });
            return true; // Đảm bảo trả về bất đồng bộ
        case "contextSearch": {
            getSubjectCodeWithFallback().then(subjectCode => {
                if (!subjectCode) return;

                // Tính vị trí popup từ vùng selection
                const selection = window.getSelection();
                if (!selection.rangeCount) return;

                const range = selection.getRangeAt(0);
                const rect = range.getBoundingClientRect();

                searchAndShowPopup(request.question, subjectCode, rect);
            });
            return true; // Đảm bảo trả về bất đồng bộ
        }
        case "getSubjectCode": {
            getSubjectCodeWithFallback().then(subjectCode => {
                sendResponse({subjectCode});
            });
            return true; // Đảm bảo trả về bất đồng bộ
        }
        // ✅ Case mới để nhận dữ liệu thô từ backend và điền đáp án
        case "backendAnswers": {
            const serverData = request.serverData;
            if (serverData && Array.isArray(serverData)) {
                const answerMap = convertToAnswerMap(serverData);
                const hashAnswerMap = buildHashAnswerMap(serverData);
                fillAnswers(answerMap, hashAnswerMap).then(() => {
                    // Trả về phản hồi sau khi fillAnswers hoàn thành (nếu fillAnswers là async)
                    sendResponse({status: "filled"});
                });
                 return true; // Quan trọng: Báo hiệu sendResponse sẽ được gọi bất đồng bộ
            } else {
                sendResponse({status: "failed", error: "Invalid serverData"});
            }
             break; // break ở đây vì return true đã handle async response
        }

        default:
            break;
    }
    return true;
});

// Listener to reactively remove widget if setting is turned off
chrome.storage.onChanged.addListener((changes, namespace) => {
    if (namespace === 'local' && changes.showResultWidget) {
        if (changes.showResultWidget.newValue === false) {
            const widget = document.getElementById('fill-result-widget');
            const bubble = document.getElementById('fill-result-bubble');
            
            // Animate out and remove
            if (widget && !widget.classList.contains('ehou-hidden')) {
                widget.classList.add('ehou-hidden');
                setTimeout(() => widget.remove(), 300); // Remove after animation
            }
            if (bubble && !bubble.classList.contains('ehou-hidden')) {
                bubble.classList.add('ehou-hidden');
                setTimeout(() => bubble.remove(), 300);
            }
        }
    }
});

// Helper function to create display structure with media placeholders
function createDisplayStructure(questionElement) {
    const questionText = extractTextWithMediaPlaceholders(questionElement);
    const images = [...questionElement.querySelectorAll('img')].map(img => img.src);
    const audios = questionElement.querySelectorAll('audio, span.mediaplugin_mp3, span.mediaplugin');
    
    return {
        text: questionText,
        images: images,
        audios: audios
    };
}

// Xây map questionHash -> danh sách/đối tượng đáp án từ dữ liệu BE
function buildHashAnswerMap(serverData) {
    const map = {};
    if (!Array.isArray(serverData)) return map;
    for (const item of serverData) {
        const qh = item?.questionHash;
        if (!qh) continue;
        if (!map[qh]) map[qh] = [];
        map[qh].push(item);
    }
    return map;
}

// Helper function to convert old data structure to new format for backward compatibility
function convertOldToNewStructure(oldData) {
    if (!oldData) return oldData;
    
    // If it's already in new format, return as is
    if (oldData.content && typeof oldData.content === 'object') {
        return oldData;
    }
    
    // Convert old format to new format
    return {
        content: {
            text: oldData.content || oldData.text || '',
            images: oldData.imageUrls ? oldData.imageUrls.map(url => ({ url })) : [],
            audios: []
        },
        choices: (oldData.choices || []).map(choice => {
            if (typeof choice === 'string') {
                return { text: choice, images: [], audios: [] };
            }
            return {
                text: choice.text || choice,
                images: choice.imageUrls ? choice.imageUrls.map(url => ({ url })) : [],
                audios: []
            };
        }),
        correctAnswer: oldData.correctAnswer,
        explanation: oldData.explanation || '',
        ai: oldData.ai || false
    };
}

// Helper function to get question ID from questionflagpostdata
function getQid(root) {
    const el = root.querySelector("input.questionflagpostdata");
    if (!el) return null;
    try {
        const params = new URLSearchParams(el.value);
        return params.get("qid");
    } catch {
        return null;
    }
}

// Helper function to extract gaps for completion questions
function extractGapfill(questionElement) {
    const gaps = [];
    
    // cố gắng map theo index ổn định từ name *_pN
    const inputs = questionElement.querySelectorAll('input[type="text"], input[type="search"], input[type="tel"], textarea');
    
    if (inputs.length) {
        inputs.forEach((inp, index) => {
            
            const idx = getGapIndexFromName(inp.name);
            
            if (idx == null) return;
            let v = null;
            
            // Strategy 1: If input is incorrect, prioritize feedback over input value
            if (inp.classList.contains("incorrect")) {
                // Look for feedback in the same parent element, after this input
                const parent = inp.parentElement;
                if (parent) {
                    // Get all elements after this input in the same parent
                    const allElements = Array.from(parent.children);
                    const inputIndex = allElements.indexOf(inp);
                    
                    // Look for feedback elements after this input
                    for (let i = inputIndex + 1; i < allElements.length; i++) {
                        const el = allElements[i];
                        const feedbackEl = el.querySelector('[title="Correct answer"], .rightanswer, .aftergapfeedback');
                        if (feedbackEl) {
                            v = feedbackEl.textContent?.replace(/^\[|\]$/g, "")?.trim() || "";
                            break;
                        }
                        // Also check if the element itself is a feedback element
                        if (el.matches('[title="Correct answer"], .rightanswer, .aftergapfeedback')) {
                            v = el.textContent?.replace(/^\[|\]$/g, "")?.trim() || "";
                            break;
                        }
                    }
                }
                
                // Fallback to closest method if not found
                if (!v) {
                    const fb = inp.closest("p,td,div,li")?.querySelector('[title="Correct answer"], .rightanswer, .aftergapfeedback');
                    v = fb?.textContent?.replace(/^\[|\]$/g, "")?.trim() || "";
                }
                
                // If still no feedback found for incorrect input, skip this gap to avoid wrong data
                if (!v) {
                    return; // Skip this gap entirely
                }
            }
            
            // Strategy 2: If input is correct, use input value
            if (!v && inp.classList.contains("correct")) {
                v = inp.value?.trim() || "";
            }
            
            // Strategy 3: If no value and input is disabled (completed quiz), try to get value
            if (!v && inp.disabled && inp.value) {
                v = inp.value.trim();
            }
            
            // Strategy 4: Try to get from feedback elements (fallback)
            if (!v) {
                const fb = inp.closest("p,td,div,li")?.querySelector('[title="Correct answer"], .rightanswer, .aftergapfeedback');
                v = fb?.textContent?.replace(/^\[|\]$/g, "")?.trim() || "";
            }
            
            // Strategy 4: For table-based gapfill (new case), try to get from cell content
            if (!v) {
                const cell = inp.closest('td');
                if (cell) {
                    // Look for text content in the same cell that might be the answer
                    const cellText = cell.textContent?.trim() || "";
                    
                    // Try to extract answer from cell text
                    // Look for patterns like "value" or text that looks like an answer
                    const lines = cellText.split('\n').map(line => line.trim()).filter(line => line);
                    
                    // Find the line that contains the input value or looks like an answer
                    for (const line of lines) {
                        // Skip lines that look like descriptions or instructions
                        if (line.length > 0 && 
                            !line.includes('to ') && 
                            !line.includes('a reason') && 
                            !line.includes('not to') &&
                            !line.includes('bad in') &&
                            !line.includes('allow something') &&
                            line.length < 50) { // Reasonable answer length
                            v = line;
                            break;
                        }
                    }
                }
            }
            
            
            if (v) {
                const ex = gaps.find(g => g.index === idx);
                if (ex) {
                    if (!ex.correctValues.includes(v)) ex.correctValues.push(v);
                } else {
                    gaps.push({ index: idx, correctValues: [v] });
                }
            }
        });
    } else {
        // fallback nếu không tìm thấy input (ít gặp) - original logic
        questionElement.querySelectorAll('[title="Correct answer"], .rightanswer, .aftergapfeedback').forEach((fb, i) => {
            const v = fb.textContent.replace(/^\[|\]$/g, "").trim();
            if (v) gaps.push({ index: i + 1, correctValues: [v] }); // đánh số 1-based tạm thời
        });
    }
    
    return gaps.sort((a,b)=>a.index-b.index);
}

// Điền đáp án cho câu COMPLETION_WITH_CHOICES dựa vào danh sách gaps [{index, correctValues}]
function applyGapAnswers(questionElement, gaps) {
    const inputs = questionElement.querySelectorAll('input[type="text"], input[type="search"], input[type="tel"], textarea');
    let filled = 0;
    const total = gaps?.length || 0;
    if (!inputs.length || !Array.isArray(gaps) || gaps.length === 0) return { filled, total };

    const gapMap = new Map();
    gaps.forEach(g => {
        if (g && typeof g.index === 'number' && Array.isArray(g.correctValues) && g.correctValues.length > 0) {
            gapMap.set(g.index, g.correctValues[0]);
        }
    });

    const tipVals = [];
    const HINT_STYLE = { outline: '3px solid #22c55e', bg: 'rgba(34,197,94,.12)' };
    const fire = (el) => {
        try {
            el.dispatchEvent(new Event('input', { bubbles: true }));
            el.dispatchEvent(new Event('change', { bubbles: true }));
            el.dispatchEvent(new Event('blur', { bubbles: true }));
        } catch {}
    };

    inputs.forEach((inp) => {
        const idx = getGapIndexFromName(inp.name);
        if (idx != null && gapMap.has(idx)) {
            const val = gapMap.get(idx);
            if (typeof val === 'string' && val.length > 0) {
                inp.value = val;
                // Kích hoạt sự kiện để Moodle ghi nhận
                fire(inp);
                // Gợi ý trực quan
                inp.style.outline = HINT_STYLE.outline;
                inp.style.background = HINT_STYLE.bg;
                tipVals.push(val);
                filled++;
            }
        }
    });

    // Hiển thị badge gợi ý ở khu vực stem
    try {
        if (tipVals.length) {
            const stemEl = questionElement.querySelector('.qtext, .questiontext, .content, .prompt') || questionElement;
            const badge = document.createElement('div');
            badge.innerHTML = `<b>Gợi ý ô trống:</b> ${tipVals.join(' | ')}`;
            Object.assign(badge.style, {
                position: 'absolute', zIndex: 9999, background: 'rgba(255,255,0,.95)',
                border: '1px solid #aaa', padding: '6px 8px', borderRadius: '8px',
                fontSize: '12px', boxShadow: '0 2px 6px rgba(0,0,0,.2)'
            });
            const r = stemEl.getBoundingClientRect();
            badge.style.top = (window.scrollY + r.top - 8) + 'px';
            badge.style.left = (window.scrollX + r.right + 8) + 'px';
            document.body.appendChild(badge);
            setTimeout(() => badge.remove(), 120000);
        }
    } catch {}

    return { filled, total };
}

// Helper function to get gap index from input name
function getGapIndexFromName(name) {
    if (!name) return null;
    
    // Try multiple patterns to ensure backward compatibility
    const patterns = [
        /[:_]p(\d+)/,           // q14945179:19_p1, q123_p1
        /_p(\d+)/,              // original pattern: q123_p1
        /:p(\d+)/,              // q123:p1
        /p(\d+)/,               // p1, p2, etc.
        /gap(\d+)/,             // gap1, gap2, etc.
        /(\d+)$/                // just number at the end
    ];
    
    for (const pattern of patterns) {
        const m = pattern.exec(name);
        if (m) {
            const idx = parseInt(m[1], 10);
            if (!isNaN(idx) && idx > 0) {
                return idx;
            }
        }
    }
    
    return null;
}

// Helper function to normalize text for stem_hash
function normalizeText(str) {
    const div = document.createElement("div");
    div.innerHTML = str ?? "";
    let t = (div.textContent || "").toLowerCase();
    t = t.normalize("NFD").replace(/\p{Diacritic}/gu, "");
    t = t.replace(/[^\p{Letter}\p{Number}\s]/gu, " ");
    t = t.replace(/\s+/g, " ").trim();
    return t;
}

// Helper function to generate text hash
function textHash(t) {
    const fnv1a = (str) => {
        let h = 0x811c9dc5 >>> 0;
        for (let i = 0; i < str.length; i++) {
            h ^= str.charCodeAt(i);
            h = (h + ((h<<1)+(h<<4)+(h<<7)+(h<<8)+(h<<24))) >>> 0;
        }
        return ("00000000" + h.toString(16)).slice(-8);
    };
    return fnv1a(normalizeText(t || ""));
}

// Helper function to determine question type based on HTML structure
function getQuestionType(questionElement) {
    if (!questionElement) return 'SINGLE_CHOICE'; // Default fallback
    
    // Check for specific question classes first (most reliable)
    if (questionElement.classList.contains("gapfill") || 
        questionElement.classList.contains("cloze")) {
        return 'COMPLETION_WITH_CHOICES';
    }
    
    if (questionElement.classList.contains("truefalse")) {
        return 'TRUE_FALSE';
    }
    
    if (questionElement.classList.contains("multichoice")) {
        // For multichoice, need to determine if single or multiple
        const checkboxInputs = questionElement.querySelectorAll('input[type="checkbox"]');
        const radioInputs = questionElement.querySelectorAll('input[type="radio"]');
        
        if (checkboxInputs.length > 0) {
            return 'MULTIPLE_CHOICE';
        }
        
        if (radioInputs.length > 0) {
            return 'SINGLE_CHOICE';
        }
        
        // If no inputs found, check for other indicators
        const promptElement = questionElement.querySelector('.prompt');
        if (promptElement) {
            const promptText = promptElement.innerText.toLowerCase();
            if (promptText.includes('chọn nhiều câu trả lời') || 
                promptText.includes('select multiple answers') ||
                promptText.includes('choose multiple answers')) {
                return 'MULTIPLE_CHOICE';
            }
        }
        
        // Default for multichoice is single choice
        return 'SINGLE_CHOICE';
    }
    
    // Fallback: check input types if no specific classes found
    const radioInputs = questionElement.querySelectorAll('input[type="radio"]');
    const checkboxInputs = questionElement.querySelectorAll('input[type="checkbox"]');
    
    if (checkboxInputs.length > 0) {
        return 'MULTIPLE_CHOICE';
    }
    
    if (radioInputs.length > 0) {
        return 'SINGLE_CHOICE';
    }
    
    // Final fallback: check text patterns
    const promptElement = questionElement.querySelector('.prompt');
    if (promptElement) {
        const promptText = promptElement.innerText.toLowerCase();
        
        if (promptText.includes('chọn một câu trả lời') || 
            promptText.includes('select one answer') ||
            promptText.includes('choose one answer')) {
            return 'SINGLE_CHOICE';
        }
        
        if (promptText.includes('chọn nhiều câu trả lời') || 
            promptText.includes('select multiple answers') ||
            promptText.includes('choose multiple answers')) {
            return 'MULTIPLE_CHOICE';
        }
        
        if (promptText.includes('đúng hay sai') || 
            promptText.includes('true or false') ||
            promptText.includes('true/false')) {
            return 'TRUE_FALSE';
        }
        
        if (promptText.includes('điền vào chỗ trống') || 
            promptText.includes('fill in the blank') ||
            promptText.includes('completion')) {
            return 'COMPLETION_WITH_CHOICES';
        }
    }
    
    // Default to single choice if we can't determine
    return 'SINGLE_CHOICE';
}

// Hàm tính độ tương đồng giữa hai chuỗi
function calculateSimilarity(str1, str2) {
    if (!str1 || !str2) return 0;
    
    // Hàm tính Levenshtein distance
    function levenshtein(a, b) {
        const matrix = [];
        let i;
        for (i = 0; i <= b.length; i++) { matrix[i] = [i]; }
        let j;
        for (j = 0; j <= a.length; j++) { matrix[0][j] = j; }
        for (i = 1; i <= b.length; i++) {
            for (j = 1; j <= a.length; j++) {
                if (b.charAt(i - 1) === a.charAt(j - 1)) {
                    matrix[i][j] = matrix[i - 1][j - 1];
                } else {
                    matrix[i][j] = Math.min(
                        matrix[i - 1][j - 1] + 1,
                        Math.min(matrix[i][j - 1] + 1, matrix[i - 1][j] + 1)
                    );
                }
            }
        }
        return matrix[b.length][a.length];
    }
    
    // Tính độ tương đồng
    let longer = str1, shorter = str2;
    if (str1.length < str2.length) {
        longer = str2; shorter = str1;
    }
    const longerLength = longer.length;
    if (longerLength === 0) return 1.0;
    return (longerLength - levenshtein(longer, shorter)) / parseFloat(longerLength);
}

// Helper function to create SHA-256 hash
async function createHash(str) {
    const encoder = new TextEncoder();
    const data = encoder.encode(str);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

// Cloudinary Configuration
const CLOUDINARY_CONFIG = {
    cloudName: 'dcwjsatj2',
    apiKey: '382524641892598',
    apiSecret: 'b8GUSgXDodXc3aDHX8zm4CSIv80',
    uploadPreset: 'easyquizehou',
    folder: 'ehou-audio'
};

// Helper function to upload audio file to Cloudinary
async function uploadAudioToCloudinary(audioUrl, audioHash, audioBase64, retryCount = 0) {
    const maxRetries = 2; // Reduced from 3 to 2 for faster failure detection
    
    try {
        let audioBlob;
        
        if (audioBase64) {
            // Use existing base64 data
            const binaryString = atob(audioBase64);
            const bytes = new Uint8Array(binaryString.length);
            for (let i = 0; i < binaryString.length; i++) {
                bytes[i] = binaryString.charCodeAt(i);
            }
            audioBlob = new Blob([bytes], { type: 'audio/mpeg' });
        } else {
            // Fallback: fetch the audio file from the original URL
            const response = await fetch(audioUrl);
            if (!response.ok) {
                throw new Error(`Failed to fetch audio: ${response.statusText}`);
            }
            audioBlob = await response.blob();
        }
        
        // Validate blob size (Cloudinary has limits)
        const maxSize = 100 * 1024 * 1024; // 100MB limit
        if (audioBlob.size > maxSize) {
            throw new Error(`Audio file too large: ${(audioBlob.size / 1024 / 1024).toFixed(2)}MB (max: 100MB)`);
        }
        
        // Create FormData for Cloudinary upload
        const formData = new FormData();
        formData.append('file', audioBlob, `audio_${audioHash}.mp3`);
        formData.append('upload_preset', CLOUDINARY_CONFIG.uploadPreset);
        formData.append('folder', CLOUDINARY_CONFIG.folder);
        formData.append('resource_type', 'video'); // Cloudinary uses 'video' for audio files
        
        // Upload to Cloudinary with timeout
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 30000); // 30 second timeout
        
        const uploadResponse = await fetch(`https://api.cloudinary.com/v1_1/${CLOUDINARY_CONFIG.cloudName}/video/upload`, {
            method: 'POST',
            body: formData,
            signal: controller.signal
        });
        
        clearTimeout(timeoutId);
        
        if (!uploadResponse.ok) {
            const errorText = await uploadResponse.text();
            throw new Error(`Cloudinary upload failed: ${uploadResponse.status} - ${errorText}`);
        }
        
        const uploadResult = await uploadResponse.json();
        
        return {
            originalUrl: audioUrl,
            cloudinaryUrl: uploadResult.secure_url,
            publicId: uploadResult.public_id,
            hash: audioHash,
            size: uploadResult.bytes,
            duration: uploadResult.duration
        };
    } catch (error) {
        
        // Retry logic for network errors with reduced delays
        if (retryCount < maxRetries && (
            error.message.includes('Failed to fetch') ||
            error.message.includes('NetworkError') ||
            error.message.includes('timeout') ||
            error.name === 'AbortError'
        )) {
            const retryDelay = (retryCount + 1) * 1000; // Reduced delay: 1s, 2s instead of 2s, 4s
            await new Promise(resolve => setTimeout(resolve, retryDelay));
            return uploadAudioToCloudinary(audioUrl, audioHash, audioBase64, retryCount + 1);
        }
        
        return {
            originalUrl: audioUrl,
            cloudinaryUrl: null,
            error: error.message,
            hash: audioHash,
            retryCount: retryCount
        };
    }
}

// Helper function to get Cloudinary URLs for existing files
// NOTE: This function is no longer needed with the new API format that returns existingFiles with URLs
// Keeping for backward compatibility
async function getFileUrls(hashes) {
    if (!hashes || hashes.length === 0) {
        return {};
    }
    
    return new Promise((resolve) => {
        chrome.runtime.sendMessage({
            type: "getFileUrls",
            payload: { hashes }
        }, (response) => {
            if (response && response.success) {
                resolve(response.data);
            } else {
                resolve({});
            }
        });
    });
}

// Helper function to upload multiple audio files to Cloudinary with progress tracking
// FLOW:
// 1. Extract all hashes from audio files
// 2. Check with backend which files already exist (get missingHashes and existingHashes)
// 3. Filter files to upload (only those in missingHashes)
// 4. Upload only missing files to Cloudinary
// 5. Get Cloudinary URLs for existing files from backend
// 6. Combine results and return all files with their Cloudinary URLs
async function uploadAudiosToCloudinary(audioList) {
    if (!audioList || audioList.length === 0) {
        return [];
    }
    
    // Extract all hashes for checking
    const allHashes = audioList.map(audio => audio.hash).filter(Boolean);
    
    // Check with backend which files already exist
    const hashCheckResult = await checkFileHashes(allHashes);
    
    // Check if session is expired
    if (hashCheckResult.sessionExpired) {
        return audioList.map(audio => ({
            originalUrl: audio.url,
            cloudinaryUrl: null,
            hash: audio.hash,
            status: 'session_expired'
        }));
    }
    
    // Note: If all files show as missing, it might mean:
    // 1. Backend doesn't have check-hashes logic yet (using fallback)
    // 2. All files are actually new and need upload
    // 3. Backend response structure is different than expected
    
    // Filter files that need upload (only those in missingHashes)
    const filesToUpload = filterAudioFilesForUpload(audioList, hashCheckResult.missingHashes);
    
    // If no files to upload due to missing base64, try to fetch them again
    if (filesToUpload.length === 0 && hashCheckResult.missingHashes.length > 0) {
        
        // Try to fetch base64 for files that are missing
        const filesWithBase64 = await Promise.all(audioList.map(async (audio) => {
            if (hashCheckResult.missingHashes.includes(audio.hash) && !audio.base64) {
                try {            
                    const response = await fetch(audio.url);
                    if (!response.ok) {
                        throw new Error(`Failed to fetch: ${response.statusText}`);
                    }
                    
                    const blob = await response.blob();
                    const base64 = await new Promise((resolve) => {
                        const reader = new FileReader();
                        reader.onloadend = () => resolve(reader.result.split(',')[1]);
                        reader.readAsDataURL(blob);
                    });
                    
                    return {
                        ...audio,
                        base64: base64
                    };
                } catch (error) {
                    return audio;
                }
            }
            return audio;
        }));
        
        // Try filtering again with updated data
        const retryFilesToUpload = filterAudioFilesForUpload(filesWithBase64, hashCheckResult.missingHashes);
        if (retryFilesToUpload.length > 0) {
            filesToUpload.push(...retryFilesToUpload);
        }
    }
    
    if (filesToUpload.length === 0) {
        
        // Return existing files with their Cloudinary URLs from the response
        return audioList.map(audio => ({
            originalUrl: audio.url,
            cloudinaryUrl: hashCheckResult.existingFiles?.[audio.hash] || null,
            hash: audio.hash,
            status: 'existing'
        }));
    }
    
    showUploadStatus(`Uploading ${filesToUpload.length} new files (${hashCheckResult.totalExisting} already exist)...`, 'info');
    
    // Create a progress indicator
    let completedUploads = 0;
    const totalUploads = filesToUpload.length;
    
    const updateProgress = () => {
        completedUploads++;
        updateUploadProgress(completedUploads, totalUploads);
    };
    
    // Optimized upload with higher concurrency and better batch processing
    const concurrencyLimit = 5; // Increased from 3 to 5 for faster uploads
    const uploadResults = [];
    
    // Process files in optimized batches
    for (let i = 0; i < filesToUpload.length; i += concurrencyLimit) {
        const batch = filesToUpload.slice(i, i + concurrencyLimit);
        const batchPromises = batch.map(async (audio, batchIndex) => {
            if (audio.url && audio.hash) {
                try {
                    const result = await uploadAudioToCloudinary(audio.url, audio.hash, audio.base64);
                    updateProgress();
                    return result;
                } catch (error) {
                    updateProgress();
                    return {
                        originalUrl: audio.url,
                        cloudinaryUrl: null,
                        error: error.message,
                        hash: audio.hash,
                        status: 'failed'
                    };
                }
            }
            updateProgress();
            return null;
        });
        
        const batchResults = await Promise.all(batchPromises);
        uploadResults.push(...batchResults.filter(Boolean));
        
        // Reduced delay between batches for faster processing
        if (i + concurrencyLimit < filesToUpload.length) {
            await new Promise(resolve => setTimeout(resolve, 500)); // Reduced from 1000ms to 500ms
        }
    }
    
    const successfulUploads = uploadResults.filter(result => result && result.cloudinaryUrl);
    const failedUploads = uploadResults.filter(result => result && !result.cloudinaryUrl);
    
    // Show final status to user only if there were actual uploads
    if (uploadResults.length > 0) {
        if (failedUploads.length === 0) {
            showUploadStatus(`✅ Successfully uploaded ${successfulUploads.length} new files!`, 'success');
        } else if (successfulUploads.length === 0) {
            showUploadStatus(`❌ Failed to upload ${failedUploads.length} files`, 'error');
        } else {
            showUploadStatus(`⚠️ Uploaded ${successfulUploads.length} files, ${failedUploads.length} failed`, 'warning');
        }
    }
    
    // Combine existing files with newly uploaded files
    const allResults = [];
    
    // Add existing files using URLs from the response
    audioList.forEach(audio => {
        if (hashCheckResult.existingFiles?.[audio.hash]) {
            allResults.push({
                originalUrl: audio.url,
                cloudinaryUrl: hashCheckResult.existingFiles[audio.hash],
                hash: audio.hash,
                status: 'existing'
            });
        }
    });
    
    // Add newly uploaded files
    allResults.push(...uploadResults.filter(Boolean));
    
    return allResults;
}

// Helper function to update audio URLs in question data
function updateAudioUrlsInQuestion(questionData, uploadResults) {
    if (!uploadResults || uploadResults.length === 0) {
        return questionData;
    }
    
    // Check if any files have session_expired status
    const hasSessionExpired = uploadResults.some(result => result.status === 'session_expired');
    if (hasSessionExpired) {
        return questionData; // Return original data without changes
    }
    
    // Create a map of hashes to Cloudinary URLs
    const hashMap = {};
    uploadResults.forEach(result => {
        if (result.cloudinaryUrl && result.hash) {
            hashMap[result.hash] = result.cloudinaryUrl;
        }
    });
    
    // Update question content audio URLs
    if (questionData.content && questionData.content.audioUrls && questionData.content.audioHashes) {
        questionData.content.audioUrls = questionData.content.audioUrls.map((url, index) => {
            const hash = questionData.content.audioHashes[index];
            return hashMap[hash] || url;
        });
    }
    
    // Update explanation audio URLs
    if (questionData.explanation && questionData.explanation.audioUrls && questionData.explanation.audioHashes) {
        questionData.explanation.audioUrls = questionData.explanation.audioUrls.map((url, index) => {
            const hash = questionData.explanation.audioHashes[index];
            return hashMap[hash] || url;
        });
    }
    
    // Update choices audio URLs
    if (questionData.choices) {
        questionData.choices.forEach(choice => {
            if (choice.audioUrls && choice.audioHashes) {
                choice.audioUrls = choice.audioUrls.map((url, index) => {
                    const hash = choice.audioHashes[index];
                    return hashMap[hash] || url;
                });
            }
        });
    }
    
    // Update correct answer audio URLs
    if (questionData.correctAnswer && questionData.correctAnswer.audioUrls && questionData.correctAnswer.audioHashes) {
        questionData.correctAnswer.audioUrls = questionData.correctAnswer.audioUrls.map((url, index) => {
            const hash = questionData.correctAnswer.audioHashes[index];
            return hashMap[hash] || url;
        });
    }
    
    // Update wrong answer audio URLs
    if (questionData.wrongAnswer && questionData.wrongAnswer.audioUrls && questionData.wrongAnswer.audioHashes) {
        questionData.wrongAnswer.audioUrls = questionData.wrongAnswer.audioUrls.map((url, index) => {
            const hash = questionData.wrongAnswer.audioHashes[index];
            return hashMap[hash] || url;
        });
    }
    
    return questionData;
}

// Cache để lưu kết quả kiểm tra admin (tránh check nhiều lần)
let adminCheckCache = {
    isAdmin: null,
    timestamp: null,
    cacheDuration: 5 * 60 * 1000 // Cache 5 phút
};

// Helper function để kiểm tra xem user có phải admin không
async function checkIsAdmin() {
    // Kiểm tra cache trước
    if (adminCheckCache.isAdmin !== null && adminCheckCache.timestamp) {
        const now = Date.now();
        if (now - adminCheckCache.timestamp < adminCheckCache.cacheDuration) {
            return adminCheckCache.isAdmin;
        }
    }
    
    // Nếu cache hết hạn hoặc chưa có, kiểm tra lại
    return new Promise((resolve) => {
        chrome.storage.local.get(['profile'], (data) => {
            const role = data.profile?.role || '';
            const isAdmin = typeof role === 'string' && ['admin', 'partner'].includes(role.trim().toLowerCase());
            
            // Lưu vào cache
            adminCheckCache.isAdmin = isAdmin;
            adminCheckCache.timestamp = Date.now();
            
            resolve(isAdmin);
        });
    });
}

// Helper function to show upload status to user (chỉ hiển thị cho admin)
async function showUploadStatus(message, type = 'info') {
    // Kiểm tra xem user có phải admin không
    const isAdmin = await checkIsAdmin();
    
    // Chỉ hiển thị nếu là admin
    if (!isAdmin) {
        // Log vào console thay vì hiển thị UI (cho debug)
        logger.debugLogWithEmoji('📤', `[Upload Status - Admin Only] ${message}`);
        return null;
    }
    
    // Remove existing status if any
    const existingStatus = document.getElementById('ehou-upload-status');
    if (existingStatus) {
        existingStatus.remove();
    }
    
    const statusDiv = document.createElement('div');
    statusDiv.id = 'ehou-upload-status';
    statusDiv.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        padding: 12px 16px;
        border-radius: 8px;
        color: white;
        font-weight: bold;
        z-index: 10002;
        max-width: 300px;
        box-shadow: 0 4px 12px rgba(0,0,0,0.3);
        transition: all 0.3s ease;
    `;
    
    // Set background color based on type
    switch (type) {
        case 'success':
            statusDiv.style.background = '#4CAF50';
            break;
        case 'error':
            statusDiv.style.background = '#F44336';
            break;
        case 'warning':
            statusDiv.style.background = '#FF9800';
            break;
        default:
            statusDiv.style.background = '#2196F3';
    }
    
    statusDiv.textContent = message;
    document.body.appendChild(statusDiv);
    
    // Auto remove after 4 seconds for all message types
    setTimeout(() => {
        if (statusDiv.parentNode) {
            statusDiv.style.opacity = '0';
            setTimeout(() => statusDiv.remove(), 300);
        }
    }, 4000);
    
    return statusDiv;
}

// Helper function to update upload progress
function updateUploadProgress(current, total) {
    const progress = ((current / total) * 100).toFixed(1);
    const message = `Uploading audio files: ${current}/${total} (${progress}%)`;
    showUploadStatus(message, 'info');
}


async function checkFileHashes(hashes) {
    if (!hashes || hashes.length === 0) {
        return { missingHashes: [], existingFiles: {} };
    }
    
    return new Promise((resolve) => {
        // Add timeout for the message response
        const timeoutId = setTimeout(() => {
            console.warn('Hash check timeout, using fallback');
            resolve({ 
                missingHashes: hashes, 
                existingFiles: {},
                totalRequested: hashes.length,
                totalExisting: 0,
                totalMissing: hashes.length,
                timeout: true
            });
        }, 10000); // 10 second timeout
        
        chrome.runtime.sendMessage({
            type: "checkFileHashes",
            payload: { hashes }
        }, (response) => {
            clearTimeout(timeoutId);
            
            if (response && response.success) {
                resolve(response.data);
            } else {
                
                // Check if it's a session expiration error
                if (response?.error && response.error.includes('Phiên đăng nhập đã hết hạn')) {
                    showUploadStatus('🔐 Phiên đăng nhập đã hết hạn, vui lòng đăng nhập lại!', 'error');
                    
                    // Show a more prominent notification
                    setTimeout(() => {
                        showUploadStatus('💡 Vui lòng mở extension và đăng nhập lại để tiếp tục sử dụng', 'warning');
                    }, 2000);
                    
                    // Return empty result to prevent upload attempts
                    resolve({ 
                        missingHashes: [], 
                        existingFiles: {},
                        totalRequested: hashes.length,
                        totalExisting: 0,
                        totalMissing: 0,
                        sessionExpired: true
                    });
                } else {
                    // Fallback: if backend doesn't support check-hashes yet, assume all files are missing
                    showUploadStatus('⚠️ Không thể kiểm tra files với server, sẽ upload tất cả files', 'warning');
                    resolve({ 
                        missingHashes: hashes, 
                        existingFiles: {},
                        totalRequested: hashes.length,
                        totalExisting: 0,
                        totalMissing: hashes.length
                    });
                }
            }
        });
    });
}

// Helper function to filter audio files that need upload
function filterAudioFilesForUpload(audioList, missingHashes) {
    if (!audioList || audioList.length === 0) {
        return [];
    }
    
    const missingHashesSet = new Set(missingHashes || []);
    
    const filesToUpload = audioList.filter(audio => {
        const hasRequiredData = audio.url && audio.hash && audio.base64;
        const isMissing = missingHashesSet.has(audio.hash);
        
        return hasRequiredData && isMissing;
    });
    
    return filesToUpload;
}

// ✨ Thêm nút "Làm bài ngay" khi vào trang quiz attempt
(function setupAutoQuizButton() {
    // Kiểm tra xem có phải trang quiz attempt không
    if (!location.href.includes("/mod/quiz/attempt.php")) return;
    
    // Biến để theo dõi trạng thái
    let isProcessing = false;
    let lastProcessedQuestions = null;
    let lastProcessedSubjectCode = null;
    
    // Chờ trang load hoàn toàn
    const checkAndCreateButton = () => {
        // Kiểm tra xem đã có nút chưa
        if (document.getElementById('auto-quiz-button')) return;
        
        // Kiểm tra xem có phải trang quiz attempt thực sự không
        const quizContent = document.querySelector('.quiz-content, .content, #page-content');
        if (!quizContent) return;
        
        // Tìm element span#sb-1 để đặt nút bên dưới
        const targetElement = document.getElementById('sb-1');
        if (!targetElement) return;
        
        // Tạo container cho các nút
        const buttonContainer = document.createElement('div');
        buttonContainer.id = 'auto-quiz-button';
        buttonContainer.style.cssText = `
            position: relative;
            margin: 20px 0;
            display: flex;
            flex-direction: column;
            gap: 15px;
            align-items: center;
            z-index: 1000;
        `;
        
        // Tạo nút "Làm bài ngay" - LÀM NỔI BẬT HƠN
        const autoButton = document.createElement('div');
        autoButton.innerHTML = `
            <div style="
                background: linear-gradient(135deg, #ff6b6b 0%, #ee5a24 0%, #ff9ff3 50%, #f368e0 100%);
                color: white;
                padding: 20px 35px;
                border-radius: 50px;
                font-size: 18px;
                font-weight: 700;
                cursor: pointer;
                box-shadow: 0 10px 30px rgba(255, 107, 107, 0.4), 0 0 0 3px rgba(255, 255, 255, 0.2);
                transition: all 0.4s cubic-bezier(0.4, 0, 0.2, 1);
                display: flex;
                align-items: center;
                gap: 15px;
                font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                border: 3px solid rgba(255,255,255,0.3);
                backdrop-filter: blur(15px);
                min-width: 250px;
                justify-content: center;
                text-shadow: 0 2px 4px rgba(0,0,0,0.3);
                position: relative;
                overflow: hidden;
            " onmouseover="this.style.transform='scale(1.08) translateY(-3px)'; this.style.boxShadow='0 15px 40px rgba(255, 107, 107, 0.6), 0 0 0 4px rgba(255, 255, 255, 0.3)'" 
               onmouseout="this.style.transform='scale(1) translateY(0)'; this.style.boxShadow='0 10px 30px rgba(255, 107, 107, 0.4), 0 0 0 3px rgba(255, 255, 255, 0.2)'">
                <span style="font-size: 28px; filter: drop-shadow(0 3px 6px rgba(0,0,0,0.4)); animation: bounce 2s infinite;">🚀</span>
                <span class="button-text" style="font-size: 20px; letter-spacing: 0.5px;">LÀM BÀI NGAY</span>
                <div class="loading-spinner" style="display: none; width: 20px; height: 20px; border: 3px solid rgba(255,255,255,0.3); border-top: 3px solid white; border-radius: 50%; animation: spin 1s linear infinite;"></div>
                <div style="
                    position: absolute;
                    top: 0;
                    left: -100%;
                    width: 100%;
                    height: 100%;
                    background: linear-gradient(90deg, transparent, rgba(255,255,255,0.2), transparent);
                    transition: left 0.5s;
                " class="shine-effect"></div>
            </div>
        `;
        
        // Tạo nút "Làm lại" - CẢI THIỆN UI
        const retryButton = document.createElement('div');
        retryButton.id = 'retry-quiz-button';
        retryButton.style.display = 'none';
        retryButton.innerHTML = `
            <div style="
                background: linear-gradient(135deg, #ff9f43 0%, #f39c12 100%);
                color: white;
                padding: 15px 28px;
                border-radius: 35px;
                font-size: 16px;
                font-weight: 600;
                cursor: pointer;
                box-shadow: 0 6px 20px rgba(255, 159, 67, 0.4);
                transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
                display: flex;
                align-items: center;
                gap: 10px;
                font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                border: 2px solid rgba(255,255,255,0.3);
                backdrop-filter: blur(10px);
                min-width: 160px;
                justify-content: center;
            " onmouseover="this.style.transform='scale(1.05) translateY(-2px)'; this.style.boxShadow='0 8px 25px rgba(255, 159, 67, 0.6)'" 
               onmouseout="this.style.transform='scale(1) translateY(0)'; this.style.boxShadow='0 6px 20px rgba(255, 159, 67, 0.4)'">
                <span style="font-size: 20px;">🔄</span>
                <span>Làm lại</span>
            </div>
        `;
        
        // Tạo nút "Đóng" - CẢI THIỆN UI
        const closeButton = document.createElement('div');
        closeButton.id = 'close-quiz-button';
        closeButton.style.display = 'none';
        closeButton.innerHTML = `
            <div style="
                background: linear-gradient(135deg, #95a5a6 0%, #7f8c8d 100%);
                color: white;
                padding: 12px 22px;
                border-radius: 25px;
                font-size: 14px;
                font-weight: 600;
                cursor: pointer;
                box-shadow: 0 4px 15px rgba(149, 165, 166, 0.4);
                transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
                display: flex;
                align-items: center;
                gap: 8px;
                font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                border: 2px solid rgba(255,255,255,0.3);
                backdrop-filter: blur(10px);
                min-width: 120px;
                justify-content: center;
            " onmouseover="this.style.transform='scale(1.05) translateY(-2px)'; this.style.boxShadow='0 6px 20px rgba(149, 165, 166, 0.6)'" 
               onmouseout="this.style.transform='scale(1) translateY(0)'; this.style.boxShadow='0 4px 15px rgba(149, 165, 166, 0.4)'">
                <span style="font-size: 18px;">✕</span>
                <span>Đóng</span>
            </div>
        `;
        
        // Thêm CSS cho loading spinner và hiệu ứng
        if (!document.getElementById('auto-quiz-spinner-styles')) {
            const spinnerStyle = document.createElement('style');
            spinnerStyle.id = 'auto-quiz-spinner-styles';
            spinnerStyle.textContent = `
                @keyframes spin {
                    0% { transform: rotate(0deg); }
                    100% { transform: rotate(360deg); }
                }
                @keyframes bounce {
                    0%, 20%, 50%, 80%, 100% { transform: translateY(0); }
                    40% { transform: translateY(-10px); }
                    60% { transform: translateY(-5px); }
                }
                @keyframes pulse {
                    0% { transform: scale(1); }
                    50% { transform: scale(1.02); }
                    100% { transform: scale(1); }
                }
                .auto-quiz-loading .button-text {
                    opacity: 0.8;
                }
                .auto-quiz-loading .loading-spinner {
                    display: inline-block !important;
                }
                .button-disabled {
                    opacity: 0.6 !important;
                    cursor: not-allowed !important;
                }
                .shine-effect {
                    transition: left 0.6s cubic-bezier(0.4, 0, 0.2, 1);
                }
                .shine-effect:hover {
                    left: 100%;
                }
                #auto-quiz-button {
                    animation: fadeInUp 0.8s cubic-bezier(0.4, 0, 0.2, 1);
                }
                @keyframes fadeInUp {
                    from { 
                        opacity: 0; 
                        transform: translateY(30px); 
                    }
                    to { 
                        opacity: 1; 
                        transform: translateY(0); 
                    }
                }
            `;
            document.head.appendChild(spinnerStyle);
        }
        
        // Hàm xử lý chính
        const processQuiz = async (isRetry = false) => {
            if (isProcessing) return;
            
            // Kiểm tra đăng nhập và tài khoản học
            chrome.storage.local.get(["access_token", "username", "profile"], async (data) => {
                if (!data.access_token) {
                    showToast("🔐 Vui lòng đăng nhập vào extension Easy Quiz EHOU trước!", "error");
                    return;
                }
                
                // Lấy usernameEhou từ storage hoặc trang web (cho validation)
                const usernameEhou = await getUsernameEhou();
                // Lấy opaqueKey cho API calls
                const opaqueKey = await getOpaqueKey();
                
                // Kiểm tra role - nếu là admin thì bỏ qua check tài khoản
                const role = data.profile?.role || '';
                if (typeof role === 'string' && ['admin', 'partner'].includes(role.trim().toLowerCase())) {
                    // Cho phép admin sử dụng luôn
                    logger.debugLogWithEmoji('Admin user detected, bypassing account check');
                } else {
                    // Kiểm tra tài khoản học có khớp với tài khoản đăng nhập không (chỉ cho user thường)
                    if (!data.username || !usernameEhou || data.username !== usernameEhou) {
                        const currentUsername = data.username || 'Chưa đăng nhập';
                        const ehouUsername = usernameEhou || 'Chưa xác định';
                        
                        if (!data.username) {
                            showToast("🔐 Vui lòng đăng nhập vào extension Easy Quiz EHOU trước!", "error");
                        } else if (!usernameEhou) {
                            showToast("⚠️ Không thể xác định tài khoản học. Vui lòng refresh trang và thử lại!", "warning");
                        } else {
                            showToast(`⚠️ Tài khoản đăng nhập (${currentUsername}) không khớp với tài khoản học (${ehouUsername})! Vui lòng đăng nhập đúng tài khoản.`, "error");
                        }
                        return;
                    }
                }
                
                isProcessing = true;
                
                // Thay đổi trạng thái nút thành loading
                const buttonDiv = autoButton.querySelector('div');
                const buttonText = buttonDiv.querySelector('.button-text');
                const loadingSpinner = buttonDiv.querySelector('.loading-spinner');
                
                buttonDiv.classList.add('auto-quiz-loading');
                buttonDiv.style.cursor = 'not-allowed';
                buttonDiv.style.pointerEvents = 'none';
                
                try {
                    // Lấy câu hỏi từ trang hiện tại
                    if (!isRetry) {
                        showToast("📖 Đang lấy câu hỏi từ trang...", "info");
                    } else {
                        showToast("🔄 Đang xử lý lại...", "info");
                    }
                    
                    const questions = await getQuestions();
                    const subjectCode = await getSubjectCodeWithFallback();
                    
                    if (!questions || !questions.length) {
                        showToast("❌ Không lấy được câu hỏi nào từ trang!", "error");
                        return;
                    }
                    
                    // Lưu thông tin để làm lại
                    if (!isRetry) {
                        lastProcessedQuestions = questions;
                        lastProcessedSubjectCode = subjectCode;
                    }
                    
                    showToast(`📚 Đã lấy được ${questions.length} câu hỏi. Đang tìm kiếm đáp án...`, "info");                                                
                    const learningAccount = await getLearningAccount();
                    const opaqueKey = await getOpaqueKey();
                    
                    // Validate opaqueKey
                    if (!opaqueKey) {
                        showToast("⚠️ Không thể tạo khóa bảo mật. Vui lòng đăng nhập lại vào hệ thống học và thử lại!", "error");
                        return;
                    }
                    logger.debugLogWithEmoji(`opaqueKey: ${opaqueKey}`);

                    // Gửi message về background.js để xử lý API
                    chrome.runtime.sendMessage({
                        type: "searchMultipleQuestions",
                        payload: {
                            questions: questions,
                            subjectCode: subjectCode,                        
                            learningAccount: learningAccount,
                            opaqueKey: opaqueKey
                        }
                    }, async (response) => {
                        try {
                            if (chrome.runtime.lastError) {
                                throw new Error(chrome.runtime.lastError.message);
                            }
                            
                            if (response && response.success && response.data && response.data.length > 0) {
                                showToast(`🎯 Tìm thấy ${response.data.length} đáp án! Đang điền...`, "success");
                                
                                // Điền đáp án
                                const answerMap = convertToAnswerMap(response.data);
                                const hashAnswerMap = buildHashAnswerMap(response.data);
                                await fillAnswers(answerMap, hashAnswerMap);
                                
                                showToast("🎉 Đã điền đáp án thành công! Chúc bạn làm bài tốt!", "success");
                                
                                // Thêm hiệu ứng thành công
                                buttonDiv.style.background = 'linear-gradient(135deg, #28a745 0%, #20c997 100%)';
                                buttonDiv.style.transform = 'scale(1.1)';
                                setTimeout(() => {
                                    buttonDiv.style.background = 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)';
                                    buttonDiv.style.transform = 'scale(1)';
                                }, 200);
                                
                                // Hiển thị nút "Làm lại"
                                retryButton.style.display = 'block';                            
                                
                                // Hiển thị nút "Đóng"
                                closeButton.style.display = 'block';
                                
                            } else {
                                const errorMsg = response?.error || "Không tìm thấy đáp án phù hợp!";
                                showToast(`⚠️ ${errorMsg}`, "warning");
                                
                                // Thêm hiệu ứng cảnh báo
                                buttonDiv.style.background = 'linear-gradient(135deg, #ffc107 0%, #fd7e14 100%)';
                                setTimeout(() => {
                                    buttonDiv.style.background = 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)';
                                }, 1000);
                                
                                // Vẫn hiển thị nút "Làm lại" để thử lại
                                retryButton.style.display = 'block';
                                
                                // Hiển thị nút "Đóng"
                                closeButton.style.display = 'block';
                            }
                        } catch (error) {
                            console.error('Error in searchMultipleQuestions response:', error);
                            showToast(`❌ Lỗi khi tìm kiếm: ${error.message}`, "error");
                            
                            // Thêm hiệu ứng lỗi
                            buttonDiv.style.background = 'linear-gradient(135deg, #dc3545 0%, #e83e8c 100%)';
                            setTimeout(() => {
                                buttonDiv.style.background = 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)';
                            }, 1000);
                            
                            // Hiển thị nút "Làm lại" để thử lại
                            retryButton.style.display = 'block';
                            
                            // Hiển thị nút "Đóng"
                            closeButton.style.display = 'block';
                        } finally {
                            // Khôi phục trạng thái nút
                            buttonDiv.classList.remove('auto-quiz-loading');
                            buttonDiv.style.cursor = 'pointer';
                            buttonDiv.style.pointerEvents = 'auto';
                            isProcessing = false;
                        }
                    });
                    
                } catch (error) {
                    console.error('Error in auto quiz button:', error);
                    showToast(`❌ Lỗi: ${error.message}`, "error");
                    
                    // Thêm hiệu ứng lỗi
                    const buttonDiv = autoButton.querySelector('div');
                    buttonDiv.style.background = 'linear-gradient(135deg, #dc3545 0%, #e83e8c 100%)';
                    setTimeout(() => {
                        buttonDiv.style.background = 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)';
                    }, 1000);
                    
                    // Khôi phục trạng thái nút
                    buttonDiv.classList.remove('auto-quiz-loading');
                    buttonDiv.style.cursor = 'pointer';
                    buttonDiv.style.pointerEvents = 'auto';
                    isProcessing = false;
                    
                    // Hiển thị nút "Làm lại" để thử lại
                    retryButton.style.display = 'block';
                    
                    // Hiển thị nút "Đóng"
                    closeButton.style.display = 'block';
                }
            });
        };
        
        // Thêm sự kiện click cho nút chính
        autoButton.addEventListener('click', () => processQuiz(false));
        
        // Thêm hiệu ứng shine khi hover
        autoButton.addEventListener('mouseenter', () => {
            const shineEffect = autoButton.querySelector('.shine-effect');
            if (shineEffect) {
                shineEffect.style.left = '100%';
            }
        });
        
        autoButton.addEventListener('mouseleave', () => {
            const shineEffect = autoButton.querySelector('.shine-effect');
            if (shineEffect) {
                shineEffect.style.left = '-100%';
            }
        });
        
        // Thêm sự kiện click cho nút làm lại
        retryButton.addEventListener('click', () => processQuiz(true));
        
        // Thêm sự kiện click cho nút đóng
        closeButton.addEventListener('click', () => {
            // Ẩn tất cả các nút phụ
            retryButton.style.display = 'none';
            closeButton.style.display = 'none';
            
            // Reset trạng thái nút chính
            const buttonDiv = autoButton.querySelector('div');
            buttonDiv.style.background = 'linear-gradient(135deg, #ff6b6b 0%, #ee5a24 0%, #ff9ff3 50%, #f368e0 100%)';
            buttonDiv.style.transform = 'scale(1)';
            
            showToast("👋 Đã đóng các nút phụ!", "info");
        });
        
        // Thêm các nút vào container
        buttonContainer.appendChild(autoButton);
        buttonContainer.appendChild(retryButton);
        buttonContainer.appendChild(closeButton);
        
        // Thêm container vào trang - ĐẶT DƯỚI span#sb-1
        targetElement.parentNode.insertBefore(buttonContainer, targetElement.nextSibling);
        
        // Thêm CSS cho toast
        if (!document.getElementById('toast-styles')) {
            const toastStyle = document.createElement('style');
            toastStyle.id = 'toast-styles';
            toastStyle.textContent = `
                .toast-message {
                    position: fixed;
                    top: 80px;
                    right: 20px;
                    padding: 14px 22px;
                    border-radius: 12px;
                    color: white;
                    font-weight: 500;
                    z-index: 10001;
                    animation: slideInRight 0.4s cubic-bezier(0.4, 0, 0.2, 1);
                    max-width: 350px;
                    word-wrap: break-word;
                    box-shadow: 0 8px 25px rgba(0,0,0,0.15);
                    backdrop-filter: blur(10px);
                    border: 1px solid rgba(255,255,255,0.1);
                }
                .toast-message.info { 
                    background: linear-gradient(135deg, #17a2b8 0%, #138496 100%);
                    border-left: 4px solid #0c5460;
                }
                .toast-message.success { 
                    background: linear-gradient(135deg, #28a745 0%, #20c997 100%);
                    border-left: 4px solid #155724;
                }
                .toast-message.warning { 
                    background: linear-gradient(135deg, #ffc107 0%, #fd7e14 100%); 
                    color: #212529;
                    border-left: 4px solid #856404;
                }
                .toast-message.error { 
                    background: linear-gradient(135deg, #dc3545 0%, #e83e8c 100%);
                    border-left: 4px solid #721c24;
                }
                @keyframes slideInRight {
                    from { 
                        transform: translateX(100%) scale(0.9); 
                        opacity: 0; 
                    }
                    to { 
                        transform: translateX(0) scale(1); 
                        opacity: 1; 
                    }
                }
            `;
            document.head.appendChild(toastStyle);
        }
    };
    
    // Hàm hiển thị toast
    window.showToast = function(message, type = 'info') {
        const toast = document.createElement('div');
        toast.className = `toast-message ${type}`;
        toast.textContent = message;
        document.body.appendChild(toast);
        
        setTimeout(() => {
            toast.style.animation = 'slideInRight 0.4s cubic-bezier(0.4, 0, 0.2, 1) reverse';
            setTimeout(() => toast.remove(), 400);
        }, 4000);
    };
    
    // Kiểm tra và tạo nút khi trang load
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', checkAndCreateButton);
    } else {
        checkAndCreateButton();
    }
    
    // Kiểm tra lại sau khi trang load hoàn toàn
    window.addEventListener('load', checkAndCreateButton);
    
    // Kiểm tra lại khi URL thay đổi (cho SPA)
    let lastUrl = location.href;
    new MutationObserver(() => {
        const url = location.href;
        if (url !== lastUrl) {
            lastUrl = url;
            if (url.includes("/mod/quiz/attempt.php")) {
                setTimeout(checkAndCreateButton, 1000); // Delay để trang load hoàn toàn
            }
        }
    }).observe(document, {subtree: true, childList: true});
})();

(function setupHotkeys() {
    if (!location.href.includes('/mod/quiz/attempt.php')) return;
    let buffer = '';
    let timer = null;
    const reset = () => { buffer = ''; if (timer) { clearTimeout(timer); timer = null; } };
    const findNextPageButton = () => {
        return document.getElementById('mod_quiz-next-nav') 
            || document.querySelector('.submitbtns input[name="next"]')
            || document.querySelector('input.btn[value*="Tiếp"], button:contains("Tiếp")');
    };
    document.addEventListener('keydown', (e) => {
        const t = e.target;
        const isEditable = t && ((t.tagName === 'INPUT') || (t.tagName === 'TEXTAREA') || (t.isContentEditable));
        if (isEditable) return;
        if (e.ctrlKey || e.altKey || e.metaKey) return;
        if (e.key && e.key.length === 1) {
            buffer += e.key.toLowerCase();
            if (buffer.length > 2) buffer = buffer.slice(-2);
            if (timer) clearTimeout(timer);
            timer = setTimeout(reset, 1200);
            if (buffer === 'll') {
                reset();
                const container = document.getElementById('auto-quiz-button');
                const autoBtn = container && container.children && container.children[0] ? container.children[0] : null;
                if (autoBtn && typeof autoBtn.click === 'function') {
                    if (typeof window.showToast === 'function') showToast('🚀 Phím tắt: Làm bài ngay', 'info');
                    autoBtn.click();
                }
            } else if (buffer === 'nn') {
                reset();
                const nextBtn = findNextPageButton();
                if (nextBtn) {
                    if (typeof window.showToast === 'function') showToast('➡️ Phím tắt: Trang tiếp', 'info');
                    nextBtn.click();
                }
            }
        }
    });
})();