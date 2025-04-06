import { showNotification, showLoading } from './shared/utils.js';
import { categories, categorizeEmail, calculateCategoryScore } from './categories.js';
import uiHandler from './uihandler.js';

// Add handleEmailOperation near the top with other core email functions
async function handleEmailOperation(operation) {
    let attempt = 0;
    while (attempt < this.retryAttempts) {
        try {
            return await operation();
        } catch (error) {
            attempt++;
            if (error.status === 401) {
                this.handleAuthExpired();
                throw new Error('Authentication required');
            }
            if (error.status === 429 || error.message?.includes('quota')) {
                // Rate limit hit - wait and retry
                await new Promise(resolve => setTimeout(resolve, this.retryDelay * attempt));
                continue;
            }
            if (attempt === this.retryAttempts) {
                throw error;
            }
            await new Promise(resolve => setTimeout(resolve, this.retryDelay));
        }
    }
}

// --- MARKER: START OF EMAIL OPERATIONS SECTION ---
// Email operations like loading, sending, and managing emails
let isLoadingMore = false;
let hasMoreEmails = true;
let lastPageToken = null;

async function loadEmails(folderId = 'INBOX') {
    if (!this.accessToken) {
        showNotification('Please sign in first', 'warning');
        return;
    }

    try {
        await this.checkNetworkConnectivity();
        showLoading(true);
        const query = this.getFolderQuery(folderId);

        // Clear existing emails and categories first
        this.emails = [];
        this.emailCategories = {};

        const response = await this.handleEmailOperation(async () => {
            return await gapi.client.gmail.users.messages.list({
                userId: 'me',
                maxResults: 20, // Reduced from 50 to 20 for initial load
                labelIds: [folderId],
                q: query
            });
        });

        if (!response?.result?.messages) {
            console.warn('No messages found');
            this.renderEmails();
            return;
        }

        const messageIds = response.result.messages;
        const emails = await this.fetchEmailBatch(messageIds);
        
        // Set pagination state
        hasMoreEmails = !!response.result.nextPageToken;
        lastPageToken = response.result.nextPageToken;
        isLoadingMore = false;

        // Add emails and categorize them
        this.emails = emails;
        this.emails.forEach(email => {
            email.category = categorizeEmail(email);
            const category = email.category;
            if (!this.emailCategories[category]) {
                this.emailCategories[category] = [];
            }
            this.emailCategories[category].push(email);
        });
        
        this.renderEmails();
    } catch (err) {
        console.error('Error loading emails:', err);
        this.handleEmailError(err);
    } finally {
        showLoading(false);
    }
}

async function loadMoreEmails() {
    if (isLoadingMore || !hasMoreEmails) return;

    try {
        isLoadingMore = true;
        const response = await gapi.client.gmail.users.messages.list({
            userId: 'me',
            maxResults: 20,
            labelIds: [this.currentFolder],
            pageToken: lastPageToken
        });

        if (!response.result.messages) {
            hasMoreEmails = false;
            isLoadingMore = false;
            return;
        }

        const olderEmails = await this.fetchEmailBatch(response.result.messages);
        
        if (olderEmails.length > 0) {
            // Update pagination state
            lastPageToken = response.result.nextPageToken;
            hasMoreEmails = !!lastPageToken;

            // Add emails and categorize them
            olderEmails.forEach(email => {
                // Check for duplicates before adding
                if (!this.emails.some(e => e.id === email.id)) {
                    this.emails.push(email);
                    email.category = categorizeEmail(email);
                    if (!this.emailCategories[email.category]) {
                        this.emailCategories[email.category] = [];
                    }
                    this.emailCategories[email.category].push(email);
                }
            });
            
            this.renderEmailsWithCategories();
        }
    } catch (error) {
        console.error('Error loading more emails:', error);
    } finally {
        isLoadingMore = false;
    }
}

function getFolderQuery(folderId) {
    switch (folderId) {
        case 'INBOX':
            return 'in:inbox';
        case 'SENT':
            return 'in:sent';
        case 'DRAFT':
            return 'in:drafts';
        case 'TRASH':
            return 'in:trash';
        case 'SPAM':
            return 'in:spam';
        default:
            return '';
    }
}

function handleEmailError(error) {
    let message = 'Failed to load emails';
    
    if (error?.message === 'No internet connection') {
        message = 'No internet connection. Please check your network.';
    } else if (error?.message === 'Authentication required') {
        message = 'Please sign in again';
        this.handleAuthExpired();
    } else if (error?.status === 429) {
        message = 'Too many requests. Please wait a moment';
    } else if (error) {
        message = error.message || 'An unexpected error occurred';
    }

    showNotification(message, 'error');
}

function handleAuthExpired() {
    this.isAuthenticated = false;
    this.accessToken = null;
    this.userEmail = null;
    localStorage.removeItem('accessToken');
    localStorage.removeItem('userEmail');
    document.getElementById('loginBtn').style.display = 'block';
    document.getElementById('emailControls').style.display = 'none';
}

async function getEmailDetails(messageId, full = false) {
    try {
        const response = await gapi.client.gmail.users.messages.get({
            userId: 'me',
            id: messageId,
            format: full ? 'full' : 'metadata',
            metadataHeaders: ['From', 'Subject', 'Date', 'To', 'Cc']
        });
        return this.parseEmailResponse(response.result);
    } catch (error) {
        console.error('Error getting email details:', error);
        showNotification('Failed to load email details', 'error');
        return null;
    }
}

