const https = require('https');

// Firebase Configuration
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
                    reject(new Error(`Failed to fetch ${collection}: ${data}`));
                }
            });
        });
        req.on('error', reject);
        req.end();
    });
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

async function runCleanup() {
    console.log("Starting Timestamp Cleanup Script...");
    
    const collections = ['members', 'registration_requests'];
    
    for (const collection of collections) {
        console.log(`\nScanning collection: ${collection}`);
        try {
            const docs = await fetchDocuments(collection);
            let updatedCount = 0;
            let skippedCount = 0;

            for (const doc of docs) {
                const fields = doc.fields || {};
                const docId = doc.name.split('/').pop();
                
                // Check if timestamp exists and is > 0
                let hasValidTimestamp = false;
                
                if (fields.timestamp) {
                    const tsValue = fields.timestamp.integerValue || fields.timestamp.stringValue;
                    if (tsValue && parseInt(tsValue, 10) > 0) {
                        hasValidTimestamp = true;
                    }
                }

                if (!hasValidTimestamp) {
                    // Extract hidden createTime
                    const createTimeStr = doc.createTime;
                    const createTimeMillis = new Date(createTimeStr).getTime();
                    
                    console.log(`[FIXING] Member ${fields.name?.stringValue || docId} has no date. Hidden creation: ${createTimeStr}`);
                    await updateTimestamp(collection, docId, createTimeMillis);
                    updatedCount++;
                } else {
                    skippedCount++;
                }
            }
            
            console.log(`Collection ${collection} completed:`);
            console.log(`  - Fixed: ${updatedCount}`);
            console.log(`  - Skipped (already had valid date): ${skippedCount}`);
            
        } catch (e) {
            console.error(`Error processing collection ${collection}:`, e.message);
        }
    }
    
    console.log("\nCleanup Finished!");
}

runCleanup();
