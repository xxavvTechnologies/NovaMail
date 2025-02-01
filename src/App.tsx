import React, { useState, useEffect } from 'react';
import { EmailList } from './components/EmailList';
import { EmailComposer } from './components/EmailComposer';
import { Email, EmailService } from './types/EmailTypes';
import { GmailService } from './services/GmailService';
import styles from './styles/App.module.css';

const App: React.FC = () => {
    const [emails, setEmails] = useState<Email[]>([]);
    const [services, setServices] = useState<EmailService[]>([]);
    const [selectedEmail, setSelectedEmail] = useState<Email | null>(null);
    const [showComposer, setShowComposer] = useState(false);

    useEffect(() => {
        // Initialize email services
        const gmailService = new GmailService('gmail-1');
        setServices([gmailService]);
    }, []);

    const handleSendEmail = async (email: Partial<Email>, service: EmailService) => {
        await service.sendEmail(email);
        setShowComposer(false);
    };

    return (
        <div className={styles.app}>
            <div className={styles.sidebar}>
                <button className={styles.newEmailButton} onClick={() => setShowComposer(true)}>
                    New Email
                </button>
                <EmailList 
                    emails={emails}
                    onEmailSelect={setSelectedEmail}
                />
            </div>
            <div className={styles.mainContent}>
                {showComposer ? (
                    <EmailComposer
                        services={services}
                        onSend={handleSendEmail}
                    />
                ) : selectedEmail ? (
                    <div className="email-view">
                        <h2>{selectedEmail.subject}</h2>
                        <p>From: {selectedEmail.from}</p>
                        <p>To: {selectedEmail.to.join(', ')}</p>
                        <div className="email-body">{selectedEmail.body}</div>
                    </div>
                ) : (
                    <div className="no-selection">
                        Select an email to view or compose a new one
                    </div>
                )}
            </div>
        </div>
    );
};

export default App;
