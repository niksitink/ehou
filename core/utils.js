function validate(email) {
    const reg = /^([A-Za-z0-9_\-\.])+\@([A-Za-z0-9_\-\.])+\.([A-Za-z]{2,4})$/;
    if (!reg.test(email)) {
        if (typeof showErrorToast === 'function') {
            showErrorToast('Email không hợp lệ!');
        } else {
            alert('Email không hợp lệ!');
        }
        return false;
    }
    return true;
}

function validatePhone(phone) {
    // Loại bỏ khoảng trắng và ký tự đặc biệt để kiểm tra
    const cleanedPhone = phone.replace(/[\s\-\(\)]/g, '');
    
    // Kiểm tra số điện thoại Việt Nam: 10-11 chữ số, bắt đầu bằng 0 hoặc +84
    // Format: 0xxxxxxxxx hoặc +84xxxxxxxxx (10-11 số sau 0 hoặc +84)
    const vietnamPhoneRegex = /^(0|\+84)[1-9][0-9]{8,9}$/;
    
    if (!vietnamPhoneRegex.test(cleanedPhone)) {
        if (typeof showErrorToast === 'function') {
            showErrorToast('Số điện thoại không hợp lệ! Vui lòng nhập số điện thoại Việt Nam (10-11 chữ số, bắt đầu bằng 0 hoặc +84)');
        } else {
            alert('Số điện thoại không hợp lệ! Vui lòng nhập số điện thoại Việt Nam (10-11 chữ số, bắt đầu bằng 0 hoặc +84)');
        }
        return false;
    }
    return true;
}

function convertToAnswerMap(serverData) {
    const answerMap = {};

    serverData.forEach(q => {
        // Lấy nội dung câu hỏi từ q.content và chuẩn hóa - giống như fillAnswers
        const rawQuestionText = q.content?.trim() || '';
        const escapedText = (typeof escapeHtml === 'function') ? escapeHtml(rawQuestionText) : rawQuestionText;
        const questionText = (typeof normalizeTextForSearch === 'function') ? normalizeTextForSearch(escapedText) : (escapedText || '').trim();
        
        // Also create enhanced normalized version for better matching
        const enhancedQuestionText = (typeof normalizeTextForMatching === 'function') ? normalizeTextForMatching(rawQuestionText) : (rawQuestionText || '').toLowerCase();

        // Xử lý hình ảnh và audio từ cấu trúc mới
        const questionImageHashes = q.imageHashes || [];
        const questionAudioHashes = q.audioHashes || [];

        // Nếu text câu hỏi rỗng sau khi trim và không có media, bỏ qua
        if (!questionText && questionImageHashes.length === 0 && questionAudioHashes.length === 0) {
            return;
        }

        let questionKey;

        // Tạo key dựa trên việc câu hỏi có media hay không
        if (questionImageHashes.length > 0) {
            // Key cho câu hỏi có media: Dạng JSON string
            questionKey = JSON.stringify({
                text: questionText,
                imageHashes: questionImageHashes
            });
        } else if (questionAudioHashes.length > 0) {
            questionKey = JSON.stringify({
                text: questionText,
                audioHashes: questionAudioHashes
            });
        } else {
            // Key cho câu hỏi chỉ có text: Dạng text đơn giản
            questionKey = questionText;
        }
        
        // Also create enhanced normalized key for better matching
        const enhancedQuestionKey = enhancedQuestionText;

        // Xử lý choices với cấu trúc mới
        const processedChoices = (q.choices || []).map(choice => {
            if (typeof choice === 'string') {
                return { text: choice };
            }
            
            // Xử lý cấu trúc mới với images và audios
            return {
                text: choice.text || choice,
                imageHashes: choice.imageHashes || [],
                audioHashes: choice.audioHashes || []
            };
        });

        // Lưu toàn bộ object câu hỏi vào answerMap với key tương ứng (dưới dạng mảng)
        if (!answerMap[questionKey]) {
            answerMap[questionKey] = [];
        }
        
        // Also store under enhanced key if different
        if (enhancedQuestionKey && enhancedQuestionKey !== questionKey) {
            if (!answerMap[enhancedQuestionKey]) {
                answerMap[enhancedQuestionKey] = [];
            }
        }

        const answerData = {
            content: questionText,
            imageHashes: questionImageHashes,
            audioHashes: questionAudioHashes,
            type: q.questionType || q.type || 'SINGLE_CHOICE', // Default to SINGLE_CHOICE if not specified
            questionHash: q.questionHash,
            gaps: q.gaps,
            choices: processedChoices,
            correctAnswer: q.correctAnswer,
            explanation: q.explanation || '',
            ai: q.ai || false
        };
        answerMap[questionKey].push(answerData);
        
        // Also store under enhanced key if different
        if (enhancedQuestionKey && enhancedQuestionKey !== questionKey) {
            answerMap[enhancedQuestionKey].push(answerData);
        }
    });

    return answerMap;
}

function showToast(message = "Thành công", timeout = 2000) {
    const $toast = $("#toast");
    const $icon = $("#toastIcon");
    const $msg = $("#toastMessage");

    $toast.removeClass("error").addClass("success").fadeIn();
    $icon.text("✅");
    $msg.text(message);

    // Reset & tạo progress mới
    $(".toast-progress").remove();
    $toast.append('<div class="toast-progress"></div>');
    $(".toast-progress").css("animation", `progressAnim ${timeout}ms linear forwards`);

    setTimeout(() => {
        $toast.fadeOut();
    }, timeout);
}