function renderEmails() {
    const emailList = document.getElementById('emailList');
    if (!emailList) return;

    emailList.innerHTML = '';
    
    this.emails.forEach(email => {
        const div = document.createElement('div');
        div.className = `email-item ${email.read ? '' : 'unread'} ${email.selected ? 'selected' : ''}`;
        div.dataset.emailId = email.id;

        // Extract display name from email
        const fromMatch = email.from.match(/(?:"?([^"]*)"?\s)?(?:<?(.+@[^>]+)>?)/);
        const displayName = fromMatch ? (fromMatch[1] || fromMatch[2]) : email.from;

        // Format snippet
        const snippet = email.snippet || email.plainText?.substring(0, 140) || '';
        const date = this.formatEmailDate(email.date);

        div.innerHTML = `
            <div class="email-content-preview">
                <div class="email-sender">${this.sanitizeHTML(displayName)}</div>
                <div class="email-subject">${this.sanitizeHTML(email.subject || '(No Subject)')}</div>
                <div class="email-snippet">${this.sanitizeHTML(snippet)}${snippet.length > 140 ? '...' : ''}</div>
            </div>
            <div class="email-metadata">
                <div class="email-date">${date}</div>
                ${email.hasAttachment ? '<div class="email-attachment"><i class="fa-solid fa-paperclip"></i></div>' : ''}
            </div>
        `;

        div.addEventListener('click', (e) => {
            if (!e.ctrlKey && !e.metaKey) {
                this.showEmail(email);
            }
        });

        div.addEventListener('dblclick', () => {
            this.toggleReadStatus(email.id);
        });

        emailList.appendChild(div);
    });
}

function formatEmailDate(date) {
    const now = new Date();
    const emailDate = new Date(date);
    
    if (emailDate.toDateString() === now.toDateString()) {
        // Today - show time
        return emailDate.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
    } else if (emailDate.getFullYear() === now.getFullYear()) {
        // This year - show month and day
        return emailDate.toLocaleDateString([], { month: 'short', day: 'numeric' });
    } else {
        // Different year - show year
        return emailDate.toLocaleDateString([], { year: 'numeric' });
    }
}

function showEmail(email) {
    if (!email) return;

    // Auto-mark as read when opened
    if (!email.read) {
        this.modifyEmail(email.id, {
            removeLabelIds: ['UNREAD']
        });
        email.read = true;
        this.renderEmailItem(email);
    }

    // Use UIHandler for display
    window.uiHandler.showEmail(email);

    // Store as selected email
    this.selectedEmail = email;
}

async function toggleReadStatus(emailId) {
    const email = this.emails.find(e => e.id === emailId);
    if (!email) return;
    
    await this.modifyEmail(email.id, {
        removeLabelIds: email.read ? [] : ['UNREAD'],
        addLabelIds: email.read ? ['UNREAD'] : []
    });
    
    email.read = !email.read;
    this.renderEmailItem(email);
    this.updateFolderCounts();
}

function formatEmailAddress(address) {
    const parts = this.parseEmailAddress(address);
    return parts.name ? 
        `${parts.name} <${parts.email}>` : 
        parts.email;
}

function formatFullDate(date) {
    return new Date(date).toLocaleString(undefined, {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    });
}

function parseEmailAddress(address) {
    const match = address.match(/^(?:"?([^"]*)"?\s)?(?:<?(.+@[^>]+)>?)/);
    return {
        name: match ? match[1] || '' : '',
        email: match ? match[2] || address : address
    };
}

function sanitizeHTML(html) {
    const doc = new DOMParser().parseFromString(html, 'text/html');
    
    // Handle links
    doc.querySelectorAll('a').forEach(link => {
        const url = link.href;
        
        // Remove target attribute to prevent new tab opening
        link.removeAttribute('target');
        
        // Mark suspicious links
        if (hasSuspiciousLinks(url)) {
            link.classList.add('suspicious-link');
            link.title = 'Warning: This link appears suspicious';
            link.dataset.safe = 'false';
        }

        // Preserve href but remove any onclick handlers
        link.removeAttribute('onclick');
        link.removeAttribute('onmousedown');
        link.removeAttribute('onmouseup');
    });

    return doc.body.innerHTML;
}

function processImage(imgNode) {
    // Preserve original dimensions if they exist
    const originalWidth = imgNode.getAttribute('width');
    const originalHeight = imgNode.getAttribute('height');
    
    // Remove potentially dangerous attributes
    Array.from(imgNode.attributes).forEach(attr => {
        if (!['src', 'alt', 'width', 'height', 'style'].includes(attr.name)) {
            imgNode.removeAttribute(attr.name);
        }
    });

    // Add loading="lazy" for better performance
    imgNode.setAttribute('loading', 'lazy');

    // Set max-width and preserve aspect ratio
    let styleAttr = 'max-width: 100%; height: auto;';
    
    // Keep original dimensions if they exist
    if (originalWidth && originalHeight) {
        styleAttr += ` aspect-ratio: ${originalWidth}/${originalHeight};`;
    }

    // Merge with existing style if present
    const existingStyle = imgNode.getAttribute('style');
    if (existingStyle) {
        styleAttr = this.sanitizeCSS(existingStyle + ';' + styleAttr);
    }
    
    imgNode.setAttribute('style', styleAttr);
}

