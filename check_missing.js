const https = require('https');

const FIREBASE_PROJECT_ID = "testingtempleteapp";
const FIREBASE_API_KEY = "AIzaSyCkZp3cnXrDLUH3WKbstbtb6jPJ1CeaO4o";

async function fetchDocuments(collection) {
    return new Promise((resolve, reject) => {
        const options = {
            hostname: 'firestore.googleapis.com',
            path: `/v1/projects/${FIREBASE_PROJECT_ID}/databases/(default)/documents/${collection}?key=${FIREBASE_API_KEY}&pageSize=1000`,
            method: 'GET'
        };

        const req = https.request(options, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                if (res.statusCode >= 200 && res.statusCode < 300) {
                    resolve(JSON.parse(data).documents || []);
                } else {
                    reject(new Error(`Failed to fetch ${collection}`));
                }
            });
        });
        req.on('error', reject);
        req.end();
    });
}

function getMemberIdNumber(doc) {
    const memberId = doc.fields?.memberId?.stringValue || "";
    const parts = memberId.split('/');
    if (parts.length >= 3) {
        return parseInt(parts[2], 10) || 999999;
    }
    return 999999;
}

async function checkMissing() {
    console.log("Fetching documents...");
    const docs = await fetchDocuments('members');
    
    // Sort documents by memberId
    docs.sort((a, b) => getMemberIdNumber(a) - getMemberIdNumber(b));
    
    const missing = docs.filter(doc => !doc.fields.timestamp);
    console.log(`Total: ${docs.length}, Missing timestamp: ${missing.length}`);
    
    // Let's also check how many have "0L" equivalent or invalid timestamps
    const invalid = docs.filter(doc => {
        if (!doc.fields.timestamp) return true;
        const val = doc.fields.timestamp.integerValue || doc.fields.timestamp.stringValue;
        return !val || parseInt(val, 10) <= 0;
    });
    console.log(`Missing or invalid timestamp: ${invalid.length}`);
    
    if (invalid.length > 0) {
        console.log("Example invalid doc:", invalid[0].name, invalid[0].fields.memberId);
    }
}

checkMissing();