function showErrorToast(message = "Đã có lỗi xảy ra", timeout = 4000) {
    const $toast = $("#toast");
    const $icon = $("#toastIcon");
    const $msg = $("#toastMessage");

    $toast.removeClass("success").addClass("error").fadeIn();
    $icon.text("❌");
    $msg.text(message);

    $(".toast-progress").remove();
    $toast.append('<div class="toast-progress"></div>');
    $(".toast-progress").css("animation", `progressAnim ${timeout}ms linear forwards`);

    setTimeout(() => {
        $toast.fadeOut();
    }, timeout);
}

// Cho background import được nếu là môi trường service
if (typeof window === "undefined") {
    self.validate = validate;
    self.validatePhone = validatePhone;
    self.convertToAnswerMap = convertToAnswerMap;
    self.showToast = showToast;
    self.showErrorToast = showErrorToast;
} else {
    window.validate = validate;
    window.validatePhone = validatePhone;
    window.convertToAnswerMap = convertToAnswerMap;
    window.showToast = showToast;
    window.showErrorToast = showErrorToast;
}


/**
 * Kiểm tra quyền truy cập dựa trên username (cho LMS cũ)
 * @param {string} feature - Tên tính năng để hiển thị trong thông báo
 * @returns {Promise<boolean>} - True nếu được phép truy cập, False nếu bị chặn
 */
function checkUsernameAccess() {
    return new Promise((resolve) => {
        chrome.storage.local.get(["username", "profile", "usernameEhou"], function (data) {
            const registeredUsername = data.username; // Username đã đăng ký extension
            const profileData = data.profile || {};
            const role = profileData.role || '';
            const usernameEhou = data.usernameEhou || '';
            // Admin bypass - admin được quyền truy cập tất cả
            if (typeof role === 'string' && ['admin', 'partner'].includes(role.trim().toLowerCase())) {
                resolve(true);
                return;
            }

            // Nếu không có username đã đăng ký, cho phép truy cập
            if (!registeredUsername) {
                resolve(true);
                return;
            }
            // Nếu tìm thấy thông tin user trên trang và không khớp với user đã đăng ký
            if ((!usernameEhou || !registeredUsername || usernameEhou !== registeredUsername)) {
                showErrorToast('Tài khoản không khớp! Vui lòng đăng nhập vào tài khoản học là ' + registeredUsername + ' để sử dụng tính năng này!');
                resolve(false);
                return;
            }
            resolve(true);
        });
    });
}

/**
 * Kiểm tra quyền truy cập dựa trên studentCode (cho LMS mới)
 * @param {string} pageStudentCode - StudentCode lấy từ trang web
 * @returns {Promise<boolean>} - True nếu được phép truy cập, False nếu bị chặn
 */
function checkStudentCodeAccess(pageStudentCode) {
    return new Promise((resolve) => {
        chrome.storage.local.get(["profile"], function (data) {
            const profileData = data.profile || {};
            const role = profileData.role || '';
            const extStudentCode = profileData.studentCode || '';
            
            // Admin bypass - admin được quyền truy cập tất cả
            if (typeof role === 'string' && ['admin', 'partner'].includes(role.trim().toLowerCase())) {
                resolve(true);
                return;
            }

            // Nếu chưa có studentCode trong profile, yêu cầu cập nhật
            if (!extStudentCode) {
                showErrorToast('Vui lòng cập nhật mã sinh viên trong profile để sử dụng tính năng này!');
                resolve(false);
                return;
            }

            // Nếu tìm thấy studentCode trên trang và không khớp với studentCode đã đăng ký
            if (pageStudentCode && extStudentCode && pageStudentCode !== extStudentCode) {
                showErrorToast('Mã sinh viên không khớp! Vui lòng đăng nhập vào tài khoản học có mã sinh viên là ' + extStudentCode + ' để sử dụng tính năng này!');
                resolve(false);
                return;
            }

            resolve(true);
        });
    });
}

/**
 * Kiểm tra quyền truy cập tự động phát hiện LMS cũ/mới
 * @returns {Promise<boolean>} - True nếu được phép truy cập, False nếu bị chặn
 */
function checkAccess() {
    return new Promise((resolve) => {
        // Lấy tab hiện tại để kiểm tra URL
        chrome.tabs.query({active: true, currentWindow: true}, (tabs) => {
            const tab = tabs[0];
            if (!tab || !tab.url) {
                // Nếu không lấy được URL, dùng logic cũ (username)
                checkUsernameAccess().then(resolve);
                return;
            }

            const url = tab.url;
            const isNewLMS = url.includes('lmshub.hou.edu.vn');
            const isOldLMS = url.includes('learning.ehou.edu.vn');

            if (isNewLMS) {
                // LMS mới: lấy studentCode từ content script và so sánh
                chrome.tabs.sendMessage(tab.id, {type: 'getStudentCode'}, (response) => {
                    if (chrome.runtime.lastError) {
                        // Nếu không lấy được (có thể content script chưa load), dùng logic cũ
                        checkUsernameAccess().then(resolve);
                        return;
                    }
                    const pageStudentCode = response?.studentCode || null;
                    checkStudentCodeAccess(pageStudentCode).then(resolve);
                });
            } else if (isOldLMS) {
                // LMS cũ: dùng logic username
                checkUsernameAccess().then(resolve);
            } else {
                // Không phải LMS nào cả, dùng logic cũ
                checkUsernameAccess().then(resolve);
            }
        });
    });
}