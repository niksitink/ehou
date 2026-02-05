let currentScreen = null;
let lastScreen = null;
let tomSelectInstance = null;
let stompClient = null;

async function getLearningAccount() {
    const { usernameEhou } = await new Promise(resolve => {
        chrome.storage.local.get("usernameEhou", resolve);
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

// 🔐 Wrapper function để xử lý lỗi authentication từ fetchWithAuth
async function safeFetchWithAuth(url, options = {}) {
    try {
        const response = await fetchWithAuth(url, options);
        return response;
    } catch (error) {
        // Kiểm tra nếu là lỗi "Phiên đăng nhập đã hết hạn"
        if (error.message === 'Phiên đăng nhập đã hết hạn, vui lòng đăng nhập lại!') {
            // Tự động đăng xuất và chuyển về màn hình đăng nhập
            chrome.storage.local.clear(() => {
                checkLogin();
            });
            throw error;
        }
        
        throw error;
    }
}

// Hàm escape HTML để tránh XSS
function escapeHtml(text) {
    if (!text) return '';
    const map = {
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#039;'
    };
    return String(text).replace(/[&<>"']/g, m => map[m]);
}

// Hàm hiển thị popup xác nhận thông tin đăng ký
function showConfirmRegistrationModal(registrationData, onConfirm) {
    // Escape HTML để tránh XSS
    const safeUsername = escapeHtml(registrationData.username);
    const safeEmail = escapeHtml(registrationData.email);
    const safePhone = escapeHtml(registrationData.phone);
    const safeStudentCode = escapeHtml(registrationData.studentCode || 'Chưa nhập');
    
    const modalHtml = `
        <div class="modal" id="confirmRegistrationModal" style="position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.7); display: flex; justify-content: center; align-items: center; z-index: 9999;">
            <div class="modal-content" style="background: #222; color: #eee; padding: 25px; max-width: 400px; width: 90%; border-radius: 12px; position: relative; box-shadow: 0 4px 20px rgba(0,0,0,0.5);">
                <span class="close" style="position: absolute; right: 15px; top: 15px; cursor: pointer; font-size: 24px; color: #999; transition: color 0.3s;">&times;</span>
                <h3 style="margin-top: 0; margin-bottom: 20px; color: #4CAF50; text-align: center;">📋 Xác nhận thông tin đăng ký</h3>
                <div style="background: #2a2a3a; padding: 15px; border-radius: 8px; margin-bottom: 20px;">
                    <p style="margin: 10px 0; font-size: 14px;"><strong style="color: #90ee90;">Username:</strong> <span style="color: #fff;">${safeUsername}</span></p>
                    <p style="margin: 10px 0; font-size: 14px;"><strong style="color: #90ee90;">Email:</strong> <span style="color: #fff;">${safeEmail}</span></p>
                    <p style="margin: 10px 0; font-size: 14px;"><strong style="color: #90ee90;">Số điện thoại:</strong> <span style="color: #fff;">${safePhone}</span></p>
                    <p style="margin: 10px 0; font-size: 14px;"><strong style="color: #90ee90;">Mã sinh viên:</strong> <span style="color: #fff;">${safeStudentCode}</span></p>
                </div>
                <p style="color: #ffd700; font-size: 13px; text-align: center; margin-bottom: 20px; line-height: 1.5;">
                    ⚠️ Vui lòng kiểm tra kỹ thông tin. Sau khi xác nhận, bạn sẽ nhận được email để xác nhận tài khoản.
                </p>
                <div style="display: flex; gap: 10px; justify-content: center;">
                    <button id="cancelConfirm" class="gradient-btn" style="background: #666; padding: 10px 20px; border: none; border-radius: 6px; color: white; cursor: pointer; font-size: 14px;">Hủy</button>
                    <button id="confirmRegistration" class="gradient-btn purple-blue" style="padding: 10px 20px; border: none; border-radius: 6px; color: white; cursor: pointer; font-size: 14px;">Xác nhận</button>
                </div>
            </div>
        </div>
    `;

    const $modal = $(modalHtml);
    $('body').append($modal);

    // Đóng modal khi click nút X hoặc Hủy
    $modal.find('.close, #cancelConfirm').click(() => {
        $modal.fadeOut(200, () => $modal.remove());
    });

    // Xác nhận đăng ký
    $modal.find('#confirmRegistration').click(() => {
        $modal.fadeOut(200, () => $modal.remove());
        if (onConfirm) {
            onConfirm();
        }
    });

    // Đóng modal khi click ra ngoài
    $modal.click((e) => {
        if ($(e.target).is('#confirmRegistrationModal')) {
            $modal.fadeOut(200, () => $modal.remove());
        }
    });

    $modal.fadeIn(200);
}

function register() {
    const $form = $('#registerWrapper .form-screen');
    const username = $form.find('.username').val().trim();
    const email = $form.find('.email').val().trim();
    const password = $form.find('.pwd').val().trim();
    const confirmPassword = $form.find('.confirm-pwd').val().trim();
    const phone = $form.find('.phone').val().trim();
    const studentCode = $form.find('.student-code').val().trim(); // Tùy chọn

    // Kiểm tra các trường bắt buộc (studentCode là tùy chọn)
    if (!username || !email || !password || !confirmPassword || !phone) {
        showErrorToast("Vui lòng điền đầy đủ thông tin!");
        return;
    }

    // Kiểm tra email hợp lệ
    if (!validate(email)) {
        return; // validate() đã hiển thị thông báo lỗi
    }

    // Kiểm tra số điện thoại hợp lệ
    if (!validatePhone(phone)) {
        return; // validatePhone() đã hiển thị thông báo lỗi
    }

    // Kiểm tra mật khẩu khớp nhau
    if (password !== confirmPassword) {
        showErrorToast("Mật khẩu xác nhận không khớp!");
        return;
    }

    // Hiển thị popup xác nhận thông tin
    const registrationData = {
        username: username,
        email: email,
        phone: phone,
        studentCode: studentCode || null
    };

    showConfirmRegistrationModal(registrationData, () => {
        // Hàm này được gọi khi người dùng xác nhận
        submitRegistration(username, email, password, phone, studentCode, $form);
    });
}

// Hàm gửi request đăng ký
function submitRegistration(username, email, password, phone, studentCode, $form) {
    // Tạo object dữ liệu, chỉ thêm studentCode nếu có giá trị
    const registrationData = {username, email, password, phone};
    if (studentCode && studentCode.trim() !== '') {
        registrationData.studentCode = studentCode.trim();
    }
    
    $.ajax({
        url: `${API_URL}/auth/register`,
        method: "POST",
        contentType: "application/json",
        data: JSON.stringify(registrationData),
        success: function(response) {
            // Hiển thị thông báo từ server (có thể chứa thông tin về email verification)
            const message = response.message || "Đăng ký thành công. Vui lòng kiểm tra email để xác nhận tài khoản.";
            showToast(message);
            
            // Chuyển đến màn hình thông báo kiểm tra email
            showScreen("emailVerificationWrapper");
            
            // Xóa form đăng ký
            $form.find('.username, .email, .phone, .student-code, .pwd, .confirm-pwd').val('');
        },
        error: function(xhr) {
            let errorMessage = "Đã có lỗi xảy ra!";
            
            // Xử lý lỗi từ server
            if (xhr.responseJSON && xhr.responseJSON.message) {
                errorMessage = xhr.responseJSON.message;
            } else if (xhr.responseText) {
                try {
                    const errorData = JSON.parse(xhr.responseText);
                    if (errorData.message) {
                        errorMessage = errorData.message;
                    }
                } catch (e) {
                    // Nếu không parse được JSON, dùng message mặc định
                }
            }
            
            showErrorToast(errorMessage);
        }
    });
}

function login() {
    const username = $('.user').val();
    const password = $('.pwd').val();

    $.ajax({
        url: `${API_URL}/auth/login`,
        method: "POST",
        contentType: "application/json",
        data: JSON.stringify({username, password}),
        xhrFields: {
            withCredentials: true // ✅ để nhận HttpOnly cookie từ server
        },
        success: function (res) {
            chrome.storage.local.set({
                access_token: res.accessToken,
                username: res.username || username,
                role: res.role || '' // Lưu role nếu có
            }, () => {
                // Lấy thông tin profile sau khi đăng nhập thành công
                getProfile();
                showToast("Đăng nhập thành công");
                $("#user").text(username);
                $(".user-menu").show();
                showScreen("wrap");
                loadSubjectsIfNeeded();
            });
        },
        error: function (xhr) {
            // Xử lý lỗi 403 - Email chưa được xác nhận
            if (xhr.status === 403) {
                let errorMessage = "Sai tài khoản hoặc mật khẩu!";
                
                // Kiểm tra message từ server
                if (xhr.responseJSON && xhr.responseJSON.message) {
                    errorMessage = xhr.responseJSON.message;
                } else if (xhr.responseText) {
                    try {
                        const errorData = JSON.parse(xhr.responseText);
                        if (errorData.message) {
                            errorMessage = errorData.message;
                        }
                    } catch (e) {
                        // Nếu không parse được JSON, dùng message mặc định
                    }
                }
                
                // Kiểm tra nếu message có chứa thông tin về email chưa xác nhận
                if (errorMessage.includes("chưa được xác nhận email") || 
                    errorMessage.includes("chưa xác nhận") ||
                    errorMessage.toLowerCase().includes("email")) {
                    // Hiển thị thông báo chi tiết và chuyển đến màn hình thông báo
                    showErrorToast(errorMessage);
                    // Có thể hiển thị modal hoặc chuyển đến màn hình thông báo email
                    setTimeout(() => {
                        showScreen("emailVerificationWrapper");
                    }, 2000);
                } else {
                    showErrorToast(errorMessage);
                }
            } else {
                // Xử lý các lỗi khác
                let errorMessage = "Sai tài khoản hoặc mật khẩu!";
                if (xhr.responseJSON && xhr.responseJSON.message) {
                    errorMessage = xhr.responseJSON.message;
                } else if (xhr.responseText) {
                    try {
                        const errorData = JSON.parse(xhr.responseText);
                        if (errorData.message) {
                            errorMessage = errorData.message;
                        }
                    } catch (e) {
                        // Nếu không parse được JSON, dùng message mặc định
                    }
                }
                showErrorToast(errorMessage);
            }
        }
    });
}

function logout() {
    chrome.storage.local.clear(() => {
        showToast("Đăng xuất thành công");
        $(".user-menu").hide();
        showScreen("entry")
    });
}

function checkLogin() {
    chrome.storage.local.get(["access_token", "username"], function (data) {
        if (data.access_token && data.username) {
            showScreen("wrap");
            $("#user").text(data.username);
            $(".user-menu").show();
            loadSubjectsIfNeeded();
        } else {
            showScreen("entry")
            $(".user-menu").hide();
        }
    });
}

function loadSubjectsIfNeeded() {
    chrome.storage.local.get(['subjects'], ({subjects}) => {
        if (!subjects || subjects.length === 0) {
            loadSubjects();
        } else {
            renderSubjects(subjects);
        }
    });
}

function renderSubjects(subjects) {
    const tomSelect = tomSelectInstance;
    if (!tomSelect) {
        return;
    }

    const previousValue = tomSelect.getValue();

    tomSelect.clear();
    tomSelect.clearOptions();

    if (!subjects || subjects.length === 0) {
        tomSelect.addOption({value: '', text: 'Không có môn học nào', disabled: true});
        tomSelect.setValue('');
        return;
    }

    subjects.forEach(sub => {
        tomSelect.addOption({
            value: sub.id,
            text: `${sub.courseCode} - ${sub.name}`
        });
    });

    if (previousValue && subjects.some(sub => sub.id === previousValue)) {
        tomSelect.setValue(previousValue);
    } else {
        tomSelect.setValue('');
    }

    // Cập nhật trạng thái nút và hiển thị số lượt đổi môn nếu có
    updateChangeButtonState();
    updateChangeAttemptsDisplay();
}

function loadSubjects() {
    const $subjectRow = $('.subject-row');
    $subjectRow.addClass('loading');

    safeFetchWithAuth(`${API_URL}/subjects/all`)
        .then(res => res.json())
        .then(subjects => {
            chrome.storage.local.set({subjects});
            renderSubjects(subjects);
        })
        .catch(() => {
            showErrorToast("Lỗi khi tải môn học!");
        })
        .finally(() => {
            $subjectRow.removeClass('loading');
        });
}

// Hàm cập nhật trạng thái nút Đổi
function updateChangeButtonState() {
    if (!tomSelectInstance) return;

    const selectedSubjectId = tomSelectInstance.getValue();

    const $changeButton = $("#change-course");

    if (!selectedSubjectId) {
        $changeButton.prop('disabled', true).text('Đổi');
        return;
    }

    // Kiểm tra xem môn đã được đăng ký chưa
    chrome.storage.local.get(['profile'], function (data) {
        const registeredSubjects = data.profile?.subjects || [];
        const isRegistered = registeredSubjects.some(sub => sub.id === selectedSubjectId);

        if (isRegistered) {
            $changeButton.prop('disabled', true)
                .text('Đã có')
                .css({
                    'background': '#7c7c7c',
                    'opacity': '0.6',
                    'cursor': 'not-allowed'
                });
        } else {
            $changeButton.prop('disabled', false)
                .text('Đổi')
                .css({
                    'background': '',
                    'opacity': '1',
                    'cursor': 'pointer'
                });
        }
    });
}

// Hàm cập nhật hiển thị số lượt đổi môn
function updateChangeAttemptsDisplay() {
    chrome.storage.local.get(['profile'], function (data) {
        const points = data.profile?.points;
        const $attemptsDisplay = $('#changeAttemptsDisplay');

        if (!$attemptsDisplay.length) {
            // Tạo element nếu chưa tồn tại và thêm vào sau select box
            const $display = $('<div id="changeAttemptsDisplay" class="change-attempts" style="margin-top: 8px; font-size: 13px; color: #666;"></div>');
            $('.ts-wrapper').after($display);
        }

        if (!points || points === 0) {
            $('#changeAttemptsDisplay').html('Bạn không còn lượt đổi môn. <a href="#" id="buyMorePoints" style="color: #007bff; text-decoration: underline;">Mua gói</a> để mua thêm');
        } else {
            $('#changeAttemptsDisplay').html(`Bạn còn ${points} lượt đổi môn`);
        }

        // Thêm sự kiện click cho link mua gói
        $('#buyMorePoints').off('click').on('click', function (e) {
            e.preventDefault();
            showScreen("donateModal");
        });
    });
}

async function checkCurrentQuiz() {
    if (!await checkAccess()) return;
    chrome.tabs.query({active: true, currentWindow: true}, (tabs) => {
        const tab = tabs[0];
        if (!tab) return;

        // Hiển thị trạng thái loading ngay khi bắt đầu
        showToast("🔎 Đang tìm kiếm...");
        
        // Set timeout for AI analysis message
        const aiTimeout = setTimeout(() => {
            showToast("🤖 AI đang phân tích...");
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
                    }
                }
            } else {
                // Lấy được từ trang web, lưu vào storage để dùng cho lần sau
                chrome.storage.local.set({ currentSubjectCode: subjectCode });
            }

            if (!questions || !questions.length) {
                clearTimeout(aiTimeout);
                return showErrorToast("Không lấy được câu hỏi nào từ trang vui lòng loading lại trang!");
            }

            try {            
                const learningAccount = await getLearningAccount();
                const opaqueKey = await getOpaqueKey();

                const fetchRes = await safeFetchWithAuth(`${API_URL}/questions/search/multiple`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
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
                        // Nếu backend trả về message lỗi, ưu tiên hiển thị message đó
                        if (errorData && errorData.message) {
                            errorMsg = errorData.message;
                        }
                    } catch (e) {}
                    throw new Error(errorMsg);
                }

                const response = await fetchRes.json();
                clearTimeout(aiTimeout);

                const serverData = response.data || [];
                if (response.type === 'ERROR' && response.message) {
                    showErrorToast(response.message);
                    return;
                }
                if (Array.isArray(serverData) && serverData.length > 0) {
                    showToast(`Tìm thấy ${serverData.length} đáp án phù hợp! Đang xử lý điền...`);
                    
                    // Gửi trực tiếp dữ liệu thô từ backend sang contentScript
                    chrome.tabs.sendMessage(tab.id, {type: "backendAnswers", serverData: serverData}, (resp) => {
                        showToast("Đã điền đáp án! 🧠✅");
                    });
                } else {
                    showErrorToast("Không tìm thấy đáp án phù hợp!");
                }

            } catch (err) {
                clearTimeout(aiTimeout);
                showErrorToast(err.message || "Lỗi hệ thống, vui lòng thử lại sau!");
            }
        });
    });
}


async function saveQuestions() {
    chrome.tabs.query({active: true, currentWindow: true}, async (tabs) => {
        const tab = tabs[0];
        if (!tab) {
            showToast("Không tìm thấy tab hiện tại!");
            return;
        }
        chrome.tabs.sendMessage(tab.id, {type: "saveQuestions"}, (resp) => {
            if (resp && resp.success) {
                showToast("Đã lưu câu hỏi! 📚✅");
            } else {
                showErrorToast(resp?.error || "Lưu câu hỏi thất bại!");
            }
        });
    });
}

// ✨ Hàm show màn có hiệu ứng
function showScreen(id) {
    // Ẩn tất cả màn hình
    $(".entry-screen, .form-screen-wrapper, .main-actions").hide();

    // Ghi nhớ màn trước
    if (currentScreen !== id) {
        lastScreen = currentScreen;
        currentScreen = id;
    }

    // Thêm/xóa class register-mode cho body khi hiển thị form đăng ký
    if (id === "registerWrapper") {
        $("body").addClass("register-mode");
    } else {
        $("body").removeClass("register-mode");
    }

    // Hiện màn hình cần thiết với hiệu ứng
    $(`#${id}`).fadeIn(250);

    // Hiện nút back nếu cần
    const needBack = ["loginWrapper", "registerWrapper", "emailVerificationWrapper", "donateModal", "qrModal"];
    $("#backToHome").toggle(needBack.includes(id));

    // Map chiều cao tương ứng từng màn
    const screenHeights = {
        registerWrapper: "500px",
        loginWrapper: "380px",
        emailVerificationWrapper: "460px",
        wrap: "450px"
    };

    $("body, html").css("height", screenHeights[id] || "280px");
}

function connectSocket(transactionCode) {
    const socket = new SockJS("https://be.easyquizehou.io.vn/ws-payment");
    stompClient = Stomp.over(socket);

    stompClient.connect({}, function () {
        stompClient.subscribe(`/topic/payment/${transactionCode}`, function (message) {
            const body = JSON.parse(message.body);

            if (body.status === "SUCCESS") {
                showToast("Thanh toán thành công!");
                getProfile();
                setTimeout(() => showScreen("wrap"), 1500);
            }
        });
    });
}

function purchase(packageId) {
    chrome.storage.local.get(["username"], (data) => {
        if (!data.username) return showErrorToast("Chưa đăng nhập!");

        safeFetchWithAuth(`${API_URL}/payment/create`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                packageId: packageId
            })
        })
            .then(async (res) => {
                if (!res.ok) {
                        const errorData = await res.json();
                        const errorMessage = errorData.message || "Tạo thanh toán thất bại";
                        throw new Error(errorMessage);                
                }
                return res.json();
            })
            .then(result => {
                const qrText = result.qrCode;
                const transactionCode = result.transactionCode;

                if (!qrText || typeof qrText !== "string") {
                    return showErrorToast("QR Code không hợp lệ!");
                }
                // 🧠 Kết nối WebSocket
                connectSocket(transactionCode);
                // ✅ Dùng thư viện qrcode (soldair) để render
                QRCode.toDataURL(qrText, {width: 220, margin: 2}, function (err, url) {
                    if (err) {
                        return showErrorToast("Không thể hiển thị mã QR!");
                    }

                    $("#qrImageBig").attr("src", url);
                    showScreen("qrModal");
                    showToast("Mã QR đã sẵn sàng để thanh toán");
                });
            })
            .catch(err => {
                showErrorToast(err.message || "Không thể tạo QR thanh toán!");
            });
    });
}

