let thread_id = crypto.randomUUID();

const chatWindow = document.getElementById('chat-window');
const mainContainer = document.getElementById('main');
const userInput = document.getElementById('user-input');
const sendBtn = document.getElementById('send-btn');
const newChatBtn = document.getElementById('new-chat-btn');
const suggestionList = document.getElementById('suggestion-list');
const suggestionsPanel = document.getElementById('suggestions');
const suggestionsToggle = document.getElementById('suggestions-toggle');

const CASE_QUESTIONS = [
    "Welk royaltypercentage geldt er nu voor Björk-tracks in de Benelux? En zeggen alle bronnen daar hetzelfde over?",
    "Welke tracks in de catalogus hebben een licentie die in 2025 afloopt, en wat staat er in de bijbehorende contractdocumenten over verlengen?",
    "Mag 'Halo' van Beyoncé gebruikt worden in een festival-aftermovie die online gepubliceerd wordt? Zo ja, onder welke voorwaarden en tegen welk tarief?",
    "Het radiostation wil de meest gedraaide tracks van 2024 opnieuw programmeren. Welke daarvan mogen niet, of alleen onder bijzondere voorwaarden, uitgezonden worden?",
    "Bij welke artiesten is de data zo tegenstrijdig of incompleet dat je geen kloppende royaltyberekening kunt maken? En hoe groot is dat probleem?",
];

function setSuggestionsOpen(open) {
    suggestionsPanel.classList.toggle('collapsed', !open);
    suggestionsToggle.setAttribute('aria-expanded', open ? 'true' : 'false');
}

suggestionsToggle.onclick = function () {
    setSuggestionsOpen(suggestionsPanel.classList.contains('collapsed'));
};

