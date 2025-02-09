import { showNotification } from './shared/utils.js';

// --- MARKER: START OF UTILITY FUNCTIONS SECTION ---
// Helper functions for various operations
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

function sanitizeHTML(html) {
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

function validateEmailInput(to, subject, body) {
    if (!to || !subject || !body) {
        showNotification('Please fill all fields', 'warning');
        return false;
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(to)) {
        showNotification('Please enter a valid email address', 'warning');
        return false;
    }

    return true;
}

// Other utility methods like decoding, conversion, etc.
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
// --- MARKER: END OF UTILITY FUNCTIONS SECTION ---

export const Helpers = {
    formatEmailDate,
    sanitizeHTML,
    decodeBase64,
    validateEmailInput,
    // ...other helper methods...
};