import { debounce } from './shared/utils.js';
import { getCategoryDetails } from './categories.js';

// --- MARKER: START OF UI AND EVENT HANDLING SECTION ---
// UI setup and event listeners
function setupEventListeners() {
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

        handleKeyboardNavigation(e);
    });

    // Add folder navigation
    document.querySelectorAll('.folder').forEach(folder => {
        folder.addEventListener('click', () => {
            this.switchFolder(folder.dataset.folder);
        });
    });

    // Add search functionality (combine both search listeners)
    const searchInput = document.getElementById('searchInput');
    searchInput.addEventListener('input', debounce(() => {
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

    // Add category tab handlers
    document.querySelectorAll('.category-tab').forEach(tab => {
        tab.addEventListener('click', () => {
            // Update active state
            document.querySelectorAll('.category-tab').forEach(t => 
                t.classList.remove('active')
            );
            tab.classList.add('active');

            // Re-render emails with selected category
            this.renderEmailsWithCategories();
        });
    });

    // Fix action buttons with proper selection handling
    document.getElementById('emailList').addEventListener('click', e => {
        const emailItem = e.target.closest('.email-item');
        if (emailItem) {
            if (e.ctrlKey || e.metaKey) {
                emailItem.classList.toggle('selected');
            } else {
                document.querySelectorAll('.email-item').forEach(item => {
                    item.classList.remove('selected');
                });
                emailItem.classList.add('selected');
            }
        }
    });

    // Add shift-click for range selection
    let lastSelected = null;
    document.getElementById('emailList').addEventListener('click', e => {
        const emailItem = e.target.closest('.email-item');
        if (emailItem && e.shiftKey && lastSelected) {
            const items = Array.from(document.querySelectorAll('.email-item'));
            const start = items.indexOf(lastSelected);
            const end = items.indexOf(emailItem);
            const range = items.slice(
                Math.min(start, end),
                Math.max(start, end) + 1
            );
            range.forEach(item => item.classList.add('selected'));
        }
        if (emailItem && !e.ctrlKey && !e.metaKey) {
            lastSelected = emailItem;
        }
    });

    // Select all with Ctrl/Cmd + A
    document.addEventListener('keydown', e => {
        if ((e.ctrlKey || e.metaKey) && e.key === 'a') {
            e.preventDefault();
            document.querySelectorAll('.email-item').forEach(item => {
                item.classList.add('selected');
            });
        }
    });

    initializeSearch();

    // Add mobile menu toggle
    const menuToggle = document.getElementById('menuToggle');
    const sidebar = document.querySelector('.sidebar');
    
    if (menuToggle && sidebar) {
        menuToggle.addEventListener('click', (e) => {
            e.stopPropagation();
            sidebar.classList.toggle('active');
        });

        // Close sidebar when clicking outside
        document.addEventListener('click', (e) => {
            if (window.innerWidth <= 768 && 
                !sidebar.contains(e.target) && 
                !menuToggle.contains(e.target)) {
                sidebar.classList.remove('active');
            }
        });
    }

    // Add swipe handling for mobile
    let touchStartX = 0;
    document.addEventListener('touchstart', (e) => {
        touchStartX = e.touches[0].clientX;
    });

    document.addEventListener('touchmove', (e) => {
        if (!touchStartX) return;
        
        const touchEndX = e.touches[0].clientX;
        const diff = touchEndX - touchStartX;
        
        // Swipe right to open sidebar
        if (diff > 50 && touchStartX < 30) {
            sidebar.classList.add('active');
        }
        // Swipe left to close sidebar
        else if (diff < -50 && sidebar.classList.contains('active')) {
            sidebar.classList.remove('active');
        }
    });

    document.addEventListener('touchend', () => {
        touchStartX = 0;
    });

    // Handle window resize
    window.addEventListener('resize', () => {
        const isMobile = window.innerWidth <= 768;
        menuToggle.style.display = isMobile ? 'flex' : 'none';
        if (!isMobile) {
            sidebar.classList.remove('active');
        }
    });

    // Trigger initial resize check
    window.dispatchEvent(new Event('resize'));
}

// UI rendering methods
function renderEmails() {
    const emailList = document.getElementById('emailList');
    emailList.innerHTML = '';

    this.emails.forEach(email => {
        const div = document.createElement('div');
        div.className = `email-item ${email.read ? '' : 'unread'}`;
        div.dataset.emailId = email.id;
        div.setAttribute('role', 'listitem');
        div.setAttribute('tabindex', '0');
        
        // Add checkbox for selection
        div.innerHTML = `
            <div class="email-checkbox">
                <input type="checkbox" class="select-email" aria-label="Select email">
            </div>
            <div class="email-content-preview">
                <div class="email-sender">${this.sanitizeHTML(email.from)}</div>
                <div class="email-subject">${this.sanitizeHTML(email.subject)}</div>
                <div class="email-snippet">${this.sanitizeHTML(email.snippet)}</div>
            </div>
            <div class="email-date">${this.formatEmailDate(email.date)}</div>
            ${email.hasAttachment ? '<div class="email-attachment"><i class="fa-solid fa-paperclip"></i></div>' : ''}
        `;

        // Add selection handling
        const checkbox = div.querySelector('.select-email');
        checkbox.addEventListener('click', (e) => {
            e.stopPropagation(); // Prevent email opening
            div.classList.toggle('selected');
            this.updateBulkActionButtons();
        });

        // Handle shift+click for range selection
        div.addEventListener('click', (e) => {
            if (e.target.closest('.select-email')) return;
            
            if (e.shiftKey && this.lastSelectedEmail) {
                const items = Array.from(emailList.children);
                const start = items.indexOf(this.lastSelectedEmail);
                const end = items.indexOf(div);
                const range = items.slice(
                    Math.min(start, end),
                    Math.max(start, end) + 1
                );
                range.forEach(item => {
                    item.classList.add('selected');
                    item.querySelector('.select-email').checked = true;
                });
            } else {
                if (!e.ctrlKey && !e.metaKey) {
                    this.showEmail(email);
                }
            }
            this.lastSelectedEmail = div;
            this.updateBulkActionButtons();
        });

        emailList.appendChild(div);
    });

    this.updateBulkActionButtons();
}

function updateBulkActionButtons() {
    const selected = document.querySelectorAll('.email-item.selected').length;
    const buttons = [
        'markReadBtn', 'markUnreadBtn', 'starBtn', 
        'archiveBtn', 'deleteBtn'
    ];
    
    buttons.forEach(btnId => {
        const btn = document.getElementById(btnId);
        if (btn) {
            btn.disabled = selected === 0;
            btn.classList.toggle('disabled', selected === 0);
        }
    });
}

function showEmail(email) {
    if (!email) return;

    const emailView = document.getElementById('emailView');
    emailView.style.opacity = '0';
    emailView.style.display = 'flex';
    
    emailView.offsetHeight; // Trigger reflow
    emailView.style.opacity = '1';
    emailView.style.transition = 'opacity var(--transition-normal)';

    // Update header with complete layout
    const header = document.getElementById('emailHeader');
    header.innerHTML = `
        <div class="email-header-inner">
            <button class="back-button" id="backToList">
                <i class="fa-solid fa-arrow-left"></i>
            </button>
            <div class="header-content">
                <div class="subject-line">
                    <h2>${this.sanitizeHTML(email.subject || '(No Subject)')}</h2>
                    <span class="email-date">${this.formatFullDate(email.date)}</span>
                </div>
                <div class="header-metadata">
                    <div class="address-row"><strong>From:</strong> ${this.sanitizeHTML(email.from)}</div>
                    <div class="address-row"><strong>To:</strong> ${this.sanitizeHTML(email.to.join(', '))}</div>
                    ${email.hasAttachment ? '<div class="attachments-label"><i class="fa-solid fa-paperclip"></i> Contains attachments</div>' : ''}
                </div>
            </div>
            <div class="email-actions">
                <button class="action-btn reply-btn" title="Reply">
                    <i class="fa-solid fa-reply"></i>
                </button>
                <button class="action-btn forward-btn" title="Forward">
                    <i class="fa-solid fa-share"></i>
                </button>
                <button class="action-btn more-btn" title="More actions">
                    <i class="fa-solid fa-ellipsis-v"></i>
                </button>
            </div>
        </div>
    `;

    // Add action button handlers
    header.querySelector('.reply-btn').addEventListener('click', () => {
        this.emailOps.replyToEmail();
    });

    header.querySelector('.forward-btn').addEventListener('click', () => {
        this.emailOps.forwardEmail();
    });

    header.querySelector('.more-btn').addEventListener('click', (e) => {
        e.stopPropagation();
        const menu = document.createElement('div');
        menu.className = 'popup-menu';
        menu.innerHTML = `
            <div class="menu-item" data-action="replyAll">
                <i class="fa-solid fa-reply-all"></i>
                Reply All
            </div>
            <div class="menu-item" data-action="archive">
                <i class="fa-solid fa-box-archive"></i>
                Archive
            </div>
            <div class="menu-item" data-action="spam">
                <i class="fa-solid fa-ban"></i>
                Mark as Spam
            </div>
            <div class="menu-item" data-action="delete">
                <i class="fa-regular fa-trash-can"></i>
                Delete
            </div>
        `;

        // Position menu below button
        const rect = e.target.getBoundingClientRect();
        menu.style.top = `${rect.bottom + 5}px`;
        menu.style.right = `${window.innerWidth - rect.right}px`;
        document.body.appendChild(menu);

        // Handle menu item clicks
        menu.addEventListener('click', (e) => {
            const action = e.target.closest('.menu-item')?.dataset.action;
            if (!action) return;

            switch(action) {
                case 'replyAll': this.emailOps.replyAllToEmail(); break;
                case 'archive': this.emailOps.archiveSelected([email.id]); break;
                case 'spam': this.emailOps.markAsSpam(); break;
                case 'delete': this.emailOps.deleteEmail(); break;
            }
            menu.remove();
        });

        // Close menu when clicking outside
        const closeMenu = (e) => {
            if (!menu.contains(e.target)) {
                menu.remove();
                document.removeEventListener('click', closeMenu);
            }
        };
        document.addEventListener('click', closeMenu);
    });

    // Add back button handler
    const backBtn = document.getElementById('backToList');
    if (backBtn) {
        backBtn.onclick = () => this.showEmailList();
    }

    // Hide other views
    document.getElementById('noSelection').style.display = 'none';
    document.getElementById('emailComposer').style.display = 'none';

    // Update email content in iframe
    const emailContainer = document.getElementById('emailBody');
    emailContainer.innerHTML = '';
    
    const iframe = document.createElement('iframe');
    iframe.setAttribute('sandbox', 'allow-same-origin allow-scripts allow-popups');
    iframe.style.width = '100%';
    iframe.style.border = 'none';
    iframe.style.height = '500px';
    emailContainer.appendChild(iframe);

    iframe.srcdoc = `
        <!DOCTYPE html>
        <html>
        <head>
            <base target="_blank">
            <style>
                body {
                    margin: 0;
                    padding: 16px;
                    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                    overflow-y: auto;
                }
                img { max-width: 100%; height: auto; }
                a { color: #1a73e8; }
            </style>
        </head>
        <body>${email.content}</body>
        </html>
    `;

    // Display attachments if any
    if (email.attachments && email.attachments.length > 0) {
        this.displayAttachments(email.attachments);
    }
}

function sanitizeHTML(html) {
    console.log('Starting HTML sanitization');
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');

    doc.querySelectorAll('a').forEach(link => {
        const url = link.getAttribute('href');
        console.log('Processing link:', url);
        
        link.addEventListener('click', async (e) => {
            e.preventDefault();
            console.log('Link clicked:', url);
            
            link.classList.add('checking');
            console.log('Starting link safety check');
            
            const isSafe = await checkLinkSafety(url);
            console.log('Link safety check result:', isSafe);
            
            link.classList.remove('checking');
            
            if (isSafe) {
                console.log('Opening safe link');
                window.open(url, '_blank', 'noopener,noreferrer');
            } else {
                console.log('Blocked unsafe link');
                showNotification('This link appears to be unsafe', 'warning');
            }
        });
    });

    return doc.body.innerHTML;
}

function showEmailList() {
    document.getElementById('emailView').style.display = 'none';
    document.getElementById('emailList').style.display = 'block';
    document.getElementById('noSelection').style.display = 'none';
    document.getElementById('emailComposer').style.display = 'none';
}

function showAIPopup(content) {
    const popup = document.getElementById('aiPopup');
    const popupContent = popup.querySelector('.popup-content');
    
    // Show loading state
    if (content === 'loading') {
        popupContent.innerHTML = `
            <div class="ai-loading">
                <i class="fa-solid fa-circle-notch fa-spin"></i>
                Processing your request...
            </div>
        `;
    } else {
        popupContent.innerHTML = content;
    }
    
    popup.style.display = 'block';
    
    document.getElementById('closeAIPopup').addEventListener('click', () => {
        popup.style.display = 'none';
    });
}

function setupContextMenus() {
    // Email list context menu
    const emailList = document.getElementById('emailList');
    emailList.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        const emailItem = e.target.closest('.email-item');
        if (!emailItem) return;

        const menu = document.createElement('div');
        menu.className = 'context-menu';
        menu.innerHTML = `
            <div class="menu-item" data-action="read">
                <i class="fa-solid fa-envelope-open"></i>
                Mark as read
            </div>
            <div class="menu-item" data-action="unread">
                <i class="fa-solid fa-envelope"></i>
                Mark as unread
            </div>
            <div class="menu-item" data-action="star">
                <i class="fa-regular fa-star"></i>
                Star
            </div>
            <div class="separator"></div>
            <div class="menu-item" data-action="archive">
                <i class="fa-solid fa-box-archive"></i>
                Archive
            </div>
            <div class="menu-item" data-action="spam">
                <i class="fa-solid fa-ban"></i>
                Mark as spam
            </div>
            <div class="menu-item" data-action="delete">
                <i class="fa-regular fa-trash-can"></i>
                Delete
            </div>
        `;

        // Position the menu
        menu.style.left = e.pageX + 'px';
        menu.style.top = e.pageY + 'px';
        document.body.appendChild(menu);

        // Handle menu item clicks
        menu.addEventListener('click', (event) => {
            const action = event.target.dataset.action;
            if (action) {
                const email = this.emails.find(e => e.id === emailItem.dataset.emailId);
                if (!email) return;

                switch (action) {
                    case 'read': this.markAsRead([email.id]); break;
                    case 'unread': this.markAsUnread([email.id]); break;
                    case 'star': this.toggleStarred(email.id); break;
                    case 'archive': this.archiveSelected([email.id]); break;
                    case 'spam': this.markAsSpam([email.id]); break;
                    case 'delete': this.deleteSelected([email.id]); break;
                }
                menu.remove();
            }
        });

        // Close menu when clicking outside
        document.addEventListener('click', function closeMenu(event) {
            if (!menu.contains(event.target)) {
                menu.remove();
                document.removeEventListener('click', closeMenu);
            }
        });
    });

    // Email content context menu
    const emailView = document.getElementById('emailView');
    emailView.addEventListener('contextmenu', (e) => {
        if (e.target.closest('.email-content')) {
            e.preventDefault();

            const menu = document.createElement('div');
            menu.className = 'context-menu';
            menu.innerHTML = `
                <div class="menu-item" data-action="reply">
                    <i class="fa-solid fa-reply"></i>
                    Reply
                </div>
                <div class="menu-item" data-action="forward">
                    <i class="fa-solid fa-share"></i>
                    Forward
                </div>
                <div class="separator"></div>
                <div class="menu-item" data-action="summarize">
                    <i class="fa-solid fa-robot"></i>
                    Summarize with AI
                </div>
                <div class="menu-item" data-action="analyze">
                    <i class="fa-solid fa-magnifying-glass-chart"></i>
                    Analyze with AI
                </div>
                <div class="menu-item" data-action="suggest">
                    <i class="fa-solid fa-magic"></i>
                    Suggest Response
                </div>
            `;

            // Position the menu
            menu.style.left = e.pageX + 'px';
            menu.style.top = e.pageY + 'px';
            document.body.appendChild(menu);

            // Handle menu item clicks
            menu.addEventListener('click', (event) => {
                const action = event.target.dataset.action;
                if (action) {
                    switch (action) {
                        case 'reply': this.replyToEmail(); break;
                        case 'forward': this.forwardEmail(); break;
                        case 'summarize': this.handleAstroAction('summarize', this.selectedEmail.id); break;
                        case 'analyze': this.handleAstroAction('analyze', this.selectedEmail.id); break;
                        case 'suggest': this.handleAstroAction('suggest', this.selectedEmail.id); break;
                    }
                    menu.remove();
                }
            });

            // Close menu when clicking outside
            document.addEventListener('click', function closeMenu(event) {
                if (!menu.contains(event.target)) {
                    menu.remove();
                    document.removeEventListener('click', closeMenu);
                }
            });
        }
    });
}

