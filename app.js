class EmailApp {
    constructor() {
        this.emails = [];
        this.isAuthenticated = false;
        this.gapiLoaded = false;
        this.gisLoaded = false;
        this.CLIENT_ID = '139502800975-lqhp99o1t4pqv7tkjcodunqch8b4vbut.apps.googleusercontent.com'; // Replace with your Google OAuth client ID
        this.API_KEY = 'AIzaSyBtIKYVjyfyhCXIkXHAsVvnyVSbNFZ_9HM'; // Replace with your Google API key
        this.DISCOVERY_DOCS = ['https://www.googleapis.com/discovery/v1/apis/gmail/v1/rest'];
        this.SCOPES = 'https://www.googleapis.com/auth/gmail.modify';
        this.tokenClient = null;
        this.accessToken = null;
        this.retryAttempts = 3;
        this.retryDelay = 1000;
        this.selectedEmail = null; // Add this
        this.currentFolder = 'INBOX';
        this.userEmail = localStorage.getItem('userEmail');
        this.accessToken = localStorage.getItem('accessToken');
        
        if (this.accessToken) {
            this.isAuthenticated = true;
            this.setupAfterAuth();
        }
        
        this.loadGoogleAPI();
        this.setupEventListeners();
        this.initializeApp().catch(error => {
            console.error('App initialization failed:', error);
            this.handleInitError(error);
        });
        this.initializeComposer();
    }

    async initializeApp() {
        try {
            await this.waitForLibraries();
            await this.initializeGoogleClient();
            // Don't check network connectivity here anymore
            // It will be checked after authentication
        } catch (error) {
            console.error('Initialization error:', error);
            this.handleInitError(error);
        }
    }

    async waitForLibraries() {
        return new Promise((resolve) => {
            const checkLibraries = () => {
                if (this.gapiLoaded && this.gisLoaded) {
                    resolve();
                } else {
                    setTimeout(checkLibraries, 100);
                }
            };
            checkLibraries();
        });
    }

    async initializeGoogleClient() {
        try {
            await new Promise((resolve, reject) => {
                gapi.load('client', { callback: resolve, onerror: reject });
            });

            await gapi.client.init({
                apiKey: this.API_KEY,
                discoveryDocs: this.DISCOVERY_DOCS,
            });

            this.tokenClient = google.accounts.oauth2.initTokenClient({
                client_id: this.CLIENT_ID,
                scope: this.SCOPES,
                callback: this.handleAuthResponse.bind(this),
                error_callback: this.handleAuthError.bind(this)
            });

            console.log('Google API client initialized');
        } catch (error) {
            console.error('Error initializing Google API client:', error);
            this.handleInitError(error);
        }
    }

    async checkNetworkConnectivity() {
        if (!navigator.onLine) {
            throw new Error('No internet connection');
        }

        if (!this.accessToken) {
            return; // Skip API check if not authenticated
        }

        try {
            const response = await fetch('https://www.googleapis.com/gmail/v1/users/me/profile', {
                headers: {
                    'Authorization': `Bearer ${this.accessToken}`,
                },
            });
            
            if (!response.ok) {
                if (response.status === 401) {
                    this.handleAuthExpired();
                    throw new Error('Authentication required');
                }
                throw new Error(`API check failed: ${response.status}`);
            }
        } catch (error) {
            console.error('Connectivity check failed:', error);
            throw error;
        }
    }

    handleInitError(error) {
        let message = 'Failed to initialize application';
        
        if (error.details?.includes('API_KEY_HTTP_REFERRER_BLOCKED')) {
            message = 'Please add your domain to the allowed referrers in Google Cloud Console';
        } else if (error.error === 'idpiframe_initialization_failed') {
            message = 'Please enable third-party cookies for Gmail authentication';
        } else if (!navigator.onLine) {
            message = 'No internet connection';
        } else if (error.status === 429) {
            message = 'Too many requests. Please try again later';
        }

        this.showNotification(message, 'error', 5000);
        console.error('Detailed initialization error:', error);
    }

    handleSignInStatus(isSignedIn) {
        if (isSignedIn) {
            this.isAuthenticated = true;
            document.getElementById('loginBtn').style.display = 'none';
            document.getElementById('emailControls').style.display = 'block';
            this.loadEmails().catch(err => {
                console.error('Error loading emails:', err);
                this.showNotification('Failed to load emails', 'error');
            });
        } else {
            this.isAuthenticated = false;
            document.getElementById('loginBtn').style.display = 'block';
            document.getElementById('emailControls').style.display = 'none';
        }
    }

    async loadGoogleAPI() {
        return new Promise((resolve, reject) => {
            const script1 = document.createElement('script');
            script1.src = 'https://apis.google.com/js/api.js';
            script1.async = true;
            script1.defer = true;
            script1.onload = () => {
                this.gapiLoaded = true;
                if (this.gisLoaded) resolve();
            };
            script1.onerror = reject;

            const script2 = document.createElement('script');
            script2.src = 'https://accounts.google.com/gsi/client';
            script2.async = true;
            script2.defer = true;
            script2.onload = () => {
                this.gisLoaded = true;
                if (this.gapiLoaded) resolve();
            };
            script2.onerror = reject;

            document.head.appendChild(script1);
            document.head.appendChild(script2);
        });
    }

    setupEventListeners() {
        document.getElementById('newEmailBtn').addEventListener('click', () => {
            document.getElementById('emailComposer').style.display = 'block';
            document.getElementById('emailView').style.display = 'none';
            document.getElementById('noSelection').style.display = 'none';
        });

        document.getElementById('sendButton').addEventListener('click', () => {
            this.sendEmail();
        });

        document.getElementById('loginBtn').addEventListener('click', () => this.handleAuthClick());

        // Add keyboard shortcuts
        document.addEventListener('keydown', (e) => {
            if (!this.isAuthenticated) return;

            // Check if we're in an input field
            if (e.target.matches('input, textarea, [contenteditable]')) return;

            const shortcuts = {
                'c': () => this.showComposer(),
                'r': () => this.replyToEmail(),
                'a': () => this.replyAllToEmail(),
                'f': () => this.forwardEmail(),
                '/': () => this.focusSearch(),
                '?': () => this.toggleShortcutHelp(),
                'j': () => this.navigateEmails('next'),
                'k': () => this.navigateEmails('prev'),
                'e': () => this.archiveEmail(),
                '#': () => this.deleteEmail(),
                '!': () => this.markAsSpam(),
                'u': () => this.markAsUnread(),
                's': () => this.toggleStarred()
            };

            if (e.key in shortcuts && !e.ctrlKey && !e.metaKey) {
                e.preventDefault();
                shortcuts[e.key]();
            }
        });

        // Add folder navigation
        document.querySelectorAll('.folder').forEach(folder => {
            folder.addEventListener('click', () => {
                this.switchFolder(folder.dataset.folder);
            });
        });

        // Add search functionality (combine both search listeners)
        const searchInput = document.getElementById('searchInput');
        searchInput.addEventListener('input', this.debounce(() => {
            this.searchEmails(searchInput.value);
        }, 300));

        // Add bulk actions
        document.getElementById('markReadBtn').addEventListener('click', () => this.markSelectedAsRead());
        document.getElementById('markUnreadBtn').addEventListener('click', () => this.markSelectedAsUnread());
        document.getElementById('starBtn').addEventListener('click', () => this.toggleSelectedStar());
        document.getElementById('archiveBtn').addEventListener('click', () => this.archiveSelected());
        document.getElementById('deleteBtn').addEventListener('click', () => this.deleteSelected());

        // Add drag and drop for attachments
        const dropZone = document.getElementById('emailEditor');
        dropZone.addEventListener('dragover', this.handleDragOver.bind(this));
        dropZone.addEventListener('drop', this.handleDrop.bind(this));
    }

    async handleAuthClick() {
        try {
            // Clear any existing tokens
            this.accessToken = null;
            
            // Request new token
            if (this.tokenClient) {
                this.tokenClient.requestAccessToken();
            } else {
                throw new Error('Token client not initialized');
            }
        } catch (err) {
            console.error('Auth error:', err);
            this.showNotification('Authentication failed. Please try again.', 'error');
            this.handleInitError(err);
        }
    }

    async handleAuthResponse(response) {
        if (response.access_token) {
            try {
                this.accessToken = response.access_token;
                gapi.client.setToken(response);
                
                // Get user email for persistent login
                const profile = await gapi.client.gmail.users.getProfile({
                    userId: 'me'
                });
                this.userEmail = profile.result.emailAddress;
                
                // Store auth data
                localStorage.setItem('accessToken', this.accessToken);
                localStorage.setItem('userEmail', this.userEmail);
                
                this.isAuthenticated = true;
                await this.setupAfterAuth();
            } catch (error) {
                console.error('Error setting up authentication:', error);
                this.showNotification('Authentication failed', 'error');
            }
        }
    }

    handleAuthError(error) {
        console.error('Auth error:', error);
        this.showNotification(`Authentication failed: ${error.message || 'Unknown error'}`, 'error');
    }

    async handleEmailOperation(operation, ...args) {
        if (!navigator.onLine) {
            this.showNotification('No internet connection', 'error');
            return;
        }

        let lastError;
        for (let attempt = 1; attempt <= this.retryAttempts; attempt++) {
            try {
                return await operation(...args);
            } catch (error) {
                lastError = error;
                console.error(`Attempt ${attempt} failed:`, error);
                
                if (this.isRetryableError(error) && attempt < this.retryAttempts) {
                    await this.delay(this.retryDelay * attempt);
                    continue;
                }
                break;
            }
        }
        throw lastError;
    }

    isRetryableError(error) {
        const retryableCodes = ['ECONNRESET', 'ETIMEDOUT', 'ECONNREFUSED', 'NETWORK_ERROR'];
        return retryableCodes.includes(error.code) || 
               error.status === 503 || 
               error.status === 429;
    }

    delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    async loadEmails() {
        if (!this.accessToken) {
            this.showNotification('Please sign in first', 'warning');
            return;
        }

        try {
            await this.checkNetworkConnectivity();
            this.showLoading(true);
            
            // First, get the list of message IDs
            const response = await this.handleEmailOperation(async () => {
                return await gapi.client.gmail.users.messages.list({
                    userId: 'me',
                    maxResults: 50,
                    labelIds: ['INBOX'],
                    q: 'in:inbox'
                });
            });
            
            if (!response?.result?.messages) {
                this.emails = [];
                this.renderEmails();
                return;
            }

            // Fetch messages in smaller batches to avoid quota limits
            const BATCH_SIZE = 10;
            const messageIds = response.result.messages;
            const batches = [];

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
                batches.push(batchPromises);
            }

            // Process batches sequentially
            this.emails = [];
            for (const batch of batches) {
                const batchResults = await Promise.all(batch);
                const parsedEmails = batchResults
                    .map(result => this.parseEmailResponse(result.result))
                    .filter(Boolean); // Remove any null/undefined results
                this.emails.push(...parsedEmails);
            }

            // Sort emails by date (newest first)
            this.emails.sort((a, b) => b.date - a.date);
            
            this.renderEmails();
        } catch (err) {
            console.error('Error loading emails:', err);
            this.handleEmailError(err);
        } finally {
            this.showLoading(false);
        }
    }

    handleEmailError(error) {
        let message = 'Failed to load emails';
        
        if (error.message === 'No internet connection') {
            message = 'No internet connection. Please check your network.';
        } else if (error.message === 'Authentication required') {
            message = 'Please sign in again';
            this.handleAuthExpired();
        } else if (error.status === 429) {
            message = 'Too many requests. Please wait a moment';
        }

        this.showNotification(message, 'error');
    }

    handleAuthExpired() {
        this.isAuthenticated = false;
        this.accessToken = null;
        this.userEmail = null;
        localStorage.removeItem('accessToken');
        localStorage.removeItem('userEmail');
        document.getElementById('loginBtn').style.display = 'block';
        document.getElementById('emailControls').style.display = 'none';
    }

    async getEmailDetails(messageId, full = false) {
        const response = await gapi.client.gmail.users.messages.get({
            userId: 'me',
            id: messageId,
            format: full ? 'full' : 'metadata',
            metadataHeaders: ['From', 'Subject', 'Date', 'To', 'Cc']
        });
        return this.parseEmailResponse(response.result);
    }

    renderEmails() {
        const emailList = document.getElementById('emailList');
        emailList.innerHTML = '';

        this.emails.forEach(email => {
            const div = document.createElement('div');
            div.className = `email-item ${email.read ? '' : 'unread'}`;
            
            // Extract display name and email
            const fromMatch = email.from.match(/(?:"?([^"]*)"?\s)?(?:<?(.+@[^>]+)>?)/);
            const displayName = fromMatch ? (fromMatch[1] || fromMatch[2]) : email.from;
            
            // Format the date
            const date = this.formatEmailDate(email.date);
            
            // Create snippet from plain text (first 140 chars)
            const snippet = email.plainText ? 
                email.plainText.substring(0, 140) + (email.plainText.length > 140 ? '...' : '') :
                '';
            
            div.innerHTML = `
                <div class="email-sender">${displayName}</div>
                <div class="email-content-preview">
                    <div class="email-subject">${email.subject}</div>
                    <div class="email-snippet">${snippet}</div>
                </div>
                <div class="email-date">${date}</div>
                ${email.hasAttachment ? '<div class="email-attachment"><i class="fa-solid fa-paperclip"></i></div>' : ''}
            `;
            
            div.addEventListener('click', () => this.showEmail(email));
            emailList.appendChild(div);

            // Add spam warning if detected
            if (email.isSpam) {
                div.classList.add('spam-warning');
                div.setAttribute('title', 'This message may be spam');
            }
        });
    }

    formatEmailDate(date) {
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

    async getEmailDetails(messageId) {
        const response = await gapi.client.gmail.users.messages.get({
            userId: 'me',
            id: messageId
        });
        return this.parseEmailResponse(response.result);
    }

    showEmail(email) {
        document.getElementById('emailView').style.display = 'block';
        document.getElementById('emailComposer').style.display = 'none';
        document.getElementById('noSelection').style.display = 'none';

        const emailContainer = document.getElementById('emailView');
        emailContainer.innerHTML = `
            <div class="email-header">
                <h2>${email.subject || '(No subject)'}</h2>
                <div class="email-meta">
                    <div class="email-address-line">
                        <span class="meta-label">From:</span>
                        <div class="email-address">${this.formatEmailAddress(email.from)}</div>
                    </div>
                    <div class="email-address-line">
                        <span class="meta-label">To:</span>
                        <div class="email-address">${email.to.map(addr => this.formatEmailAddress(addr)).join(', ')}</div>
                    </div>
                    <div class="email-date-line">
                        <span class="meta-label">Date:</span>
                        <div>${this.formatFullDate(email.date)}</div>
                    </div>
                </div>
                ${email.hasAttachment ? '<div class="email-attachments" id="emailAttachments"></div>' : ''}
            </div>
            <div class="email-content-wrapper">
                <div class="email-content">
                    <div class="email-content-inner">
                        ${this.sanitizeHTML(email.content)}
                    </div>
                </div>
            </div>
        `;

        if (email.hasAttachment) {
            this.displayAttachments(email.attachments);
        }
    }

    formatEmailAddress(address) {
        const parts = this.parseEmailAddress(address);
        return parts.name ? 
            `${parts.name} <${parts.email}>` : 
            parts.email;
    }

    formatFullDate(date) {
        return new Date(date).toLocaleString(undefined, {
            weekday: 'long',
            year: 'numeric',
            month: 'long',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
    }

    parseEmailAddress(address) {
        const match = address.match(/^(?:"?([^"]*)"?\s)?(?:<?(.+@[^>]+)>?)/);
        return {
            name: match ? match[1] || '' : '',
            email: match ? match[2] || address : address
        };
    }

    sanitizeHTML(html) {
        const parser = new DOMParser();
        const doc = parser.parseFromString(html, 'text/html');
        
        // Preserve styles for email content
        const originalStyles = doc.getElementsByTagName('style');
        let styleContent = '';
        Array.from(originalStyles).forEach(style => {
            styleContent += style.textContent;
            style.remove();
        });

        // Remove dangerous elements
        const dangerousTags = ['script', 'iframe', 'object', 'embed', 'form'];
        dangerousTags.forEach(tag => {
            doc.querySelectorAll(tag).forEach(node => node.remove());
        });

        // Process elements
        doc.querySelectorAll('*').forEach(node => {
            // Keep original styles but sanitize them
            const originalStyle = node.getAttribute('style');
            if (originalStyle) {
                const safeStyle = this.sanitizeCSS(originalStyle);
                if (safeStyle) {
                    node.setAttribute('style', safeStyle);
                }
            }

            // Handle images
            if (node.tagName === 'IMG') {
                this.processImage(node);
                return;
            }

            // Clean other attributes
            const allowedAttrs = ['href', 'src', 'alt', 'title', 'class', 'target', 'style'];
            Array.from(node.attributes).forEach(attr => {
                if (!allowedAttrs.includes(attr.name)) {
                    node.removeAttribute(attr.name);
                }
                if (attr.name === 'href') {
                    node.setAttribute('target', '_blank');
                    node.setAttribute('rel', 'noopener noreferrer');
                }
            });
        });

        // Reinsert sanitized styles in a scoped manner
        if (styleContent) {
            const safeStyles = this.sanitizeCSS(styleContent);
            const styleElement = doc.createElement('style');
            styleElement.textContent = safeStyles;
            doc.body.insertBefore(styleElement, doc.body.firstChild);
        }

        // Add click protection for all links
        doc.querySelectorAll('a').forEach(link => {
            const url = link.getAttribute('href');
            if (url) {
                link.addEventListener('click', async (e) => {
                    e.preventDefault();
                    if (await this.validateLink(url)) {
                        window.open(url, '_blank', 'noopener,noreferrer');
                    } else {
                        this.showNotification('This link appears to be unsafe', 'warning');
                    }
                });
            }
        });

        return doc.body.innerHTML;
    }

    processImage(imgNode) {
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

    sanitizeCSS(css) {
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

    async validateLink(url) {
        // Check against known malicious URL patterns
        const suspiciousPatterns = [
            /^data:/i,
            /^javascript:/i,
            /^vbscript:/i,
            /^file:/i,
            /^ftp:/i,
        ];

        if (suspiciousPatterns.some(pattern => pattern.test(url))) {
            return false;
        }

        try {
            // Check against Google Safe Browsing API
            const response = await fetch(`https://safebrowsing.googleapis.com/v4/threatMatches:find?key=${this.API_KEY}`, {
                method: 'POST',
                body: JSON.stringify({
                    client: {
                        clientId: "NovaMail",
                        clientVersion: "1.0.0"
                    },
                    threatInfo: {
                        threatTypes: ["MALWARE", "SOCIAL_ENGINEERING", "UNWANTED_SOFTWARE", "POTENTIALLY_HARMFUL_APPLICATION"],
                        platformTypes: ["ANY_PLATFORM"],
                        threatEntryTypes: ["URL"],
                        threatEntries: [{ url }]
                    }
                })
            });

            const data = await response.json();
            return !data.matches; // Return true if no threats found
        } catch (error) {
            console.error('Error checking URL safety:', error);
            return false;
        }
    }

    async sendEmail() {
        const to = document.getElementById('toField').value;
        const subject = document.getElementById('subjectField').value;
        const body = document.getElementById('emailEditor').innerHTML; // Changed from TinyMCE to native editor

        if (!this.validateEmailInput(to, subject, body)) {
            return;
        }

        this.showLoading(true);
        try {
            const email = this.createEmailRequest(to, subject, body);
            await this.handleEmailOperation(async () => {
                const response = await gapi.client.gmail.users.messages.send({
                    userId: 'me',
                    resource: { raw: email }
                });
                return response;
            });
            
            this.showNotification('Email sent successfully', 'success');
            this.resetComposer();
            await this.loadEmails();
        } catch (err) {
            console.error('Error sending email:', err);
            this.handleEmailError(err);
        } finally {
            this.showLoading(false);
        }
    }

    validateEmailInput(to, subject, body) {
        if (!to || !subject || !body) {
            this.showNotification('Please fill all fields', 'warning');
            return false;
        }

        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(to)) {
            this.showNotification('Please enter a valid email address', 'warning');
            return false;
        }

        return true;
    }

    showNotification(message, type, duration = 3000) {
        const notification = document.getElementById('notification');
        if (!notification) return; // Guard against missing element

        // Remove any existing notification
        while (notification.firstChild) {
            notification.removeChild(notification.firstChild);
        }

        notification.textContent = message;
        notification.className = `notification ${type}`;
        notification.style.display = 'block';

        if (duration > 0) {
            setTimeout(() => {
                if (notification.style.display === 'block') {
                    notification.style.display = 'none';
                }
            }, duration);
        }
    }

    showLoading(show) {
        document.getElementById('loading').style.display = show ? 'block' : 'none';
    }

    // Helper method to parse email headers
    parseEmailResponse(message) {
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

    calculateSpamScore(message) {
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

    isLikelySpam(message, spamScore) {
        // Consider multiple factors for spam detection
        const factors = [
            spamScore >= 15,
            this.hasSpamHeaders(message),
            this.hasSuspiciousSender(message),
            this.hasSuspiciousLinks(message)
        ];

        return factors.filter(Boolean).length >= 2;
    }

    hasSpamHeaders(message) {
        const headers = message.payload.headers;
        return headers.some(header => 
            /^X-Spam-/i.test(header.name) && 
            /yes|true|spam/i.test(header.value)
        );
    }

    hasSuspiciousSender(message) {
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

    hasSuspiciousLinks(message) {
        const content = message.snippet || '';
        const suspiciousPatterns = [
            /bit\.ly/i,
            /tinyurl\.com/i,
            /goo\.gl/i,
            /is\.gd/i
        ];

        return suspiciousPatterns.some(pattern => pattern.test(content));
    }

    async moveToSpam(messageId) {
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

    convertPlainTextToHtml(text) {
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

    displayAttachments(attachments) {
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

    async downloadAttachment(attachment) {
        try {
            this.showLoading(true);
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

            this.showNotification('Attachment downloaded successfully', 'success');
        } catch (error) {
            console.error('Error downloading attachment:', error);
            this.showNotification('Failed to download attachment. Please try again.', 'error');
        } finally {
            this.showLoading(false);
        }
    }

    base64ToArrayBuffer(base64) {
        const binaryString = window.atob(base64);
        const bytes = new Uint8Array(binaryString.length);
        for (let i = 0; i < binaryString.length; i++) {
            bytes[i] = binaryString.charCodeAt(i);
        }
        return bytes.buffer;
    }

    initializeComposer() {
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

    showColorPicker() {
        // Create a temporary input
        const input = document.createElement('input');
        input.type = 'color';
        input.click();
        
        return new Promise(resolve => {
            input.addEventListener('change', () => resolve(input.value));
        });
    }

    async handleAttachments(event) {
        const files = event.target.files;
        const attachmentsList = document.getElementById('attachmentsList');
        
        for (const file of files) {
            // Create attachment chip
            const chip = document.createElement('div');
            chip.className = 'attachment-chip';
            chip.innerHTML = `
                <span>${file.name}</span>
                <button class="remove-attachment">×</button>
            `;
            
            // Add remove handler
            chip.querySelector('.remove-attachment').addEventListener('click', () => {
                chip.remove();
            });
            
            attachmentsList.appendChild(chip);
        }
    }

    createEmailRequest(to, subject, body, attachments = []) {
        // Update to include CC and BCC
        const cc = document.getElementById('ccField').value;
        const bcc = document.getElementById('bccField').value;
        
        // Generate boundary
        const boundary = `boundary_${Math.random().toString(36).substr(2)}`;
        
        // Create email headers
        const email = [
            `Content-Type: multipart/mixed; boundary="${boundary}"`,
            'MIME-Version: 1.0',
            `To: ${to}`,
            cc ? `Cc: ${cc}` : '',
            bcc ? `Bcc: ${bcc}` : '',
            `Subject: ${subject}`,
            '',
            `--${boundary}`,
            'Content-Type: multipart/alternative; boundary="alt_boundary"',
            '',
            '--alt_boundary',
            'Content-Type: text/plain; charset=utf-8',
            'Content-Transfer-Encoding: 7bit',
            '',
            this.htmlToPlainText(body),
            '',
            '--alt_boundary',
            'Content-Type: text/html; charset=utf-8',
            'Content-Transfer-Encoding: 7bit',
            '',
            this.sanitizeHTML(body), // Sanitize HTML before sending
            '',
            '--alt_boundary--'
        ].filter(Boolean); // Remove empty lines (from optional cc/bcc)

        // Add attachments
        const attachmentsList = document.getElementById('attachmentsList');
        const attachmentChips = attachmentsList.getElementsByClassName('attachment-chip');
        
        for (const chip of attachmentChips) {
            const fileName = chip.querySelector('span').textContent;
            const file = attachments.find(a => a.name === fileName);
            
            if (file) {
                email.push(
                    `--${boundary}`,
                    `Content-Type: ${file.type}`,
                    'Content-Transfer-Encoding: base64',
                    `Content-Disposition: attachment; filename="${file.name}"`,
                    '',
                    file.data
                );
            }
        }

        email.push(`--${boundary}--`);
        
        return btoa(email.join('\r\n')).replace(/\+/g, '-').replace(/\//g, '_');
    }

    resetComposer() {
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

    decodeBase64(encoded) {
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

    htmlToPlainText(html) {
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

    showComposer() {
        document.getElementById('emailComposer').style.display = 'block';
        document.getElementById('emailView').style.display = 'none';
        document.getElementById('noSelection').style.display = 'none';
    }

    replyToEmail() {
        if (!this.selectedEmail) return;
        const subject = `Re: ${this.selectedEmail.subject.replace(/^Re:\s*/i, '')}`;
        const to = this.selectedEmail.from;
        const body = this.createReplyBody(this.selectedEmail);
        this.openComposer({ to, subject, body });
    }

    replyAllToEmail() {
        if (!this.selectedEmail) return;
        const subject = `Re: ${this.selectedEmail.subject.replace(/^Re:\s*/i, '')}`;
        const to = this.selectedEmail.from;
        const cc = this.selectedEmail.to.filter(addr => addr !== this.userEmail);
        const body = this.createReplyBody(this.selectedEmail);
        this.openComposer({ to, cc, subject, body });
    }

    forwardEmail() {
        if (!this.selectedEmail) return;
        const subject = `Fwd: ${this.selectedEmail.subject.replace(/^Fwd:\s*/i, '')}`;
        const body = this.createForwardBody(this.selectedEmail);
        this.openComposer({ subject, body });
    }

    searchEmails(query) {
        if (!query) {
            this.renderEmails(this.emails);
            return;
        }

        const searchTerms = query.toLowerCase().split(' ');
        const filtered = this.emails.filter(email => {
            const searchable = [
                email.subject,
                email.from,
                ...email.to,
                email.plainText
            ].join(' ').toLowerCase();

            return searchTerms.every(term => searchable.includes(term));
        });

        this.renderEmails(filtered);
    }

    debounce(func, wait) {
        let timeout;
        return (...args) => {
            clearTimeout(timeout);
            timeout = setTimeout(() => func.apply(this, args), wait);
        };
    }

    handleDragOver(e) {
        e.preventDefault();
        e.currentTarget.classList.add('drag-over');
    }

    async handleDrop(e) {
        e.preventDefault();
        e.currentTarget.classList.remove('drag-over');

        const files = Array.from(e.dataTransfer.files);
        await this.handleAttachments({ target: { files } });
    }

    // Add new helper methods
    async toggleStarred() {
        if (!this.selectedEmail) return;
        const isStarred = this.selectedEmail.starred;
        await this.modifyEmail(this.selectedEmail.id, {
            addLabelIds: isStarred ? [] : ['STARRED'],
            removeLabelIds: isStarred ? ['STARRED'] : []
        });
        this.selectedEmail.starred = !isStarred;
        this.renderEmailItem(this.selectedEmail);
    }

    navigateEmails(direction) {
        const currentIndex = this.emails.findIndex(e => e.id === this.selectedEmail?.id);
        let newIndex = direction === 'next' ? currentIndex + 1 : currentIndex - 1;
        
        if (newIndex >= 0 && newIndex < this.emails.length) {
            this.showEmail(this.emails[newIndex]);
        }
    }

    async switchFolder(folderId) {
        this.currentFolder = folderId;
        document.querySelectorAll('.folder').forEach(f => {
            f.classList.toggle('active', f.dataset.folder === folderId);
        });
        await this.loadEmails(folderId);
    }

    async searchEmails(query) {
        if (!query) {
            await this.loadEmails(this.currentFolder);
            return;
        }

        try {
            const response = await gapi.client.gmail.users.messages.list({
                userId: 'me',
                q: query,
                maxResults: 50
            });

            if (!response.result.messages) {
                this.emails = [];
                this.renderEmails();
                return;
            }

            // Use the same batch processing logic as loadEmails
            const messageIds = response.result.messages;
            this.emails = await this.fetchEmailBatch(messageIds);
            this.renderEmails();
        } catch (error) {
            console.error('Search failed:', error);
            this.showNotification('Search failed', 'error');
        }
    }

    async markSelectedAsRead(read = true) {
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
            this.showNotification(`Marked ${selected.length} emails as ${read ? 'read' : 'unread'}`, 'success');
        } catch (error) {
            console.error('Failed to mark emails:', error);
            this.showNotification('Failed to update emails', 'error');
        }
    }

    async toggleSelectedStar() {
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
            this.showNotification('Updated starred status', 'success');
        } catch (error) {
            console.error('Failed to update starred status:', error);
            this.showNotification('Failed to update emails', 'error');
        }
    }

    async archiveSelected() {
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
            this.showNotification(`Archived ${selected.length} emails`, 'success');
        } catch (error) {
            console.error('Failed to archive emails:', error);
            this.showNotification('Failed to archive emails', 'error');
        }
    }

    async deleteSelected() {
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
            this.showNotification(`Deleted ${selected.length} emails`, 'success');
        } catch (error) {
            console.error('Failed to delete emails:', error);
            this.showNotification('Failed to delete emails', 'error');
        }
    }

    getSelectedEmails() {
        return Array.from(document.querySelectorAll('.email-item.selected'))
            .map(el => this.emails.find(e => e.id === el.dataset.emailId))
            .filter(Boolean);
    }

    async fetchEmailBatch(messageIds) {
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

    markSelectedAsUnread() {
        this.markSelectedAsRead(false);
    }

    async setupAfterAuth() {
        document.getElementById('loginBtn').style.display = 'none';
        document.getElementById('emailControls').style.display = 'block';
        
        try {
            await this.checkNetworkConnectivity();
            await this.loadEmails();
        } catch (error) {
            console.error('Error in setup:', error);
            this.handleAuthExpired();
        }
    }

    async modifyEmail(messageId, modifications) {
        try {
            await gapi.client.gmail.users.messages.modify({
                userId: 'me',
                id: messageId,
                resource: modifications
            });
        } catch (error) {
            console.error('Failed to modify email:', error);
            this.showNotification('Failed to update email', 'error');
        }
    }

    renderEmailItem(email) {
        const existingItem = document.querySelector(`[data-email-id="${email.id}"]`);
        if (existingItem) {
            existingItem.className = `email-item ${email.read ? '' : 'unread'} ${email.starred ? 'starred' : ''}`;
        }
    }

    createReplyBody(originalEmail) {
        const date = this.formatFullDate(originalEmail.date);
        return `\n\nOn ${date}, ${originalEmail.from} wrote:\n> ${originalEmail.content.replace(/\n/g, '\n> ')}`;
    }

    createForwardBody(originalEmail) {
        const date = this.formatFullDate(originalEmail.date);
        return `---------- Forwarded message ---------\n` +
               `From: ${originalEmail.from}\n` +
               `Date: ${date}\n` +
               `Subject: ${originalEmail.subject}\n` +
               `To: ${originalEmail.to.join(', ')}\n\n` +
               originalEmail.content;
    }

    openComposer({ to = '', cc = '', subject = '', body = '' } = {}) {
        document.getElementById('toField').value = to;
        document.getElementById('ccField').value = Array.isArray(cc) ? cc.join(', ') : cc;
        document.getElementById('subjectField').value = subject;
        document.getElementById('emailEditor').innerHTML = body;
        this.showComposer();
    }

    focusSearch() {
        document.getElementById('searchInput').focus();
    }

    toggleShortcutHelp() {
        const overlay = document.getElementById('shortcutHelp');
        overlay.style.display = overlay.style.display === 'none' ? 'grid' : 'none';
    }

    archiveEmail() {
        this.archiveSelected();
    }

    deleteEmail() {
        this.deleteSelected();
    }

    markAsSpam() {
        if (!this.selectedEmail) return;
        this.moveToSpam(this.selectedEmail.id);
    }
}

// Initialize the app when the DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    new EmailApp();
});
