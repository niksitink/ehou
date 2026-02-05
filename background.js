const API_URL = "https://be.easyquizehou.io.vn/api";
const NOTIFICATION_ICON = "images/logo.png";

const OPAQUE_KEY_SECRET = "EasyQuizEhou";

// Encode username to opaqueKey
async function encodeUsername(username) {
    if (!username) return null;
    
    try {
        // Convert username to bytes
        const encoder = new TextEncoder();
        const payload = encoder.encode(username);
        
        // Create HMAC signature
        const key = await crypto.subtle.importKey(
            "raw",
            encoder.encode(OPAQUE_KEY_SECRET),
            { name: "HMAC", hash: "SHA-256" },
            false,
            ["sign"]
        );
        
        const signature = await crypto.subtle.sign("HMAC", key, payload);
        
        // Encode payload and signature to base64url
        const body = btoa(String.fromCharCode(...payload))
            .replace(/\+/g, '-')
            .replace(/\//g, '_')
            .replace(/=/g, '');
        
        const sig = btoa(String.fromCharCode(...new Uint8Array(signature)))
            .replace(/\+/g, '-')
            .replace(/\//g, '_')
            .replace(/=/g, '');
        
        return body + "." + sig;
    } catch (error) {
        console.error("Error encoding username:", error);
        return null;
    }
}

// Decode opaqueKey to username
async function decodeUsername(opaqueKey) {
    if (!opaqueKey || !opaqueKey.includes(".")) return null;
    
    try {
        const parts = opaqueKey.split(".");
        if (parts.length !== 2) return null;
        
        // Decode payload
        const body = parts[0]
            .replace(/-/g, '+')
            .replace(/_/g, '/');
        const payload = new Uint8Array(atob(body).split('').map(c => c.charCodeAt(0)));
        
        // Verify signature
        const encoder = new TextEncoder();
        const key = await crypto.subtle.importKey(
            "raw",
            encoder.encode(OPAQUE_KEY_SECRET),
            { name: "HMAC", hash: "SHA-256" },
            false,
            ["sign", "verify"]
        );
        
        const sig = parts[1]
            .replace(/-/g, '+')
            .replace(/_/g, '/');
        const signature = new Uint8Array(atob(sig).split('').map(c => c.charCodeAt(0)));
        
        const expectedSignature = await crypto.subtle.sign("HMAC", key, payload);
        const expectedSig = new Uint8Array(expectedSignature);
        
        // Compare signatures
        if (signature.length !== expectedSig.length) return null;
        for (let i = 0; i < signature.length; i++) {
            if (signature[i] !== expectedSig[i]) return null;
        }
        
        // Return decoded username
        const decoder = new TextDecoder();
        return decoder.decode(payload);
    } catch (error) {
        console.error("Error decoding opaqueKey:", error);
        return null;
    }
}

// 🔁 Tự động gọi refresh token nếu accessToken hết hạn
async function tryRefreshToken() {
    try {
        const response = await fetch(`${API_URL}/auth/refresh`, {
            method: "POST",
            credentials: "include",
            headers: {
                "Content-Type": "application/json"
            }
        });
        
        if (!response.ok) {
            throw new Error("Refresh token failed");
        }
        
        const res = await response.json();
        const newToken = res.accessToken;
        
        return new Promise((resolve, reject) => {
            chrome.storage.local.set({access_token: newToken}, () => {
                resolve(newToken);
            });
        });
    } catch (error) {
        throw new Error("Refresh token failed");
    }
}

// 🔁 API với auto refresh
async function fetchWithAuth(url, options = {}) {
    return new Promise((resolve, reject) => {
        chrome.storage.local.get("access_token", (data) => {
            const token = data.access_token;
            const headers = {
                ...(options.headers || {}),
                Authorization: `Bearer ${token}`
            };

            fetch(url, { ...options, headers })
                .then(async res => {
                    if (res.status === 401) {
                        try {
                            const newToken = await tryRefreshToken();
                            const retryRes = await fetch(url, {
                                ...options,
                                headers: { ...headers, Authorization: `Bearer ${newToken}` }
                            });
                            return retryRes;
                        } catch (error) {
                            throw new Error('Phiên đăng nhập đã hết hạn, vui lòng đăng nhập lại!');
                        }
                    }
                    return res;
                })
                .then(resolve)
                .catch(reject);
        });
    });
}

// 🔔 Thông báo chrome
function notify(title, message) {
    chrome.notifications.create({
        type: "basic",
        iconUrl: NOTIFICATION_ICON,
        title: title,
        message: message
    });
}

chrome.runtime.onInstalled.addListener(() => {
    // Gốc
    chrome.contextMenus.create({
        id: "easyquiz-root",
        title: "Easy Quiz EHOU 📚",
        contexts: ["all"]
    });

    // Sub: Hiển thị đáp án (chỉ khi bôi đen)
    chrome.contextMenus.create({
        id: "show-answer",
        parentId: "easyquiz-root",
        title: "📘 Hiển thị đáp án",
        contexts: ["selection"]
    });

    // Sub: Tìm câu hỏi (luôn hiện)
    chrome.contextMenus.create({
        id: "find-question",
        parentId: "easyquiz-root",
        title: "🔍 Tìm câu hỏi",
        contexts: ["all"]
    });
});


chrome.contextMenus.onClicked.addListener((info, tab) => {
    const questionText = info.selectionText || "";

    if (info.menuItemId === "find-question") {
        chrome.storage.local.set({last_question: questionText}, () => {
            chrome.sidePanel.setOptions({
                tabId: tab.id,
                path: "sidepanel.html",
                enabled: true
            });
            chrome.sidePanel.open({tabId: tab.id});
        });
    } else if (info.menuItemId === "show-answer") {
        // ✅ Gửi đến contentScript để xử lý như cũ
        chrome.tabs.sendMessage(tab.id, {
            type: "contextSearch",
            question: questionText
        });
    }
});

// Utility function to handle BaseResponse
function handleBaseResponse(response) {
    if (!response) return { success: false, error: "No response from server" };
    
    // Check if response has a type field (old format)
    if (response.type) {
        // Handle different response types
        switch (response.type) {
            case "SUCCESS":
                return { success: true, data: response.data };
            case "ERROR":
                return { success: false, error: response.message || "An error occurred" };
            case "WARNING":
                return { success: false, warning: response.message };
            case "ERROR_LOGIN":
                return { success: false, error: "Session expired", needLogin: true };
            case "INVALID_PERMISSION":
                return { success: false, error: "Invalid permission" };
            default:
                return { success: false, error: "Unknown response type" };
        }
    }
    
    // New format: response might be direct data or have different structure
    // For check-hashes endpoint, expect: { missingHashes: [], existingFiles: {}, totalRequested: X, totalExisting: Y, totalMissing: Z }
    if (response.missingHashes !== undefined && response.existingFiles !== undefined) {
        return { success: true, data: response };
    }
    
    // Legacy format: check for existingHashes (old format)
    if (response.missingHashes !== undefined && response.existingHashes !== undefined) {
        return { success: true, data: response };
    }
    
    // If response has data field, use it
    if (response.data) {
        return { success: true, data: response.data };
    }
    
    // If response is an array or object, assume it's valid data
    if (Array.isArray(response) || typeof response === 'object') {
        return { success: true, data: response };
    }
    
    // Fallback: assume success if we have any response
    return { success: true, data: response };
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    // Handle opaqueKey encoding requests
    if (message.type === "encodeUsername") {
        encodeUsername(message.username)
            .then(opaqueKey => {
                sendResponse({ success: true, opaqueKey });
            })
            .catch(error => {
                sendResponse({ success: false, error: error.message });
            });
        return true;
    }
    
    // Handle opaqueKey decoding requests
    if (message.type === "decodeUsername") {
        decodeUsername(message.opaqueKey)
            .then(username => {
                sendResponse({ success: true, username });
            })
            .catch(error => {
                sendResponse({ success: false, error: error.message });
            });
        return true;
    }
    
    if (message.type === "getQuestionsTab") {
        const tabId = message.tabId;  // Lấy tabId từ thông điệp

        // Lấy dữ liệu từ tab đang mở và gửi lại cho popup
        chrome.tabs.sendMessage(tabId, {type: "getQuestions"}, (response) => {
            if (response && response.questions) {
                sendResponse({questions: response.questions, subjectCode: response.subjectCode});  // Trả về câu hỏi
            } else {
                sendResponse({questions: []});  // Không có dữ liệu
            }
        });

        return true;
    }
    if (message.type === "saveQuestions") {
        fetchWithAuth(`${API_URL}/questions`, {
            method: "POST",
            headers: {"Content-Type": "application/json"},
            body: JSON.stringify(message.data)
        })
            .then(async res => {
                if (!res.ok) throw new Error("Lỗi phản hồi từ server");
                const response = await res.json();
                const result = handleBaseResponse(response);
                if (!result.success) {
                    notify("Lỗi", result.error);
                    sendResponse({ success: false, error: result.error });
                } else {
                    sendResponse({ success: true });
                }
            })
            .catch((err) => {
                sendResponse({ success: false, error: err?.message || "Lỗi hệ thống" });
            });
        return true;
    }
    if (message.type === "searchQuestion") {
        const {question, subjectCode, learningAccount} = message.payload;

        fetchWithAuth(`${API_URL}/questions/search`, {
            method: "POST",
            headers: {"Content-Type": "application/json"},
            body: JSON.stringify({
                question: {
                    text: question,
                    imageUrls: [],
                    imageBase64: [],
                    imageHashes: []
                },
                subjectCode: subjectCode,
                learningAccount: learningAccount,
                choices: []
            })
        })
            .then(async res => {
                if (!res.ok) throw new Error("Lỗi phản hồi từ server");
                const response = await res.json();
                const result = handleBaseResponse(response);
                
                if (!result.success) {
                    if (result.needLogin) {
                        sendResponse({
                            success: false,
                            data: [{ai: null, explanation: "Bạn cần đăng nhập Easy Quiz EHOU"}]
                        });
                    } else {
                        sendResponse({
                            success: false,
                            data: [{
                                ai: true,
                                explanation: result.error || "Lỗi hệ thống, vui lòng thử lại sau!"
                            }]
                        });
                    }
                } else {
                    sendResponse({success: true, data: result.data});
                }
            }).catch(err => {
                notify("Lỗi", "🚨 Không thể gửi dữ liệu");
                sendResponse({success: false, error: err.message});
            });

        return true;
    }
    if (message.type === "checkFileHashes") {
        const {hashes} = message.payload;

        fetchWithAuth(`${API_URL}/files/check-hashes`, {
            method: "POST",
            headers: {"Content-Type": "application/json"},
            body: JSON.stringify({hashes})
        })
            .then(async res => {
                if (!res.ok) throw new Error("Lỗi phản hồi từ server");
                const response = await res.json();
                const result = handleBaseResponse(response);
                
                if (!result.success) {
                    if (result.needLogin) {
                        sendResponse({
                            success: false,
                            error: "Bạn cần đăng nhập Easy Quiz EHOU"
                        });
                    } else {
                        sendResponse({
                            success: false,
                            error: result.error || "Lỗi hệ thống, vui lòng thử lại sau!"
                        });
                    }
                } else {
                    sendResponse({success: true, data: result.data});
                }
            }).catch(err => {
                notify("Lỗi", "🚨 Không thể kiểm tra file hashes");
                sendResponse({success: false, error: err.message});
            });

        return true;
    }
    if (message.type === "getFileUrls") {
        const {hashes} = message.payload;

        fetchWithAuth(`${API_URL}/files/get-urls`, {
            method: "POST",
            headers: {"Content-Type": "application/json"},
            body: JSON.stringify({hashes})
        })
            .then(async res => {
                if (!res.ok) throw new Error("Lỗi phản hồi từ server");
                const response = await res.json();
                const result = handleBaseResponse(response);
                
                if (!result.success) {
                    if (result.needLogin) {
                        sendResponse({
                            success: false,
                            error: "Bạn cần đăng nhập Easy Quiz EHOU"
                        });
                    } else {
                        sendResponse({
                            success: false,
                            error: result.error || "Lỗi hệ thống, vui lòng thử lại sau!"
                        });
                    }
                } else {
                    sendResponse({success: true, data: result.data});
                }
            }).catch(err => {
                notify("Lỗi", "🚨 Không thể lấy file URLs");
                sendResponse({success: false, error: err.message});
            });

        return true;
    }
    
    // ✅ Xử lý tìm kiếm nhiều câu hỏi cho nút "Làm bài ngay"
    if (message.type === "searchMultipleQuestions") {
        const {questions, subjectCode, learningAccount, opaqueKey} = message.payload;

        fetchWithAuth(`${API_URL}/questions/search/multiple`, {
            method: "POST",
            headers: {"Content-Type": "application/json"},
            body: JSON.stringify({questions, subjectCode, learningAccount, opaqueKey})
        })
            .then(async res => {
                if (!res.ok) throw new Error("Lỗi phản hồi từ server");
                const response = await res.json();
                const result = handleBaseResponse(response);
                
                if (!result.success) {
                    if (result.needLogin) {
                        sendResponse({
                            success: false,
                            error: "Bạn cần đăng nhập Easy Quiz EHOU"
                        });
                    } else {
                        sendResponse({
                            success: false,
                            error: result.error || "Lỗi hệ thống, vui lòng thử lại sau!"
                        });
                    }
                } else {
                    sendResponse({success: true, data: result.data});
                }
            }).catch(err => {
                notify("Lỗi", err.message ? err.message : "🚨 Không thể tìm kiếm câu hỏi");
                sendResponse({success: false, error: err.message});
            });

        return true;
    }
});