function showContextMenu(event, { items, callback }) {
    // Remove any existing context menus
    document.querySelectorAll('.context-menu').forEach(m => m.remove());

    // Create menu
    const menu = document.createElement('div');
    menu.className = 'context-menu';
    
    // Add menu items
    items.forEach(item => {
        if (!item) {
            // Add separator
            menu.appendChild(Object.assign(document.createElement('div'), {
                className: 'separator'
            }));
            return;
        }

        const div = document.createElement('div');
        div.className = 'menu-item';
        div.dataset.action = item.action;
        div.innerHTML = `
            <i class="fa-solid ${item.icon}"></i>
            ${item.label}
        `;
        menu.appendChild(div);
    });

    // Position menu
    document.body.appendChild(menu);
    const rect = menu.getBoundingClientRect();
    const x = Math.min(event.clientX, window.innerWidth - rect.width);
    const y = Math.min(event.clientY, window.innerHeight - rect.height);
    menu.style.left = x + 'px';
    menu.style.top = y + 'px';

    // Handle menu item clicks
    menu.addEventListener('click', (e) => {
        const menuItem = e.target.closest('.menu-item');
        if (menuItem) {
            callback(menuItem.dataset.action);
            menu.remove();
        }
    });

    // Close menu when clicking outside
    document.addEventListener('click', function closeMenu(e) {
        if (!menu.contains(e.target)) {
            menu.remove();
            document.removeEventListener('click', closeMenu);
        }
    });

    // Close menu when pressing Escape
    document.addEventListener('keydown', function closeMenu(e) {
        if (e.key === 'Escape') {
            menu.remove();
            document.removeEventListener('keydown', closeMenu);
        }
    });
}

