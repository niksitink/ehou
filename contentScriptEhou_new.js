(function () {
    // New EHOU LMS: lmshub.hou.edu.vn
    // Keep this file focused on DOM differences while reusing shared helpers from core/utils.js

    // Safe logger - sử dụng logger từ core/logger.js
    const logger = (typeof window !== 'undefined' && window.logger) ? window.logger : {
        debugLog: console.log,
        debugLogWithEmoji: (emoji, ...args) => console.log(emoji, ...args),
        log: console.log,
        logWithEmoji: (emoji, ...args) => console.log(emoji, ...args),
        error: console.error,
        warn: console.warn,
        info: console.info
    };

    // Feature flag to quickly disable on unknown pages
    const href = location.href;
    if (!href.startsWith('https://lmshub.hou.edu.vn')) return;

    // Provide a jQuery-free toast fallback if utils.js toast depends on $
    (function ensureToastFallback(){
        const jqMissing = (typeof window.$ !== 'function');
        if (jqMissing) {
            window.showToast = function(message, type = 'info') {
                const toast = document.createElement('div');
                toast.className = `toast-message ${type}`;
                toast.textContent = message;
                Object.assign(toast.style, {
                    position: 'fixed', top: '80px', right: '20px', padding: '14px 22px',
                    borderRadius: '12px', color: '#fff', fontWeight: '500', zIndex: 10001,
                    maxWidth: '350px', boxShadow: '0 8px 25px rgba(0,0,0,.15)'
                });
                const bg = {
                    info: 'linear-gradient(135deg,#17a2b8 0%,#138496 100%)',
                    success: 'linear-gradient(135deg,#28a745 0%,#20c997 100%)',
                    warning: 'linear-gradient(135deg,#ffc107 0%,#fd7e14 100%)',
                    error: 'linear-gradient(135deg,#dc3545 0%,#e83e8c 100%)'
                }[type] || 'linear-gradient(135deg,#17a2b8 0%,#138496 100%)';
                toast.style.background = bg;
                document.body.appendChild(toast);
                setTimeout(() => {
                    toast.style.transition = 'opacity .4s ease';
                    toast.style.opacity = '0';
                    setTimeout(() => toast.remove(), 400);
                }, 3000);
            };
        }
    })();

    // Adapters: override only the selectors that differ on the new site.
    // Provide minimal working implementations, delegating to common logic if they exist on window.

    function getSubjectCodeFromTitle_new() {
        // 1) Ưu tiên breadcrumb: #page-navbar .breadcrumb li:first a (thường là mã môn)
        const crumbCode = document.querySelector('#page-navbar .breadcrumb li:first-child a');
        const codeFromCrumb = crumbCode?.textContent?.trim();
        if (codeFromCrumb && /[A-Z]+\d+(?:\.\d+)?/i.test(codeFromCrumb)) {
            return codeFromCrumb.match(/[A-Z]+\d+(?:\.\d+)?/i)?.[0] || codeFromCrumb;
        }

        // 2) Fallback từ tiêu đề h1: "Tên môn - CODE"
        const h1Text = document.querySelector('.page-header-headings h1')?.innerText || '';
        const m = h1Text.match(/-\s*([A-Z]+\d+(?:\.\d+)?)/i) || h1Text.match(/\b([A-Z]+\d+(?:\.\d+)?)\b/i);
        return m ? (m[1] || m[0]) : null;
    }

    function getSubjectNameFromTitle_new() {
        // Lấy từ h1 chính trong header
        const h1 = document.querySelector('.page-header-headings h1');
        const text = h1?.textContent || '';
        if (!text) return '';
        const parts = text.split(' - ');
        const name = (parts[0] || text).trim();
        return name;
    }

    // Helper function to get subjectCode with fallback to storage (chỉ dành cho admin)
    async function getSubjectCodeWithFallback_new() {
        // Ưu tiên lấy từ trang web
        let subjectCode = getSubjectCodeFromTitle_new();
        
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

    // Expose adapters so existing shared code can call if it detects new domain
    window.getSubjectCodeFromTitle = window.getSubjectCodeFromTitle || getSubjectCodeFromTitle_new;
    window.getSubjectNameFromTitle = window.getSubjectNameFromTitle || getSubjectNameFromTitle_new;

    // ---- Adapter scaffold: mirror public APIs from legacy script ----
    // Each function logs a message and returns safe defaults until we implement

    async function getCurrentPageUsername_new() {
        // Primary: first line in the bold user block
        const firstLine = document.querySelector('.usermenu .bold p.mb-0');
        const username = firstLine?.textContent?.trim();
        if (username) return username;

        // Fallback 1: avatar initials wrapper might have title/aria-label
        const initials = document.querySelector('.usermenu .userinitials');
        const title = initials?.getAttribute('title') || initials?.getAttribute('aria-label') || '';
        // Some sites place username near the initials; attempt to find preceding sibling text
        if (title && /\S+/.test(title)) {
            // Title likely holds full name, not username; keep as null here
        }

        // Fallback 2: any bold block with two p tags; take the first
        const boldBlock = document.querySelector('.usermenu .bold');
        if (boldBlock) {
            const pTags = boldBlock.querySelectorAll('p');
            if (pTags && pTags.length > 0) {
                const txt = pTags[0].textContent?.trim();
                if (txt) return txt;
            }
        }

        logger.debugLogWithEmoji('⚠️', '[NEW-LMS] Không tìm thấy username trong usermenu.');
        return null;
    }

    // Hàm lấy studentCode từ trang mới (dòng đầu tiên trong usermenu)
    async function getCurrentPageStudentCode_new() {
        // Primary: first line in the bold user block (đây là studentCode ở trang mới)
        const firstLine = document.querySelector('.usermenu .bold p.mb-0');
        const studentCode = firstLine?.textContent?.trim();
        if (studentCode) return studentCode;

        // Fallback: any bold block with p tags; take the first
        const boldBlock = document.querySelector('.usermenu .bold');
        if (boldBlock) {
            const pTags = boldBlock.querySelectorAll('p');
            if (pTags && pTags.length > 0) {
                const txt = pTags[0].textContent?.trim();
                if (txt) return txt;
            }
        }

        logger.debugLogWithEmoji('⚠️', '[NEW-LMS] Không tìm thấy studentCode trong usermenu.');
        return null;
    }

    // Helpers specific to new LMS
function getQuestionType_new(q) {
    if (!q) return 'SINGLE_CHOICE';
    if (q.classList.contains('gapfill') || q.classList.contains('cloze')) return 'COMPLETION_WITH_CHOICES';
    if (q.classList.contains('truefalse')) return 'TRUE_FALSE';
    if (q.classList.contains('multichoice')) {
        const hasCheckbox = q.querySelectorAll('input[type="checkbox"]').length > 0;
        return hasCheckbox ? 'MULTIPLE_CHOICE' : 'SINGLE_CHOICE';
    }
    const hasCheckbox = q.querySelectorAll('input[type="checkbox"]').length > 0;
    const hasRadio = q.querySelectorAll('input[type="radio"]').length > 0;
    if (hasCheckbox) return 'MULTIPLE_CHOICE';
    if (hasRadio) return 'SINGLE_CHOICE';
    const hasTextInputs = q.querySelectorAll('input[type="text"], input[type="search"], input[type="tel"], textarea').length > 0;
    if (hasTextInputs) return 'COMPLETION_WITH_CHOICES';
    return 'SINGLE_CHOICE';
}

    async function sha256_hex_new(str) {
        const enc = new TextEncoder();
        const data = enc.encode(str || '');
        const buf = await crypto.subtle.digest('SHA-256', data);
        const bytes = Array.from(new Uint8Array(buf));
        return bytes.map(b => b.toString(16).padStart(2, '0')).join('');
    }

function cleanText_new(el, options = {}) {
    const { replaceInputsWithGap = false } = options;
    if (!el) return '';

    const clone = el.cloneNode(true);

    const inputs = clone.querySelectorAll('input, textarea, select');
    inputs.forEach(inp => {
        const type = (inp.getAttribute('type') || '').toLowerCase();
        inp.removeAttribute('value');
        inp.value = '';
        if (replaceInputsWithGap && (!type || ['text','search','tel','number','email','url','password'].includes(type) || inp.tagName === 'TEXTAREA')) {
            const placeholder = document.createElement('span');
            placeholder.textContent = '[GAP]';
            inp.parentNode.replaceChild(placeholder, inp);
        }
    });

    // Extract text while preserving line breaks from HTML structure
    const processNode = (node) => {
        if (node.nodeType === 3) { // TEXT_NODE
            return node.textContent || '';
        } else if (node.nodeType === 1) { // ELEMENT_NODE
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
    
    let txt = processNode(clone).trim();
    
    // Fallback to innerText if processing fails
    if (!txt) {
        txt = (clone.innerText || clone.textContent || '').replace(/\s+/g, ' ').trim();
    }
    
    return txt;
}

    function findNextPageButton_new() {
        // Prefer explicit id provided
        let btn = document.querySelector('#mod_quiz-next-nav');
        if (btn) return btn;
        // Common Moodle pattern
        btn = document.querySelector('.submitbtns input[name="next"]');
        if (btn) return btn;
        // Fallback by visible text
        const candidates = Array.from(document.querySelectorAll('input[type="submit"], button'));
        btn = candidates.find(el => /(Trang tiếp|Tiếp theo|Next)/i.test(el.value || el.textContent || '')) || null;
        return btn || null;
    }

    async function computeQuestionHash_new(q, type) {
        // Prefer legacy normalization pipeline to keep hashes identical across old/new sites
        const hasLegacy = typeof window.extractNormalizedTextForHash === 'function' && typeof window.createHash === 'function';
        if (hasLegacy) {
            try {
                const stemEl = q.querySelector('.qtext');
                const stem = await window.extractNormalizedTextForHash(stemEl, { replaceInputsWithGap: (type === 'COMPLETION_WITH_CHOICES'), removePrefix: false });
                const labels = Array.from(q.querySelectorAll('.answer label, .answer [data-region="answer-label"]'));
                const options = [];
                for (const label of labels) {
                    const txt = await window.extractNormalizedTextForHash(label, { removePrefix: true });
                    if (txt) options.push(txt);
                }
                const sorted = options.map(o => (o || '')).sort((a,b)=>a.localeCompare(b));
                const payload = `${stem}\nOPTIONS:\n${sorted.join('\n')}`;
                return await window.createHash(payload);
            } catch (e) {
                // Fallback to local simple hashing if legacy path fails
            }
        }

        // Fallback simple hashing
        const stem = cleanText_new(q.querySelector('.qtext'), { replaceInputsWithGap: type === 'COMPLETION_WITH_CHOICES' });
        const choiceDivs = Array.from(q.querySelectorAll('.answer > div'));
        const options = choiceDivs.map(div => cleanText_new(div.querySelector('[data-region="answer-label"] .flex-fill, .flex-fill'))).filter(Boolean);
        const payload = `${stem}\nOPTIONS:\n${options.sort((a,b)=>a.localeCompare(b)).join('\n')}`;
        return sha256_hex_new(payload);
    }

    async function getQuestions_new() {
        const queNodes = Array.from(document.querySelectorAll('.que'));
        const results = [];
        for (const q of queNodes) {
            const type = getQuestionType_new(q);
            const stemText = cleanText_new(q.querySelector('.qtext'), { replaceInputsWithGap: type === 'COMPLETION_WITH_CHOICES' });
            const questionHash = await computeQuestionHash_new(q, type);
            const answerDivs = Array.from(q.querySelectorAll('.answer > div'));
            const choices = answerDivs.map(div => {
                const label = div.querySelector('[data-region="answer-label"] .flex-fill, .flex-fill');
                const text = cleanText_new(label);
                return { text, imageUrls: [], imageBase64: [], imageHashes: [], audioUrls: [], audioBase64: [], audioHashes: [] };
            });

            results.push({
                questionHash,
                stemSample: stemText.slice(0, 120),
                gaps: null,
                content: {
                    text: stemText,
                    imageUrls: [], imageBase64: [], imageHashes: [],
                    audioUrls: [], audioBase64: [], audioHashes: []
                },
                type,
                choices,
                correctAnswer: null,
                explanation: null,
                wrongAnswer: null
            });
        }
        return results;
    }

    function normalize_simple_new(str) {
        return (str || '').toLowerCase().replace(/\s+/g, ' ').trim();
    }

    function buildHashAnswerMap_new(serverData) {
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

    async function fillAnswers_new(answerMap, hashAnswerMap) {
        const questionElements = Array.from(document.querySelectorAll('.que'));
        let filledCount = 0;
        let exactMatches = 0;
        let fuzzyMatches = 0;
        let notFound = 0;
        let aiAnswers = 0;
        let dbAnswers = 0;
        const details = [];

        // Helper bridges to legacy if available
        const extractTextWithMediaPlaceholders = (typeof window.extractTextWithMediaPlaceholders === 'function') ? window.extractTextWithMediaPlaceholders : async function(el, removePrefix){
            if (!el) return '';
            
            // Extract text while preserving line breaks from HTML structure
            const processNode = (node) => {
                if (node.nodeType === 3) { // TEXT_NODE
                    return node.textContent || '';
                } else if (node.nodeType === 1) { // ELEMENT_NODE
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
            
            let text = processNode(el).trim();
            
            // Fallback to innerText if processing fails
            if (!text) {
                text = (el.innerText || el.textContent || '').trim();
            }
            
            if (removePrefix) text = text.replace(/^[a-zA-Z]\.[\s\u00A0]+/, '').trim();
            return text;
        };
        const escapeHtml = (typeof window.escapeHtml === 'function') ? window.escapeHtml : function(t){
            return (t||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#039;');
        };
        const escapeHtmlExceptValidMedia = (typeof window.escapeHtmlExceptValidMedia === 'function') ? window.escapeHtmlExceptValidMedia : function(t){ return escapeHtml(t); };
        const processImages = (typeof window.processImages === 'function') ? window.processImages : async function(urls){ return []; };
        const processAudio = (typeof window.processAudio === 'function') ? window.processAudio : async function(els){ return []; };
        const normalizeText = (typeof window.normalizeText === 'function') ? window.normalizeText : function(s){ return (s||'').toLowerCase().replace(/\s+/g,' ').trim(); };
        const decodeHTMLEntities = (typeof window.decodeHTMLEntities === 'function') ? window.decodeHTMLEntities : function(s){ const ta=document.createElement('textarea'); ta.innerHTML=s||''; return ta.value; };
        const calculateSimilarity = (typeof window.calculateSimilarity === 'function') ? window.calculateSimilarity : function(a,b){
            if (!a || !b) return 0; a = a.toString(); b=b.toString();
            const lev = (x,y)=>{ const m=[]; for(let i=0;i<=y.length;i++){m[i]=[i];} for(let j=0;j<=x.length;j++){m[0][j]=j;} for(let i=1;i<=y.length;i++){for(let j=1;j<=x.length;j++){ m[i][j]= (y.charAt(i-1)===x.charAt(j-1))? m[i-1][j-1] : Math.min(m[i-1][j-1]+1, Math.min(m[i][j-1]+1, m[i-1][j]+1)); }} return m[y.length][x.length]; };
            const longer = a.length>=b.length ? a : b; const shorter = a.length>=b.length ? b : a; if (longer.length===0) return 1; return (longer.length - lev(longer, shorter))/longer.length; };

        for (const [qIndex, q] of questionElements.entries()) {
            // Ensure each question has an id for scrolling
            if (!q.id) q.id = `ehou-quiz-question-${qIndex}`;

            const type = getQuestionType_new(q);
            const hash = await computeQuestionHash_new(q, type);

            // Build candidate answers
            let answerList = [];
            if (hash && hashAnswerMap && hashAnswerMap[hash]) {
                const ans = hashAnswerMap[hash];
                answerList = Array.isArray(ans) ? ans.slice() : [ans];
            }
            if (answerList.length === 0) {
                const stem = await extractTextWithMediaPlaceholders(q.querySelector('.qtext'));
                const key = normalize_simple_new(escapeHtml(stem));
                if (key && Array.isArray(answerMap[key])) answerList = answerMap[key].slice();
            }

            // Prepare question details/meta
            const rawQuestionText = await extractTextWithMediaPlaceholders(q.querySelector('.qtext'));
            const escapedText = escapeHtml(rawQuestionText.trim());
            const questionTextForKey = (typeof window.normalizeTextForSearch === 'function') ? window.normalizeTextForSearch(escapedText) : normalizeText(escapedText);

            // Process media on question
            const questionImages = Array.from(q.querySelectorAll('.qtext img')).map(img=>img.src);
            const processedQuestionImages = await processImages(questionImages);
            const questionAudios = q.querySelectorAll('.qtext audio, .qtext span.mediaplugin_mp3, .qtext span.mediaplugin');
            const processedQuestionAudios = await processAudio(questionAudios);

            let foundCorrectAnswer = false;
            let questionDetail = {
                question: questionTextForKey.substring(0,100) + (questionTextForKey.length>100 ? '...' : ''),
                rawQuestion: rawQuestionText,
                images: processedQuestionImages || [],
                audios: processedQuestionAudios || [],
                status: 'not_found',
                answer: '',
                similarity: 0,
                isAi: false,
                questionId: q.id,
                answerImages: [],
                answerAudios: []
            };

            const choiceElements = Array.from(q.querySelectorAll('.answer > div'));

            // Try each backend item
            for (const answerData of answerList) {
                if (foundCorrectAnswer) break;
                if (!Array.isArray(answerData?.choices)) continue;

                const correctIdx = (typeof answerData.correctAnswer === 'number') ? answerData.correctAnswer : -1;
                const correctAnswerData = correctIdx >=0 ? answerData.choices[correctIdx] : null;
                if (!correctAnswerData) continue;

                let bestMatch = null; let bestSimilarity = 0; let foundExact = false;

                // Pass 1: exact raw text match
                for (let i=0;i<choiceElements.length;i++) {
                    const label = choiceElements[i].querySelector('label, [data-region="answer-label"]');
                    if (!label) continue;
                    const choiceText = await extractTextWithMediaPlaceholders(label, true);
                    if (choiceText && correctAnswerData.text && choiceText === correctAnswerData.text) {
                        foundExact = true; bestMatch = { choiceElement: choiceElements[i], choiceText, similarity: 1.0 }; bestSimilarity = 1.0; break;
                    }
                }

                // Pass 2: decoded equality
                if (!foundExact) {
                    for (let i=0;i<choiceElements.length;i++) {
                        const label = choiceElements[i].querySelector('label, [data-region="answer-label"]');
                        if (!label) continue;
                        const choiceText = await extractTextWithMediaPlaceholders(label, true);
                        if (choiceText && correctAnswerData.text) {
                            const dc = decodeHTMLEntities(choiceText);
                            const dr = decodeHTMLEntities(correctAnswerData.text);
                            if (dc === dr) { foundExact = true; bestMatch = { choiceElement: choiceElements[i], choiceText, similarity: 1.0 }; bestSimilarity = 1.0; break; }
                        }
                    }
                }

                // Pass 3: remove audio placeholders before compare
                if (!foundExact) {
                    for (let i=0;i<choiceElements.length;i++) {
                        const label = choiceElements[i].querySelector('label, [data-region="answer-label"]');
                        if (!label) continue;
                        const choiceText = await extractTextWithMediaPlaceholders(label, true);
                        if (choiceText && correctAnswerData.text) {
                            const cleanChoice = choiceText.replace(/\[AUDIO:[^\]]+\]/g,'').trim();
                            const cleanCorrect = (correctAnswerData.text||'').replace(/\[AUDIO:[^\]]+\]/g,'').trim();
                            if (cleanChoice === cleanCorrect) { foundExact = true; bestMatch = { choiceElement: choiceElements[i], choiceText, similarity: 1.0 }; bestSimilarity = 1.0; break; }
                        }
                    }
                }

                // Pass 4: fuzzy with normalized text (high threshold ~0.995)
                if (!foundExact) {
                    for (let i=0;i<choiceElements.length;i++) {
                        const label = choiceElements[i].querySelector('label, [data-region="answer-label"]');
                        if (!label) continue;
                        const choiceText = await extractTextWithMediaPlaceholders(label, true);
                        if (choiceText && correctAnswerData.text) {
                            const normChoice = normalizeText(escapeHtml(choiceText));
                            const normCorrect = normalizeText(escapeHtml(correctAnswerData.text));
                            const sim = calculateSimilarity(normChoice, normCorrect);
                            if (sim >= 0.995 && sim > bestSimilarity) { bestMatch = { choiceElement: choiceElements[i], choiceText, similarity: sim }; bestSimilarity = sim; }
                        }
                    }
                }

                // Verify image/audio hashes if provided
                if (bestMatch) {
                    // Image hashes
                    if (Array.isArray(correctAnswerData.imageHashes) && correctAnswerData.imageHashes.length > 0) {
                        const choiceImgs = Array.from(bestMatch.choiceElement.querySelectorAll('img')).map(img=>img.src);
                        const procImgs = await processImages(choiceImgs);
                        const choiceHashes = (procImgs||[]).map(i=>i.hash);
                        const allImgOk = correctAnswerData.imageHashes.every(h=>choiceHashes.includes(h));
                        if (!allImgOk) { bestMatch = null; bestSimilarity = 0; }
                    }
                    // Audio hashes
                    if (bestMatch && Array.isArray(correctAnswerData.audioHashes) && correctAnswerData.audioHashes.length > 0) {
                        const choiceAudEl = bestMatch.choiceElement.querySelectorAll('audio, span.mediaplugin_mp3, span.mediaplugin');
                        const procAud = await processAudio(choiceAudEl);
                        const choiceAudHashes = (procAud||[]).map(a=>a.hash);
                        const allAudOk = correctAnswerData.audioHashes.every(h=>choiceAudHashes.includes(h));
                        if (!allAudOk) { bestMatch = null; bestSimilarity = 0; }
                    }
                }

                // Apply ticking
                if (bestMatch) {
                    const input = bestMatch.choiceElement.querySelector('input[type="radio"], input[type="checkbox"]');
                    if (input) {
                        const wasDisabled = input.disabled;
                        if (wasDisabled) input.disabled = false;
                        input.checked = true;
                        try {
                            input.dispatchEvent(new Event('change', { bubbles: true }));
                            input.dispatchEvent(new Event('input', { bubbles: true }));
                        } catch {}
                        if (wasDisabled) input.disabled = true;

                        filledCount++;
                        if (bestSimilarity === 1.0) exactMatches++; else fuzzyMatches++;
                        questionDetail.status = (bestSimilarity === 1.0) ? 'exact' : 'fuzzy';
                        questionDetail.answer = bestMatch.choiceText;
                        questionDetail.similarity = bestSimilarity;
                        questionDetail.isAi = answerData.ai === true;
                        // capture answer images/audios
                        const aImgs = Array.from(bestMatch.choiceElement.querySelectorAll('img')).map(img=>img.src);
                        questionDetail.answerImages = await processImages(aImgs) || [];
                        const aAud = bestMatch.choiceElement.querySelectorAll('audio, span.mediaplugin_mp3, span.mediaplugin');
                        questionDetail.answerAudios = await processAudio(aAud) || [];
                        if (answerData.ai === true) aiAnswers++; else dbAnswers++;
                        foundCorrectAnswer = true;
                        break;
                    }
                }
            }

            if (!foundCorrectAnswer) {
                notFound++;
            }
            details.push(questionDetail);
        }

        // Show widget if enabled
        try {
            const totalQuestions = questionElements.length;
            const nextBtn = findNextPageButton_new();
            const summary = {
                totalQuestions,
                filledCount,
                exactMatches,
                fuzzyMatches,
                notFound,
                aiAnswers,
                dbAnswers,
                details,
                hasNextPage: !!nextBtn
            };
            chrome.storage.local.get('showResultWidget', (data) => {
                const showWidget = data.showResultWidget === undefined ? true : !!data.showResultWidget;
                if (showWidget && typeof createOrUpdateFillResultWidget_new === 'function') {
                    createOrUpdateFillResultWidget_new(summary);
                } else if (!showWidget) {
                    const widget = document.getElementById('fill-result-widget');
                    const bubble = document.getElementById('fill-result-bubble');
                    if (widget) widget.remove();
                    if (bubble) bubble.remove();
                }
            });
        } catch {}

        return true;
    }

    // Widget UI largely matching legacy appearance (compact port)
    function createOrUpdateFillResultWidget_new(results) {
        const widgetId = 'fill-result-widget';
        const bubbleId = 'fill-result-bubble';
        let widget = document.getElementById(widgetId);
        let bubble = document.getElementById(bubbleId);

        if (!widget) {
            widget = document.createElement('div');
            widget.id = widgetId;
            Object.assign(widget.style, {
                position: 'fixed', top: '15%', left: '50%', transform: 'translateX(-50%)',
                background: 'white', border: '2px solid #2196F3', borderRadius: '8px',
                boxShadow: '0 4px 20px rgba(0,0,0,0.3)', zIndex: 10001, maxWidth: '500px',
                width: '90%', maxHeight: '80vh', display: 'flex', flexDirection: 'column', overflow: 'hidden'
            });
            widget.innerHTML = `
                <div id="fill-result-header" style="padding:8px 12px; background:#2196F3; color:#fff; cursor:move; display:flex; justify-content:space-between; align-items:center;">
                    <h3 style="margin:0; font-size:16px; color:#fff;">📊 Kết quả điền đáp án</h3>
                    <div>
                        <button id="minimize-fill-result" title="Thu nhỏ" style="background:none;border:none;color:white;font-size:20px;cursor:pointer;padding:0 5px;">—</button>
                        <button id="close-fill-result" title="Đóng" style="background:none;border:none;color:white;font-size:20px;cursor:pointer;padding:0 5px;">×</button>
                    </div>
                </div>
                <div id="fill-result-content" style="padding: 16px; overflow-y: auto; background: #fff;"></div>
            `;
            document.body.appendChild(widget);

            bubble = document.createElement('div');
            bubble.id = bubbleId; bubble.title = 'Hiện lại kết quả'; bubble.innerHTML = '📊';
            bubble.classList.add('ehou-hidden');
            Object.assign(bubble.style, {
                position: 'fixed', bottom: '30px', right: '30px', width: '50px', height: '50px',
                background: '#2196F3', color: '#fff', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: '24px', cursor: 'pointer', boxShadow: '0 4px 12px rgba(0,0,0,0.3)', zIndex: 10000
            });
            document.body.appendChild(bubble);

            document.getElementById('minimize-fill-result').addEventListener('click', () => {
                widget.style.opacity = '0'; widget.style.pointerEvents = 'none'; bubble.classList.remove('ehou-hidden');
                setTimeout(()=>{ widget.style.display='none'; widget.style.opacity='1'; widget.style.pointerEvents='auto'; }, 200);
            });
            document.getElementById('close-fill-result').addEventListener('click', () => { widget.remove(); bubble.remove(); });
            bubble.addEventListener('click', () => { widget.style.display='flex'; bubble.classList.add('ehou-hidden'); });
        }

        const { totalQuestions, filledCount, exactMatches, fuzzyMatches, notFound, aiAnswers, dbAnswers, details, hasNextPage } = results;
        const processMedia = (typeof window.processMediaPlaceholders === 'function') ? window.processMediaPlaceholders : (t)=>t;
        const escapeKeep = (typeof window.escapeHtmlExceptValidMedia === 'function') ? window.escapeHtmlExceptValidMedia : (t)=>t;
        const highlighter = (typeof window.highlightElement === 'function') ? window.highlightElement : (el)=>{ if (el) el.scrollIntoView({behavior:'smooth', block:'center'}); };
        // Build details HTML separately to avoid nested template backticks
        let detailsHtml = '';
        if (Array.isArray(details) && details.length) {
            const items = details.map(function(detail, index){
                const statusIcon = detail.status === 'exact' ? '🎯' : (detail.status === 'fuzzy' ? '⚠️' : '❌');
                const statusColor = detail.status === 'exact' ? '#4CAF50' : (detail.status === 'fuzzy' ? '#FF9800' : '#F44336');
                const similarityText = detail.similarity > 0 ? ' (' + (detail.similarity * 100).toFixed(1) + '%)' : '';
                const aiIcon = detail.isAi ? '🤖' : '💾';
                const aiText = detail.isAi ? 'AI' : 'DB';
                const qText = processMedia(escapeKeep(detail.rawQuestion || detail.question || ''));
                const aText = processMedia(escapeKeep(detail.answer || ''));
                return (
                    '<div class="fill-result-detail-item" data-question-id="' + (detail.questionId || '') + '" style="margin-bottom:4px;font-size:12px;cursor:pointer;padding:4px 6px;border-radius:4px;" onmouseover="this.style.background=\'#f0f8ff\'" onmouseout="this.style.background=\'transparent\'">' +
                    '<span style="color:' + statusColor + ';font-weight:bold;">' + statusIcon + ' Câu ' + (index + 1) + ':</span> ' +
                    '<span style="color:#666;font-weight:bold;">' + aiIcon + ' ' + aiText + '</span> ' +
                    qText +
                    (detail.answer ? ('<br><span style="margin-left:20px;">→ ' + aText + similarityText + '</span>') : '') +
                    '</div>'
                );
            }).join('');
            detailsHtml = '<div style="max-height: 200px; overflow-y: auto; border: 1px solid #ddd; padding: 8px; background: #f9f9f9; margin-top: 12px;">' +
                '<div style="font-weight: bold; margin-bottom: 6px;">Chi tiết:</div>' + items + '</div>';
        }
        const contentEl = document.getElementById('fill-result-content');
        contentEl.innerHTML = `
            <div style="margin-bottom:8px;"><span style="font-weight:bold;">Tổng số câu hỏi:</span> ${totalQuestions}</div>
            <div style="margin-bottom:8px;"><span style="font-weight:bold;color:#4CAF50;">✅ Đã điền:</span> ${filledCount} câu</div>
            <div style="margin-bottom:8px;"><span style="font-weight:bold;color:#2196F3;">🎯 Khớp chính xác 100%:</span> ${exactMatches} câu</div>
            <div style="margin-bottom:8px;"><span style="font-weight:bold;color:#FF9800;">⚠️ Khớp fuzzy 99.5%:</span> ${fuzzyMatches} câu<div style="font-size:12px;color:#666;margin-top:4px;">Vui lòng kiểm tra lại các câu này!</div></div>
            <div style="margin-bottom:12px;"><span style="font-weight:bold;color:#F44336;">❌ Không tìm thấy:</span> ${notFound} câu</div>
            <hr style="margin:12px 0;border:1px solid #ddd;">
            <div style="margin-bottom:8px;"><span style="font-weight:bold;color:#9C27B0;">🤖 Đáp án từ AI:</span> ${aiAnswers} câu</div>
            <div style="margin-bottom:8px;"><span style="font-weight:bold;color:#607D8B;">💾 Đáp án từ Dữ liệu:</span> ${dbAnswers} câu</div>
            ${detailsHtml}
            ${hasNextPage ? `
            <div style="text-align:center; margin-top: 15px; padding-top: 15px; border-top: 1px solid #eee;">
                <button id="widget-next-page-btn" style="background: linear-gradient(to right, #28a745, #218838); color: white; border: none; padding: 10px 20px; border-radius: 8px; cursor: pointer; font-size: 16px; font-weight: bold; width: 100%;">
                    Trang Tiếp Theo →
                </button>
            </div>` : ''}
        `;

        // Click-to-scroll highlight
        contentEl.querySelectorAll('.fill-result-detail-item').forEach(item => {
            item.addEventListener('click', () => {
                const qid = item.getAttribute('data-question-id');
                const el = qid ? document.getElementById(qid) : null;
                if (el) highlighter(el);
            });
        });

        if (hasNextPage) {
            const widgetNextBtn = contentEl.querySelector('#widget-next-page-btn');
            if (widgetNextBtn) {
                widgetNextBtn.addEventListener('click', () => { const n = findNextPageButton_new(); if (n) n.click(); });
            }
        }

        widget.style.display = 'flex';
    }

    // Reactively remove widget if setting is turned off
    chrome.storage.onChanged.addListener((changes, namespace) => {
        if (namespace === 'local' && changes.showResultWidget) {
            if (changes.showResultWidget.newValue === false) {
                const widget = document.getElementById('fill-result-widget');
                const bubble = document.getElementById('fill-result-bubble');
                if (widget) widget.remove();
                if (bubble) bubble.remove();
            }
        }
    });

    // Cache để lưu kết quả kiểm tra admin (tránh check nhiều lần)
    let adminCheckCache_new = {
        isAdmin: null,
        timestamp: null,
        cacheDuration: 5 * 60 * 1000 // Cache 5 phút
    };

    // Helper function để kiểm tra xem user có phải admin không
    async function checkIsAdmin_new() {
        // Kiểm tra cache trước
        if (adminCheckCache_new.isAdmin !== null && adminCheckCache_new.timestamp) {
            const now = Date.now();
            if (now - adminCheckCache_new.timestamp < adminCheckCache_new.cacheDuration) {
                return adminCheckCache_new.isAdmin;
            }
        }
        
        // Nếu cache hết hạn hoặc chưa có, kiểm tra lại
        return new Promise((resolve) => {
            chrome.storage.local.get(['profile'], (data) => {
                const role = data.profile?.role || '';
                const isAdmin = typeof role === 'string' && ['admin', 'partner'].includes(role.trim().toLowerCase());
                
                // Lưu vào cache
                adminCheckCache_new.isAdmin = isAdmin;
                adminCheckCache_new.timestamp = Date.now();
                
                resolve(isAdmin);
            });
        });
    }

    // Helper function to show upload status to user (chỉ hiển thị cho admin)
    async function showUploadStatus_new(message, type = 'info') {
        // Kiểm tra xem user có phải admin không
        const isAdmin = await checkIsAdmin_new();
        
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

    // Hàm tính kích thước ước tính của một question (bytes)
    function estimateQuestionSize_new(question) {
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
    function splitQuestionsIntoBatches_new(questions, subjectCode, subjectName) {
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
            const questionSize = estimateQuestionSize_new(question);
            
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
                logger.debugLogWithEmoji('⚠️', `[NEW-LMS] Question ${index + 1} quá lớn (${(questionSize / 1024).toFixed(2)}KB), tách riêng`);
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
        
        logger.debugLogWithEmoji('📦', `[NEW-LMS] Đã tách thành ${batches.length} batch(es) từ ${questions.length} câu hỏi`);
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
    async function sendQuestionBatches_new(batches, subjectCode, subjectName) {
        if (!batches || batches.length === 0) {
            logger.debugLogWithEmoji('⚠️', '[NEW-LMS] Không có batch nào để gửi');
            return;
        }
        
        const totalBatches = batches.length;
        let successCount = 0;
        let failCount = 0;
        const errors = [];
        
        // Hiển thị thông báo bắt đầu
        if (totalBatches > 1) {
            await showUploadStatus_new(`📤 Đang gửi ${totalBatches} phần dữ liệu...`, 'info');
        }
        
        // Gửi từng batch tuần tự
        for (let i = 0; i < batches.length; i++) {
            const batch = batches[i];
            const batchNumber = i + 1;
            
            try {
                // Hiển thị progress nếu có nhiều batch
                if (totalBatches > 1) {
                    const progress = ((batchNumber / totalBatches) * 100).toFixed(0);
                    await showUploadStatus_new(`📤 Đang gửi phần ${batchNumber}/${totalBatches} (${progress}%)...`, 'info');
                }
                
                // Gửi batch
                const response = await new Promise((resolve, reject) => {
                    chrome.runtime.sendMessage({
                        type: 'saveQuestions',
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
                logger.debugLogWithEmoji('✅', `[NEW-LMS] Batch ${batchNumber}/${totalBatches} đã gửi thành công`);
                
                // Delay nhỏ giữa các batch để tránh quá tải server
                if (i < batches.length - 1) {
                    await new Promise(resolve => setTimeout(resolve, 300));
                }
                
            } catch (error) {
                failCount++;
                const errorMsg = `Batch ${batchNumber}/${totalBatches}: ${error.message}`;
                errors.push(errorMsg);
                logger.debugLogWithEmoji('❌', `[NEW-LMS] ${errorMsg}`);
                console.error(`[NEW-LMS] Failed to send batch ${batchNumber}:`, error);
                
                // Tiếp tục gửi các batch còn lại ngay cả khi một batch lỗi
            }
        }
        
        // Hiển thị kết quả cuối cùng
        if (totalBatches > 1) {
            if (failCount === 0) {
                await showUploadStatus_new(`✅ Đã gửi thành công ${successCount}/${totalBatches} phần!`, 'success');
            } else if (successCount === 0) {
                await showUploadStatus_new(`❌ Gửi thất bại tất cả ${failCount} phần!`, 'error');
            } else {
                await showUploadStatus_new(`⚠️ Đã gửi ${successCount}/${totalBatches} phần, ${failCount} phần lỗi!`, 'warning');
            }
        } else {
            // Chỉ có 1 batch, hiển thị thông báo đơn giản
            if (successCount > 0) {
                await showUploadStatus_new('✅ Đã lưu câu hỏi thành công!', 'success');
            } else {
                await showUploadStatus_new('❌ Lỗi khi lưu câu hỏi!', 'error');
            }
        }
        
        // Log chi tiết lỗi nếu có
        if (errors.length > 0) {
            console.error('[NEW-LMS] Errors while sending batches:', errors);
        }
    }

    async function saveFullQuestions_new() {
        // Parse review blocks and enrich with correct/wrong/explanation
        const queNodes = Array.from(document.querySelectorAll('.que'));
        if (queNodes.length === 0) {
            logger.debugLogWithEmoji('⚠️', '[NEW-LMS] Không tìm thấy .que trên trang review');
            return { success: false, reason: 'no_questions' };
        }

        const questions = await getQuestions_new();

        const enriched = questions.map((qData, idx) => {
            const q = queNodes[idx];
            if (!q) return qData;
            const answerDivs = Array.from(q.querySelectorAll('.answer > div'));

            // Detect correct and wrong indices
            let correctIdx = answerDivs.findIndex(div => div.classList.contains('correct'));
            if (correctIdx === -1) {
                // Try icon with aria-label "Đúng"
                correctIdx = answerDivs.findIndex(div => div.querySelector('[aria-label="Đúng"], .text-success, .fa-circle-check'));
            }
            let wrongIdx = answerDivs.findIndex(div => div.classList.contains('incorrect'));
            if (wrongIdx === -1) {
                wrongIdx = answerDivs.findIndex(div => div.querySelector('[aria-label="Sai"], .text-danger, .fa-circle-xmark'));
            }

            // Explanation (if exists)
            const expEl = q.querySelector('.specificfeedback, .feedback, .rightanswer');
            const expText = cleanText_new(expEl);

            const correctAnswer = (correctIdx >= 0 && qData.choices[correctIdx]) ? {
                text: qData.choices[correctIdx].text,
                imageUrls: [], imageBase64: [], imageHashes: [],
                audioUrls: [], audioBase64: [], audioHashes: []
            } : null;

            const wrongAnswer = (wrongIdx >= 0 && qData.choices[wrongIdx]) ? {
                text: qData.choices[wrongIdx].text,
                imageUrls: [], imageBase64: [], imageHashes: [],
                audioUrls: [], audioBase64: [], audioHashes: []
            } : null;

            return {
                questionHash: qData.questionHash,
                content: qData.content,
                correctAnswer,
                explanation: expText ? { text: expText, imageUrls: [], imageBase64: [], imageHashes: [], audioUrls: [], audioHashes: [] } : null,
                choices: qData.choices,
                type: qData.type,
                wrongAnswer
            };
        });

        const subjectCode = await getSubjectCodeWithFallback_new();
        const subjectName = getSubjectNameFromTitle_new();

        // Tách questions thành các batch nhỏ để tránh request quá lớn
        const questionBatches = splitQuestionsIntoBatches_new(enriched, subjectCode, subjectName);
        
        // Gửi từng batch tuần tự
        await sendQuestionBatches_new(questionBatches, subjectCode, subjectName);

        return { success: true };
    }

    // Minimal popup UI compatible with old behavior
    function showResultPopup_new(x, y, dataList) {
        const old = document.querySelector('#quiz-result-popup');
        if (old) old.remove();

        const popup = document.createElement('div');
        popup.id = 'quiz-result-popup';

        popup.innerHTML = (dataList || []).map((item, idx) => {
            if (item && item.ai === true && item.explanation && !item.content) {
                return `<div style="margin-bottom: 12px;">
                    <div><b>🤖 AI phân tích</b></div>
                    <div style=\"margin-top: 6px;\">${(item.explanation || '')}</div>
                </div>`;
            }
            const title = item?.content?.text || item?.content || '';
            const exp = (item?.explanation && (item.explanation.text || item.explanation)) || '';
            const typeDisplay = item?.typeDisplay || item?.type || 'Chọn một câu trả lời';
            const choices = Array.isArray(item?.choices) ? item.choices : [];
            const letters = ['a','b','c','d','e','f'];
            const choicesHtml = choices.map((c, i) => {
                const isCorrect = (typeof item.correctAnswer === 'number') && (i === item.correctAnswer);
                return `<div>${letters[i] || i}. ${(c?.text || '')} ${isCorrect ? '✅' : ''}</div>`;
            }).join('');
            const qImages = item.questionImagesHtml || '';
            const qAudios = item.questionAudioHtml || '';
            return `<div style=\"margin-bottom: 12px;\">\n                <div style=\"font-weight: bold;\">${idx + 1}. ${title}</div>\n                <div style=\"font-size: 12px; color: #666; margin-bottom: 6px;\">📝 ${typeDisplay}</div>\n                ${qImages}${qAudios}\n                <div style=\"margin-left: 10px; margin-top: 6px;\">${choicesHtml}</div>\n                ${exp ? `<div style=\\\"margin-top: 6px; font-style: italic; color: #222;\\\">🧠 ${exp}</div>` : ''}\n            </div>`;
        }).join("<hr style='margin: 12px 0;'>");

        Object.assign(popup.style, {
            position: 'absolute',
            top: `${y + window.scrollY + 20}px`,
            left: `${x + window.scrollX}px`,
            padding: '14px',
            background: 'linear-gradient(to right, #ffffff, #e3f2fd)',
            color: '#000',
            fontSize: '14px',
            borderRadius: '12px',
            zIndex: 10000,
            boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
            width: '420px',
            maxWidth: '90%',
            whiteSpace: 'normal',
            lineHeight: '1.5'
        });

        document.body.appendChild(popup);
        setTimeout(() => {
            document.addEventListener('click', function removePopup(ev) {
                if (!popup.contains(ev.target)) {
                    popup.remove();
                    document.removeEventListener('click', removePopup);
                }
            });
        }, 10);
    }

    async function getLearningAccount_new() {
        return new Promise((resolve, reject) => {
            try {
                chrome.storage.local.get('usernameEhou', (result) => {
                    if (chrome.runtime.lastError) return reject(chrome.runtime.lastError);
                    resolve(result.usernameEhou || '');
                });
            } catch (e) { resolve(''); }
        });
    }

    async function getOpaqueKey_new() {
        try {
            const { opaqueKey } = await new Promise((resolve, reject) => {
                try {
                    chrome.storage.local.get('opaqueKey', (result) => {
                        if (chrome.runtime.lastError) return reject(chrome.runtime.lastError);
                        resolve(result);
                    });
                } catch (e) { resolve({}); }
            });
            return opaqueKey || null;
        } catch { return null; }
    }

    function searchAndShowPopup_new(questionText, subjectCode, rect) {
        if (!questionText) return;
        chrome.storage.local.get(['profile', 'access_token', 'username'], async (data) => {
            if (!data.access_token) return;
            const role = (data.profile?.role || '').toString().trim().toLowerCase();
            const isAdmin = ['admin','partner'].includes(role);
            if (!isAdmin) {
                const pageUsername = await getCurrentPageUsername_new();
                const extUsername = data.profile?.username || data.profile?.userName || data.username || '';
                if (pageUsername && extUsername && pageUsername !== extUsername) {
                    alert(`Vui lòng đăng nhập vào tài khoản học là ${extUsername} thì mới được dùng các chức năng này!`);
                    return;
                }
            }
            const learningAccount = await getLearningAccount_new();
            const opaqueKey = await getOpaqueKey_new();
            if (!opaqueKey) {
                alert('⚠️ Không thể tạo khóa bảo mật. Vui lòng đăng nhập lại vào hệ thống học và thử lại!');
                return;
            }
            chrome.runtime.sendMessage({
                type: 'searchQuestion',
                payload: { question: questionText, subjectCode, learningAccount, opaqueKey }
            }, (response) => {
                const dataList = response?.data || [];
                if (dataList.length > 0 && dataList[0].message) {
                    showResultPopup_new(rect.right, rect.bottom, [{ ai: true, explanation: dataList[0].message }]);
                    return;
                }
                const finalData = dataList.length > 0 ? dataList : [{ ai: true, explanation: 'Không tìm thấy kết quả.' }];
                showResultPopup_new(rect.right, rect.bottom, finalData);
            });
        });
    }

    (function setupSelectionListener_new() {
        let iconEl = null;
        async function showSearchIcon(e) {
            const selectedText = window.getSelection().toString().trim();
            const subjectCode = await getSubjectCodeWithFallback_new();
            if (!selectedText) return;
            chrome.storage.local.get('access_token', (data) => {
                if (!data.access_token) return;
                const sel = window.getSelection();
                if (!sel.rangeCount) return;
                if (!iconEl) {
                    iconEl = document.createElement('div');
                    iconEl.style.position = 'absolute';
                    iconEl.style.width = '28px';
                    iconEl.style.height = '28px';
                    iconEl.style.background = '#fff';
                    iconEl.style.border = '2px solid #000';
                    iconEl.style.borderRadius = '8px';
                    iconEl.style.display = 'flex';
                    iconEl.style.alignItems = 'center';
                    iconEl.style.justifyContent = 'center';
                    iconEl.style.cursor = 'pointer';
                    iconEl.style.zIndex = 9999;
                    const img = document.createElement('img');
                    img.src = chrome.runtime.getURL('images/ai-agent.png');
                    img.style.width = '24px';
                    img.style.height = '24px';
                    iconEl.appendChild(img);
                    document.body.appendChild(iconEl);
                }
                const range = sel.getRangeAt(0);
                const rect = range.getBoundingClientRect();
                const offsetX = 12, offsetY = 12;
                iconEl.style.top = `${rect.bottom + window.scrollY + offsetY}px`;
                iconEl.style.left = `${rect.right + window.scrollX + offsetX}px`;
                iconEl.style.display = 'block';
                iconEl.onclick = () => {
                    iconEl.style.display = 'none';
                    searchAndShowPopup_new(selectedText, subjectCode, rect);
                };
            });
        }
        document.addEventListener('mouseup', (e) => {
            const selectedText = window.getSelection().toString().trim();
            if (selectedText.length > 0) showSearchIcon(e);
            else if (iconEl) iconEl.style.display = 'none';
        });
        document.addEventListener('contextmenu', (e) => {
            setTimeout(() => {
                const selectedText = window.getSelection().toString().trim();
                if (selectedText.length > 0) showSearchIcon(e);
            }, 10);
        });
    })();

    // Auto làm bài button outside card-body (like legacy visual)
    (function setupAutoQuizButton_new() {
        if (!href.includes('/mod/quiz/attempt.php')) return;
        let isProcessing = false;

        const ensureButton = () => {
            if (document.getElementById('auto-quiz-button-new')) return null;
            // Prefer anchor like legacy: span#sb-1
            const anchor = document.getElementById('sb-1');
            // Fallback: locate card-body heading "Bảng câu hỏi"
            let cardBody = null;
            if (!anchor) {
                const headings = Array.from(document.querySelectorAll('.card-body.p-3 h3.card-title'));
                for (const h of headings) {
                    const text = (h.textContent || '').trim();
                    if (/Bảng câu hỏi/i.test(text)) {
                        cardBody = h.closest('.card-body.p-3');
                        break;
                    }
                }
                if (!cardBody) return null;
            }

            // Build fancy button group (main + retry + close), insert OUTSIDE card-body
            const container = document.createElement('div');
            container.id = 'auto-quiz-button-new';
            container.style.cssText = `
                position: relative;
                margin: 20px 0;
                display: flex;
                flex-direction: column;
                gap: 15px;
                align-items: center;
                z-index: 1000;
            `;

            const mainBtn = document.createElement('div');
            mainBtn.innerHTML = `
                <div style="
                    background: linear-gradient(135deg, #ff6b6b 0%, #ee5a24 0%, #ff9ff3 50%, #f368e0 100%);
                    color: white; padding: 14px 22px; border-radius: 40px;
                    font-size: 16px; font-weight: 700; cursor: pointer; min-width: 200px;
                    box-shadow: 0 10px 30px rgba(255, 107, 107, 0.35);
                    transition: all .25s ease; display:flex; align-items:center; gap:10px; justify-content:center;
                    border: 2px solid rgba(255,255,255,.25);
                " onmouseover="this.style.transform='scale(1.05) translateY(-2px)';"
                   onmouseout="this.style.transform='scale(1) translateY(0)';">
                    <span style="font-size:22px">🚀</span>
                    <span class="btn-text">LÀM BÀI NGAY</span>
                    <span class="spinner" style="display:none;width:18px;height:18px;border:3px solid rgba(255,255,255,.35);border-top:3px solid #fff;border-radius:50%;"></span>
                </div>
            `;

            const retryBtn = document.createElement('div');
            retryBtn.style.display = 'none';
            retryBtn.innerHTML = `
                <div style="background: linear-gradient(135deg, #ff9f43 0%, #f39c12 100%); color: white; padding: 10px 16px; border-radius: 28px; font-weight:600; cursor:pointer; box-shadow:0 6px 20px rgba(255,159,67,.4);">🔄 Làm lại</div>
            `;

            const closeBtn = document.createElement('div');
            closeBtn.style.display = 'none';
            closeBtn.innerHTML = `
                <div style="background: linear-gradient(135deg, #95a5a6 0%, #7f8c8d 100%); color: white; padding: 8px 14px; border-radius: 22px; font-weight:600; cursor:pointer; box-shadow:0 4px 15px rgba(149,165,166,.4);">✕ Đóng</div>
            `;

            container.appendChild(mainBtn);
            container.appendChild(retryBtn);
            container.appendChild(closeBtn);

            // Insert container just like legacy: immediately after #sb-1 if available
            if (anchor && anchor.parentNode) {
                anchor.parentNode.insertBefore(container, anchor.nextSibling);
            } else {
                // Else insert outside the nav section
                const navSection = cardBody.closest('section#mod_quiz_navblock');
                if (navSection && navSection.parentElement) {
                    navSection.parentElement.insertBefore(container, navSection.nextSibling);
                } else {
                    const parent = cardBody.parentElement;
                    if (parent) parent.insertBefore(container, cardBody.nextSibling);
                }
            }

            // Click handler
            const btn = mainBtn.firstElementChild;
            btn.addEventListener('click', async () => {
            if (isProcessing) return;
            isProcessing = true;
                btn.style.opacity = '0.6';
                const spinner = btn.querySelector('.spinner');
                const textEl = btn.querySelector('.btn-text');
                if (spinner) {
                    spinner.style.display = 'inline-block';
                    spinner.style.animation = 'spin 1s linear infinite';
                }
            try {
                const auth = await new Promise((resolve) => chrome.storage.local.get(['access_token', 'profile', 'username'], resolve));
                logger.debugLogWithEmoji('🔍', '[Auth check]', { 
                    hasToken: !!auth.access_token, 
                    username: auth.username,
                    role: auth.profile?.role,
                    studentCode: auth.profile?.studentCode 
                });

                if (!auth.access_token) { 
                    const errorMsg = '🔐 Vui lòng đăng nhập vào extension trước!';
                    logger.error('[No auth token]', errorMsg);
                    if (typeof window.showToast==='function') showToast(errorMsg,'error'); 
                    throw new Error('no_auth'); 
                }
                const role = (auth.profile?.role || '').toString().trim().toLowerCase();
                const isAdmin = ['admin','partner'].includes(role);
                if (!isAdmin) {
                    // Ở trang mới, so sánh studentCode thay vì username
                    const pageStudentCode = await getCurrentPageStudentCode_new();
                    const extStudentCode = auth.profile?.studentCode || '';
                    logger.debugLogWithEmoji('🔍', '[StudentCode check]', { 
                        pageStudentCode, 
                        extStudentCode, 
                        match: pageStudentCode === extStudentCode 
                    });
                    
                    if (pageStudentCode && extStudentCode && pageStudentCode !== extStudentCode) { 
                        const errorMsg = `⚠️ Mã sinh viên trên trang (${pageStudentCode}) không khớp với mã đã đăng ký (${extStudentCode})!`;
                        logger.error('[StudentCode mismatch]', { pageStudentCode, extStudentCode });
                        if (typeof window.showToast==='function') showToast(errorMsg,'error'); 
                        throw new Error('student_code_mismatch'); 
                    }
                    // Nếu chưa có studentCode trong profile, cảnh báo nhưng không chặn
                    if (pageStudentCode && !extStudentCode) {
                        const errorMsg = `⚠️ Vui lòng cập nhật mã sinh viên trong profile! (Mã trên trang: ${pageStudentCode})`;
                        logger.error('[StudentCode not set in profile]', { pageStudentCode });
                        if (typeof window.showToast==='function') showToast(errorMsg,'error'); 
                        throw new Error('student_code_not_set'); 
                    }
                }
                if (typeof window.showToast==='function') showToast('📖 Đang lấy câu hỏi từ trang...','info');
                const questions = await getQuestions_new();
                const subjectCode = await getSubjectCodeWithFallback_new();
                logger.debugLogWithEmoji('🔍', '[Questions loaded]', { 
                    count: questions?.length || 0, 
                    subjectCode 
                });
                
                if (!questions || !questions.length) { 
                    logger.error('[No questions found]');
                    if (typeof window.showToast==='function') showToast('❌ Không lấy được câu hỏi trên trang!','error'); 
                    throw new Error('no_questions'); 
                }
                const learningAccount = await getLearningAccount_new();
                const opaqueKey = await getOpaqueKey_new();
                logger.debugLogWithEmoji('🔍', '[Account info]', { learningAccount, hasOpaqueKey: !!opaqueKey });
                
                if (!opaqueKey) { 
                    logger.error('[No opaqueKey]');
                    if (typeof window.showToast==='function') showToast('⚠️ Không thể tạo khóa bảo mật. Vui lòng đăng nhập lại!','error'); 
                    throw new Error('no_key'); 
                }
                if (typeof window.showToast==='function') showToast('🔎 Đang tìm kiếm đáp án...','info');
                chrome.runtime.sendMessage({
                    type: 'searchMultipleQuestions',
                    payload: { questions, subjectCode, learningAccount, opaqueKey }
                }, async (response) => {
                    logger.debugLogWithEmoji('🔍', '[Search response]', { 
                        success: response?.success, 
                        dataCount: response?.data?.length || 0,
                        error: response?.error 
                    });
                    try {
                        if (response && response.success && Array.isArray(response.data) && response.data.length > 0) {
                            if (typeof window.showToast==='function') showToast(`🎯 Tìm thấy ${response.data.length} đáp án! Đang điền...`,'success');
                            const answerMap = (typeof window.convertToAnswerMap === 'function') ? window.convertToAnswerMap(response.data) : {};
                            const hashAnswerMap = buildHashAnswerMap_new(response.data);
                            await fillAnswers_new(answerMap, hashAnswerMap);
                            if (typeof window.showToast==='function') showToast('🎉 Đã điền đáp án thành công! Chúc bạn làm bài tốt!','success');
                            retryBtn.style.display = 'block';
                            closeBtn.style.display = 'block';
                        } else {
                            if (typeof window.showToast==='function') showToast(`⚠️ ${response?.error || 'Không tìm thấy đáp án phù hợp!'}`,'warning');
                            retryBtn.style.display = 'block';
                            closeBtn.style.display = 'block';
                        }
                    } finally {
                        // Cleanup loading ONLY after response handling completes
                        isProcessing = false;
                        btn.style.opacity = '1';
                        if (spinner) spinner.style.display = 'none';
                    }
                });
            } catch (e) {
                // Log chi tiết cho dev
                logger.error('[Auto quiz error caught]', {
                    error: e,
                    message: e?.message,
                    stack: e?.stack,
                    name: e?.name
                });
                console.error('Auto quiz error:', e);
                
                // Lấy thông tin user ngay lập tức (đã có từ auth check trước đó)
                chrome.storage.local.get(['profile', 'username'], (data) => {
                    const username = data.username || data.profile?.username || data.profile?.userName || '';
                    const studentCode = data.profile?.studentCode || '';
                    const userInfo = studentCode ? ` (MSV: ${studentCode})` : (username ? ` (User: ${username})` : '');
                    
                    // Xác định thông báo lỗi chi tiết dựa trên error type
                    let errorMessage = '❌ Lỗi khi tự động làm bài!';
                    const errorType = e?.message || e?.name || '';
                    
                    // Map error types to user-friendly messages
                    switch (errorType) {
                        case 'no_auth':
                            errorMessage = '🔐 Vui lòng đăng nhập vào extension trước!';
                            break;
                        case 'student_code_mismatch':
                            errorMessage = `⚠️ đăng nhập vào tài khoản học có mã sinh viên là ${studentCode} để sử dụng tính năng này!`;
                            break;
                        case 'student_code_not_set':
                            errorMessage = `⚠️ Vui lòng cập nhật mã sinh viên trong profile!${userInfo}`;
                            break;
                        case 'no_questions':
                            errorMessage = '❌ Không lấy được câu hỏi trên trang!';
                            break;
                        case 'no_key':
                            errorMessage = '⚠️ Không thể tạo khóa bảo mật. Vui lòng đăng nhập lại!';
                            break;
                        default:
                            // Hiển thị error message nếu có, hoặc dùng message mặc định
                            if (e?.message && e.message !== errorType) {
                                errorMessage = `❌ ${e.message}${userInfo}`;
                            } else {
                                errorMessage = `❌ Lỗi khi tự động làm bài!${userInfo}`;
                            }
                    }
                    
                    // Hiển thị thông báo lỗi
                    if (typeof window.showToast === 'function') {
                        showToast(errorMessage, 'error');
                    }
                });
                
                // Fallback cleanup if we failed before sendMessage callback
                isProcessing = false;
                btn.style.opacity = '1';
                const spinner = btn.querySelector('.spinner');
                if (spinner) spinner.style.display = 'none';
            }
            });

            // Ensure showToast exists (legacy-style)
            if (typeof window.showToast !== 'function') {
                window.showToast = function(message, type = 'info') {
                    const toast = document.createElement('div');
                    toast.className = `toast-message ${type}`;
                    toast.textContent = message;
                    document.body.appendChild(toast);
                    setTimeout(() => {
                        toast.style.animation = 'slideInRight 0.4s cubic-bezier(0.4,0,.2,1) reverse';
                        setTimeout(() => toast.remove(), 400);
                    }, 4000);
                };
                if (!document.getElementById('toast-styles')) {
                    const toastStyle = document.createElement('style');
                    toastStyle.id = 'toast-styles';
                    toastStyle.textContent = `
                        .toast-message { position: fixed; top: 80px; right: 20px; padding: 14px 22px; border-radius: 12px; color: white; font-weight: 500; z-index: 10001; animation: slideInRight .4s cubic-bezier(.4,0,.2,1); max-width: 350px; word-wrap: break-word; box-shadow: 0 8px 25px rgba(0,0,0,.15); backdrop-filter: blur(10px); border: 1px solid rgba(255,255,255,.1); }
                        .toast-message.info { background: linear-gradient(135deg, #17a2b8 0%, #138496 100%); border-left: 4px solid #0c5460; }
                        .toast-message.success { background: linear-gradient(135deg, #28a745 0%, #20c997 100%); border-left: 4px solid #155724; }
                        .toast-message.warning { background: linear-gradient(135deg, #ffc107 0%, #fd7e14 100%); color:#212529; border-left: 4px solid #856404; }
                        .toast-message.error { background: linear-gradient(135deg, #dc3545 0%, #e83e8c 100%); border-left: 4px solid #721c24; }
                        @keyframes slideInRight { from { transform: translateX(100%) scale(.9); opacity: 0; } to { transform: translateX(0) scale(1); opacity: 1; } }
                    `;
                    document.head.appendChild(toastStyle);
                }
            }

            // Retry & Close actions
            retryBtn.addEventListener('click', () => {
                if (btn) btn.click();
            });
            closeBtn.addEventListener('click', () => {
                retryBtn.style.display = 'none';
                closeBtn.style.display = 'none';
            });
            return container;
        };

        // initial
        ensureButton();
        // Observe DOM changes (pagination etc.)
        const obs = new MutationObserver(() => ensureButton());
        obs.observe(document.body, { childList: true, subtree: true });
    })();

    // Keyboard shortcuts: 'll' -> Làm bài ngay, 'nn' -> Trang tiếp
    (function setupHotkeys_new(){
        if (!href.includes('/mod/quiz/attempt.php')) return;
        let buffer = '';
        let timer = null;
        const reset = () => { buffer = ''; if (timer) { clearTimeout(timer); timer = null; } };
        document.addEventListener('keydown', (e) => {
            // Ignore when typing in inputs or contenteditable
            const t = e.target;
            const isEditable = t && ((t.tagName === 'INPUT') || (t.tagName === 'TEXTAREA') || (t.isContentEditable));
            if (isEditable) return;
            if (e.ctrlKey || e.altKey || e.metaKey) return;
            if (e.key && e.key.length === 1) {
                buffer += e.key.toLowerCase();
                // Keep only last 2
                if (buffer.length > 2) buffer = buffer.slice(-2);
                if (timer) clearTimeout(timer);
                timer = setTimeout(reset, 1200);
                if (buffer === 'll') {
                    reset();
                    const container = document.getElementById('auto-quiz-button-new');
                    const textEl = container ? container.querySelector('.btn-text') : null;
                    const btn = textEl ? textEl.parentElement : (container ? container.querySelector('div') : null);
                    if (btn && typeof btn.click === 'function') {
                        if (typeof window.showToast==='function') showToast('🚀 Phím tắt: Làm bài ngay','info');
                        btn.click();
                    }
                } else if (buffer === 'nn') {
                    reset();
                    const nextBtn = window.findNextPageButton ? window.findNextPageButton() : null;
                    if (nextBtn) {
                        if (typeof window.showToast==='function') showToast('➡️ Phím tắt: Trang tiếp','info');
                        nextBtn.click();
                    }
                }
            }
        });
    })();

    // Expose username getter for shared checks
    window.getCurrentPageUsername = window.getCurrentPageUsername || getCurrentPageUsername_new;
    // Expose next button finder for attempt flow
    window.findNextPageButton = window.findNextPageButton || findNextPageButton_new;

    // Wire message handling similar to legacy, but call new stubs
    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
        try {
            switch (request.type) {
                case 'getQuestions': {
                    getQuestions_new().then(async (questions) => {
                        const subjectCode = await getSubjectCodeWithFallback_new();
                        sendResponse({ questions, subjectCode });
                    });
                    return true;
                }
                case 'saveQuestions': {
                    saveFullQuestions_new().then((result) => sendResponse(result));
                    return true;
                }
                case 'backendAnswers': {
                    const serverData = request.serverData;
                    if (serverData && Array.isArray(serverData)) {
                        const answerMap = (typeof window.convertToAnswerMap === 'function') ? window.convertToAnswerMap(serverData) : {};
                        const hashAnswerMap = buildHashAnswerMap_new(serverData);
                        fillAnswers_new(answerMap, hashAnswerMap).then(() => sendResponse({ status: 'filled' }));
                        return true;
                    } else {
                        sendResponse({ status: 'failed', error: 'Invalid serverData' });
                    }
                    break;
                }
                case 'contextSearch': {
                    getSubjectCodeWithFallback_new().then(subjectCode => {
                        if (!subjectCode) return;
                        const selection = window.getSelection();
                        if (!selection || !selection.rangeCount) return;
                        const range = selection.getRangeAt(0);
                        const rect = range.getBoundingClientRect();
                        searchAndShowPopup_new(request.question, subjectCode, rect);
                    });
                    return true;
                }
                case 'getSubjectCode': {
                    getSubjectCodeWithFallback_new().then(subjectCode => {
                        sendResponse({ subjectCode });
                    });
                    return true;
                }
                case 'getStudentCode': {
                    getCurrentPageStudentCode_new().then(studentCode => {
                        sendResponse({ studentCode });
                    });
                    return true;
                }
                default:
                    break;
            }
        } catch (e) {
            logger.debugLogWithEmoji('❌', '[NEW-LMS] message error:', e);
        }
        return true;
    });

    // Optional: minimal bootstrap for Selection search icon if shared code is loaded elsewhere
    // If you later move the shared selection UI into a shared module, you can import here.
    logger.debugLogWithEmoji('🚀', 'Easy Quiz EHOU new content script loaded (lmshub).');
    // Auto trigger save on review page
    if (href.includes('/mod/quiz/review.php')) {
        let called = false;
        const run = () => {
            if (called) return; called = true;
            try { saveFullQuestions_new(); } catch (e) { logger.debugLogWithEmoji('❌', 'saveFullQuestions_new error:', e); }
        };
        if (document.readyState === 'complete' || document.readyState === 'interactive') {
            setTimeout(run, 0);
        } else {
            window.addEventListener('load', run, { once: true });
        }
    }

    // Initialize opaqueKey on new LMS (mirror legacy behavior)
    (function initOpaqueKey_new(){
        try {
            window.addEventListener('load', async () => {
                try {
                    const username = await getCurrentPageUsername_new();
                    if (!username) return;
                    chrome.runtime.sendMessage({ type: 'encodeUsername', username }, (response) => {
                        if (response && response.success && response.opaqueKey) {
                            try {
                                chrome.storage.local.set({ opaqueKey: response.opaqueKey, usernameEhou: username });
                            } catch (e) {}
                        }
                    });
                } catch (e) {}
            }, { once: true });
        } catch (e) {}
    })();
})();


