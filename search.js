window.addEventListener("DOMContentLoaded", () => {
    // Cache DOM elements
    const elements = {
        input: document.getElementById("question-input"),
        searchBtn: document.getElementById("search-btn"),
        resultsEl: document.getElementById("results"),
        loginWarning: document.getElementById("login-warning"),
        mainContent: document.getElementById("main-content"),
        quickSolveBtn: document.getElementById("quickSolveBtn")
    };

    // Check login status
    chrome.storage.local.get("access_token", (data) => {
        const token = data.access_token;
        if (!token) {
            elements.loginWarning.style.display = "block";
            elements.mainContent.style.display = "none";
            return;
        }

        elements.loginWarning.style.display = "none";
        elements.mainContent.style.display = "block";

        // Get last question from storage if exists
        chrome.storage.local.get("last_question", async (data) => {
            const question = data.last_question;
            if (question && elements.input) {
                elements.input.value = question;
                await performSearch(question);
                chrome.storage.local.remove("last_question");
            }
        });

        // Event listeners
        elements.searchBtn?.addEventListener("click", async () => {
            const query = elements.input.value.trim();
            if (query) await performSearch(query);
        });

        elements.input?.addEventListener("keydown", async (event) => {
            if (event.key === "Enter") {
                const query = elements.input.value.trim();
                if (query) await performSearch(query);
            }
        });

        elements.quickSolveBtn?.addEventListener("click", async () => {
            await checkCurrentQuiz();
        });
    });

    async function performSearch(query) {
        if (!await checkAccess()) return;
        elements.resultsEl.innerHTML = "🔎 Đang tìm kiếm...";

        // Set timeout for AI analysis message
        const aiTimeout = setTimeout(() => {
            elements.resultsEl.innerHTML = "🤖 AI đang phân tích...";
        }, 5000);

        // Ưu tiên lấy subjectCode từ content script trước
        chrome.tabs.query({active: true, currentWindow: true}, (tabs) => {
            if (tabs[0]) {
                chrome.tabs.sendMessage(tabs[0].id, {type: "getSubjectCode"}, (response) => {
                    let subjectCode = "";
                    if (response && response.subjectCode) {
                        // Lấy được từ trang web, lưu vào storage để dùng cho lần sau
                        subjectCode = response.subjectCode;
                        chrome.storage.local.set({ currentSubjectCode: subjectCode });
                        sendSearchRequest(query, subjectCode, aiTimeout);
                    } else {
                        // Nếu không lấy được từ trang web, chỉ admin mới được dùng từ storage
                        chrome.storage.local.get(["currentSubjectCode", "profile"], (data) => {
                            const storedSubjectCode = data.currentSubjectCode;
                            const role = data.profile?.role || '';
                            
                            // Chỉ admin mới được phép dùng subjectCode từ storage
                            const isAdmin = typeof role === 'string' && ['admin', 'partner'].includes(role.trim().toLowerCase());
                            
                            if (storedSubjectCode && isAdmin) {
                                // Admin: cần xác nhận trước khi dùng subjectCode từ storage
                                const confirmed = confirm(
                                    `⚠️ ADMIN: Không lấy được mã môn từ trang web.\n\n` +
                                    `Mã môn đã lưu trước: ${storedSubjectCode}\n\n` +
                                    `Bạn có muốn sử dụng mã môn này?`
                                );
                                
                                if (confirmed) {
                                    subjectCode = storedSubjectCode;
                                }
                            }
                            // Nếu không phải admin hoặc không có trong storage, dùng chuỗi rỗng (tìm kiếm không giới hạn môn)
                            sendSearchRequest(query, subjectCode, aiTimeout);
                        });
                    }
                });
            } else {
                // Không có tab active, chỉ admin mới được dùng từ storage
                chrome.storage.local.get(["currentSubjectCode", "profile"], (data) => {
                    const storedSubjectCode = data.currentSubjectCode;
                    const role = data.profile?.role || '';
                    
                    // Chỉ admin mới được phép dùng subjectCode từ storage
                    const isAdmin = typeof role === 'string' && ['admin', 'partner'].includes(role.trim().toLowerCase());
                    
                    let subjectCode = "";
                    if (storedSubjectCode && isAdmin) {
                        // Admin: cần xác nhận trước khi dùng subjectCode từ storage
                        const confirmed = confirm(
                            `⚠️ ADMIN: Không lấy được mã môn từ trang web.\n\n` +
                            `Mã môn đã lưu trước: ${storedSubjectCode}\n\n` +
                            `Bạn có muốn sử dụng mã môn này?`
                        );
                        
                        if (confirmed) {
                            subjectCode = storedSubjectCode;
                        }
                    }
                    sendSearchRequest(query, subjectCode, aiTimeout);
                });
            }
        });
    }

    // Helper function to get learningAccount from storage (dev can modify this)
    async function getLearningAccount() {
        const { usernameEhou } = await new Promise(resolve => {
            chrome.storage.local.get("usernameEhou", resolve);
        });
        return usernameEhou || "";
    }
    
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
    
    // Helper function to get opaqueKey from storage
    async function getOpaqueKey() {
        try {
            const { opaqueKey } = await new Promise((resolve, reject) => {
                try {
                    chrome.storage.local.get("opaqueKey", (result) => {
                        if (chrome.runtime.lastError) {
                            console.error("❌ Chrome storage error:", chrome.runtime.lastError);
                            reject(chrome.runtime.lastError);
                        } else {
                            resolve(result);
                        }
                    });
                } catch (error) {
                    console.error("❌ Error accessing chrome.storage.local:", error);
                    reject(error);
                }
            });
            
            return opaqueKey || null;
        } catch (error) {
            console.error("❌ Error getting opaqueKey:", error);
            return null;
        }
    }

    async function sendSearchRequest(query, subjectCode, aiTimeout) {
        // Lấy learningAccount và opaqueKey
        // Strategy: Gửi cả learningAccount (dev có thể sửa) và opaqueKey (để validate thực sự)
        const learningAccount = await getLearningAccount();
        const opaqueKey = await getOpaqueKey();
        
        // Validate opaqueKey
        if (!opaqueKey) {
            elements.resultsEl.innerHTML = "⚠️ Không thể tạo khóa bảo mật. Vui lòng đăng nhập lại vào hệ thống học và thử lại!";
            return;
        }

        chrome.runtime.sendMessage({
            type: "searchQuestion",
            payload: {
                question: query,
                subjectCode: subjectCode,
                learningAccount: learningAccount,
                opaqueKey: opaqueKey || ""
            }
        }, (response) => {
            clearTimeout(aiTimeout); // Clear the timeout when response arrives
            const dataList = response?.data || [];

            // Kiểm tra nếu có message trong kết quả đầu tiên
            if (dataList.length > 0 && dataList[0].message) {
                elements.resultsEl.innerHTML = `
                    <div style="margin: 12px;">
                        <b>📢 ${dataList[0].message}</b>
                    </div>
                `;
                return;
            }

            const finalData = dataList.length > 0
                ? dataList
                : [{ai: true, explanation: "Không tìm thấy kết quả."}];

            elements.resultsEl.innerHTML = renderResults(finalData);
        });
    }

    async function checkCurrentQuiz() {
        if (!await checkAccess()) return;
        chrome.tabs.query({active: true, currentWindow: true}, (tabs) => {
            const tab = tabs[0];
            if (!tab) return;

            // Hiển thị trạng thái loading ngay khi bắt đầu
            elements.resultsEl.innerHTML = "🔎 Đang tìm kiếm...";

            // Set timeout for AI analysis message
            const aiTimeout = setTimeout(() => {
                elements.resultsEl.innerHTML = "🤖 AI đang phân tích...";
            }, 5000);

            chrome.runtime.sendMessage({type: "getQuestionsTab", tabId: tab.id}, async (res) => {
                const questions = res?.questions;
                let subjectCode = res?.subjectCode || "";

                // Nếu không lấy được subjectCode từ trang web, chỉ admin mới được dùng từ storage
                if (!subjectCode) {
                    const data = await new Promise(resolve => {
                        chrome.storage.local.get(["currentSubjectCode", "profile"], resolve);
                    });
                    const storedSubjectCode = data.currentSubjectCode;
                    const role = data.profile?.role || '';
                    
                    // Chỉ admin mới được phép dùng subjectCode từ storage
                    const isAdmin = typeof role === 'string' && ['admin', 'partner'].includes(role.trim().toLowerCase());
                    
                    if (storedSubjectCode && isAdmin) {
                        // Admin: cần xác nhận trước khi dùng subjectCode từ storage
                        const confirmed = confirm(
                            `⚠️ ADMIN: Không lấy được mã môn từ trang web.\n\n` +
                            `Mã môn đã lưu trước: ${storedSubjectCode}\n\n` +
                            `Bạn có muốn sử dụng mã môn này?`
                        );
                        
                        if (confirmed) {
                            subjectCode = storedSubjectCode;
                            // Nếu lấy được từ storage, cũng cập nhật lại trong res để đồng bộ
                            res.subjectCode = subjectCode;
                        }
                    }
                } else {
                    // Lấy được từ trang web, lưu vào storage để dùng cho lần sau
                    chrome.storage.local.set({ currentSubjectCode: subjectCode });
                }

                if (!questions || !questions.length) {
                    clearTimeout(aiTimeout);
                    return showToastError("Không lấy được câu hỏi nào từ trang vui lòng loading lại trang!");
                }

            try {
                // Lấy learningAccount và opaqueKey
                // Strategy: Gửi cả learningAccount (dev có thể sửa) và opaqueKey (để validate thực sự)
                const learningAccount = await getLearningAccount();
                const opaqueKey = await getOpaqueKey();
                
                // Validate opaqueKey
                if (!opaqueKey) {
                    clearTimeout(aiTimeout);
                    showToastError("⚠️ Không thể tạo khóa bảo mật. Vui lòng đăng nhập lại vào hệ thống học và thử lại!");
                    return;
                }

                const fetchRes = await fetchWithAuth(`${API_URL}/questions/search/multiple`, {
                    method: "POST",
                    headers: {"Content-Type": "application/json"},
                    body: JSON.stringify({
                        questions,
                        subjectCode,
                        learningAccount: learningAccount,
                        opaqueKey: opaqueKey || ""
                    })
                });

                    if (!fetchRes.ok) {
                        let errorMsg = "Server không phản hồi hợp lệ";
                        try {
                            const errorData = await fetchRes.json();
                            errorMsg = errorData.message || errorMsg;
                        } catch (e) {
                        }
                        throw new Error(errorMsg);
                    } else {
                        const response = await fetchRes.json();
                        if (response.type == "SUCCESS"){
                            clearTimeout(aiTimeout);

                            const serverData = response.data || [];
                            const finalData = serverData.length > 0
                                ? serverData
                                : [{ai: true, explanation: "Không tìm thấy kết quả."}];

                            // Hiển thị kết quả tìm kiếm trên popup
                            elements.resultsEl.innerHTML = renderResults(finalData);

                            if (Array.isArray(serverData) && serverData.length > 0) {
                                // Bỏ qua bước convertToAnswerMap ở đây
                                showToast(`Tìm thấy ${serverData.length} đáp án phù hợp! Đang xử lý điền...`);

                                // Gửi trực tiếp dữ liệu thô từ backend sang contentScript
                                chrome.tabs.sendMessage(tab.id, {
                                    type: "backendAnswers",
                                    serverData: serverData
                                }, (resp) => {
                                    // Content script đã xử lý điền đáp án
                                    showToast("Đã điền đáp án! 🧠✅");
                                });

                            } else {
                                showToast("Không tìm thấy đáp án phù hợp!");
                            }
                        }else {
                            throw new Error(response.message)
                        }

                    }

                } catch (err) {
                    clearTimeout(aiTimeout);
                    showToastError(err.message || "Lỗi hệ thống, vui lòng thử lại sau!");
                }
            });
        });
    }

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
                    return `<img src="${imageUrl}" class="hover-zoom-image" style="max-width:240px;max-height:240px;margin:0 4px;vertical-align:middle;" />`;
                }
            } else if (type === 'AUDIO') {
                // Tìm URL audio tương ứng với hash
                const audioUrl = findAudioUrlByHash(hash, item);
                if (audioUrl) {
                    return `<audio controls style="margin:0 4px;vertical-align:middle;"><source src="${audioUrl}" type="audio/mpeg">Your browser does not support the audio element.</audio>`;
                }
            }
            return match; // Giữ nguyên nếu không tìm thấy
        });
    }

    // Hàm decode HTML entities để hiển thị đúng
    function decodeHtmlEntities(text) {
        if (!text) return '';
        const textarea = document.createElement('textarea');
        textarea.innerHTML = text;
        return textarea.value;
    }

    function renderResults(dataList) {
        if (!dataList.length) return "❗ Không tìm thấy kết quả.";

        // Add CSS for hover zoom effect
        const hoverZoomCss = `
            .hover-zoom-image {
                transition: transform 0.2s ease-in-out;
                cursor: zoom-in;
                z-index: 10001; /* Ensure it's above the popup */
                position: relative; /* Needed for z-index to work sometimes */
            }
            .hover-zoom-image:hover {
                transform: scale(1.5); /* Adjust scale factor as needed */
            }
        `;

        return `<style>${hoverZoomCss}</style>` + dataList.map((item, idx) => {
            // ⚠️ Chưa đăng nhập
            if (item.ai === null) {
                return `
                    <div style="margin: 12px;">
                        <b>🔐 ${item.explanation}</b>
                        <div style="margin-top: 6px;">Vui lòng đăng nhập để sử dụng chức năng này.</div>
                    </div>
                `;
            }

            // 📡 AI phân tích – kiểm tra có dữ liệu để hiển thị như thường không
            if (item.ai === true) {
                const hasChoices = Array.isArray(item.choices) && item.choices.length > 0;
                const hasExplanation = !!item.explanation;
                const hasContent = !!item.content;

                // Xử lý hiển thị hình ảnh theo pattern
                // item.content có thể là string hoặc object {text, images, audios}
                const contentText = typeof item.content === 'string' ? item.content : (item.content?.text || '');
                const { processedContent, questionImagesHtml } = processContentWithImages(contentText, item);

                // Xử lý audio câu hỏi
                let questionAudioHtml = '';
                if (item.content && typeof item.content === 'object' && item.content.audios && item.content.audios.length) {
                    questionAudioHtml = item.content.audios.map(audio =>
                        `<audio controls style="max-width:220px;margin:8px 0;display:block;">
                            <source src="${audio.url}" type="audio/mp3">
                            <a href="${audio.url}" target="_blank">${audio.title || 'Audio'}</a>
                        </audio>`
                    ).join("");
                }

                const letters = ['a', 'b', 'c', 'd', 'e', 'f'];
                const choices = (Array.isArray(item.choices) ? item.choices : []).map((c, i) => {
                    // Xử lý hiển thị hình ảnh theo pattern cho text lựa chọn
                    const { processedText, choiceImagesHtml } = processChoiceTextWithImages(c.text || '', c);
                    
                    // Xử lý audio trong lựa chọn
                    let audioHtml = "";
                    if (c.audios && c.audios.length) {
                        audioHtml = c.audios.map(audio =>
                            `<audio controls style="max-width:80px;max-height:40px;margin-left:8px;vertical-align:middle;">
                                <source src="${audio.url}" type="audio/mp3">
                            </audio>`
                        ).join("");
                    }
                    
                    const correct = i === item.correctAnswer ? "✅" : "";
                    return `<div>${letters[i]}. ${processedText.replace(/\n/g, '<br>')} ${choiceImagesHtml} ${audioHtml} ${correct}</div>`;
                }).join("");

                // Xử lý explanation mới
                let explanationHtml = '';
                if (hasExplanation) {
                    if (typeof item.explanation === 'string') {
                        // Cấu trúc cũ: explanation là string
                        explanationHtml = `<div style="margin-top: 6px; font-style: italic;">🧠 Giải thích: ${decodeHtmlEntities(processMediaPlaceholders(escapeHtmlExceptValidMedia(item.explanation || ''), item)).replace(/\n/g, '<br>')}</div>`;
                    } else if (typeof item.explanation === 'object') {
                        // Cấu trúc mới: explanation là object
                        const explanationText = item.explanation.text || '';
                        const processedExplanationText = processMediaPlaceholders(escapeHtmlExceptValidMedia(explanationText), item.explanation);
                        
                        explanationHtml = `
                            <div style="margin-top: 6px; font-style: italic;">
                                🧠 Giải thích: ${decodeHtmlEntities(processedExplanationText).replace(/\n/g, '<br>')}
                            </div>
                        `;
                    }
                }

                if (hasChoices && hasContent) {
                    return `
                        <div style="margin-bottom: 16px;">
                            <div><b>🤖 AI phân tích</b></div>
                            <b>${idx + 1}. ${decodeHtmlEntities(processMediaPlaceholders(escapeHtmlExceptValidMedia(processedContent), item)).replace(/\n/g, '<br>')}</b>
                            ${questionImagesHtml}
                            <div>${questionAudioHtml}</div>
                            <div style="margin-left: 12px; margin-top: 6px;">${choices}</div>
                            ${explanationHtml}
                        </div>
                    `;
                } else {
                    // chỉ hiển thị explanation đơn thuần
                    return `
                        <div style="margin-bottom: 12px;">
                            <div><b>🤖 AI phân tích</b></div>
                            ${explanationHtml}
                        </div>
                    `;
                }
            }

            // Kiểm tra loại câu hỏi
            const questionType = item.type || item.questionType;
            if (questionType === 'COMPLETION_WITH_CHOICES') {
                const contentText = typeof item.content === 'string' ? item.content : (item.content?.text || item.content || '');
                const { processedContent, questionImagesHtml } = processContentWithImages(contentText, item);
                // Render danh sách gaps (chỉ đọc)
                const gaps = Array.isArray(item.gaps) ? item.gaps : [];
                const gapsHtml = gaps.length ? `
                    <div style="margin-top:8px;padding:10px;border:1px dashed #ddd;border-radius:6px;background:#fafafa;">
                        <div style="font-weight:bold;margin-bottom:6px;">Ô trống và đáp án đúng:</div>
                        ${gaps.map(g => {
                            const vals = Array.isArray(g.correctValues) ? g.correctValues : [];
                            return `<div style="margin:4px 0;">#${g.index}: ${vals.map(v => `<span style=\"display:inline-block;margin-right:6px;padding:2px 6px;border-radius:4px;background:#e3f2fd;color:#0d47a1;border:1px solid #90caf9;\">${escapeHtml(v)}</span>`).join('')}</div>`;
                        }).join('')}
                        <div style="margin-top:6px;color:#666;font-size:12px;">Mẹo: Extension sẽ tự điền các ô trống tương ứng theo thứ tự index.</div>
                    </div>
                ` : '';
                return `
                    <div style="margin-bottom: 16px;">
                        <b>${idx + 1}. ${decodeHtmlEntities(processMediaPlaceholders(escapeHtmlExceptValidMedia(processedContent), item)).replace(/\n/g, '<br>')}</b>
                        ${questionImagesHtml}
                        ${gapsHtml}
                    </div>
                `;
            } else if (questionType && questionType !== 'SINGLE_CHOICE' && questionType !== 'TRUE_FALSE' && questionType !== null) {
                return `
                    <div style="margin-bottom: 16px;">
                        <div style="background: #fff3cd; border: 1px solid #ffeaa7; padding: 12px; border-radius: 6px; margin-bottom: 8px;">
                            <b>🚧 Đang phát triển</b>
                            <div style="margin-top: 4px; color: #856404;">
                                Loại câu hỏi: ${questionType}
                            </div>
                        </div>
                        <b>${idx + 1}. ${decodeHtmlEntities(processMediaPlaceholders(escapeHtmlExceptValidMedia(item.content || ''), item)).replace(/\n/g, '<br>')}</b>
                    </div>
                `;
            }

            // Xử lý hiển thị hình ảnh theo pattern
            // item.content có thể là string hoặc object {text, images, audios}
            const contentText = typeof item.content === 'string' ? item.content : (item.content?.text || '');
            const { processedContent, questionImagesHtml } = processContentWithImages(contentText, item);

            // Xử lý audio câu hỏi
            let questionAudioHtml = '';
            if (item.content && typeof item.content === 'object' && item.content.audios && item.content.audios.length) {
                questionAudioHtml = item.content.audios.map(audio =>
                    `<audio controls style="max-width:220px;margin:8px 0;display:block;">
                        <source src="${audio.url}" type="audio/mp3">
                        <a href="${audio.url}" target="_blank">${audio.title || 'Audio'}</a>
                    </audio>`
                ).join("");
            }

            const letters = ['a', 'b', 'c', 'd', 'e', 'f'];
            const choices = (Array.isArray(item.choices) ? item.choices : []).map((c, i) => {
                // Xử lý hiển thị hình ảnh theo pattern cho text lựa chọn
                const { processedText, choiceImagesHtml } = processChoiceTextWithImages(c.text || '', c);
                
                // Xử lý audio trong lựa chọn
                let audioHtml = "";
                if (c.audios && c.audios.length) {
                    audioHtml = c.audios.map(audio =>
                        `<audio controls style="max-width:80px;max-height:40px;margin-left:8px;vertical-align:middle;">
                            <source src="${audio.url}" type="audio/mp3">
                        </audio>`
                    ).join("");
                }
                
                const correct = i === item.correctAnswer ? "✅" : "";
                return `<div>${letters[i]}. ${decodeHtmlEntities(processMediaPlaceholders(escapeHtmlExceptValidMedia(processedText), c)).replace(/\n/g, '<br>')} ${choiceImagesHtml} ${audioHtml} ${correct}</div>`;
            }).join("");

            // Xử lý explanation mới
            let explanationHtml = '';
            if (item.explanation) {
                if (typeof item.explanation === 'string') {
                    // Cấu trúc cũ: explanation là string
                    explanationHtml = `<div style="margin-top: 6px; font-style: italic;">🧠 Giải thích: ${decodeHtmlEntities(processMediaPlaceholders(escapeHtmlExceptValidMedia(item.explanation || ''), item)).replace(/\n/g, '<br>')}</div>`;
                } else if (typeof item.explanation === 'object') {
                    // Cấu trúc mới: explanation là object
                    const explanationText = item.explanation.text || '';
                    const processedExplanationText = processMediaPlaceholders(escapeHtmlExceptValidMedia(explanationText), item.explanation);
                    
                    explanationHtml = `
                        <div style="margin-top: 6px; font-style: italic;">
                            🧠 Giải thích: ${decodeHtmlEntities(processedExplanationText).replace(/\n/g, '<br>')}
                        </div>
                    `;
                }
            }

            return `
                <div style="margin-bottom: 16px;">
                    <b>${idx + 1}. ${decodeHtmlEntities(processMediaPlaceholders(escapeHtmlExceptValidMedia(processedContent), item)).replace(/\n/g, '<br>')}</b>
                    ${questionImagesHtml}
                    <div>${questionAudioHtml}</div>
                    <div style="margin-left: 12px; margin-top: 6px;">${choices}</div>
                    ${explanationHtml}
                </div>
            `;
        }).join("");
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
                        return `<img src="${imageUrl}" class="hover-zoom-image" style="max-width:240px;max-height:240px;margin:0 4px;vertical-align:middle;" />`;
                    }
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
                    `<img src="${url}" class="hover-zoom-image" style="max-width:240px;max-height:240px;margin:0 4px;vertical-align:middle;" />`
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
                        return `<img src="${imageUrl}" class="hover-zoom-image" style="max-width:160px;max-height:160px;margin-left:8px;vertical-align:middle;" />`;
                    }
                } else if (type === 'AUDIO') {
                    // Tìm URL audio tương ứng với hash
                    const audioUrl = findAudioUrlByHash(hash, choice);
                    if (audioUrl) {
                        return `<audio controls style="margin:4px 0;"><source src="${audioUrl}" type="audio/mpeg">Your browser does not support the audio element.</audio>`;
                    }
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
                    `<img src="${url}" class="hover-zoom-image" style="max-width:160px;max-height:160px;margin-left:8px;vertical-align:middle;" />`
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

    // render thông báo
    const toastQueue = [];
    let isToastShowing = false;

    function showToast(message, duration = 2000) {
        toastQueue.push({message, duration});
        if (!isToastShowing) {
            displayNextToast();
        }
    }

    function showToastError(message, duration = 2000) {
        toastQueue.push({message, duration, isError: true});
        if (!isToastShowing) {
            displayNextToast();
        }
    }

    async function displayNextToast() {
        if (!await checkAccess()) return;
        if (toastQueue.length === 0) {
            isToastShowing = false;
            return;
        }

        isToastShowing = true;
        const {message, duration, isError} = toastQueue.shift();

        const toast = document.createElement("div");
        toast.innerHTML = `
            <div style="
                width: 100%;
                background: ${isError ? '#f45450' : '#4caf50'};
                color: white;
                padding: 24px 0px 24px 0px;
                font-size: 16px;
                font-weight: bold;
                border-radius: 0;
                text-align: center;
                box-shadow: 0 2px 6px rgba(0,0,0,0.15);
                position: relative;
                overflow: hidden;
                pointer-events: auto;
                display: flex;
                align-items: center;
                justify-content: center;
            ">
                <span style="font-size:20px;margin-right:10px;">
                    ${isError ? '❌' : '✅'}
                </span>
                <span>${message}</span>
                <div style="
                    position: absolute;
                    bottom: 0;
                    left: 0;
                    height: 4px;
                    background: rgba(255,255,255,0.8);
                    animation: progressAnim ${duration}ms linear forwards;
                "></div>
            </div>
        `;

        const container = document.getElementById("toast-container");
        container.appendChild(toast);

        setTimeout(() => {
            toast.remove();
            displayNextToast();
        }, duration);
    }

    // Thêm animation CSS
    const style = document.createElement("style");
    style.textContent = `
        @keyframes progressAnim {
            from { width: 100%; }
            to { width: 0%; }
        }`;
    document.head.appendChild(style);


    const searchBox = document.querySelector(".search-box");
    const inputField = document.getElementById("question-input");

    inputField.addEventListener("focus", () => {
        searchBox.style.boxShadow = "0 0 6px rgba(26, 86, 219, 0.6)";
        searchBox.style.borderColor = "rgba(26, 86, 219, 0.6)";
    });

    inputField.addEventListener("blur", () => {
        searchBox.style.boxShadow = "0 0 2px rgba(0, 0, 0, 0.1)";
        searchBox.style.borderColor = "rgba(0, 0, 0, 0.2)";
    });

    // --- USER INFO DROPDOWN ---
    const usernameEl = document.getElementById("username");
    const userDropdown = document.getElementById("userDropdown");
    const userInfo = document.getElementById("userInfo");

    // Lấy profile và username từ localStorage (chrome.storage.local)
    chrome.storage.local.get(["profile", "username"], (data) => {
        const username = data.username || (data.profile && data.profile.username) || "";
        if (!username) {
            userInfo.style.display = "none";
            return;
        }
        userInfo.style.display = "";
        usernameEl.textContent = username;
        // Lấy danh sách môn từ profile
        let subjects = [];
        if (data.profile && data.profile.subjects) {
            subjects = data.profile.subjects;
        } else if (data.profile && data.profile.courses) {
            subjects = data.profile.courses;
        }
        // Render danh sách môn
        if (Array.isArray(subjects) && subjects.length > 0) {
            userDropdown.innerHTML = subjects.map(sub => `<li>${sub.name || sub.subjectName || sub.title || sub}</li>`).join("");
        } else {
            userDropdown.innerHTML = '<li style="color:#888;">No registered subjects</li>';
        }
    });

    userInfo.addEventListener("mouseenter", () => {
        if (userInfo.style.display === "none") return;
        userDropdown.style.display = "block";
    });
    userInfo.addEventListener("mouseleave", () => {
        if (userInfo.style.display === "none") return;
        userDropdown.style.display = "none";
    });
});
