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
                const json = JSON.parse(data);
                resolve(json.documents || []);
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
        return parseInt(parts[2], 10) || 0;
    }
    return 0;
}

async function run() {
    const docs = await fetchDocuments('registration_requests');
    docs.sort((a,b) => getMemberIdNumber(a) - getMemberIdNumber(b));
    
    console.log("Member List Check:");
    docs.forEach(d => {
        const mid = d.fields?.memberId?.stringValue;
        const ts = d.fields?.timestamp?.integerValue;
        if (!ts || ts === "0") {
             console.log(`[MISSING] ${mid} - ${d.fields?.name?.stringValue}`);
        }
    });
    console.log("Done.");
}

run();
