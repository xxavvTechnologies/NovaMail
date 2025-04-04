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

    // Update selected state
    document.querySelectorAll('.email-item').forEach(item => {
        item.classList.remove('selected');
        if (item.dataset.emailId === email.id) {
            item.classList.add('selected');
        }
    });

    const emailView = document.getElementById('emailView');
    const noSelection = document.getElementById('noSelection');
    const emailComposer = document.getElementById('emailComposer');

    // Simply show/hide without transitions
    emailView.style.display = 'flex';
    noSelection.style.display = 'none';
    emailComposer.style.display = 'none';

    // Update header
    const header = document.getElementById('emailHeader');
    header.innerHTML = `
        <button class="back-button" id="backToList">
            <i class="fa-solid fa-arrow-left"></i>
            Back to Inbox
        </button>
        <div class="header-main">
            <h2 id="emailSubject">${this.sanitizeHTML(email.subject || '(No Subject)')}</h2>
            <div class="email-meta">
                <div class="email-address-line">
                    <span class="meta-label">From:</span>
                    <div class="email-address">${this.sanitizeHTML(email.from)}</div>
                </div>
                <div class="email-address-line">
                    <span class="meta-label">To:</span>
                    <div class="email-address">${this.sanitizeHTML(email.to.join(', '))}</div>
                </div>
                <div class="email-address-line">
                    <span class="meta-label">Date:</span>
                    <div>${this.formatFullDate(email.date)}</div>
                </div>
            </div>
        </div>
    `;

    // Setup back button
    document.getElementById('backToList').addEventListener('click', () => {
        emailView.style.display = 'none';
        noSelection.style.display = 'flex';
    });

    // Setup quick action buttons
    document.getElementById('quickReply').addEventListener('click', () => {
        EmailOperations.replyToEmail.call(EmailOperations);
    });
    
    document.getElementById('quickReplyAll').addEventListener('click', () => {
        EmailOperations.replyAllToEmail.call(EmailOperations);
    });
    
    document.getElementById('quickForward').addEventListener('click', () => {
        EmailOperations.forwardEmail.call(EmailOperations);
    });

    // Update email content
    this.renderEmailContent(email);
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
    let isInitialLoad = true;
    
    // Add infinite scroll with debounce
    const observer = new IntersectionObserver(entries => {
        const lastEntry = entries[entries.length - 1];
        if (lastEntry.isIntersecting && !isInitialLoad) {
            this.loadMoreEmails();
        }
    }, { 
        threshold: 0.5,
        rootMargin: '100px' // Load more before reaching the very bottom
    });

    // Add sentinel element for infinite scroll
    let sentinel = document.querySelector('.scroll-sentinel');
    if (!sentinel) {
        sentinel = document.createElement('div');
        sentinel.className = 'scroll-sentinel';
        emailList.appendChild(sentinel);
    }

    // Start observing after initial load completes
    setTimeout(() => {
        observer.observe(sentinel);
        isInitialLoad = false;
    }, 1000);

    // Set up real-time updates
    this.startEmailPolling();
}

function createEmailItem(email, emailOps) {
    const div = document.createElement('div');
    div.className = `email-item ${email.read ? '' : 'unread'}`;
    div.dataset.emailId = email.id;
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
    handleKeyboardNavigation, // Add this
    setEmailOps(emailOps) {
        this.emailOps = emailOps;
    }
};