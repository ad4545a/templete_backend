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
        return parseInt(parts[2], 10) || 0;
    }
    return 0;
}

function isSuspiciousTimestamp(doc) {
    const tsStr = doc.fields?.timestamp?.integerValue || doc.fields?.timestamp?.stringValue;
    if (!tsStr) return true;
    
    const tsMillis = parseInt(tsStr, 10);
    
    // Check if it matches DOB
    const dobStr = doc.fields?.dateOfBirth?.stringValue;
    if (dobStr) {
        const dobMillis = new Date(dobStr).getTime();
        if (Math.abs(tsMillis - dobMillis) < 24 * 60 * 60 * 1000) { // Same day within timezone variance
            return true;
        }
    }
    
    // Check if it matches createTime (meaning it was set by my old script or imported)
    const createTimeMillis = new Date(doc.createTime).getTime();
    if (Math.abs(tsMillis - createTimeMillis) < 60 * 1000) { // exactly or very close
        return true;
    }
    
    return false;
}

async function analyze() {
    console.log("Fetching documents...");
    const docs = await fetchDocuments('members');
    
    // Sort documents by memberId
    docs.sort((a, b) => getMemberIdNumber(a) - getMemberIdNumber(b));
    
    let suspiciousCount = 0;
    
    for (const doc of docs) {
        const docId = doc.name.split('/').pop();
        const memberId = doc.fields?.memberId?.stringValue || "unknown";
        if (isSuspiciousTimestamp(doc)) {
            suspiciousCount++;
            console.log(`[SUSPICIOUS] ${memberId} - ${doc.fields?.name?.stringValue}`);
        }
    }
    
    console.log(`Total suspicious timestamps: ${suspiciousCount}`);
}

analyze();
