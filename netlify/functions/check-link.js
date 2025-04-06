const fetch = require('node-fetch');

exports.handler = async function(event) {
    if (event.httpMethod !== 'POST') {
        return { statusCode: 405, body: 'Method Not Allowed' };
    }

    try {
        const { url } = JSON.parse(event.body);
        
        // Check for suspicious protocols
        const suspiciousProtocols = /^(javascript|data|vbscript|file):/i;
        if (suspiciousProtocols.test(url)) {
            return {
                statusCode: 200,
                body: JSON.stringify({ safe: false })
            };
        }

        // Check Google Safe Browsing API
        const response = await fetch(`https://safebrowsing.googleapis.com/v4/threatMatches:find?key=${process.env.GOOGLE_API_KEY}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                client: {
                    clientId: "Nova Mail",
                    clientVersion: "1.0.0"
                },
                threatInfo: {
                    threatTypes: ["MALWARE", "SOCIAL_ENGINEERING", "UNWANTED_SOFTWARE"],
                    platformTypes: ["ANY_PLATFORM"],
                    threatEntryTypes: ["URL"],
                    threatEntries: [{ url }]
                }
            })
        });

        const data = await response.json();
        const safe = !data.matches;

        return {
            statusCode: 200,
            body: JSON.stringify({ safe })
        };
    } catch (error) {
        console.error('Link check error:', error);
        return {
            statusCode: 500,
            body: JSON.stringify({ safe: false, error: 'Link check failed' })
        };
    }
}