// Composer related UI methods
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

    function renderEmailsWithCategories() {
        const emailList = document.getElementById('emailList');
        if (!emailList) return;
    
        emailList.innerHTML = '';
    
        // Show/hide category tabs based on folder
        let categoryTabs = document.querySelector('.category-tabs');
        if (!categoryTabs) {
            categoryTabs = this.createCategoryTabs();
        }
    
        // Use either bound context or passed emailOps
        const emailOps = this.emailOps || this;
        
        if (!emailOps.currentFolder || emailOps.currentFolder !== 'INBOX') {
            categoryTabs.style.display = 'none';
            emailOps.renderEmails();
            return;
        }
    
        categoryTabs.style.display = 'flex';
    
        // Get active category from UI or default to primary
        const activeCategory = document.querySelector('.category-tab.active')?.dataset.category || 'primary';
        const emails = emailOps.emailCategories[activeCategory] || [];
    
        // Update category counts
        Object.entries(emailOps.emailCategories || {}).forEach(([category, categoryEmails]) => {
            const unreadCount = categoryEmails.filter(e => !e.read).length;
            const countElement = document.querySelector(`.category-tab[data-category="${category}"] .count`);
            if (countElement) {
                countElement.textContent = unreadCount || '';
                countElement.style.display = unreadCount ? 'block' : 'none';
            }
        });
    
        // Render emails for selected category
        emails.forEach(email => {
            const existingEmail = document.querySelector(`[data-email-id="${email.id}"]`);
            if (existingEmail) {
                // Update existing email item
                updateEmailItem(existingEmail, email, emailOps);
            } else {
                // Create new email item
                const div = createEmailItem(email, emailOps);
                emailList.appendChild(div);
            }
        });
    
        // Update scroll sentinel position
        let sentinel = document.querySelector('.scroll-sentinel');
        if (!sentinel) {
            sentinel = document.createElement('div');
            sentinel.className = 'scroll-sentinel';
            emailList.appendChild(sentinel);
        }
    }

    function createCategoryTabs() {
        // First try to find existing container
        let container = document.querySelector('.category-tabs');

        // If it doesn't exist, create it
        if (!container) {
            container = document.createElement('div');
            container.className = 'category-tabs';

            // Insert after email list header
            const emailListHeader = document.querySelector('.email-list-header');
            if (emailListHeader) {
                emailListHeader.parentNode.insertBefore(container, emailListHeader.nextSibling);
            }
        }

        // Clear existing tabs if any
        container.innerHTML = '';

        ['primary', 'social', 'promotions', 'updates', 'forums'].forEach(category => {
            const details = getCategoryDetails(category);
            const tab = document.createElement('div');
            tab.className = `category-tab ${category === 'primary' ? 'active' : ''}`;
            tab.dataset.category = category;
            tab.innerHTML = `
                <i class="fa-solid ${details.icon}" style="color: ${details.color}"></i>
                <span>${details.name}</span>
                <span class="count"></span>
            `;

            tab.addEventListener('click', () => {
                document.querySelectorAll('.category-tab').forEach(t => t.classList.remove('active'));
                tab.classList.add('active');
                this.renderEmailsWithCategories();
            });

            container.appendChild(tab);
        });

        return container;
    }

    // Add missing renderEmailItem implementation
    function renderEmailItem(email) {
        // Find email item in list by matching its dataset emailId
        const emailItem = document.querySelector(`.email-item[data-email-id="${email.id}"]`);
        if (emailItem) {
            // For instance, mark the email item as active or update its UI
            emailItem.classList.add('active');
        } else {
            console.warn('Email item not found for', email);
        }
    }