function sanitizeCSS(css) {
    // List of allowed CSS properties
    const allowedProperties = [
        'color', 'background-color', 'font-family', 'font-size', 'font-weight',
        'line-height', 'margin', 'padding', 'border', 'text-align', 'width',
        'height', 'max-width', 'display', 'background', 'border-radius',
        'aspect-ratio', 'text-decoration', 'font-style', 'list-style',
        'vertical-align', 'table-layout', 'border-collapse', 'border-spacing'
    ];

    try {
        // Remove comments and potentially harmful content
        css = css.replace(/\/\*.*?\*\//g, '');

        // Split into individual rules
        const rules = css.split(';');
        
        // Filter and clean each rule
        return rules
            .map(rule => {
                const [property, ...values] = rule.split(':');
                const prop = property?.trim().toLowerCase();
                const value = values.join(':').trim();
                
                // Check if property is allowed and value is safe
                if (allowedProperties.includes(prop) && !value.includes('javascript:')) {
                    return `${prop}: ${value}`;
                }
                return '';
            })
            .filter(Boolean)
            .join('; ');
    } catch (error) {
        console.error('Error sanitizing CSS:', error);
        return '';
    }
}

async function sendEmail() {
    const to = document.getElementById('toField').value;
    const subject = document.getElementById('subjectField').value;
    const body = document.getElementById('emailEditor').innerHTML; // Get HTML content

    if (!this.validateEmailInput(to, subject, body)) {
        return;
    }

    showLoading(true);
    try {
        // Create email with HTML content
        const email = this.createEmailRequest(to, subject, body);
        await this.handleEmailOperation(async () => {
            return await gapi.client.gmail.users.messages.send({
                userId: 'me',
                resource: { raw: email }
            });
        });
        
        showNotification('Email sent successfully', 'success');
        this.resetComposer();
        await this.loadEmails();
    } catch (err) {
        console.error('Error sending email:', err);
        this.handleEmailError(err);
    } finally {
        showLoading(false);
    }
}

// Email processing and manipulation methods
function parseEmailResponse(message) {
    try {
        // Extract headers first
        const headers = message.payload.headers;
        const subject = headers.find(h => h.name.toLowerCase() === 'subject')?.value || '(no subject)';
        const from = headers.find(h => h.name.toLowerCase() === 'from')?.value || '';
        const to = (headers.find(h => h.name.toLowerCase() === 'to')?.value || '').split(',').map(e => e.trim());
        const date = new Date(parseInt(message.internalDate));

        // Initialize content containers
        let htmlContent = '';
        let plainText = '';
        let attachments = [];

        // Process message parts
        const processMessagePart = (part) => {
            if (part.mimeType === 'text/html' && part.body?.data) {
                htmlContent = this.decodeBase64(part.body.data);
            } else if (part.mimeType === 'text/plain' && part.body?.data) {
                plainText = this.decodeBase64(part.body.data);
            } else if (part.mimeType === 'multipart/alternative' && part.parts) {
                part.parts.forEach(processMessagePart);
            } else if (part.mimeType === 'multipart/mixed' && part.parts) {
                part.parts.forEach(processMessagePart);
            } else if (part.filename && part.body) {
                attachments.push({
                    id: part.body.attachmentId,
                    messageId: message.id,
                    filename: part.filename,
                    mimeType: part.mimeType,
                    size: part.body.size
                });
            }
        };

        // Start processing from the payload
        processMessagePart(message.payload);

        // If we have both HTML and plain text, prefer HTML
        let finalContent = htmlContent || this.convertPlainTextToHtml(plainText);

        // If we still don't have content, try the payload body directly
        if (!finalContent && message.payload.body?.data) {
            const decodedBody = this.decodeBase64(message.payload.body.data);
            finalContent = message.payload.mimeType === 'text/html' ? 
                decodedBody : 
                this.convertPlainTextToHtml(decodedBody);
        }

        // Add spam detection
        const spamScore = this.calculateSpamScore(message);
        const isSpam = this.isLikelySpam(message, spamScore);

        if (isSpam) {
            // Move to spam folder if detected
            this.moveToSpam(message.id);
        }

        return {
            id: message.id,
            threadId: message.threadId,
            labelIds: message.labelIds || [],
            snippet: message.snippet,
            subject,
            from,
            to,
            date,
            content: finalContent,
            attachments,
            hasAttachment: attachments.length > 0,
            read: !message.labelIds?.includes('UNREAD'),
            starred: message.labelIds?.includes('STARRED'),
            spamScore,
            isSpam
        };
    } catch (error) {
        console.error('Error parsing email:', error);
        return null;
    }
}

function calculateSpamScore(message) {
    let score = 0;
    const headers = message.payload.headers;
    
    // Check for common spam indicators
    const spamIndicators = {
        'X-Spam-Flag': 10,
        'X-Spam-Status': 5,
        'X-Spam-Level': 5,
        'X-Spam-Score': 5
    };

    // Check headers for spam indicators
    headers.forEach(header => {
        if (spamIndicators[header.name] && /yes|true|spam/i.test(header.value)) {
            score += spamIndicators[header.name];
        }
    });

    // Check for suspicious content patterns
    const subject = headers.find(h => h.name === 'Subject')?.value || '';
    const from = headers.find(h => h.name === 'From')?.value || '';
    const suspiciousPatterns = [
        /\b(viagra|cialis|rolex|luxury.*watches)\b/i,
        /\b(lottery|prize|winner|million.*dollars)\b/i,
        /\b(urgent|action.*required|account.*suspended)\b/i,
        /\b(nigerian.*prince|inheritance|bank.*transfer)\b/i
    ];

    suspiciousPatterns.forEach(pattern => {
        if (pattern.test(subject)) score += 5;
        if (pattern.test(from)) score += 3;
    });

    return score;
}

function isLikelySpam(message, spamScore) {
    // Consider multiple factors for spam detection
    const factors = [
        spamScore >= 15,
        this.hasSpamHeaders(message),
        this.hasSuspiciousSender(message),
        this.hasSuspiciousLinks(message)
    ];

    return factors.filter(Boolean).length >= 2;
}

function hasSpamHeaders(message) {
    const headers = message.payload.headers;
    return headers.some(header => 
        /^X-Spam-/i.test(header.name) && 
        /yes|true|spam/i.test(header.value)
    );
}

function hasSuspiciousSender(message) {
    const from = message.payload.headers.find(h => h.name === 'From')?.value || '';
    const suspiciousDomains = [
        /\.xyz$/,
        /\.top$/,
        /\.website$/,
        /\.space$/,
        /\.tk$/,
        /\.ml$/
    ];

    return suspiciousDomains.some(domain => domain.test(from));
}

function hasSuspiciousLinks(message) {
    const content = message.snippet || '';
    const suspiciousPatterns = [
        /bit\.ly/i,
        /tinyurl\.com/i,
        /goo\.gl/i,
        /is\.gd/i
    ];

    return suspiciousPatterns.some(pattern => pattern.test(content));
}

async function moveToSpam(messageId) {
    try {
        await gapi.client.gmail.users.messages.modify({
            userId: 'me',
            id: messageId,
            resource: {
                addLabelIds: ['SPAM'],
                removeLabelIds: ['INBOX']
            }
        });
    } catch (error) {
        console.error('Error moving message to spam:', error);
    }
}

function convertPlainTextToHtml(text) {
    if (!text) return '';
    return text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;')
        .replace(/\n/g, '<br>')
        .replace(/(https?:\/\/[^\s]+)/g, '<a href="$1" target="_blank">$1</a>');
}

function displayAttachments(attachments) {
    const container = document.getElementById('emailAttachments');
    container.innerHTML = '';
    
    if (!attachments || attachments.length === 0) {
        container.style.display = 'none';
        return;
    }

    attachments.forEach(attachment => {
        const div = document.createElement('div');
        div.className = 'attachment-item';
        div.innerHTML = `
            <span class="attachment-icon"><i class="fa-solid fa-paperclip"></i></span>
            <span>${attachment.filename}</span>
        `;
        div.addEventListener('click', () => this.downloadAttachment(attachment));
        container.appendChild(div);
    });

    container.style.display = 'grid';
}

async function downloadAttachment(attachment) {
    try {
        showLoading(true);
        const response = await gapi.client.gmail.users.messages.attachments.get({
            userId: 'me',
            messageId: attachment.messageId,
            id: attachment.id
        });

        if (!response || !response.result || !response.result.data) {
            throw new Error('Invalid attachment data');
        }

        // Use Blob API with type-safe checks
        const byteCharacters = atob(response.result.data.replace(/-/g, '+').replace(/_/g, '/'));
        const byteNumbers = new Array(byteCharacters.length);
        for (let i = 0; i < byteCharacters.length; i++) {
            byteNumbers[i] = byteCharacters.charCodeAt(i);
        }
        const byteArray = new Uint8Array(byteNumbers);
        const blob = new Blob([byteArray], { type: attachment.mimeType || 'application/octet-stream' });

        // Use more reliable download method
        const downloadUrl = window.URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = downloadUrl;
        link.download = attachment.filename;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        window.URL.revokeObjectURL(downloadUrl);

        showNotification('Attachment downloaded successfully', 'success');
    } catch (error) {
        console.error('Error downloading attachment:', error);
        showNotification('Failed to download attachment. Please try again.', 'error');
    } finally {
        showLoading(false);
    }
}

function base64ToArrayBuffer(base64) {
    const binaryString = window.atob(base64);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
    }
    return bytes.buffer;
}