// Hàm lấy thông tin profile
function getProfile() {
    return safeFetchWithAuth(`${API_URL}/auth/profile`)
        .then(res => res.json())
        .then(response => {
            if (response.code === 'SUCCESS' && response.data) {
                const profile = response.data;
                return new Promise((resolve) => {
                    chrome.storage.local.set({ profile }, () => {
                        updateChangeAttemptsDisplay();
                        resolve(profile);
                    });
                });
            } else {
                throw new Error(`API returned unexpected structure: ${JSON.stringify(response)}`);
            }
        })
        .catch(err => {
            showErrorToast("Không tìm thấy thông tin profile!");
        });
}

function showProfile() {
    chrome.storage.local.get(["profile"], function (data) {
        if (!data.profile) {
            showErrorToast("Không tìm thấy thông tin profile!");
            return;
        }

        const profile = data.profile;
        const subjects = Array.isArray(profile.subjects) ? profile.subjects : [];
        const role = (profile.role || '').toString().trim().toLowerCase();
        const isAdmin = ['admin', 'partner'].includes(role);
        const studentCode = profile.studentCode;
        const canUpdateStudentCode = isAdmin || (studentCode === null || studentCode === undefined || studentCode === '');

        // Tạo danh sách rút gọn tối đa 5 môn
        const maxDisplay = 5;
        const displaySubjects = subjects.slice(0, maxDisplay);
        const remainingCount = subjects.length - maxDisplay;

        // Tạo html danh sách rút gọn
        const subjectListHtml = displaySubjects.length > 0
            ? `<ul class="subject-list-scrollable" style="max-height: 120px;">
                ${displaySubjects.map(sub => `<li>${sub.courseCode} - ${sub.name}</li>`).join('')}
              </ul>`
            : '<p>Chưa đăng ký môn nào</p>';

        // Thêm link xem tất cả nếu còn môn học khác
        const seeAllLinkHtml = (remainingCount > 0)
            ? `<p style="margin-top: 6px; cursor: pointer; color: #007bff; text-decoration: underline;" id="seeAllSubjectsLink">
                    ... và ${remainingCount} môn khác
               </p>`
            : '';

        // Tạo nút cập nhật mã sinh viên (chỉ hiện khi có quyền)
        const updateStudentCodeBtnHtml = canUpdateStudentCode
            ? `<button id="updateStudentCodeBtn" style="margin-left: 10px; padding: 4px 8px; font-size: 12px; background: #007bff; color: white; border: none; border-radius: 4px; cursor: pointer;">${studentCode ? 'Cập nhật' : 'Thêm mã'}</button>`
            : '';

        const profileHtml = `
            <div class="profile-info">
                <h3>Thông tin cá nhân</h3>
                <p><strong>Username:</strong> ${profile.username || profile.userName || 'Không có'}</p>
                <p><strong>Email:</strong> ${profile.email}</p>
                <p><strong>Phone:</strong> ${profile.phone || 'Chưa cập nhật'}</p>
                <p><strong>Mã sinh viên:</strong> ${studentCode || 'Chưa cập nhật'} 
                    ${updateStudentCodeBtnHtml}
                </p>
                <p><strong>Role:</strong> ${profile.role}</p>
                <p><strong>Points:</strong> ${profile.points != null ? profile.points : 'Không rõ'}</p>
                <p><strong>Search free:</strong> ${profile.freeSearch != null ? profile.freeSearch : '0'}</p>
                <div style="margin-top:10px;">
                    <strong>Môn đã đăng ký:</strong>
                    ${subjectListHtml}
                    ${seeAllLinkHtml}
                </div>
            </div>
        `;

        // Tạo modal chính
        const $modal = $(`
            <div class="modal" id="profileModal" style="position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.6); display: flex; justify-content: center; align-items: center; z-index: 9999;">
                <div class="modal-content" style="background: #222; color: #eee; padding: 20px; max-width: 400px; max-height: 80vh; overflow-y: auto; border-radius: 6px; position: relative;">
                    <span class="close" style="position: absolute; right: 10px; top: 10px; cursor: pointer; font-size: 20px;">&times;</span>
                    ${profileHtml}
                </div>
            </div>
        `);

        $('body').append($modal);

        // Đóng modal chính
        $modal.find('.close').click(() => {
            $modal.remove();
        });

        // Bắt sự kiện click xem tất cả môn học
        $modal.find('#seeAllSubjectsLink').click(() => {
            showAllSubjectsModal(subjects);
        });

        // Bắt sự kiện click nút cập nhật mã sinh viên (nếu có)
        const $updateBtn = $modal.find('#updateStudentCodeBtn');
        if ($updateBtn.length > 0) {
            $updateBtn.click(() => {
                $modal.remove();
                showUpdateStudentCodeModal();
            });
        }

        $modal.fadeIn(200);
    });
}