function setupEmailList() {
    const emailList = document.getElementById('emailList');
    const container = document.querySelector('.email-list-container');
    let isLoading = false;
    let pullStartY = 0;
    let pullMoveY = 0;
    let lastTouchY = 0;
    const PULL_THRESHOLD = 80;

    // Setup infinite scroll
    const observer = new IntersectionObserver(entries => {
        const lastEntry = entries[entries.length - 1];
        if (lastEntry.isIntersecting && !isLoading) {
            isLoading = true;
            this.loadMoreEmails().finally(() => {
                isLoading = false;
            });
        }
    }, { threshold: 0.5 });

    // Add pull-to-refresh handlers
    container.addEventListener('touchstart', (e) => {
        lastTouchY = e.touches[0].clientY;
        if (emailList.scrollTop <= 0) {
            pullStartY = lastTouchY;
            container.classList.add('pulling');
        }
    }, { passive: true });

    container.addEventListener('touchmove', (e) => {
        const touchY = e.touches[0].clientY;
        const moveDiff = touchY - lastTouchY;
        lastTouchY = touchY;

        if (emailList.scrollTop <= 0 && moveDiff > 0) {
            // Only handle pull-to-refresh when at top and pulling down
            if (container.classList.contains('pulling')) {
                pullMoveY = touchY - pullStartY;
                if (pullMoveY > 0 && pullMoveY < PULL_THRESHOLD) {
                    e.preventDefault();
                    emailList.style.transform = `translateY(${pullMoveY}px)`;
                    const progress = (pullMoveY / PULL_THRESHOLD) * 100;
                    document.querySelector('.refresh-indicator').style.opacity = progress + '%';
                }
            }
        }
    }, { passive: false });

    container.addEventListener('touchend', async () => {
        if (pullMoveY >= PULL_THRESHOLD) {
            // Trigger refresh
            container.classList.add('refreshing');
            await this.loadEmails(this.currentFolder);
        }
        
        // Reset pull state
        container.classList.remove('pulling', 'refreshing');
        emailList.style.transform = '';
        pullStartY = 0;
        pullMoveY = 0;
    });

    // Setup infinite scroll sentinel
    const sentinel = document.createElement('div');
    sentinel.className = 'scroll-sentinel';
    emailList.appendChild(sentinel);
    observer.observe(sentinel);
}