function initializeComposer() {
    const editor = document.getElementById('emailEditor');
    const toolbar = document.querySelector('.composer-toolbar');
    // Handle toolbar buttons
    toolbar.addEventListener('click', (e) => {
        const button = e.target.closest('.toolbar-btn');
        if (!button) return;
        e.preventDefault();
        const command = button.dataset.command;
        
        if (command === 'createLink') {
            const url = prompt('Enter URL:');
            if (url) document.execCommand(command, false, url);
        } else if (command === 'insertImage') {
            const url = prompt('Enter image URL:');
            if (url) document.execCommand(command, false, url);
        } else if (command === 'foreColor' || command === 'backColor') {
            const color = this.showColorPicker();
            if (color) document.execCommand(command, false, color);
        } else {
            document.execCommand(command, false, null);
        }
        
        // Toggle active state for applicable buttons
        if (!['createLink', 'insertImage', 'foreColor', 'backColor'].includes(command)) {
            button.classList.toggle('active');
        }
    });
       
    // Handle file attachments
    const fileInput = document.querySelector('.attachment-btn input');
    fileInput.addEventListener('change', this.handleAttachments.bind(this));

    // Handle Cc/Bcc toggle
    const ccBccBtn = document.querySelector('.cc-bcc-btn');
    const ccBccFields = document.querySelector('.cc-bcc-fields');
    ccBccBtn.addEventListener('click', () => {
        ccBccFields.style.display = ccBccFields.style.display === 'none' ? 'block' : 'none';
    });

    // Handle composer window controls
    document.querySelector('.minimize-btn').addEventListener('click', () => {
        const composer = document.getElementById('emailComposer');
        composer.classList.toggle('minimized');
    });

    document.querySelector('.close-btn').addEventListener('click', () => {
        if (confirm('Discard this message?')) {
            this.resetComposer();
        }
    });
}

