class AstroAI {
    init() {
        console.log('Astro: Disabling AI features temporarily');
        const aiFeatures = document.getElementById('aiFeatures');
        if (!aiFeatures) return;

        // Add disabled class
        aiFeatures.classList.add('disabled');

        // Disable all AI buttons
        const buttons = aiFeatures.querySelectorAll('.ai-btn');
        buttons.forEach(button => {
            button.disabled = true;
            button.title = 'AI features temporarily unavailable';
        });
    }
}

// Export a single instance
export const Astro = new AstroAI();