function createEmailItem(email, emailOps) {
    const div = document.createElement('div');
    div.className = `email-item ${email.read ? '' : 'unread'}`;
    div.dataset.emailId = email.id;

    // Add double-click handler
    div.addEventListener('dblclick', (e) => {
        e.stopPropagation();
        emailOps.toggleReadStatus(email.id);
    });

    // Add touch handlers for swipe
    let touchStart = null;
    let touchEnd = null;

    div.addEventListener('touchstart', (e) => {
        touchStart = e.touches[0].clientX;
    });

    div.addEventListener('touchmove', (e) => {
        touchEnd = e.touches[0].clientX;
        const diff = touchStart - touchEnd;
        
        // Show action hints based on swipe direction
        if (Math.abs(diff) > 50) {
            div.style.transform = `translateX(${-diff}px)`;
        }
    });

    div.addEventListener('touchend', () => {
        const diff = touchStart - touchEnd;
        if (Math.abs(diff) > 100) { // Minimum swipe distance
            if (diff > 0) {
                // Swipe left - Archive
                emailOps.archiveSelected([email.id]);
            } else {
                // Swipe right - Mark read/unread
                emailOps.toggleReadStatus(email.id);
            }
        }
        div.style.transform = '';
    });

    updateEmailItem(div, email, emailOps);
    return div;
}