function showColorPicker() {
    // Create a temporary input
    const input = document.createElement('input');
    input.type = 'color';
    input.click();
    
    return new Promise(resolve => {
        input.addEventListener('change', () => resolve(input.value));
    });
}

async function handleAttachments(event) {
    const files = event.target.files;
    const attachmentsList = document.getElementById('attachmentsList');
    
    for (const file of files) {
        const chip = document.createElement('div');
        chip.className = 'attachment-chip';
        chip.innerHTML = `
            <span>${file.name}</span>
            <button class="remove-attachment">
                <i class="fa-solid fa-xmark"></i>
            </button>
        `;
        
        // Add remove handler
        chip.querySelector('.remove-attachment').addEventListener('click', () => {
            chip.remove();
        });
        
        attachmentsList.appendChild(chip);
    }
}

function createEmailRequest(to, subject, body, attachments = [], isDraft = false) {
    const cc = document.getElementById('ccField').value;
    const bcc = document.getElementById('bccField').value;
    const boundary = `boundary_${Math.random().toString(36).substr(2)}`;
    
    // Helper function to encode UTF-8 text to base64
    const encodeUTF8ToBase64 = (text) => {
        return btoa(unescape(encodeURIComponent(text)));
    };
    
    // Create RFC 2822 email
    const email = [
        'MIME-Version: 1.0',
        `To: ${to}`,
        cc ? `Cc: ${cc}` : '',
        bcc ? `Bcc: ${bcc}` : '',
        `Subject: ${subject}`,
        `Content-Type: multipart/alternative; boundary="${boundary}"`,
        '',
        `--${boundary}`,
        'Content-Type: text/plain; charset=UTF-8',
        'Content-Transfer-Encoding: base64',
        '',
        encodeUTF8ToBase64(this.htmlToPlainText(body)),
        '',
        `--${boundary}`,
        'Content-Type: text/html; charset=UTF-8',
        'Content-Transfer-Encoding: base64',
        '',
        encodeUTF8ToBase64(this.sanitizeHTML(body)),
        '',
        `--${boundary}--`
    ].filter(Boolean);

    // Convert to URL-safe base64
    return btoa(email.join('\r\n'))
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=+$/, '');
}

async function saveDraft() {
    try {
        const to = document.getElementById('toField').value;
        const subject = document.getElementById('subjectField').value;
        const body = document.getElementById('emailEditor').innerHTML;

        const email = this.createEmailRequest(to, subject, body, [], true);
        
        await this.handleEmailOperation(async () => {
            return await gapi.client.gmail.users.drafts.create({
                userId: 'me',
                resource: {
                    message: { raw: email }
                }
            });
        });
        
        showNotification('Draft saved', 'success');
    } catch (error) {
        console.error('Error saving draft:', error);
        showNotification('Failed to save draft', 'error');
    }
}

function resetComposer() {
    // Clear all input fields
    document.getElementById('toField').value = '';
    document.getElementById('subjectField').value = '';
    document.getElementById('emailEditor').innerHTML = ''; // Changed from TinyMCE to native editor
    document.getElementById('attachmentsList').innerHTML = '';
    document.querySelector('.cc-bcc-fields').style.display = 'none';
    document.getElementById('ccField').value = '';
    document.getElementById('bccField').value = '';

    // Hide composer and show no selection view
    document.getElementById('emailComposer').style.display = 'none';
    document.getElementById('noSelection').style.display = 'block';
    document.getElementById('emailView').style.display = 'none';
}

function decodeBase64(encoded) {
    try {
        if (!encoded) return '';

        // Add padding if needed
        while (encoded.length % 4) {
            encoded += '=';
        }

        // Replace URL-safe chars with base64 chars
        const base64 = encoded
            .replace(/-/g, '+')
            .replace(/_/g, '/');

        // Decode and handle UTF-8
        try {
            return decodeURIComponent(escape(atob(base64)));
        } catch (e) {
            // Fallback for non-UTF-8 content
            return atob(base64);
        }
    } catch (error) {
        console.error('Base64 decoding error:', error);
        return '';
    }
}

function htmlToPlainText(html) {
    // Create temporary div to handle HTML content
    const temp = document.createElement('div');
    temp.innerHTML = html;

    // Handle line breaks and paragraphs
    temp.querySelectorAll('br').forEach(br => br.replaceWith('\n'));
    temp.querySelectorAll('p').forEach(p => p.appendChild(document.createTextNode('\n')));
    temp.querySelectorAll('div').forEach(div => div.appendChild(document.createTextNode('\n')));

    // Handle lists
    temp.querySelectorAll('li').forEach(li => li.appendChild(document.createTextNode('\n')));
    temp.querySelectorAll('ul, ol').forEach(list => list.appendChild(document.createTextNode('\n')));

    // Convert links to text with URL
    temp.querySelectorAll('a').forEach(a => {
        const url = a.getAttribute('href');
        if (url && !url.startsWith('javascript:')) {
            a.textContent += ` (${url})`;
        }
    });

    // Get text content
    let text = temp.textContent || temp.innerText || '';

    // Clean up whitespace
    text = text
        .replace(/\n\s*\n/g, '\n\n') // Replace multiple blank lines with just two
        .replace(/  +/g, ' ')        // Replace multiple spaces with single space
        .trim();                     // Remove leading/trailing whitespace

    return text;
}

function showComposer() {
    document.getElementById('emailComposer').style.display = 'block';
    document.getElementById('emailView').style.display = 'none';
    document.getElementById('noSelection').style.display = 'none';
}

