class NovaMail {
    constructor() {
        this.connectedAccounts = [];
        this.initEventListeners();
    }

    initEventListeners() {
        // Gmail Connection
        document.getElementById('gmail-connect').addEventListener('click', () => {
            this.connectEmailProvider('gmail');
        });

        // Outlook Connection
        document.getElementById('outlook-connect').addEventListener('click', () => {
            this.connectEmailProvider('outlook');
        });

        // iCloud Connection
        document.getElementById('icloud-connect').addEventListener('click', () => {
            this.connectEmailProvider('icloud');
        });
    }

    async connectEmailProvider(provider) {
        try {
            // Simulated OAuth flow - in real implementation, this would 
            // redirect to the specific provider's OAuth endpoint
            const authResult = await this.simulateOAuth(provider);
            
            if (authResult.success) {
                this.addConnectedAccount(provider, authResult.userEmail);
                this.updateUIAfterConnection();
            } else {
                this.showErrorNotification('Connection failed. Please try again.');
            }
        } catch (error) {
            console.error('Provider connection error:', error);
            this.showErrorNotification('An unexpected error occurred.');
        }
    }

    simulateOAuth(provider) {
        // Simulated OAuth - would be replaced with actual OAuth flow in production
        return new Promise((resolve) => {
            setTimeout(() => {
                resolve({
                    success: true,
                    userEmail: `user@${provider}.com`
                });
            }, 1500);
        });
    }

    addConnectedAccount(provider, email) {
        const account = { provider, email };
        this.connectedAccounts.push(account);
        this.saveConnectedAccounts();
    }

    updateUIAfterConnection() {
        const authSection = document.getElementById('auth-section');
        const emailDashboard = document.getElementById('email-dashboard');
        const connectedAccountsSection = document.getElementById('connected-accounts');
        const accountList = document.getElementById('account-list');

        // Hide auth section, show dashboard and connected accounts
        authSection.classList.add('hidden');
        emailDashboard.classList.remove('hidden');
        connectedAccountsSection.classList.remove('hidden');

        // Clear previous list
        accountList.innerHTML = '';

        // Populate connected accounts
        this.connectedAccounts.forEach(account => {
            const listItem = document.createElement('li');
            listItem.classList.add('flex', 'justify-between', 'items-center', 'bg-gray-100', 'p-2', 'rounded');
            listItem.innerHTML = `
                <span>${account.email}</span>
                <span class="text-sm text-gray-500">${account.provider.toUpperCase()}</span>
                <button class="text-red-500 disconnect-btn" data-email="${account.email}">Disconnect</button>
            `;
            accountList.appendChild(listItem);
        });

        // Add disconnect event listeners
        document.querySelectorAll('.disconnect-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const email = e.target.dataset.email;
                this.disconnectAccount(email);
            });
        });
    }

    disconnectAccount(email) {
        // Remove account from connected accounts
        this.connectedAccounts = this.connectedAccounts.filter(account => account.email !== email);
        this.saveConnectedAccounts();
        
        // Update UI
        if (this.connectedAccounts.length === 0) {
            const authSection = document.getElementById('auth-section');
            const emailDashboard = document.getElementById('email-dashboard');
            const connectedAccountsSection = document.getElementById('connected-accounts');

            authSection.classList.remove('hidden');
            emailDashboard.classList.add('hidden');
            connectedAccountsSection.classList.add('hidden');
        } else {
            this.updateUIAfterConnection();
        }
    }

    saveConnectedAccounts() {
        // In a real app, this would use more secure storage
        localStorage.setItem('novamail-accounts', JSON.stringify(this.connectedAccounts));
    }

    loadSavedAccounts() {
        const savedAccounts = localStorage.getItem('novamail-accounts');
        if (savedAccounts) {
            this.connectedAccounts = JSON.parse(savedAccounts);
            if (this.connectedAccounts.length > 0) {
                this.updateUIAfterConnection();
            }
        }
    }

    showErrorNotification(message) {
        // Create and show a temporary error notification
        const notification = document.createElement('div');
        notification.classList.add(
            'fixed', 'top-4', 'right-4', 'bg-red-500', 'text-white', 
            'p-4', 'rounded', 'shadow-lg', 'transition-all', 'duration-300'
        );
        notification.textContent = message;
        document.body.appendChild(notification);

        // Remove notification after 3 seconds
        setTimeout(() => {
            notification.remove();
        }, 3000);
    }

    // Future methods for email synchronization would go here
    async synchronizeEmails() {
        // Placeholder for email sync logic
        console.log('Synchronizing emails from connected accounts...');
    }
}

// Initialize the NovaMail application
document.addEventListener('DOMContentLoaded', () => {
    const novaMail = new NovaMail();
    novaMail.loadSavedAccounts();
});