function updateEmailItem(element, email, emailOps) {
    const fromMatch = email.from.match(/(?:"?([^"]*)"?\s)?(?:<?(.+@[^>]+)>?)/);
    const displayName = fromMatch ? (fromMatch[1] || fromMatch[2]) : email.from;
    const date = emailOps.formatEmailDate(email.date);
    const snippet = email.plainText?.substring(0, 140) + (email.plainText?.length > 140 ? '...' : '') || '';

    element.className = `email-item ${email.read ? '' : 'unread'}`;
    element.innerHTML = `
        <div class="email-sender">${displayName}</div>
        <div class="email-content-preview">
            <div class="email-subject">${email.subject}</div>
            <div class="email-snippet">${snippet}</div>
        </div>
        <div class="email-date">${date}</div>
        ${email.hasAttachment ? '<div class="email-attachment"><i class="fa-solid fa-paperclip"></i></div>' : ''}
    `;

    if (email.isSpam) {
        element.classList.add('spam-warning');
        element.setAttribute('title', 'This message may be spam');
    }

    // Ensure click handler is attached
    element.onclick = () => emailOps.showEmail(email);
}

function initializeSearch() {
    const searchInput = document.getElementById('searchInput');
    const searchHistory = JSON.parse(localStorage.getItem('searchHistory') || '[]');
    
    // Create search suggestions container
    const suggestionsDiv = document.createElement('div');
    suggestionsDiv.className = 'search-suggestions';
    searchInput.parentNode.appendChild(suggestionsDiv);

    searchInput.addEventListener('input', debounce((e) => {
        const query = e.target.value;
        if (query.length >= 2) {
            const matches = searchHistory.filter(h => 
                h.toLowerCase().includes(query.toLowerCase())
            ).slice(0, 5);
            
            showSearchSuggestions(matches, suggestionsDiv, searchInput);
        } else {
            suggestionsDiv.style.display = 'none';
        }
    }, 200));
}