function replyToEmail() {
    if (!this.selectedEmail) return;
    const subject = `Re: ${this.selectedEmail.subject.replace(/^Re:\s*/i, '')}`;
    const to = this.selectedEmail.from;
    const body = this.createReplyBody(this.selectedEmail);
    this.openComposer({ to, subject, body });
}

function replyAllToEmail() {
    if (!this.selectedEmail) return;
    const subject = `Re: ${this.selectedEmail.subject.replace(/^Re:\s*/i, '')}`;
    const to = this.selectedEmail.from;
    const cc = this.selectedEmail.to.filter(addr => addr !== this.userEmail);
    const body = this.createReplyBody(this.selectedEmail);
    this.openComposer({ to, cc, subject, body });
}

function forwardEmail() {
    if (!this.selectedEmail) return;
    const subject = `Fwd: ${this.selectedEmail.subject.replace(/^Fwd:\s*/i, '')}`;
    const body = this.createForwardBody(this.selectedEmail);
    this.openComposer({ subject, body });
}

async function searchEmails(query) {
    if (!query) {
        await this.loadEmails(this.currentFolder);
        return;
    }

    try {
        showLoading(true);
        // Add retry logic here
        const response = await this.handleEmailOperation(async () => {
            return await gapi.client.gmail.users.messages.list({
                userId: 'me',
                q: query,
                maxResults: 20 // Reduced from 50 to prevent rate limiting
            });
        });

        if (!response.result.messages) {
            this.emails = [];
            this.renderEmails();
            return;
        }

        const messageIds = response.result.messages;
        this.emails = await this.fetchEmailBatch(messageIds);
        this.renderEmails();
    } catch (error) {
        console.error('Search failed:', error);
        showNotification('Search failed. Please try again.', 'error');
    } finally {
        showLoading(false);
    }
}

function debounce(func, wait) {
    let timeout;
    return (...args) => {
        clearTimeout(timeout);
        timeout = setTimeout(() => func.apply(this, args), wait);
    };
}

function handleDragOver(e) {
    e.preventDefault();
    e.currentTarget.classList.add('drag-over');
}

async function handleDrop(e) {
    e.preventDefault();
    e.currentTarget.classList.remove('drag-over');

    const files = Array.from(e.dataTransfer.files);
    await this.handleAttachments({ target: { files } });
}

// Add new helper methods
async function toggleStarred() {
    if (!this.selectedEmail) return;
    const isStarred = this.selectedEmail.starred;
    await this.modifyEmail(this.selectedEmail.id, {
        addLabelIds: isStarred ? [] : ['STARRED'],
        removeLabelIds: isStarred ? ['STARRED'] : []
    });
    this.selectedEmail.starred = !isStarred;
    this.renderEmailItem(this.selectedEmail);
}

function navigateEmails(direction) {
    const emailList = document.getElementById('emailList');
    const items = Array.from(emailList.querySelectorAll('.email-item'));
    const currentIndex = items.findIndex(item => item.classList.contains('selected'));
    let newIndex = direction === 'next' ? currentIndex + 1 : currentIndex - 1;
    
    if (newIndex >= 0 && newIndex < items.length) {
        items[currentIndex]?.classList.remove('selected');
        items[newIndex].classList.add('selected');
        items[newIndex].scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        
        // Update email preview
        const emailId = items[newIndex].dataset.emailId;
        const email = this.emails.find(e => e.id === emailId);
        if (email) {
            this.selectedEmail = email;
            this.showEmail(email);
        }
    }
}

async function switchFolder(folderId) {
    this.currentFolder = folderId;
    document.querySelectorAll('.folder').forEach(f => {
        f.classList.toggle('active', f.dataset.folder === folderId);
    });
    await this.loadEmails(folderId);
}

async function markSelectedAsRead(read = true) {
    const selected = this.getSelectedEmails();
    if (!selected.length) return;

    try {
        await Promise.all(selected.map(email => 
            gapi.client.gmail.users.messages.modify({
                userId: 'me',
                id: email.id,
                resource: {
                    removeLabelIds: read ? ['UNREAD'] : [],
                    addLabelIds: read ? [] : ['UNREAD']
                }
            })
        ));

        selected.forEach(email => email.read = read);
        this.renderEmails();
        showNotification(`Marked ${selected.length} emails as ${read ? 'read' : 'unread'}`, 'success');
    } catch (error) {
        console.error('Failed to mark emails:', error);
        showNotification('Failed to update emails', 'error');
    }
}

async function toggleSelectedStar() {
    const selected = this.getSelectedEmails();
    if (!selected.length) return;

    try {
        await Promise.all(selected.map(email => {
            const isStarred = email.labelIds.includes('STARRED');
            return gapi.client.gmail.users.messages.modify({
                userId: 'me',
                id: email.id,
                resource: {
                    addLabelIds: isStarred ? [] : ['STARRED'],
                    removeLabelIds: isStarred ? ['STARRED'] : []
                }
            });
        }));

        selected.forEach(email => {
            const isStarred = email.labelIds.includes('STARRED');
            if (isStarred) {
                email.labelIds = email.labelIds.filter(l => l !== 'STARRED');
            } else {
                email.labelIds.push('STARRED');
            }
        });

        this.renderEmails();
        showNotification('Updated starred status', 'success');
    } catch (error) {
        console.error('Failed to update starred status:', error);
        showNotification('Failed to update emails', 'error');
    }
}