// Modal phụ để hiển thị toàn bộ môn học đăng ký
function showAllSubjectsModal(subjects) {
    const subjectListHtml = subjects.length > 0
        ? `<ul class="subject-list-scrollable">
            ${subjects.map(sub => `<li>${sub.courseCode} - ${sub.name}</li>`).join('')}
           </ul>`
        : '<p>Chưa đăng ký môn nào</p>';

    const $modal = $(`
        <div class="modal" id="allSubjectsModal" style="position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.75); display: flex; justify-content: center; align-items: center; z-index: 10000;">
            <div class="modal-content" style="background: #222; color: #eee; padding: 20px; max-width: 400px; max-height: 80vh; overflow-y: auto; border-radius: 6px; position: relative;">
                <span class="close" style="position: absolute; right: 10px; top: 10px; cursor: pointer; font-size: 20px;">&times;</span>
                <h3>Danh sách môn học đăng ký đầy đủ</h3>
                ${subjectListHtml}
            </div>
        </div>
    `);

    $('body').append($modal);

    // Đóng modal phụ
    $modal.find('.close').click(() => {
        $modal.remove();
    });

    $modal.fadeIn(200);
}

// Hàm cập nhật mã sinh viên
async function updateStudentCode(studentCode) {
    try {
        const response = await safeFetchWithAuth(`${API_URL}/auth/update-student-code`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ studentCode })
        });

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.message || 'Cập nhật mã sinh viên thất bại!');
        }

        const result = await response.json();
        return result;
    } catch (error) {
        throw error;
    }
}