CASE_QUESTIONS.forEach((question, i) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'suggestion-btn';
    btn.innerHTML = '<span class="q-num">' + (i + 1) + '.</span>' + escapeHtml(question);
    btn.onclick = () => {
        setSuggestionsOpen(false);
        sendMessage(question);
    };
    suggestionList.appendChild(btn);
});

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function linkifySourcesInMarkdown(md) {
    md = md.replace(/\]\((?:\.\/)?(?:data\/)?documents\/([^)\s#]+)(#[^)]*)?\)/gi, '](/data/documents/$1$2)');
    md = md.replace(/\]\((?:\.\/)?results\/([^)\s#]+)(#[^)]*)?\)/gi, '](/results/$1$2)');
    md = md.replace(/\]\((?:\.\/)?data\/([^)\s#]+)(#[^)]*)?\)/gi, '](/data/$1$2)');

    md = md.replace(/\b([\w.-]+\.pdf)(?:,?\s*p\.?\s*(\d+))?/gi, function (match, file, page, offset, full) {
        const before = full.slice(Math.max(0, offset - 3), offset);
        if (before.includes('](') || before.endsWith('(/') || before.endsWith('/')) return match;
        const href = '/data/documents/' + file + (page ? '#page=' + page : '');
        const label = page ? file + ', p. ' + page : file;
        return '[' + label + '](' + href + ')';
    });

    md = md.replace(/(?<!\(|\/)\b(results\/[\w.-]+\.csv)\b/g, '[$1](/$1)');
    md = md.replace(/(?<!\(|\/)\b(tracks_rechten_export\.csv)\b/g, '[$1](/data/$1)');
    md = md.replace(/(?<!\(|\/)\b(CATALOG_DUMP_[\w.-]+\.dat)\b/g, '[$1](/data/$1)');
    return md;
}

function renderMarkdown(text) {
    const md = linkifySourcesInMarkdown(text);
    let html;
    if (window.marked && typeof marked.parse === 'function') {
        html = marked.parse(md, { breaks: true });
    } else {
        html = escapeHtml(md).replace(/\n/g, '<br>');
    }
    return html
        .replace(/<a /g, '<a class="source-link" ')
        .replace(/<table([\s>])/g, '<div class="table-wrap"><table$1')
        .replace(/<\/table>/g, '</table></div>');
}

const sourceOverlay = document.getElementById('source-overlay');
const sourceBody = document.getElementById('source-body');
const sourceTitle = document.getElementById('source-title');
const sourceClose = document.getElementById('source-close');

function closeSourceViewer() {
    sourceOverlay.hidden = true;
    sourceBody.innerHTML = '';
    sourceTitle.textContent = 'Source';
}

function sourceLabelFromUrl(url) {
    try {
        const u = new URL(url, window.location.origin);
        const name = u.pathname.split('/').pop() || 'Source';
        const page = u.hash.match(/page=(\d+)/i);
        return page ? name + ' · p. ' + page[1] : name;
    } catch (e) {
        return 'Source';
    }
}

async function openSourceViewer(url) {
    sourceTitle.textContent = sourceLabelFromUrl(url);
    sourceBody.innerHTML = '<p class="source-error">Loading…</p>';
    sourceOverlay.hidden = false;

    const path = url.split('#')[0].split('?')[0].toLowerCase();
    if (path.endsWith('.pdf')) {
        sourceBody.innerHTML = '';
        const frame = document.createElement('iframe');
        frame.title = sourceTitle.textContent;
        frame.src = url;
        sourceBody.appendChild(frame);
        return;
    }

    try {
        const res = await fetch(url);
        if (!res.ok) throw new Error('HTTP ' + res.status);
        const text = await res.text();
        const pre = document.createElement('pre');
        pre.textContent = text;
        sourceBody.innerHTML = '';
        sourceBody.appendChild(pre);
    } catch (err) {
        sourceBody.innerHTML = '<p class="source-error">Could not load this source.</p>';
    }
}

function isAppSourceUrl(href) {
    if (!href) return false;
    try {
        const u = new URL(href, window.location.origin);
        if (u.origin !== window.location.origin) return false;
        return u.pathname.startsWith('/data/') || u.pathname.startsWith('/results/');
    } catch (e) {
        return false;
    }
}

sourceClose.onclick = closeSourceViewer;
sourceOverlay.addEventListener('click', function (e) {
    if (e.target === sourceOverlay) closeSourceViewer();
});
document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && !sourceOverlay.hidden) closeSourceViewer();
});

document.addEventListener('click', function (e) {
    const link = e.target.closest('a.source-link, a[href^="/data/"], a[href^="/results/"]');
    if (!link) return;
    const href = link.getAttribute('href');
    if (!isAppSourceUrl(href)) return;
    e.preventDefault();
    openSourceViewer(href);
});

function renderStreamingMarkdown(text) {
    return renderMarkdown(text) + '<span class="stream-cursor" aria-hidden="true"></span>';
}

function shortToolLabel(msg) {
    const callMatch = msg.match(/Calling tool '([^']+)'/);
    if (callMatch) return callMatch[1];
    const resultMatch = msg.match(/Tool '([^']+)' returned/);
    if (resultMatch) return resultMatch[1] + ' ✓';
    return msg.length > 72 ? msg.slice(0, 71) + '…' : msg;
}

function createToolsPanel() {
    const panel = document.createElement('div');
    panel.className = 'tools-panel collapsed';

    const summaryBtn = document.createElement('button');
    summaryBtn.type = 'button';
    summaryBtn.className = 'tools-panel-summary';
    summaryBtn.setAttribute('aria-expanded', 'false');
    panel.classList.add('is-loading');
    summaryBtn.innerHTML =
        '<span class="tools-spinner" aria-hidden="true"></span>' +
        '<span class="tools-summary-text">Working…</span>' +
        '<span class="tools-chevron" aria-hidden="true">▸</span>';
    summaryBtn.setAttribute('aria-busy', 'true');

    const body = document.createElement('div');
    body.className = 'tools-panel-body';

    summaryBtn.onclick = function () {
        panel.classList.toggle('collapsed');
        const isOpen = !panel.classList.contains('collapsed');
        summaryBtn.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
        summaryBtn.querySelector('.tools-chevron').textContent = isOpen ? '▾' : '▸';
    };

    panel.appendChild(summaryBtn);
    panel.appendChild(body);
    chatWindow.appendChild(panel);

    return {
        el: panel,
        body,
        summaryText: summaryBtn.querySelector('.tools-summary-text'),
        summaryBtn,
        count: 0,
        latest: '',
        running: true,
    };
}

function updateToolsSummary(panel, latestLabel, finished) {
    panel.latest = latestLabel;
    panel.running = !finished;
    if (finished) {
        panel.el.classList.remove('is-loading');
        panel.summaryBtn.setAttribute('aria-busy', 'false');
        const spin = panel.summaryBtn.querySelector('.tools-spinner');
        if (spin) {
            spin.className = 'tools-done';
            spin.textContent = '✓';
        }
        panel.summaryText.textContent = 'Finished · ' + panel.count + ' tool' + (panel.count === 1 ? '' : 's');
    } else {
        panel.el.classList.add('is-loading');
        panel.summaryBtn.setAttribute('aria-busy', 'true');
        panel.summaryText.textContent = latestLabel + (panel.count > 1 ? ' · ' + panel.count + ' tools' : '');
    }
}

function appendToolRow(panel, kind, msg) {
    panel.count += 1;
    const row = document.createElement('div');
    row.className = 'tools-row';
    const label = shortToolLabel(msg);
    updateToolsSummary(panel, label, false);

    if (msg.length > 500) {
        const truncated = msg.substring(0, 500);
        const attr = (s) => s.replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
        const contentSpan = document.createElement('span');
        contentSpan.innerHTML = escapeHtml(truncated)
            + '<span class="expand-btn" data-full="' + attr(msg) + '" data-truncated="' + attr(truncated) + '">...expand</span>';
        row.innerHTML = '<b>' + kind + ':</b> ';
        row.appendChild(contentSpan);
    } else {
        row.innerHTML = '<b>' + kind + ':</b> <span>' + escapeHtml(msg) + '</span>';
    }
    panel.body.appendChild(row);
    mainContainer.scrollTop = mainContainer.scrollHeight;
}

chatWindow.addEventListener('click', function (e) {
    if (!e.target.classList.contains('expand-btn')) return;
    e.stopPropagation();
    const btn = e.target;
    const full = btn.getAttribute('data-full');
    const truncated = btn.getAttribute('data-truncated');
    const contentSpan = btn.parentElement;
    const isExpanded = btn.textContent.trim() === 'collapse';
    const attr = (s) => s.replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    if (isExpanded) {
        contentSpan.innerHTML = escapeHtml(truncated)
            + '<span class="expand-btn" data-full="' + attr(full) + '" data-truncated="' + attr(truncated) + '">...expand</span>';
    } else {
        contentSpan.innerHTML = escapeHtml(full)
            + '<span class="expand-btn" data-full="' + attr(full) + '" data-truncated="' + attr(truncated) + '">collapse</span>';
    }
});

function appendMessage(text, sender) {
    const msgDiv = document.createElement('div');
    msgDiv.className = 'message ' + sender;
    if (sender === 'ai' || sender === 'welcome') {
        msgDiv.innerHTML = renderMarkdown(text);
    } else {
        msgDiv.textContent = text;
    }
    chatWindow.appendChild(msgDiv);
    mainContainer.scrollTop = mainContainer.scrollHeight;
}

function showWelcome() {
    appendMessage(
        'Ask about artists, tracks, royalty rates, or license end dates. Sources may disagree — conflicts are called out.',
        'welcome'
    );
}

function sendMessage(text) {
    if (!text) return;
    appendMessage(text, 'user');
    userInput.value = '';
    userInput.style.height = 'auto';
    userInput.disabled = true;
    sendBtn.disabled = true;

    let aiMsgDiv = document.createElement('div');
    aiMsgDiv.className = 'message ai';
    aiMsgDiv.innerText = '...';
    chatWindow.appendChild(aiMsgDiv);
    mainContainer.scrollTop = mainContainer.scrollHeight;

    (async () => {
        try {
            const formData = new URLSearchParams();
            formData.append('user_input', text);
            formData.append('thread_id', thread_id);
            const response = await fetch('/chat', {
                method: 'POST',
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                body: formData.toString()
            });
            if (!response.ok) {
                aiMsgDiv.innerHTML = renderMarkdown('[Error: ' + response.status + ']');
                userInput.disabled = false;
                sendBtn.disabled = false;
                userInput.focus();
                return;
            }

            const reader = response.body.getReader();
            const decoder = new TextDecoder();
            let aiMsg = '';
            let toolsUsed = false;
            let toolsPanel = null;
            let buffer = '';
            let finalMessageProcessed = false;
            let answerStarted = false;

            function ensureAnswerDiv() {
                if (!aiMsgDiv || !aiMsgDiv.parentNode) {
                    aiMsgDiv = document.createElement('div');
                    aiMsgDiv.className = 'message ai streaming';
                    chatWindow.appendChild(aiMsgDiv);
                }
                answerStarted = true;
            }

            function resetAnswerForMoreTools() {
                if (answerStarted && aiMsgDiv && aiMsgDiv.parentNode) {
                    aiMsgDiv.remove();
                }
                aiMsgDiv = null;
                aiMsg = '';
                answerStarted = false;
            }

            let streamRaf = null;
            let revealPromise = null;

            function paintAnswer(streaming) {
                ensureAnswerDiv();
                if (streaming) {
                    aiMsgDiv.classList.add('streaming');
                    aiMsgDiv.innerHTML = renderStreamingMarkdown(aiMsg);
                } else {
                    aiMsgDiv.classList.remove('streaming');
                    aiMsgDiv.innerHTML = renderMarkdown(aiMsg);
                }
                mainContainer.scrollTop = mainContainer.scrollHeight;
            }

            function appendStreamText(chunk) {
                ensureAnswerDiv();
                if (aiMsgDiv.innerText === '...') {
                    aiMsgDiv.innerText = '';
                }
                aiMsg += chunk;
                if (streamRaf) return;
                streamRaf = requestAnimationFrame(function () {
                    streamRaf = null;
                    paintAnswer(true);
                });
            }

            function revealText(text) {
                return new Promise(function (resolve) {
                    ensureAnswerDiv();
                    aiMsg = '';
                    let i = 0;
                    function step() {
                        if (i >= text.length) {
                            aiMsg = text;
                            paintAnswer(false);
                            resolve();
                            return;
                        }
                        let n = 4;
                        if (text[i] === '\n') n = 1;
                        else if (text.startsWith('**', i) || text.startsWith('||', i)) n = 2;
                        else {
                            const nextSpace = text.indexOf(' ', i + 1);
                            if (nextSpace > i && nextSpace - i < 28) n = nextSpace - i + 1;
                        }
                        i = Math.min(text.length, i + n);
                        aiMsg = text.slice(0, i);
                        paintAnswer(true);
                        setTimeout(step, 12);
                    }
                    step();
                });
            }

            function extractMarker(marker) {
                const pattern = new RegExp(marker + ':(.+?)(?=\\n__TOOL_CALL__:|\\n__TOOL_CALL_RESULT__:|\\n__FINAL__:|$)', 's');
                const match = buffer.match(pattern) || buffer.match(new RegExp(marker + ':(.+)$', 's'));
                if (match) {
                    const content = match[1].trim();
                    buffer = buffer.replace(pattern, '');
                    if (buffer.includes(marker + ':')) {
                        buffer = buffer.replace(new RegExp(marker + ':.*$', 's'), '');
                    }
                    return content;
                }
                return null;
            }

            function processBuffer() {
                const markers = ['__TOOL_CALL__', '__TOOL_CALL_RESULT__', '__FINAL__'];
                const firstMarker = markers.find(m => buffer.includes(m + ':'));

                if (!firstMarker && buffer.length && !finalMessageProcessed) {
                    if (aiMsgDiv && aiMsgDiv.innerText === '...') {
                        aiMsgDiv.innerText = '';
                    }
                    appendStreamText(buffer);
                    buffer = '';
                    return;
                }

                if (firstMarker) {
                    const firstIndex = buffer.indexOf(firstMarker + ':');
                    if (firstIndex > 0 && !finalMessageProcessed) {
                        const ahead = buffer.substring(0, firstIndex);
                        if (ahead.trim()) {
                            if (aiMsgDiv && aiMsgDiv.innerText === '...') {
                                aiMsgDiv.innerText = '';
                            }
                            appendStreamText(ahead);
                        }
                        buffer = buffer.substring(firstIndex);
                    }
                }

                while (true) {
                    let processed = false;

                    if (buffer.includes('__TOOL_CALL__:')) {
                        const msg = extractMarker('__TOOL_CALL__');
                        if (msg) {
                            if (!toolsUsed) {
                                if (aiMsgDiv && aiMsgDiv.parentNode) aiMsgDiv.remove();
                                aiMsgDiv = null;
                                aiMsg = '';
                                toolsUsed = true;
                                toolsPanel = createToolsPanel();
                            } else {
                                resetAnswerForMoreTools();
                            }
                            appendToolRow(toolsPanel, 'Tool', msg);
                            processed = true;
                        }
                    }

                    if (buffer.includes('__TOOL_CALL_RESULT__:')) {
                        const msg = extractMarker('__TOOL_CALL_RESULT__');
                        if (msg) {
                            if (!toolsPanel) {
                                toolsUsed = true;
                                toolsPanel = createToolsPanel();
                            }
                            appendToolRow(toolsPanel, 'Result', msg);
                            processed = true;
                        }
                    }

                    if (buffer.includes('__FINAL__:') && !finalMessageProcessed) {
                        const finalMessage = extractMarker('__FINAL__');
                        if (finalMessage) {
                            if (streamRaf) {
                                cancelAnimationFrame(streamRaf);
                                streamRaf = null;
                            }
                            if (toolsPanel) updateToolsSummary(toolsPanel, toolsPanel.latest, true);
                            finalMessageProcessed = true;
                            processed = true;
                            const streamed = aiMsg.trim();
                            if (streamed.length >= Math.min(60, finalMessage.length * 0.5)) {
                                aiMsg = finalMessage;
                                paintAnswer(false);
                            } else {
                                revealPromise = revealText(finalMessage);
                            }
                        }
                    }

                    if (!processed) break;
                    mainContainer.scrollTop = mainContainer.scrollHeight;
                }
            }

            while (true) {
                const { value, done } = await reader.read();
                if (value) {
                    buffer += decoder.decode(value, { stream: true });
                    processBuffer();
                }
                if (done) {
                    let lastLength;
                    do {
                        lastLength = buffer.length;
                        processBuffer();
                    } while (buffer.length !== lastLength && buffer.length > 0);

                    if (toolsPanel && toolsPanel.running) {
                        updateToolsSummary(toolsPanel, toolsPanel.latest, true);
                    }
                    if (streamRaf) {
                        cancelAnimationFrame(streamRaf);
                        streamRaf = null;
                    }
                    if (revealPromise) {
                        await revealPromise;
                        revealPromise = null;
                    } else if (aiMsg && !finalMessageProcessed) {
                        aiMsg = aiMsg.trim();
                        paintAnswer(false);
                    } else if (aiMsgDiv && aiMsgDiv.innerText === '...') {
                        aiMsgDiv.remove();
                    }

                    userInput.disabled = false;
                    sendBtn.disabled = false;
                    userInput.focus();
                    break;
                }
            }
        } catch (err) {
            if (aiMsgDiv) {
                aiMsgDiv.innerHTML = renderMarkdown('[Network error]');
            }
            userInput.disabled = false;
            sendBtn.disabled = false;
            userInput.focus();
        }
    })();
}

sendBtn.onclick = function () {
    sendMessage(userInput.value.trim());
};

userInput.addEventListener('input', function () {
    this.style.height = 'auto';
    this.style.height = Math.min(this.scrollHeight, 160) + 'px';
});

userInput.addEventListener('keydown', function (e) {
    if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendBtn.onclick();
    }
});

newChatBtn.onclick = function () {
    thread_id = crypto.randomUUID();
    chatWindow.innerHTML = '';
    setSuggestionsOpen(true);
    showWelcome();
    userInput.focus();
    fetch('/new-chat', { method: 'POST' }).catch(function () {});
};

showWelcome();