async function archiveSelected() {
    const selected = this.getSelectedEmails();
    if (!selected.length) return;

    try {
        await Promise.all(selected.map(email =>
            gapi.client.gmail.users.messages.modify({
                userId: 'me',
                id: email.id,
                resource: {
                    removeLabelIds: ['INBOX']
                }
            })
        ));

        this.emails = this.emails.filter(e => !selected.includes(e));
        this.renderEmails();
        showNotification(`Archived ${selected.length} emails`, 'success');
    } catch (error) {
        console.error('Failed to archive emails:', error);
        showNotification('Failed to archive emails', 'error');
    }
}

async function deleteSelected() {
    const selected = this.getSelectedEmails();
    if (!selected.length || !confirm(`Delete ${selected.length} emails?`)) return;

    try {
        await Promise.all(selected.map(email =>
            gapi.client.gmail.users.messages.trash({
                userId: 'me',
                id: email.id
            })
        ));

        this.emails = this.emails.filter(e => !selected.includes(e));
        this.renderEmails();
        showNotification(`Deleted ${selected.length} emails`, 'success');
    } catch (error) {
        console.error('Failed to delete emails:', error);
        showNotification('Failed to delete emails', 'error');
    }
}

function getSelectedEmails() {
    return Array.from(document.querySelectorAll('.email-item.selected'))
        .map(el => this.emails.find(e => e.id === el.dataset.emailId))
        .filter(Boolean);
}

async function fetchEmailBatch(messageIds) {
    const BATCH_SIZE = 10;
    const batches = [];
    const results = [];

    for (let i = 0; i < messageIds.length; i += BATCH_SIZE) {
        const batchIds = messageIds.slice(i, i + BATCH_SIZE);
        const batchPromises = batchIds.map(msg => 
            this.handleEmailOperation(() => 
                gapi.client.gmail.users.messages.get({
                    userId: 'me',
                    id: msg.id,
                    format: 'full'
                })
            )
        );
        batches.push(Promise.all(batchPromises));
    }

    for (const batchPromise of batches) {
        const batchResults = await batchPromise;
        const parsedEmails = batchResults
            .map(result => this.parseEmailResponse(result.result))
            .filter(Boolean);
        results.push(...parsedEmails);
    }

    return results;
}

function markSelectedAsUnread() {
    this.markSelectedAsRead(false);
}

async function setupAfterAuth() {
    document.getElementById('loginBtn').style.display = 'none';
    document.getElementById('emailControls').style.display = 'block';
    
    try {
        await this.checkNetworkConnectivity();
        
        // Ensure Gmail API is initialized before loading emails
        if (!gapi.client?.gmail?.users) {
            await this.initializeGoogleClient();
        }
        
        await this.loadEmails();
    } catch (error) {
        console.error('Error in setup:', error);
        if (error.message === 'Authentication required') {
            this.handleAuthExpired();
        } else {
            this.handleEmailError(error);
        }
    }
}

async function modifyEmail(messageId, modifications) {
    try {
        await gapi.client.gmail.users.messages.modify({
            userId: 'me',
            id: messageId,
            resource: modifications
        });
    } catch (error) {
        console.error('Failed to modify email:', error);
        showNotification('Failed to update email', 'error');
    }
}

function renderEmailItem(email) {
    const existingItem = document.querySelector(`[data-email-id="${email.id}"]`);
    if (existingItem) {
        existingItem.className = `email-item ${email.read ? '' : 'unread'} ${email.starred ? 'starred' : ''}`;
    }
}

function createReplyBody(originalEmail) {
    const date = this.formatFullDate(originalEmail.date);
    return `\n\nOn ${date}, ${originalEmail.from} wrote:\n> ${originalEmail.content.replace(/\n/g, '\n> ')}`;
}

function createForwardBody(originalEmail) {
    const date = this.formatFullDate(originalEmail.date);
    return `---------- Forwarded message ---------\n` +
           `From: ${originalEmail.from}\n` +
           `Date: ${date}\n` +
           `Subject: ${originalEmail.subject}\n` +
           `To: ${originalEmail.to.join(', ')}\n\n` +
           originalEmail.content;
}

function openComposer({ to = '', cc = '', subject = '', body = '' } = {}) {
    document.getElementById('toField').value = to;
    document.getElementById('ccField').value = Array.isArray(cc) ? cc.join(', ') : cc;
    document.getElementById('subjectField').value = subject;
    document.getElementById('emailEditor').innerHTML = body;
    this.showComposer();
}

function focusSearch() {
    document.getElementById('searchInput').focus();
}

function toggleShortcutHelp() {
    const overlay = document.getElementById('shortcutHelp');
    overlay.style.display = overlay.style.display === 'none' ? 'grid' : 'none';
}

function archiveEmail() {
    this.archiveSelected();
}

function deleteEmail() {
    this.deleteSelected();
}

function markAsSpam() {
    if (!this.selectedEmail) return;
    this.moveToSpam(this.selectedEmail.id);
}

let isPolling = false;
let pollingInterval = null;

async function startEmailPolling() {
    if (isPolling) return;
    isPolling = true;
    
    try {
        // Initial check with error handling
        await this.checkNewEmails(); // Add this. to bind context
        
        // Poll every 30 seconds with error handling
        pollingInterval = setInterval(async () => {
            try {
                await this.checkNewEmails(); // Add this. to bind context
            } catch (error) {
                console.error('Email polling error:', error);
                if (error.message?.includes('auth')) {
                    clearInterval(pollingInterval);
                    isPolling = false;
                }
            }
        }, 30000);
    } catch (error) {
        console.error('Failed to start email polling:', error);
        isPolling = false;
    }
}