// Hàm hiển thị modal cập nhật mã sinh viên
function showUpdateStudentCodeModal() {
    chrome.storage.local.get(["profile"], function (data) {
        if (!data.profile) {
            showErrorToast("Không tìm thấy thông tin profile!");
            return;
        }

        const profile = data.profile;
        const role = (profile.role || '').toString().trim().toLowerCase();
        const isAdmin = ['admin', 'partner'].includes(role);
        const currentStudentCode = profile.studentCode;

        // Kiểm tra quyền: User thường chỉ được cập nhật khi studentCode là null
        if (!isAdmin && currentStudentCode !== null && currentStudentCode !== undefined && currentStudentCode !== '') {
            showErrorToast("Mã sinh viên đã được cập nhật trước đó. Không thể thay đổi.");
            return;
        }

        const modalHtml = `
            <div class="modal" id="updateStudentCodeModal" style="position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.7); display: flex; justify-content: center; align-items: center; z-index: 9999;">
                <div class="modal-content" style="background: #222; color: #eee; padding: 25px; max-width: 400px; width: 90%; border-radius: 12px; position: relative; box-shadow: 0 4px 20px rgba(0,0,0,0.5);">
                    <span class="close" style="position: absolute; right: 15px; top: 15px; cursor: pointer; font-size: 24px; color: #999; transition: color 0.3s;">&times;</span>
                    <h3 style="margin-top: 0; margin-bottom: 20px; color: #4CAF50; text-align: center;">${currentStudentCode ? 'Cập nhật' : 'Thêm'} mã sinh viên</h3>
                    <div style="background: #2a2a3a; padding: 15px; border-radius: 8px; margin-bottom: 20px;">
                        <p style="margin: 10px 0; font-size: 13px; color: #ccc;">
                            ${currentStudentCode ? `Mã sinh viên hiện tại: <strong style="color: #90ee90;">${escapeHtml(currentStudentCode)}</strong>` : 'Vui lòng nhập mã sinh viên của bạn'}
                        </p>
                        ${!isAdmin && currentStudentCode ? '<p style="margin: 10px 0; font-size: 12px; color: #ffd700;">⚠️ Lưu ý: Bạn chỉ được cập nhật mã sinh viên một lần.</p>' : ''}
                    </div>
                    <input type="text" id="studentCodeInput" placeholder="Nhập mã sinh viên" 
                           value="${currentStudentCode || ''}" 
                           style="width: 100%; padding: 12px; margin-bottom: 20px; border: 1px solid #444; border-radius: 6px; background: #2a2a3a; color: #eee; font-size: 14px; box-sizing: border-box;">
                    <div style="display: flex; gap: 10px; justify-content: center;">
                        <button id="cancelUpdateStudentCode" class="gradient-btn" style="background: #666; padding: 10px 20px; border: none; border-radius: 6px; color: white; cursor: pointer; font-size: 14px;">Hủy</button>
                        <button id="confirmUpdateStudentCode" class="gradient-btn purple-blue" style="padding: 10px 20px; border: none; border-radius: 6px; color: white; cursor: pointer; font-size: 14px;">Xác nhận</button>
                    </div>
                </div>
            </div>
        `;

        const $modal = $(modalHtml);
        $('body').append($modal);

        // Đóng modal khi click nút X hoặc Hủy
        $modal.find('.close, #cancelUpdateStudentCode').click(() => {
            $modal.fadeOut(200, () => $modal.remove());
        });

        // Xác nhận cập nhật mã sinh viên
        $modal.find('#confirmUpdateStudentCode').click(() => {
            const studentCode = $('#studentCodeInput').val().trim();
            
            if (!studentCode) {
                showErrorToast("Vui lòng nhập mã sinh viên!");
                return;
            }

            // Disable button để tránh double click
            const $confirmBtn = $modal.find('#confirmUpdateStudentCode');
            $confirmBtn.prop('disabled', true).text('Đang xử lý...');

            updateStudentCode(studentCode)
                .then(() => {
                    showToast("Cập nhật mã sinh viên thành công!");
                    $modal.fadeOut(200, () => $modal.remove());
                    // Cập nhật lại profile
                    getProfile().then(() => {
                        // Tự động mở lại profile modal để hiển thị thông tin mới
                        setTimeout(() => {
                            showProfile();
                        }, 500);
                    });
                })
                .catch(err => {
                    showErrorToast(err.message || "Cập nhật mã sinh viên thất bại!");
                    $confirmBtn.prop('disabled', false).text('Xác nhận');
                });
        });

        // Đóng modal khi click ra ngoài
        $modal.click((e) => {
            if ($(e.target).is('#updateStudentCodeModal')) {
                $modal.fadeOut(200, () => $modal.remove());
            }
        });

        // Focus vào input khi modal hiển thị
        setTimeout(() => {
            $('#studentCodeInput').focus();
        }, 300);

        $modal.fadeIn(200);
    });
}

