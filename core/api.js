const API_URL = CONFIG.baseUrl;

// 🔁 Tự động gọi refresh token nếu accessToken hết hạn
async function tryRefreshToken() {
    return new Promise((resolve, reject) => {
        $.ajax({
            url: `${API_URL}/auth/refresh`,
            method: "POST",
            xhrFields: { withCredentials: true },
            success: function (res) {
                const newToken = res.accessToken;
                chrome.storage.local.set({ access_token: newToken }, () => {
                    resolve(newToken);
                });
            },
            error: function () {
                reject("Refresh token failed");
            }
        });
    });
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

            fetch(url, {
                ...options,
                headers
            })
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
                .then(resolve).catch(reject);
        });
    });
}

// 🔔 Thông báo chrome
function notify(title, message) {
    chrome.notifications.create({
        type: "basic",
        iconUrl: "icon.png",
        title: title,
        message: message
    });
}

