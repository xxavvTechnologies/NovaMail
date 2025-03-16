// Category definitions with rules
export const categories = {
    primary: {
        name: 'Primary',
        icon: 'fa-inbox',
        color: '#1a73e8',
        rules: {
            priority: 'high',
            // Personal communication patterns
            senderPatterns: [
                /^[a-zA-Z.]+@/i,  // Direct person-to-person emails
                /^(?!.*(@news|@marketing|@promo|@mail|@info|@no-reply))/i,
            ],
            // Important keywords
            keywords: [
                'urgent', 'important', 'action', 'required',
                'deadline', 'meeting', 'report', 'review',
                'approved', 'confirmation', 'account', 'payment',
                'invoice', 'contract', 'document', 'password',
                'security', 'team', 'project', 'update'
            ],
            // Trust score boost for recognized domains
            trustedDomains: [
                'gmail.com', 'outlook.com', 'yahoo.com', 'hotmail.com',
                'apple.com', 'microsoft.com', 'amazon.com', 'github.com',
                'linkedin.com'
            ],
            weight: 1.5  // Give primary category more weight
        }
    },
    social: {
        name: 'Social',
        icon: 'fa-users',
        color: '#1DA1F2',
        rules: {
            domains: [
                'facebook.com', 'instagram.com', 'twitter.com', 
                'linkedin.com', 'pinterest.com', 'tiktok.com',
                'snapchat.com', 'discord.com', 'slack.com'
            ],
            keywords: [
                'friend', 'follow', 'like', 'share', 'connect',
                'profile', 'invitation', 'network', 'join',
                'group', 'community', 'social', 'post'
            ],
            senderPatterns: [
                /@.*?(social|community|notification|connect)/i
            ],
            weight: 1.0
        }
    },
    promotions: {
        name: 'Promotions',
        icon: 'fa-tag',
        color: '#34A853',
        rules: {
            domains: [
                'marketing', 'newsletter', 'news', 'offer',
                'discount', 'sale', 'deals', 'promotions'
            ],
            keywords: [
                'off', 'save', 'sale', 'deal', 'special',
                'discount', 'promo', 'coupon', 'offer',
                'limited time', 'exclusively', 'subscription'
            ],
            senderPatterns: [
                /@.*?(marketing|promo|offer|sales|newsletter)/i,
                /^promotions@/i,
                /^offers@/i
            ],
            weight: 0.8
        }
    },
    updates: {
        name: 'Updates',
        icon: 'fa-bell',
        color: '#EA4335',
        rules: {
            senderPatterns: [
                /@.*?(update|notification|alert|notice|info|verify)/i,
                /^no-reply@/i,
                /^noreply@/i,
                /^notification@/i
            ],
            keywords: [
                'update', 'alert', 'notification', 'status',
                'confirm', 'verify', 'security', 'notice',
                'reminder', 'subscription', 'account'
            ],
            weight: 0.9
        }
    },
    forums: {
        name: 'Forums',
        icon: 'fa-comments',
        color: '#FBBC05',
        rules: {
            domains: [
                'forum', 'community', 'discuss', 'support',
                'help', 'groups', 'answers'
            ],
            keywords: [
                'forum', 'thread', 'topic', 'discussion',
                'reply', 'posted', 'comment', 'question',
                'answer', 'community', 'support'
            ],
            senderPatterns: [
                /@.*?(forum|community|support|discuss)/i
            ],
            weight: 0.7
        }
    }
};

// Improved categorization function
export function calculateCategoryScore(email, rules) {
    let score = 0;
    
    // Process from address
    const fromAddress = email.from.toLowerCase();
    
    // Check sender patterns
    if (rules.senderPatterns) {
        if (rules.senderPatterns.some(pattern => pattern.test(fromAddress))) {
            score += 30;
        }
    }

    // Check domains
    if (rules.domains) {
        const emailDomain = fromAddress.split('@')[1];
        if (rules.domains.some(domain => emailDomain?.includes(domain))) {
            score += 25;
        }
    }

    // Check trusted domains for primary category
    if (rules.trustedDomains) {
        const emailDomain = fromAddress.split('@')[1];
        if (rules.trustedDomains.includes(emailDomain)) {
            score += 20;
        }
    }

    // Check keywords in subject and snippet
    if (rules.keywords) {
        const content = `${email.subject} ${email.snippet}`.toLowerCase();
        const matchedKeywords = rules.keywords.filter(keyword => 
            content.includes(keyword.toLowerCase())
        );
        score += matchedKeywords.length * 10;
    }

    // Apply category weight
    score *= (rules.weight || 1.0);

    return score;
}

export function categorizeEmail(email) {
    // First check Gmail's native categories if available
    if (email.labelIds) {
        const gmailCategory = getGmailCategory(email.labelIds);
        if (gmailCategory) return gmailCategory;
    }

    // Calculate scores for each category
    const scores = Object.entries(categories).map(([category, config]) => ({
        category,
        score: calculateCategoryScore(email, config.rules)
    }));

    // Sort by score descending
    scores.sort((a, b) => b.score - a.score);

    // If highest score is significantly higher than others, use it
    if (scores[0].score > scores[1].score * 1.5) {
        return scores[0].category;
    }

    // If primary has a decent score, prefer it
    const primaryScore = scores.find(s => s.category === 'primary')?.score || 0;
    if (primaryScore > 30) {
        return 'primary';
    }

    // Otherwise use highest score
    return scores[0].category;
}

function getGmailCategory(labelIds) {
    const categoryMap = {
        'CATEGORY_SOCIAL': 'social',
        'CATEGORY_PROMOTIONS': 'promotions',
        'CATEGORY_UPDATES': 'updates',
        'CATEGORY_FORUMS': 'forums'
    };

    for (const [gmailLabel, category] of Object.entries(categoryMap)) {
        if (labelIds.includes(gmailLabel)) return category;
    }
    return null;
}

export function getCategoryDetails(categoryId) {
    return categories[categoryId] || categories.primary;
}