// Hàm xử lý đổi mật khẩu
function showChangePasswordModal() {
    const modalHtml = `
        <div class="modal" id="changePasswordModal">
            <div class="modal-content">
                <span class="close">&times;</span>
                <h3>Đổi mật khẩu</h3>
                <div class="password-wrapper">
                    <input type="password" id="currentPassword" placeholder="Mật khẩu hiện tại">
                    <span class="toggle-password" data-target="currentPassword">👁️</span>
                </div>
                <div class="password-wrapper">
                    <input type="password" id="newPassword" placeholder="Mật khẩu mới">
                    <span class="toggle-password" data-target="newPassword">👁️</span>
                </div>
                <div class="password-wrapper">
                    <input type="password" id="confirmNewPassword" placeholder="Xác nhận mật khẩu mới">
                    <span class="toggle-password" data-target="confirmNewPassword">👁️</span>
                </div>
                <button id="submitChangePassword" class="gradient-btn pink-green">Đổi mật khẩu</button>
            </div>
        </div>
    `;

    // Thêm modal vào body
    const $modal = $(modalHtml);
    $('body').append($modal);

    // Xử lý sự kiện đóng modal
    $modal.find('.close').click(() => {
        $modal.remove();
    });

    // Xử lý sự kiện submit
    $modal.find('#submitChangePassword').click(() => {
        const oldPassword = $('#currentPassword').val();
        const newPassword = $('#newPassword').val();
        const confirmPassword = $('#confirmNewPassword').val();

        if (!oldPassword || !newPassword || !confirmPassword) {
            showErrorToast("Vui lòng điền đầy đủ thông tin!");
            return;
        }

        if (newPassword !== confirmPassword) {
            showErrorToast("Mật khẩu xác nhận không khớp!");
            return;
        }

        safeFetchWithAuth(`${API_URL}/auth/change-password`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                oldPassword,
                newPassword,
                confirmPassword
            })
        })
            .then(async (response) => {
                if (!response.ok) {
                    const errorData = await response.json();
                    throw new Error(errorData.message || 'Đổi mật khẩu thất bại!');
                }
                showToast("Đổi mật khẩu thành công!");
                $modal.remove();
            })
            .catch(err => {
                showErrorToast(err.message || "Đổi mật khẩu thất bại!");
            });
    });

    // Hiển thị modal
    $modal.fadeIn(200);
}

