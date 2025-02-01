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
        
        this.loadGoogleAPI();
        this.setupEventListeners();
        this.initializeApp().catch(error => {
            console.error('App initialization failed:', error);
            this.handleInitError(error);
        });
        this.initializeRichEditor();
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
                
                this.isAuthenticated = true;
                document.getElementById('loginBtn').style.display = 'none';
                document.getElementById('emailControls').style.display = 'block';
                
                // Check connectivity after authentication
                await this.checkNetworkConnectivity();
                await this.loadEmails();
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
            const response = await this.handleEmailOperation(async () => {
                if (!gapi.client.gmail) {
                    await this.initializeGoogleClient();
                }
                return await gapi.client.gmail.users.messages.list({
                    userId: 'me',
                    maxResults: 10
                });
            });
            
            if (!response.result.messages) {
                this.emails = [];
                this.renderEmails();
                return;
            }

            this.emails = await Promise.all(
                response.result.messages.map(msg => 
                    this.handleEmailOperation(() => this.getEmailDetails(msg.id))
                )
            );
            
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
        document.getElementById('loginBtn').style.display = 'block';
        document.getElementById('emailControls').style.display = 'none';
    }

    async getEmailDetails(messageId) {
        const response = await gapi.client.gmail.users.messages.get({
            userId: 'me',
            id: messageId
        });
        return this.parseEmailResponse(response.result);
    }

    renderEmails() {
        const emailList = document.getElementById('emailList');
        emailList.innerHTML = '';

        this.emails.forEach(email => {
            const div = document.createElement('div');
            div.className = `email-item ${email.read ? '' : 'unread'}`;
            div.innerHTML = `
                <div>${email.from}</div>
                <div>${email.subject}</div>
                <div>${email.date.toLocaleDateString()}</div>
            `;
            div.addEventListener('click', () => this.showEmail(email));
            emailList.appendChild(div);
        });
    }

    showEmail(email) {
        document.getElementById('emailView').style.display = 'block';
        document.getElementById('emailComposer').style.display = 'none';
        document.getElementById('noSelection').style.display = 'none';

        document.getElementById('emailSubject').textContent = email.subject;
        document.getElementById('emailFrom').textContent = `From: ${email.from}`;
        document.getElementById('emailTo').textContent = `To: ${email.to.join(', ')}`;
        
        const emailBody = document.getElementById('emailBody');
        if (email.htmlContent) {
            emailBody.innerHTML = this.sanitizeHTML(email.htmlContent);
        } else {
            emailBody.textContent = email.plainText || email.body;
        }

        this.displayAttachments(email.attachments);
    }

    async sendEmail() {
        const to = document.getElementById('toField').value;
        const subject = document.getElementById('subjectField').value;
        const body = tinymce.get('richEditor').getContent();

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
        const headers = message.payload.headers;
        const subject = headers.find(h => h.name === 'Subject')?.value || '(no subject)';
        const from = headers.find(h => h.name === 'From')?.value || '';
        const to = headers.find(h => h.name === 'To')?.value.split(',') || [];
        const date = new Date(parseInt(message.internalDate));
        
        let htmlContent = '';
        let plainText = '';
        let attachments = [];

        if (message.payload.parts) {
            message.payload.parts.forEach(part => {
                if (part.mimeType === 'text/html') {
                    htmlContent = atob(part.body.data.replace(/-/g, '+').replace(/_/g, '/'));
                } else if (part.mimeType === 'text/plain') {
                    plainText = atob(part.body.data.replace(/-/g, '+').replace(/_/g, '/'));
                } else if (part.filename) {
                    attachments.push({
                        id: part.body.attachmentId,
                        filename: part.filename,
                        mimeType: part.mimeType,
                        size: part.body.size
                    });
                }
            });
        } else if (message.payload.body.data) {
            plainText = atob(message.payload.body.data.replace(/-/g, '+').replace(/_/g, '/'));
        }

        return {
            id: message.id,
            subject,
            from,
            to,
            body: htmlContent || plainText,
            date,
            read: !message.labelIds.includes('UNREAD'),
            htmlContent,
            plainText,
            attachments
        };
    }

    sanitizeHTML(html) {
        const parser = new DOMParser();
        const doc = parser.parseFromString(html, 'text/html');
        // Remove potentially dangerous elements and attributes
        this.sanitizeNode(doc.body);
        return doc.body.innerHTML;
    }

    sanitizeNode(node) {
        const allowedTags = ['p', 'br', 'div', 'span', 'a', 'b', 'i', 'strong', 'em', 'img'];
        const allowedAttrs = ['href', 'src', 'alt', 'title'];
        
        Array.from(node.children).forEach(child => {
            if (!allowedTags.includes(child.tagName.toLowerCase())) {
                node.removeChild(child);
            } else {
                Array.from(child.attributes).forEach(attr => {
                    if (!allowedAttrs.includes(attr.name)) {
                        child.removeAttribute(attr.name);
                    }
                });
                this.sanitizeNode(child);
            }
        });
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
                <span class="attachment-icon">📎</span>
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

    initializeRichEditor() {
        tinymce.init({
            selector: '#richEditor',
            menubar: false,
            plugins: 'link image code',
            toolbar: 'undo redo | bold italic | alignleft aligncenter alignright | code'
        });
    }

    createEmailRequest(to, subject, body, attachments = []) {
        const email = [
            'Content-Type: multipart/mixed; boundary="boundary"',
            'MIME-Version: 1.0',
            'to: ' + to,
            'subject: ' + subject,
            '',
            '--boundary',
            'Content-Type: text/html; charset=utf-8',
            'MIME-Version: 1.0',
            '',
            body,
        ];

        // Add attachments if any
        attachments.forEach(attachment => {
            email.push(
                '--boundary',
                `Content-Type: ${attachment.type}`,
                'Content-Transfer-Encoding: base64',
                `Content-Disposition: attachment; filename="${attachment.name}"`,
                '',
                attachment.data
            );
        });

        email.push('--boundary--');
        
        return btoa(email.join('\r\n').replace(/\+/g, '-').replace(/\//g, '_'));
    }

    // ... other helper methods ...
}

// Initialize the app when the DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    new EmailApp();
});
