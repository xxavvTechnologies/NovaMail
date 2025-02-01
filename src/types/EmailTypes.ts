export interface Email {
    id: string;
    from: string;
    to: string[];
    subject: string;
    body: string;
    date: Date;
    read: boolean;
    attachments?: Attachment[];
}

export interface Attachment {
    filename: string;
    content: Blob;
    contentType: string;
}

export interface EmailService {
    id: string;
    name: string;
    type: 'gmail' | 'outlook' | 'imap';
    connect(): Promise<void>;
    fetchEmails(): Promise<Email[]>;
    sendEmail(email: Partial<Email>): Promise<void>;
}
