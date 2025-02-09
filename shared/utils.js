function showNotification(message, type = 'info', duration = 3000) {
    const notification = document.getElementById('notification');
    notification.textContent = message;
    notification.className = `notification ${type}`;
    notification.style.display = 'block';

    // Clear any existing timeout
    if (notification.timeoutId) {
        clearTimeout(notification.timeoutId);
    }

    // Set a new timeout to hide the notification
    notification.timeoutId = setTimeout(() => {
        notification.style.display = 'none';
    }, duration);
}

function showLoading(isLoading) {
    const loadingOverlay = document.getElementById('loading');
    loadingOverlay.style.display = isLoading ? 'flex' : 'none';
}

function debounce(func, delay) {
    let timeout;
    return function(...args) {
        const context = this;
        clearTimeout(timeout);
        timeout = setTimeout(() => func.apply(context, args), delay);
    };
}

export { showNotification, showLoading, debounce };
