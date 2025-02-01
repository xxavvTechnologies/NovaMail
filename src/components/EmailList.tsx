import React from 'react';
import { Email } from '../types/EmailTypes';
import styles from '../styles/EmailList.module.css';

interface EmailListProps {
    emails: Email[];
    onEmailSelect: (email: Email) => void;
}

export const EmailList: React.FC<EmailListProps> = ({ emails, onEmailSelect }) => {
    return (
        <div className={styles.emailList}>
            {emails.map((email) => (
                <div
                    key={email.id}
                    className={`${styles.emailItem} ${email.read ? '' : styles.unread}`}
                    onClick={() => onEmailSelect(email)}
                >
                    <div className={styles.sender}>{email.from}</div>
                    <div className={styles.subject}>{email.subject}</div>
                    <div className={styles.date}>
                        {email.date.toLocaleDateString()}
                    </div>
                </div>
            ))}
        </div>
    );
};
