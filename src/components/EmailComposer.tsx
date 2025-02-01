import React, { useState } from 'react';
import { Email, EmailService } from '../types/EmailTypes';
import styles from '../styles/EmailComposer.module.css';

interface EmailComposerProps {
    services: EmailService[];
    onSend: (email: Partial<Email>, service: EmailService) => Promise<void>;
}

export const EmailComposer: React.FC<EmailComposerProps> = ({ services, onSend }) => {
    const [selectedService, setSelectedService] = useState<EmailService | null>(null);
    const [to, setTo] = useState('');
    const [subject, setSubject] = useState('');
    const [body, setBody] = useState('');

    const handleSend = async () => {
        if (!selectedService) return;
        
        await onSend({
            to: to.split(',').map(e => e.trim()),
            subject,
            body,
            date: new Date()
        }, selectedService);
    };

    return (
        <div className={styles.composer}>
            <div className={styles.header}>New Message</div>
            <div className={styles.field}>
                <select
                    value={selectedService?.id || ''}
                    onChange={(e) => setSelectedService(services.find(s => s.id === e.target.value) || null)}
                >
                    <option value="">Select email service</option>
                    {services.map(service => (
                        <option key={service.id} value={service.id}>
                            {service.name}
                        </option>
                    ))}
                </select>
            </div>
            <div className={styles.field}>
                <input
                    type="text"
                    placeholder="To"
                    value={to}
                    onChange={(e) => setTo(e.target.value)}
                />
            </div>
            <div className={styles.field}>
                <input
                    type="text"
                    placeholder="Subject"
                    value={subject}
                    onChange={(e) => setSubject(e.target.value)}
                />
            </div>
            <div className={styles.field}>
                <textarea
                    placeholder="Body"
                    value={body}
                    onChange={(e) => setBody(e.target.value)}
                />
            </div>
            <button className={styles.sendButton} onClick={handleSend}>Send</button>
        </div>
    );
};
