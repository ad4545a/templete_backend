const https = require('https');

const FIREBASE_PROJECT_ID = "testingtempleteapp";
const FIREBASE_API_KEY = "AIzaSyCkZp3cnXrDLUH3WKbstbtb6jPJ1CeaO4o";

async function fetchDocuments(collection) {
    let allDocs = [];
    let pageToken = '';
    
    do {
        const url = `https://firestore.googleapis.com/v1/projects/${FIREBASE_PROJECT_ID}/databases/(default)/documents/${collection}?key=${FIREBASE_API_KEY}&pageSize=500${pageToken ? '&pageToken=' + pageToken : ''}`;
        const response = await new Promise((resolve, reject) => {
            https.get(url, res => {
                let data = '';
                res.on('data', d => data += d);
                res.on('end', () => resolve(JSON.parse(data)));
                res.on('error', reject);
            });
        });
        
        if (response.documents) allDocs = allDocs.concat(response.documents);
        pageToken = response.nextPageToken;
    } while (pageToken);
    
    return allDocs;
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
    const docs = await fetchDocuments('members');
    docs.sort((a,b) => getMemberIdNumber(a) - getMemberIdNumber(b));
    
    console.log(`TOTAL DOCS: ${docs.length}`);
    docs.forEach(d => {
        const mid = d.fields?.memberId?.stringValue || "NONE";
        const ts = d.fields?.timestamp ? JSON.stringify(d.fields.timestamp) : "MISSING";
        console.log(`${mid} | ${ts}`);
    });
}

run();