function showSearchSuggestions(suggestions, container, searchInput) {
    container.innerHTML = '';
    
    if (!suggestions.length) {
        container.style.display = 'none';
        return;
    }

    suggestions.forEach(suggestion => {
        const div = document.createElement('div');
        div.className = 'search-suggestion';
        div.textContent = suggestion;
        div.addEventListener('click', () => {
            searchInput.value = suggestion;
            container.style.display = 'none';
            this.searchEmails(suggestion);
        });
        container.appendChild(div);
    });

    container.style.display = 'block';
}

function handleKeyboardNavigation(e) {
    const emailList = document.getElementById('emailList');
    const selected = emailList.querySelector('.email-item.selected');
    
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        
        const items = Array.from(emailList.querySelectorAll('.email-item'));
        const currentIndex = items.indexOf(selected);
        let nextIndex;
        
        if (e.key === 'ArrowDown') {
            nextIndex = currentIndex < items.length - 1 ? currentIndex + 1 : 0;
        } else {
            nextIndex = currentIndex > 0 ? currentIndex - 1 : items.length - 1;
        }
        
        items.forEach(item => item.classList.remove('selected'));
        items[nextIndex].classList.add('selected');
        items[nextIndex].scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
}

// --- MARKER: END OF UI AND EVENT HANDLING SECTION ---

export const UIHandler = {
    setupEventListeners,
    renderEmails,
    showEmail,
    showEmailList,
    setupContextMenus,
    showContextMenu, // Add this
    initializeComposer,
    renderEmailsWithCategories,
    createCategoryTabs,
    renderEmailItem,   // now defined
    showAIPopup, // new function to display AI responses in popup
    setupEmailList,
    createEmailItem,
    updateEmailItem,
    initializeSearch, // Add this
    showSearchSuggestions, // Add this
    handleKeyboardNavigation, // Add this
    setEmailOps(emailOps) {
        this.emailOps = emailOps;
    }
};

// Create and export singleton instance
const uiHandler = {
    ...UIHandler,
    emailOps: null,
    setEmailOps(emailOps) {
        this.emailOps = emailOps;
        // Mirror needed methods
        this.formatEmailDate = emailOps.formatEmailDate;
        this.formatFullDate = emailOps.formatFullDate;
        this.sanitizeHTML = emailOps.sanitizeHTML;
        this.displayAttachments = emailOps.displayAttachments;
    }
};

// Make it globally available
window.uiHandler = uiHandler;

export default uiHandler;