// Category definitions with rules
export const categories = {
    primary: {
        name: 'Primary',
        icon: 'fa-inbox',
        color: '#1a73e8',
        rules: {
            domains: [
                'gmail.com', 'outlook.com', 'yahoo.com', 'hotmail.com',
                'protonmail.com', 'icloud.com', 'mail.com'
            ],
            keywords: [
                'invoice', 'receipt', 'account', 'important', 'report',
                'meeting', 'deadline', 'urgent', 'contract', 'agreement',
                'payment', 'schedule', 'appointment', 'confirmation',
                'tax', 'document', 'statement', 'bill'
            ],
            senderPatterns: [
                /^(?!.*(@news|@marketing|@promo|@mail|@info))/i,
                /^[a-zA-Z.]+@/i // Personal email patterns
            ],
            priority: 'high'
        }
    },
    social: {
        name: 'Social',
        icon: 'fa-users',
        color: '#1DA1F2',
        rules: {
            domains: [
                'facebook.com', 'twitter.com', 'instagram.com', 'linkedin.com',
                'tiktok.com', 'pinterest.com', 'reddit.com', 'tumblr.com',
                'snapchat.com', 'discord.com', 'slack.com', 'whatsapp.com',
                'messenger.com', 'meet.google.com', 'zoom.us'
            ],
            keywords: [
                'friend request', 'following', 'follower', 'connection',
                'network', 'liked', 'shared', 'commented', 'social',
                'group', 'invitation', 'join', 'follow', 'profile',
                'post', 'story', 'tweet', 'message', 'chat', 'meeting'
            ],
            senderPatterns: [
                /@(social|community|friends|group|notification)/i
            ]
        }
    },
    promotions: {
        name: 'Promotions',
        icon: 'fa-tag',
        color: '#34A853',
        rules: {
            domains: [
                'marketing', 'newsletter', 'info', 'sales', 'promotions',
                'deals', 'offers', 'discount'
            ],
            keywords: [
                'off', 'sale', 'discount', 'deal', 'offer', 'limited time',
                'exclusive', 'promotion', 'coupon', 'promo', 'special'
            ]
        }
    },
    updates: {
        name: 'Updates',
        icon: 'fa-bell',
        color: '#EA4335',
        rules: {
            domains: [
                'noreply', 'notification', 'updates', 'alert', 'system',
                'service', 'status', 'admin'
            ],
            keywords: [
                'update', 'alert', 'notification', 'status', 'change',
                'confirm', 'verification', 'security', 'password'
            ]
        }
    },
    forums: {
        name: 'Forums',
        icon: 'fa-comments',
        color: '#FBBC05',
        rules: {
            domains: [
                'forum', 'community', 'groups', 'discuss', 'support',
                'help', 'board'
            ],
            keywords: [
                'forum', 'discussion', 'thread', 'reply', 'community',
                'topic', 'post', 'question', 'answer'
            ]
        }
    }
};

// Enhanced categorization function
export function categorizeEmail(email) {
    // First check for explicit categories from Gmail
    if (email.labelIds) {
        if (email.labelIds.includes('CATEGORY_SOCIAL')) return 'social';
        if (email.labelIds.includes('CATEGORY_PROMOTIONS')) return 'promotions';
        if (email.labelIds.includes('CATEGORY_UPDATES')) return 'updates';
        if (email.labelIds.includes('CATEGORY_FORUMS')) return 'forums';
    }

    // Get scores for each category
    const scores = Object.entries(categories).map(([category, config]) => {
        const score = calculateCategoryScore(email, config.rules);
        return { category, score };
    });

    // Make it easier for emails to be classified as primary
    const highestScore = Math.max(...scores.map(s => s.score));
    const primaryScore = scores.find(s => s.category === 'primary')?.score || 0;

    // If no category has a significantly higher score, default to primary
    if (highestScore - primaryScore < 3) {
        return 'primary';
    }

    // Otherwise, use the highest scoring category
    return scores.reduce((prev, curr) => 
        curr.score > prev.score ? curr : prev
    ).category;
}

function calculateCategoryScore(emailContent, rules) {
    let score = 0;
    const fullContent = `${emailContent.subject} ${emailContent.snippet} ${emailContent.body}`;

    // Domain matching (highest weight)
    if (rules.domains) {
        rules.domains.forEach(domain => {
            if (emailContent.from.includes(domain)) {
                score += 5;
            }
        });
    }

    // Sender pattern matching
    if (rules.senderPatterns) {
        rules.senderPatterns.forEach(pattern => {
            if (pattern.test(emailContent.from)) {
                score += 3;
            }
        });
    }

    // Keyword matching
    if (rules.keywords) {
        rules.keywords.forEach(keyword => {
            // Use word boundary matching for more accurate results
            const regex = new RegExp(`\\b${keyword}\\b`, 'i');
            if (regex.test(fullContent)) {
                score += 1;
            }
            // Extra weight for keywords in subject
            if (regex.test(emailContent.subject)) {
                score += 2;
            }
        });
    }

    // Priority boost
    if (rules.priority === 'high' && score > 0) {
        score *= 1.5;
    }

    return score;
}

export function getCategoryDetails(categoryId) {
    return categories[categoryId] || categories.primary;
}
