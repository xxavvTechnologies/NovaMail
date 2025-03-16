import { UIHandler } from './uihandler.js';
import { EmailOperations } from './emailoperations.js';
import { Helpers } from './helpers.js';
import { showNotification, showLoading } from './shared/utils.js';
import { Astro } from './ai/Astro.js';

class EmailApp {
    constructor() {
        // Bind methods to instance
        this.handleAuthClick = this.handleAuthClick.bind(this);
        this.handleAuthResponse = this.handleAuthResponse.bind(this);
        this.handleAuthError = this.handleAuthError.bind(this);
        this.setupEventListeners = this.setupEventListeners.bind(this);
        this.loadEmails = this.loadEmails.bind(this);
        this.sendEmail = this.sendEmail.bind(this);
        
        // Add shared utilities
        this.showNotification = showNotification;
        this.showLoading = showLoading;
        
        // --- Core Properties ---
        this.emails = [];
        this.isAuthenticated = false;
        this.gapiLoaded = false;
        this.gisLoaded = false;
        this.CLIENT_ID = '139502800975-lqhp99o1t4pqv7tkjcodunqch8b4vbut.apps.googleusercontent.com'; // Replace with your Google OAuth client ID
        this.API_KEY = 'AIzaSyBtIKYVjyfyhCXIkXHAsVvnyVSbNFZ_9HM'; // Replace with your Google API key
        this.DISCOVERY_DOCS = ['https://www.googleapis.com/discovery/v1/apis/gmail/v1/rest'];
        this.SCOPES = 'https://www.googleapis.com/auth/gmail.modify';
        this.tokenClient = null;
        this.accessToken = localStorage.getItem('accessToken');
        this.refreshToken = localStorage.getItem('refreshToken');
        this.userEmail = localStorage.getItem('userEmail');
        this.tokenExpiry = localStorage.getItem('tokenExpiry');
        this.retryAttempts = 3;
        this.retryDelay = 1000;
        this.selectedEmail = null;
        this.currentFolder = 'INBOX';
        this.folderLabels = {
            'INBOX': 'INBOX',
            'SENT': 'SENT',
            'DRAFT': 'DRAFT',
            'TRASH': 'TRASH',
            'SPAM': 'SPAM'
        };

        // Initialize emailCategories
        this.emailCategories = {};

        // Expose app instance globally for Astro buttons
        window.app = this;

        // Add login overlay reference
        this.loginOverlay = document.getElementById('loginOverlay');

        // Check auth state on start
        if (this.accessToken) {
            this.hideLoginOverlay();
        } else {
            this.showLoginOverlay();
        }

        // --- Initialization ---
        this.initialize();

        // Initialize AI features
        Astro.init();

        // Bind email operations to UI handler
        UIHandler.setEmailOps(EmailOperations);
        
        // Initialize UI
        this.setupEventListeners();

        // Add new properties
        this.autoSaveInterval = null;
        this.pollInterval = null;
        this.isOffline = !navigator.onLine;
        this.retryQueue = [];
        
        // Add offline detection
        window.addEventListener('online', this.handleOnline.bind(this));
        window.addEventListener('offline', this.handleOffline.bind(this));
    }

    async initialize() {
        try {
            // First load the API scripts and wait for them to be ready
            await this.loadGoogleAPI();
            await this.waitForLibraries();
            
            // Load gapi client first
            await new Promise((resolve, reject) => {
                gapi.load('client', {
                    callback: resolve,
                    onerror: reject,
                    timeout: 5000,
                    ontimeout: () => reject(new Error('Failed to load Google API client'))
                });
            });

            // Then initialize the client
            await gapi.client.init({
                apiKey: this.API_KEY,
                discoveryDocs: this.DISCOVERY_DOCS,
            });

            // Initialize token client after gapi is ready
            this.tokenClient = google.accounts.oauth2.initTokenClient({
                client_id: this.CLIENT_ID,
                scope: this.SCOPES,
                callback: this.handleAuthResponse.bind(this),
                error_callback: this.handleAuthError.bind(this)
            });

            // Now check stored token and auth state
            if (this.accessToken) {
                gapi.client.setToken({
                    access_token: this.accessToken
                });

                const isValid = await this.validateStoredToken();
                if (isValid) {
                    this.isAuthenticated = true;
                    this.hideLoginOverlay();
                    await this.setupAfterAuth();
                } else {
                    const refreshed = await this.refreshAccessToken();
                    if (!refreshed) {
                        this.showLoginOverlay();
                        this.clearStoredCredentials();
                    }
                }
            } else {
                this.showLoginOverlay();
            }

            // Complete remaining setup
            await this.initializeGoogleClient();
            this.setupEventListeners();
            this.createCategoryTabs();
            this.initializeComposer();

            // Start email polling only if authenticated
            if (this.isAuthenticated && this.accessToken) {
                // Start email polling and folder updates
                await this.startEmailPolling();
                await this.updateFolderCounts();
                setInterval(() => this.updateFolderCounts(), 60000);
            }

        } catch (error) {
            console.error('Initialization failed:', error);
            this.handleInitError(error);
            this.showLoginOverlay();
        }
    }