$(document).ready(function () {
    tomSelectInstance = new TomSelect('#subjectSelect', {
        create: false,
        onItemAdd(value, item) {
            this.control_input.blur();
            this.close();
        },
        onChange(value) {
            // Lưu subjectCode vào storage
            if (value) {
                const selectedOption = this.getOption(value);
                if (selectedOption) {
                    const optionText = selectedOption.textContent || selectedOption.innerText || '';
                    const match = optionText.match(/^([A-Z]+\d+(?:\.\d+)?)/);
                    if (match) {
                        const subjectCode = match[1];
                        chrome.storage.local.set({ currentSubjectCode: subjectCode });
                    }
                }
            }
            updateChangeButtonState();
        },
        sortField: { field: "text", direction: "asc" },
        placeholder: "Chọn môn học",
        render: {
            no_results: () => '<div class="no-results">Không tìm thấy môn học phù hợp</div>',
            option: (data, escape) => `<div class="option"><span class="title">${escape(data.text)}</span></div>`
        }
    });

    checkLogin();

    // Gán sự kiện
    // 👉 Đăng nhập, đăng ký
    $('#loginbtn').click(() => login());
    $('#logout').click(() => logout());
    $('#check').click(() => checkCurrentQuiz());
    $("#save").click(() => saveQuestions());
    $('#submitRegister').click(() => register());
    $("#donateBtn").click(() => {
        showScreen("donateModal");
    });
    $(".purchase-btn").on("click", function () {
        const packageId = parseInt($(this).data("package-id"));
        purchase(packageId);
    });

    // 👉 Bắt sự kiện enter
    $(".pwd").on("keydown", function (e) {
        if (e.key === "Enter") {
            if ($("#loginWrapper").is(":visible")) {
                login();
            } else if ($("#registerWrapper").is(":visible")) {
                register();
            }
        }
    });

    // 👉 Điều hướng
    $("#goToLogin").click(() => showScreen("loginWrapper"));
    $("#goToRegister").click(() => {
        showScreen("registerWrapper");
    });
    $("#goToLoginFromVerification").click(() => {
        showScreen("loginWrapper");
    });
    $("#backToHome").click(() => {
        switch (currentScreen) {
            case "loginWrapper":
            case "registerWrapper":
            case "emailVerificationWrapper":
                showScreen("entry");
                break;
            case "donateModal":
                showScreen("wrap");
                break;
            case "qrModal":
                showScreen("donateModal");
                break;
            default:
                showScreen("entry");
        }
    });


    // Toggle dropdown user
    $("#userDropdownToggle").click(() => {
        $("#userDropdown").toggle();
    });

    // Ẩn dropdown nếu click ra ngoài
    $(document).mouseup(function (e) {
        const dropdown = $("#userDropdown");
        if (!dropdown.is(e.target) && dropdown.has(e.target).length === 0) {
            dropdown.hide();
        }
    });

    // Hiện/ẩn icon mắt khi có dữ liệu trong input password
    $(document).on('input', '.password-wrapper input[type="password"], .password-wrapper input[type="text"]', function () {
        const $input = $(this);
        const $wrapper = $input.closest('.password-wrapper');
        const $icon = $wrapper.find('.toggle-password');
        if ($input.val()) {
            $icon.addClass('show');
        } else {
            $icon.removeClass('show');
        }
    });

    // Khi load lại form, nếu có sẵn giá trị thì cũng show icon
    $('.password-wrapper input').each(function () {
        const $input = $(this);
        const $wrapper = $input.closest('.password-wrapper');
        const $icon = $wrapper.find('.toggle-password');
        if ($input.val()) {
            $icon.addClass('show');
        } else {
            $icon.removeClass('show');
        }
    });

    // Sự kiện click icon mắt để hiện/ẩn mật khẩu
    $(document).on('click', '.toggle-password', function () {
        const targetClass = $(this).data('target');
        let $input = $(this).siblings('input.' + targetClass);
        if ($input.length === 0) {
            // Nếu không tìm thấy input cùng cấp, tìm trong form
            const $form = $(this).closest('.form-screen');
            $input = $form.find('input.' + targetClass);
        }
        if ($input.attr('type') === 'password') {
            $input.attr('type', 'text');
            $(this).text('🙈');
        } else {
            $input.attr('type', 'password');
            $(this).text('👁️');
        }
    });

    $("#export").click(function () {
        chrome.storage.local.get(["role"], function (data) {
            if (data.role !== 'admin') {
                const subjectId = $("#subjectSelect").val()?.trim();
                if (!subjectId) {
                    showErrorToast("Vui lòng chọn môn học để xuất đáp án");
                    return;
                }

                const url = `${API_URL}/export/answers/${subjectId}`;

                safeFetchWithAuth(url)
                    .then(res => {
                        if (!res.ok) {
                            return res.json().then(errorData => {
                                const errorMessage = errorData.message || `Lỗi khi tải file: ${res.status}`;
                                throw new Error(errorMessage);
                            })
                        }

                        const disposition = res.headers.get("Content-Disposition");
                        let filename = `answers-${subjectId}.xlsx`;
                        if (disposition && disposition.includes("filename=")) {
                            filename = disposition
                                .split("filename=")[1]
                                .replace(/[";]/g, "")
                                .trim();
                        }

                        return res.blob().then(blob => ({ blob, filename }));
                    })
                    .then(({ blob, filename }) => {
                        const downloadUrl = URL.createObjectURL(blob);
                        const a = document.createElement("a");
                        a.href = downloadUrl;
                        a.download = filename;
                        document.body.appendChild(a);
                        a.click();
                        a.remove();
                        URL.revokeObjectURL(downloadUrl);
                    })
                    .catch(err => {
                        showErrorToast(err.message || "Đã xảy ra lỗi khi export file");
                    });
            }
        });
    });

    $("#exportpdf").click(function () {
        chrome.storage.local.get(["role"], function (data) {
            if (data.role !== 'admin') {
                showErrorToast("Chỉ dành cho admin");
                return;
            }
            // TODO: Thực hiện chức năng xuất PDF ở đây nếu là admin
        });
    });

    // Thêm sự kiện cho các nút profile và change password
    $("#profile").off("click").on("click", () => {
        getProfile().then(() => showProfile());
    });
    $("#changePassword").click(() => showChangePasswordModal());

    // Xử lý sự kiện click nút Đổi
    $("#change-course").click(function () {
        if (!tomSelectInstance) {
            showErrorToast("Chưa tải được danh sách môn học!");
            return;
        }

        const selectedSubjectId = tomSelectInstance.getValue();

        if (!selectedSubjectId) {
            showErrorToast("Vui lòng chọn môn học!");
            return;
        }

        // Gọi API kiểm tra points trước
        safeFetchWithAuth(`${API_URL}/subject-registration/check-points?subjectCount=1`)
            .then(res => res.json())
            .then(hasEnoughPoints => {
                if (!hasEnoughPoints) {
                    showErrorToast("Bạn không đủ points để đổi môn! Vui lòng mua thêm points.");
                    return;
                }

                // Nếu đủ points thì gọi API đăng ký môn
                safeFetchWithAuth(`${API_URL}/subject-registration/register`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        subjectId: selectedSubjectId
                    })
                })
                    .then(async res => {
                        const data = await res.json();
                        if (!res.ok) {
                            throw new Error(data.message || 'Đổi môn thất bại!');
                        }
                        showToast("Đổi môn thành công!");

                        // Cập nhật lại profile để lấy danh sách môn mới
                        return getProfile();
                    })
                    .then(() => {
                        // Sau khi cập nhật profile, cập nhật lại trạng thái nút
                        updateChangeButtonState();
                        // Cập nhật lại hiển thị số lượt đổi môn
                        updateChangeAttemptsDisplay();
                    })
                    .catch(err => {
                        showErrorToast(err.message || "Đổi môn thất bại!");
                    });
            })
            .catch(err => {
                showErrorToast("Kiểm tra points thất bại!");
            });
    });
});
