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

async function checkLinkSafety(url) {
    try {
        const response = await fetch('/.netlify/functions/check-link', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ url })
        });
        
        if (!response.ok) {
            throw new Error('Link check failed');
        }
        
        const data = await response.json();
        return data.safe;
    } catch (error) {
        console.error('Link safety check failed:', error);
        return false;
    }
}

function sanitizeHTML(html) {
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');

    // Process links with safety checks
    doc.querySelectorAll('a').forEach(link => {
        const url = link.getAttribute('href');
        if (url) {
            // Add basic security attributes
            link.setAttribute('target', '_blank');
            link.setAttribute('rel', 'noopener noreferrer');
            
            // Add click handler for safety check
            link.addEventListener('click', async (e) => {
                e.preventDefault();
                link.classList.add('checking');
                
                const isSafe = await checkLinkSafety(url);
                link.classList.remove('checking');
                
                if (isSafe) {
                    window.open(url, '_blank', 'noopener,noreferrer');
                } else {
                    showNotification('This link appears to be unsafe', 'warning');
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