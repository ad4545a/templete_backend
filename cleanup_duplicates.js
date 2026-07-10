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

async function deleteDocument(collection, docId) {
    return new Promise((resolve, reject) => {
        const options = {
            hostname: 'firestore.googleapis.com',
            path: `/v1/projects/${FIREBASE_PROJECT_ID}/databases/(default)/documents/${collection}/${docId}?key=${FIREBASE_API_KEY}`,
            method: 'DELETE'
        };

        const req = https.request(options, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                if (res.statusCode >= 200 && res.statusCode < 300) {
                    resolve();
                } else {
                    reject(new Error(`Failed to delete ${docId}: status ${res.statusCode}, response: ${data}`));
                }
            });
        });
        req.on('error', reject);
        req.end();
    });
}

function getTimestamp(doc) {
    const fields = doc.fields || {};
    const tsVal = fields.timestamp?.integerValue || fields.timestamp?.stringValue;
    return tsVal ? parseInt(tsVal, 10) : 0;
}

async function startCleanup() {
    console.log("Fetching registration requests...");
    try {
        const docs = await fetchDocuments('registration_requests');
        console.log(`Fetched ${docs.length} pending registration requests.`);

        // Group by mobile number
        const groups = {};
        for (const doc of docs) {
            const fields = doc.fields || {};
            const mobile = fields.mobile?.stringValue || '';
            const docId = doc.name.split('/').pop();
            const timestamp = getTimestamp(doc);
            const name = fields.name?.stringValue || 'N/A';

            if (!mobile) continue; // Skip empty phone numbers

            if (!groups[mobile]) {
                groups[mobile] = [];
            }
            groups[mobile].push({ docId, timestamp, name, doc });
        }

        let totalDeleted = 0;

        for (const [mobile, list] of Object.entries(groups)) {
            if (list.length > 1) {
                console.log(`\nDuplicate found for mobile: ${mobile} (${list.length} requests)`);
                // Sort list by timestamp descending (newest first)
                list.sort((a, b) => b.timestamp - a.timestamp);

                // Keep the first (newest) one
                const keep = list[0];
                console.log(`  [KEEP] docId: ${keep.docId}, Name: ${keep.name}, Date: ${new Date(keep.timestamp).toISOString()}`);

                // Delete the others
                for (let i = 1; i < list.length; i++) {
                    const dup = list[i];
                    console.log(`  [DELETE] docId: ${dup.docId}, Name: ${dup.name}, Date: ${new Date(dup.timestamp).toISOString()}`);
                    try {
                        await deleteDocument('registration_requests', dup.docId);
                        totalDeleted++;
                    } catch (err) {
                        console.error(`  Error deleting ${dup.docId}:`, err.message);
                    }
                }
            }
        }

        console.log(`\nCleanup finished. Deleted ${totalDeleted} duplicate request(s).`);
    } catch (e) {
        console.error("Error during cleanup:", e);
    }
}

startCleanup();
