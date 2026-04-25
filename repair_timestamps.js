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

async function updateTimestamp(collection, docId, timestampMillis) {
    return new Promise((resolve, reject) => {
        const firestoreData = JSON.stringify({
            fields: {
                timestamp: { integerValue: timestampMillis.toString() }
            }
        });

        const options = {
            hostname: 'firestore.googleapis.com',
            path: `/v1/projects/${FIREBASE_PROJECT_ID}/databases/(default)/documents/${collection}/${docId}?updateMask.fieldPaths=timestamp&key=${FIREBASE_API_KEY}`,
            method: 'PATCH',
            headers: {
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(firestoreData)
            }
        };

        const req = https.request(options, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                if (res.statusCode >= 200 && res.statusCode < 300) {
                    resolve();
                } else {
                    reject(new Error(`Failed to update ${docId}: ${data}`));
                }
            });
        });
        req.on('error', reject);
        req.write(firestoreData);
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

async function repair(collection) {
    console.log(`\nStarting Timestamp Repair for: ${collection}`);
    
    try {
        const docs = await fetchDocuments(collection);
        console.log(`Fetched ${docs.length} documents.`);
        
        // Sort by member ID number
        docs.sort((a, b) => getMemberIdNumber(a) - getMemberIdNumber(b));
        
        // Initial fallback if the very first record is missing a timestamp
        let lastValidTimestamp = new Date("2024-01-01").getTime(); 

        for (const doc of docs) {
            const fields = doc.fields || {};
            const docId = doc.name.split('/').pop();
            const memberId = fields.memberId?.stringValue || "unknown";
            
            const tsVal = fields.timestamp?.integerValue || fields.timestamp?.stringValue;
            const currentTs = tsVal ? parseInt(tsVal, 10) : 0;
            
            if (currentTs > 0) {
                // Member has a valid timestamp, update our "last seen"
                lastValidTimestamp = currentTs;
            } else {
                // Member is MISSING timestamp.
                // Assignment: Use the timestamp from the entry "above" (previous in sorted list)
                const dateStr = new Date(lastValidTimestamp).toISOString().split('T')[0];
                console.log(`[FIXING] ${collection}/${memberId} - ${fields.name?.stringValue || 'N/A'}. Assigning: ${dateStr}`);
                
                await updateTimestamp(collection, docId, lastValidTimestamp);
            }
        }
    } catch (e) {
        console.error(`Error during repair of ${collection}:`, e.message);
    }
}

async function start() {
    await repair('members');
    await repair('registration_requests');
    console.log("\nAll repairs finished.");
}

start();
