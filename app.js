import { UIHandler } from './uihandler.js';
import { EmailOperations } from './emailoperations.js';
import { Helpers } from './helpers.js';
import { showNotification, showLoading } from './shared/utils.js';

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
        this.accessToken = null;
        this.retryAttempts = 3;
        this.retryDelay = 1000;
        this.selectedEmail = null;
        this.currentFolder = 'INBOX';
        this.userEmail = localStorage.getItem('userEmail');
        this.accessToken = localStorage.getItem('accessToken');
        this.folderLabels = {
            'INBOX': 'INBOX',
            'SENT': 'SENT',
            'DRAFT': 'DRAFT',
            'TRASH': 'TRASH',
            'SPAM': 'SPAM'
        };

        // Expose app instance globally for Astro buttons
        window.app = this;

        // --- Initialization ---
        this.initialize();
    }

    async initialize() {
        if (this.accessToken) {
            this.isAuthenticated = true;
            await this.setupAfterAuth();
        }

        await this.loadGoogleAPI();
        this.setupEventListeners();
        try {
            await this.initializeApp();
            // Add this line to create category tabs during initialization
            this.createCategoryTabs();
        } catch (error) {
            console.error('App initialization failed:', error);
            this.handleInitError(error);
        }
        this.initializeComposer();
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
                gapi.load('client', {
                    callback: resolve,
                    onerror: reject,
                    timeout: 5000,
                    ontimeout: () => reject(new Error('Failed to load Google API client'))
                });
            });

            await gapi.client.init({
                apiKey: this.API_KEY,
                discoveryDocs: this.DISCOVERY_DOCS,
            });

            // Wait for discovery docs to be loaded
            await new Promise((resolve) => {
                const checkDiscovery = () => {
                    if (gapi.client.gmail) {
                        resolve();
                    } else {
                        setTimeout(checkDiscovery, 100);
                    }
                };
                checkDiscovery();
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
            throw error; // Re-throw to handle it in the calling function
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

    // Modified to store token and userEmail for persistence
    async handleAuthResponse(response) {
        if (response.access_token) {
            this.accessToken = response.access_token;
            localStorage.setItem('accessToken', response.access_token);
            // Optionally, store userEmail if available (or fetch via API)
            if (response.email) {
                this.userEmail = response.email;
                localStorage.setItem('userEmail', response.email);
            }
            await this.setupAfterAuth();
        } else {
            this.handleAuthError({ message: "No access token received" });
        }
    }

    handleAuthError(error) {
        console.error('Auth error:', error);
        this.showNotification(`Authentication failed: ${error.message || 'Unknown error'}`, 'error');
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
