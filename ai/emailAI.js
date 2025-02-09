export class EmailAI {
    constructor() {
        this.confidenceThreshold = 0.7;
        // Free Hugging Face API token - replace with your own from huggingface.co
        this.HF_API_TOKEN = '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'; // Get from https://huggingface.co/settings/tokens
        this.API_URL = 'https://api-inference.huggingface.co/models/';
        this.MODELS = {
            summarization: 'facebook/bart-large-cnn',
            sentiment: 'nlptown/bert-base-multilingual-uncased-sentiment',
            classification: 'facebook/bart-large-mnli',
            questionAnswering: 'deepset/roberta-base-squad2'
        };
        this.setupListeners();
        this.responseContainer = null;
    }

    setupListeners() {
        // Attach listeners when an email is shown
        document.addEventListener('emailShown', (e) => {
            const email = e.detail;
            this.attachButtonListeners(email);
        });
    }

    attachButtonListeners(email) {
        // Initialize response container
        this.responseContainer = document.getElementById('aiResponse');
        
        const buttons = {
            'summarizeBtn': () => this.generateSmartSummary(email),
            'analyzeBtn': () => this.analyzeEmail(email),
            'extractBtn': () => this.extractKeyInformation(email),
            'suggestBtn': () => this.generateResponseSuggestion(email)
        };

        Object.entries(buttons).forEach(([id, handler]) => {
            const button = document.getElementById(id);
            if (!button) return;

            // Remove old listeners
            button.replaceWith(button.cloneNode(true));
            
            // Add new listener
            document.getElementById(id).addEventListener('click', async () => {
                const btn = document.getElementById(id);
                try {
                    console.log(`Starting ${id} operation...`);
                    this.showLoading(btn.textContent);
                    btn.classList.add('loading');
                    const result = await handler();
                    console.log(`${id} operation completed:`, result);
                    this.showResult(result);
                } catch (error) {
                    console.error(`${id} operation failed:`, error);
                    this.showError(error);
                } finally {
                    btn.classList.remove('loading');
                }
            });
        });
    }

    showLoading(action) {
        if (!this.responseContainer) return;
        this.responseContainer.className = 'ai-response loading';
        this.responseContainer.innerHTML = `
            <i class="fa-solid fa-circle-notch"></i>
            Astro is ${action.toLowerCase()}ing this email...
        `;
    }

    showResult(result) {
        if (!this.responseContainer) return;
        this.responseContainer.className = 'ai-response success';
        
        let formattedContent = '';
        if (typeof result === 'string') {
            formattedContent = `<p>${result}</p>`;
        } else if (result.sentiment) {
            formattedContent = `
                <h4>Analysis Results</h4>
                <p><strong>Sentiment:</strong> ${result.sentiment.label}</p>
                <p><strong>Priority:</strong> ${result.priority}</p>
                ${result.actionItems?.length ? 
                    `<p><strong>Action Items:</strong> ${result.actionItems.join(', ')}</p>` : 
                    ''}
            `;
        } else if (result.actionItem) {
            formattedContent = `
                <h4>Key Information</h4>
                <p><strong>Action Item:</strong> ${result.actionItem}</p>
                <p><strong>Deadline:</strong> ${result.deadline || 'None specified'}</p>
                <p><strong>Key People:</strong> ${result.keyPeople || 'None specified'}</p>
            `;
        }

        this.responseContainer.innerHTML = formattedContent;
        this.showNotification('Analysis complete', 'success');
    }

    showError(error) {
        console.error('AI Error:', error);
        
        if (!this.responseContainer) return;
        this.responseContainer.className = 'ai-response error';
        
        let errorMessage = 'An error occurred while processing your request.';
        if (error.message.includes('API')) {
            errorMessage = 'Unable to reach AI service. Please try again later.';
        } else if (error.message.includes('rate limit')) {
            errorMessage = 'Too many requests. Please wait a moment.';
        }
        
        this.responseContainer.innerHTML = `
            <i class="fa-solid fa-triangle-exclamation"></i>
            ${errorMessage}
        `;
        
        this.showNotification(errorMessage, 'error');
    }

    showNotification(message, type) {
        const notification = document.getElementById('notification');
        notification.textContent = message;
        notification.className = `notification ${type}`;
        notification.style.display = 'block';
        
        setTimeout(() => {
            notification.style.display = 'none';
        }, 3000);
    }

    async callHuggingFaceAPI(model, inputs) {
        try {
            const response = await fetch(`${this.API_URL}${model}`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${this.HF_API_TOKEN}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ inputs })
            });

            return await response.json();
        } catch (error) {
            console.error('AI API Error:', error);
            return null;
        }
    }

    async generateSmartSummary(email) {
        const content = `${email.subject}\n\n${email.content}`;
        try {
            const result = await this.callHuggingFaceAPI(
                this.MODELS.summarization,
                content
            );
            
            if (result && result[0] && result[0].summary_text) {
                return result[0].summary_text;
            }
            return this.fallbackSummary(content);
        } catch (error) {
            console.error('Summary generation failed:', error);
            return this.fallbackSummary(content);
        }
    }

    async detectEmotionalTone(email) {
        const content = `${email.subject} ${email.snippet}`;
        try {
            const result = await this.callHuggingFaceAPI(
                this.MODELS.sentiment,
                content
            );
            
            if (result && result[0] && result[0].label) {
                return {
                    tone: result[0].label,
                    confidence: result[0].score
                };
            }
        } catch (error) {
            console.error('Tone detection failed:', error);
        }
        return this.analyzeSentiment(email); // Fallback to basic sentiment
    }

    async detectUrgency(email) {
        const premise = `${email.subject} ${email.snippet}`;
        const hypothesis = "This email requires urgent attention.";
        
        try {
            const result = await this.callHuggingFaceAPI(
                this.MODELS.classification,
                { premise, hypothesis }
            );
            
            if (result && result.labels) {
                return {
                    isUrgent: result.labels[0] === 'entailment',
                    confidence: result.scores[0]
                };
            }
        } catch (error) {
            console.error('Urgency detection failed:', error);
        }
        
        // Fallback to keyword-based detection
        return this.detectPriority(email) === 'high';
    }

    async extractKeyInformation(email) {
        const content = `${email.subject}\n\n${email.content}`;
        const questions = [
            "What is the main request or action item?",
            "When is the deadline?",
            "Who are the key people involved?",
            "What are the next steps?"
        ];

        try {
            const answers = await Promise.all(questions.map(async question => {
                const result = await this.callHuggingFaceAPI(
                    this.MODELS.questionAnswering,
                    {
                        question,
                        context: content
                    }
                );
                return {
                    question,
                    answer: result?.answer || 'Not found'
                };
            }));

            return {
                actionItem: answers[0].answer,
                deadline: answers[1].answer,
                keyPeople: answers[2].answer,
                nextSteps: answers[3].answer
            };
        } catch (error) {
            console.error('Key information extraction failed:', error);
            return null;
        }
    }

    async analyzeEmail(email) {
        try {
            const [summary, tone, urgency, keyInfo] = await Promise.all([
                this.generateSmartSummary(email),
                this.detectEmotionalTone(email),
                this.detectUrgency(email),
                this.extractKeyInformation(email)
            ]);

            return {
                priority: await this.detectPriority(email),
                sentiment: await this.analyzeSentiment(email),
                suggestedResponse: await this.generateResponseSuggestion(email),
                summary: await this.generateSummary(email),
                actionItems: await this.extractActionItems(email),
                smartLabels: await this.generateSmartLabels(email),
                meetingDetails: await this.extractMeetingDetails(email),
                deadlines: await this.extractDeadlines(email),
                isAutomated: this.detectAutomatedEmail(email),
                smartSummary: summary,
                emotionalTone: tone,
                urgency,
                keyInformation: keyInfo
            };
        } catch (error) {
            console.error('Enhanced email analysis failed:', error);
            return null;
        }
    }

    async detectPriority(email) {
        const priorityIndicators = {
            high: ['urgent', 'asap', 'immediate', 'deadline', 'important', 'priority'],
            medium: ['review', 'update', 'attention', 'please respond', 'confirm'],
            low: ['newsletter', 'subscription', 'fyi', 'for your information']
        };

        const content = `${email.subject} ${email.snippet}`.toLowerCase();
        
        // Check for explicit priority markers
        if (email.headers?.['X-Priority'] || email.headers?.['Importance']) {
            const explicitPriority = email.headers['X-Priority'] || email.headers['Importance'];
            if (['1', 'high'].includes(explicitPriority.toLowerCase())) return 'high';
            if (['3', 'normal'].includes(explicitPriority.toLowerCase())) return 'medium';
            if (['5', 'low'].includes(explicitPriority.toLowerCase())) return 'low';
        }

        // Check content against priority indicators
        for (const [level, indicators] of Object.entries(priorityIndicators)) {
            if (indicators.some(indicator => content.includes(indicator))) {
                return level;
            }
        }

        return 'medium';
    }

    async analyzeSentiment(email) {
        const content = `${email.subject} ${email.snippet}`;
        const positiveWords = ['thank', 'appreciate', 'great', 'good', 'excellent', 'pleased'];
        const negativeWords = ['issue', 'problem', 'concerned', 'disappointed', 'urgent', 'complaint'];

        let score = 0;
        const words = content.toLowerCase().split(/\W+/);

        words.forEach(word => {
            if (positiveWords.includes(word)) score += 1;
            if (negativeWords.includes(word)) score -= 1;
        });

        return {
            score: score,
            label: score > 0 ? 'positive' : score < 0 ? 'negative' : 'neutral'
        };
    }

    async generateResponseSuggestion(email) {
        const commonResponses = {
            meeting: 'I will attend the meeting.',
            thanks: 'Thank you for your email.',
            confirmation: 'I confirm receipt of your email.',
            followUp: 'I will look into this and get back to you soon.',
        };

        const content = `${email.subject} ${email.snippet}`.toLowerCase();
        
        if (content.includes('meeting') || content.includes('invite')) {
            return commonResponses.meeting;
        } else if (content.includes('thank')) {
            return commonResponses.thanks;
        } else if (content.includes('confirm')) {
            return commonResponses.confirmation;
        }

        return commonResponses.followUp;
    }

    async generateSummary(email) {
        const maxLength = 100;
        let summary = email.snippet || '';

        // Extract key points
        const keyPoints = this.extractKeyPoints(email.content);
        
        // Combine and truncate
        summary = `${keyPoints.join('. ')}`.substring(0, maxLength);
        if (summary.length === maxLength) summary += '...';

        return summary;
    }

    extractKeyPoints(content) {
        const sentences = content.split(/[.!?]+/);
        const keyPoints = [];

        // Simple heuristic: sentences with important keywords
        const importantKeywords = ['key', 'main', 'important', 'summary', 'conclude'];
        
        sentences.forEach(sentence => {
            if (importantKeywords.some(keyword => 
                sentence.toLowerCase().includes(keyword))) {
                keyPoints.push(sentence.trim());
            }
        });

        return keyPoints.slice(0, 3); // Return top 3 key points
    }

    async extractActionItems(email) {
        const actionItems = [];
        const content = `${email.subject} ${email.content}`;
        const lines = content.split('\n');

        const actionIndicators = [
            'please', 'need to', 'action item', 'todo', 'to-do',
            'required', 'must', 'should', 'could you', 'can you'
        ];

        lines.forEach(line => {
            if (actionIndicators.some(indicator => 
                line.toLowerCase().includes(indicator))) {
                actionItems.push(line.trim());
            }
        });

        return actionItems;
    }

    async generateSmartLabels(email) {
        const labels = new Set();
        const content = `${email.subject} ${email.snippet}`.toLowerCase();

        // Define label rules
        const labelRules = {
            'requires-response': ['please respond', 'let me know', 'what do you think'],
            'follow-up': ['following up', 'checking in', 'any updates'],
            'document': ['attached', 'document', 'pdf', 'doc', 'spreadsheet'],
            'meeting': ['meeting', 'calendar', 'schedule', 'discuss'],
            'deadline': ['due', 'deadline', 'by', 'until'],
            'review': ['review', 'feedback', 'thoughts', 'opinion']
        };

        // Apply rules
        Object.entries(labelRules).forEach(([label, keywords]) => {
            if (keywords.some(keyword => content.includes(keyword))) {
                labels.add(label);
            }
        });

        return Array.from(labels);
    }

    async extractMeetingDetails(email) {
        const content = `${email.subject} ${email.content}`;
        
        // Date pattern matching
        const datePattern = /(?:\b\d{1,2}(?:st|nd|rd|th)?\s+(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?\s+\d{4})|(?:\d{1,2}\/\d{1,2}\/\d{2,4})/gi;
        const timePattern = /\b(?:1[0-2]|0?[1-9])(?::[0-5][0-9])?\s*(?:am|pm)\b/gi;
        
        const dates = content.match(datePattern) || [];
        const times = content.match(timePattern) || [];

        return {
            dates,
            times,
            isVirtual: /zoom|meet|teams|webex|virtual/i.test(content),
            location: this.extractLocation(content)
        };
    }

    extractLocation(content) {
        // Look for room numbers, building names, or virtual meeting links
        const locationPatterns = [
            /(?:room|rm\.?)\s+[a-z0-9-]+/i,
            /(?:https?:\/\/)?(?:www\.)?(?:zoom\.us|meet\.google\.com|teams\.microsoft\.com)\/[^\s]*/i,
            /(?:building|bldg\.?)\s+[a-z0-9-]+/i
        ];

        for (const pattern of locationPatterns) {
            const match = content.match(pattern);
            if (match) return match[0];
        }

        return null;
    }

    async extractDeadlines(email) {
        const content = `${email.subject} ${email.content}`;
        const deadlines = [];

        // Date patterns
        const datePatterns = [
            /(?:due|deadline|by|until)\s+(?:on\s+)?(\d{1,2}(?:st|nd|rd|th)?\s+(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?\s+\d{4})/gi,
            /(?:due|deadline|by|until)\s+(?:on\s+)?(\d{1,2}\/\d{1,2}\/\d{2,4})/gi
        ];

        datePatterns.forEach(pattern => {
            let match;
            while ((match = pattern.exec(content)) !== null) {
                deadlines.push({
                    date: match[1],
                    context: content.substring(Math.max(0, match.index - 50), 
                                            Math.min(content.length, match.index + 50))
                });
            }
        });

        return deadlines;
    }

    detectAutomatedEmail(email) {
        const automatedIndicators = [
            'noreply',
            'no-reply',
            'donotreply',
            'automated',
            'system',
            'notification',
            'mailer-daemon',
            'postmaster'
        ];

        const from = email.from.toLowerCase();
        return automatedIndicators.some(indicator => from.includes(indicator));
    }
}

export const emailAI = new EmailAI();