    async validateStoredToken() {
        try {
            const response = await fetch('https://www.googleapis.com/oauth2/v3/tokeninfo', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded'
                },
                body: `access_token=${this.accessToken}`
            });
            
            if (!response.ok) {
                return false;
            }

            const data = await response.json();
            if (data.error) {
                return false;
            }

            // Verify the token audience matches our client ID
            if (data.aud !== this.CLIENT_ID) {
                return false;
            }

            // Update expiry time
            const expiryTime = Date.now() + (data.expires_in * 1000);
            localStorage.setItem('tokenExpiry', expiryTime.toString());
            this.tokenExpiry = expiryTime.toString();
            
            return true;
        } catch (error) {
            console.error('Token validation failed:', error);
            return false;
        }
    }

    async refreshAccessToken() {
        try {
            this.tokenClient = google.accounts.oauth2.initTokenClient({
                client_id: this.CLIENT_ID,
                scope: this.SCOPES,
                callback: this.handleAuthResponse.bind(this),
                error_callback: this.handleAuthError.bind(this),
                prompt: 'none'
            });

            // Try silent token refresh
            await this.tokenClient.requestAccessToken({
                prompt: 'none'
            });
            return true;
        } catch (error) {
            console.error('Silent token refresh failed:', error);
            this.clearStoredCredentials();
            return false;
        }
    }

    isTokenValid() {
        if (!this.tokenExpiry) return false;
        const expiryTime = parseInt(this.tokenExpiry);
        return expiryTime > Date.now();
    }

    clearStoredCredentials() {
        localStorage.removeItem('accessToken');
        localStorage.removeItem('refreshToken');
        localStorage.removeItem('userEmail');
        localStorage.removeItem('tokenExpiry');
        this.accessToken = null;
        this.refreshToken = null;
        this.userEmail = null;
        this.tokenExpiry = null;
    }

    // Authentication methods
    async initializeApp() {
        try {
            await this.waitForLibraries();
            await this.initializeGoogleClient();
        } catch (error) {
            console.error('Initialization error:', error);
        }
    }

    async waitForLibraries() {
        return new Promise((resolve) => {
            const check = () => {
                if (typeof gapi !== 'undefined' && typeof google !== 'undefined' && typeof google.accounts !== 'undefined') {
                    resolve();
                } else {
                    setTimeout(check, 100);
                }
            };
            check();
        });
    }

    async initializeGoogleClient() {
        try {
            // Load the Gmail API
            await new Promise((resolve) => {
                const checkApi = () => {
                    if (gapi.client?.gmail) {
                        resolve();
                    } else {
                        setTimeout(checkApi, 100);
                    }
                };
                checkApi();
            });

            console.log('Google API client initialized');
        } catch (error) {
            console.error('Error initializing Google API client:', error);
            throw error;
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

        // Add more keyboard shortcuts
        const additionalShortcuts = {
            'Escape': () => this.handleEscape(),
            'n': () => this.showComposer(),
            'm': () => this.toggleMute(),
            'x': () => this.selectEmail(),
            '*': () => this.selectAll(),
            '/': () => document.getElementById('searchInput').focus()
        };

        Object.assign(shortcuts, additionalShortcuts);

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

        // Add save draft button handler
        document.querySelector('.save-draft-button').addEventListener('click', () => {
            this.saveDraft();
        });

        // Update folder click handlers
        document.querySelectorAll('.folder').forEach(folder => {
            folder.addEventListener('click', () => {
                this.switchFolder(folder.dataset.folder);
            });
        });
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

    // Modified to store refresh token
    async handleAuthResponse(response) {
        if (response.access_token) {
            this.accessToken = response.access_token;
            localStorage.setItem('accessToken', response.access_token);
            
            // Set the token in gapi client
            gapi.client.setToken({
                access_token: response.access_token
            });
            
            // Store token expiry (get from response or default to 1 hour)
            const expiryTime = Date.now() + ((response.expires_in || 3600) * 1000);
            localStorage.setItem('tokenExpiry', expiryTime.toString());
            this.tokenExpiry = expiryTime.toString();
            
            this.isAuthenticated = true;
            this.hideLoginOverlay();
            document.getElementById('emailControls').style.display = 'block';
            
            try {
                await this.setupAfterAuth();
            } catch (error) {
                console.error('Error in setup after auth:', error);
                this.handleAuthError(error);
            }
        } else {
            this.handleAuthError({ message: "No access token received" });
        }
    }

    handleAuthError(error) {
        console.error('Auth error:', error);
        this.showNotification(`Authentication failed: ${error.message || 'Unknown error'}`, 'error');
    }

    showLoginOverlay() {
        if (this.loginOverlay) {
            this.loginOverlay.style.display = 'flex';
            document.querySelector('.app').classList.remove('authenticated');
        }
    }

    hideLoginOverlay() {
        if (this.loginOverlay) {
            this.loginOverlay.style.display = 'none';
            document.querySelector('.app').classList.add('authenticated');
        }
    }

    handleAuthExpired() {
        this.showLoginOverlay();
        this.clearStoredCredentials();
        this.isAuthenticated = false;
        document.getElementById('emailControls').style.display = 'none';
    }

    handleOffline() {
        this.isOffline = true;
        this.showNotification('You are offline. Changes will be saved when connection is restored.', 'warning');
        document.body.classList.add('offline-mode');
    }

    handleOnline() {
        this.isOffline = false;
        this.showNotification('Connection restored!', 'success');
        document.body.classList.remove('offline-mode');
        
        // Process queued operations
        while (this.retryQueue.length > 0) {
            const operation = this.retryQueue.shift();
            this.handleEmailOperation(operation);
        }
    }

    handleEscape() {
        const composer = document.getElementById('emailComposer');
        const emailView = document.getElementById('emailView');
        
        if (composer.style.display === 'block') {
            if (confirm('Discard draft?')) {
                this.resetComposer();
            }
        } else if (emailView.style.display === 'block') {
            this.showEmailList();
        }
    }

    async retryOperation(operation) {
        if (this.isOffline) {
            this.retryQueue.push(operation);
            return;
        }

        let attempts = 0;
        const maxAttempts = 3;

        while (attempts < maxAttempts) {
            try {
                return await operation();
            } catch (error) {
                attempts++;
                if (attempts === maxAttempts) {
                    throw error;
                }
                await new Promise(resolve => setTimeout(resolve, 1000 * attempts));
            }
        }
    }

    startEmailPolling() {
        if (this.pollInterval) {
            clearInterval(this.pollInterval);
        }
        
        // Check for new emails every 30 seconds
        this.pollInterval = setInterval(async () => {
            if (!this.isOffline && this.isAuthenticated) {
                await this.checkNewEmails();
            }
        }, 30000);
    }

    setupAutoSave() {
        if (this.autoSaveInterval) {
            clearInterval(this.autoSaveInterval);
        }

        const saveInterval = 30000; // 30 seconds
        this.autoSaveInterval = setInterval(async () => {
            const composer = document.getElementById('emailComposer');
            if (composer.style.display === 'block') {
                await this.saveDraft();
            }
        }, saveInterval);
    }

    static getInstance() {
        if (!EmailApp.instance) {
            EmailApp.instance = new EmailApp();
        }
        return EmailApp.instance;
    }
}

// Mix in the prototypes correctly
Object.assign(EmailApp.prototype, {
    ...UIHandler,
    ...EmailOperations,
    ...Helpers
});

// Initialize singleton instance
let instance = null;

export function initializeApp() {
    if (!instance) {
        instance = EmailApp.getInstance();
    }
    return instance;
}

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    initializeApp();
});