async function checkNewEmails() {
    // Get token from app instance
    const app = window.app;
    if (!app?.isAuthenticated || !app?.accessToken) {
        throw new Error('auth_required');
    }

    try {
        // Initialize emails array if needed
        if (!this.emails) {
            this.emails = [];
        }

        // Initialize emailCategories if needed
        if (!this.emailCategories) {
            this.emailCategories = {};
        }

        const latestEmailDate = this.emails[0]?.date || new Date(0);
        const query = `after:${Math.floor(latestEmailDate.getTime() / 1000)}`;
        
        const response = await gapi.client.gmail.users.messages.list({
            userId: 'me',
            maxResults: 20,
            q: query
        });

        if (!response?.result?.messages) return;

        const newEmails = await this.fetchEmailBatch(response.result.messages);
        
        if (newEmails.length > 0) {
            // Add new emails to the beginning of the list
            this.emails.unshift(...newEmails);
            
            // Categorize new emails
            newEmails.forEach(email => {
                email.category = categorizeEmail(email);
                if (!this.emailCategories[email.category]) {
                    this.emailCategories[email.category] = [];
                }
                this.emailCategories[email.category].unshift(email);
            });

            // Update UI if renderEmailsWithCategories exists
            if (typeof this.renderEmailsWithCategories === 'function') {
                this.renderEmailsWithCategories();
            } else {
                this.renderEmails();
            }
            showNotification(`${newEmails.length} new email(s) received`, 'info');
        }
    } catch (error) {
        console.error('Error checking new emails:', error);
        if (error.status === 401) {
            throw new Error('auth_required');
        }
        throw error;
    }
}

let autoSaveTimer = null;
let lastDraftContent = '';

function setupAutoSave() {
    const editor = document.getElementById('emailEditor');
    const subject = document.getElementById('subjectField');
    const to = document.getElementById('toField');

    const autoSaveHandler = async () => {
        const content = editor.innerHTML;
        const subjectText = subject.value;
        const toText = to.value;

        // Only save if there are actual changes and some content
        if ((content !== lastDraftContent || subjectText || toText) && 
            (content.length > 0 || subjectText.length > 0 || toText.length > 0)) {
            lastDraftContent = content;
            await saveDraft();
        }
    };

    // Auto-save every 30 seconds if there are changes
    autoSaveTimer = setInterval(autoSaveHandler, 30000);

    // Clear timer when email is sent or discarded
    return () => clearInterval(autoSaveTimer);
}

async function updateFolderCounts() {
    const folders = ['INBOX', 'DRAFT', 'SENT', 'SPAM', 'TRASH'];
    
    for (const folder of folders) {
        try {
            const response = await gapi.client.gmail.users.messages.list({
                userId: 'me',
                q: `in:${folder} is:unread`,
                maxResults: 1
            });
            
            const count = response.result.resultSizeEstimate || 0;
            const folderEl = document.querySelector(`[data-folder="${folder}"]`);
            
            if (folderEl) {
                // Find existing count element or create a new one
                let countEl = folderEl.querySelector('.unread-count');
                if (!countEl) {
                    countEl = document.createElement('span');
                    countEl.className = 'unread-count';
                    folderEl.appendChild(countEl);
                }

                // Update count display
                countEl.textContent = count || '';
                countEl.style.display = count ? 'flex' : 'none';
            }
        } catch (error) {
            console.error(`Error fetching count for ${folder}:`, error);
        }
    }
}

// --- MARKER: END OF EMAIL OPERATIONS SECTION ---

// Create EmailOperations object
const EmailOperations = {
    handleEmailOperation,
    loadEmails,
    getFolderQuery,
    handleEmailError,
    handleAuthExpired,
    getEmailDetails,
    renderEmails,
    formatEmailDate,
    showEmail,
    formatEmailAddress,
    formatFullDate,
    parseEmailAddress,
    sanitizeHTML,
    processImage,
    sanitizeCSS,
    sendEmail,
    parseEmailResponse,
    calculateSpamScore,
    isLikelySpam,
    hasSpamHeaders,
    hasSuspiciousSender,
    hasSuspiciousLinks,
    moveToSpam,
    convertPlainTextToHtml,
    displayAttachments,
    downloadAttachment,
    base64ToArrayBuffer,
    initializeComposer,
    showColorPicker,
    handleAttachments,
    createEmailRequest,
    saveDraft,
    resetComposer,
    decodeBase64,
    htmlToPlainText,
    showComposer,
    replyToEmail,
    replyAllToEmail,
    forwardEmail,
    searchEmails,
    debounce,
    handleDragOver,
    handleDrop,
    toggleStarred,
    navigateEmails,
    switchFolder,
    markSelectedAsRead,
    toggleSelectedStar,
    archiveSelected,
    deleteSelected,
    getSelectedEmails,
    fetchEmailBatch,
    markSelectedAsUnread,
    setupAfterAuth,
    modifyEmail,
    renderEmailItem,
    createReplyBody,
    createForwardBody,
    openComposer,
    focusSearch,
    toggleShortcutHelp,
    archiveEmail,
    deleteEmail,
    markAsSpam,
    startEmailPolling,
    checkNewEmails,
    loadMoreEmails,
    setupAutoSave,
    updateFolderCounts,
    toggleReadStatus
};

// Initialize UIHandler connection after EmailOperations is defined
uiHandler.setEmailOps(EmailOperations);

// Export EmailOperations
export { EmailOperations };