const express = require('express');
const path = require('path');
const fs = require('fs');
const https = require('https');
const cors = require('cors');
const app = express();
const PORT = process.env.PORT || 3000;

// Firebase Configuration (Extracted from your google-services.json)
const FIREBASE_PROJECT_ID = "testingtempleteapp";
const FIREBASE_API_KEY = "AIzaSyCkZp3cnXrDLUH3WKbstbtb6jPJ1CeaO4o";

app.use(express.json());
app.use(cors()); // Allow cross-origin requests from frontend

// Load states data
const statesData = JSON.parse(fs.readFileSync(path.join(__dirname, 'states.json'), 'utf8'));

// API Endpoints for Location
app.get('/api/states', (req, res) => res.json(Object.keys(statesData)));
app.get('/api/districts', (req, res) => {
    const { state } = req.query;
    if (!state || !statesData[state]) return res.status(404).json({ error: 'State not found' });
    res.json(Object.keys(statesData[state]));
});
app.get('/api/cities', (req, res) => {
    const { state, district } = req.query;
    if (!state || !district || !statesData[state] || !statesData[state][district]) return res.status(404).json({ error: 'District not found' });
    res.json(statesData[state][district]);
});

// Helper: Convert flat JSON to Firestore REST API format
function toFirestoreFields(data) {
    const fields = {};
    for (const [key, value] of Object.entries(data)) {
        if (typeof value === 'boolean') {
            fields[key] = { booleanValue: value };
        } else if (typeof value === 'number') {
            fields[key] = { integerValue: value.toString() };
        } else {
            fields[key] = { stringValue: value.toString() };
        }
    }
    return { fields };
}

// Registration Endpoint (Using REST API to bypass Service Account requirement)
app.post('/api/register', (req, res) => {
    const registrationData = {
        ...req.body,
        isVerified: false,
        memberId: "",
        timestamp: Date.now()
    };

    const firestoreData = JSON.stringify(toFirestoreFields(registrationData));
    const options = {
        hostname: 'firestore.googleapis.com',
        path: `/v1/projects/${FIREBASE_PROJECT_ID}/databases/(default)/documents/registration_requests?key=${FIREBASE_API_KEY}`,
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(firestoreData)
        }
    };

    const request = https.request(options, (response) => {
        let body = '';
        response.on('data', (d) => body += d);
        response.on('end', () => {
            if (response.statusCode >= 200 && response.statusCode < 300) {
                const result = JSON.parse(body);
                // Extract document ID from name path: projects/.../documents/registration_requests/ID
                const docId = result.name.split('/').pop();
                console.log(`Successfully registered member: ${docId}`);
                res.json({ success: true, id: docId });
            } else {
                console.error('Firestore REST Error:', body);
                res.status(response.statusCode).json({ error: 'Failed to save to database' });
            }
        });
    });

    request.on('error', (e) => {
        console.error('Request Error:', e);
        res.status(500).json({ error: 'Network error connecting to Firebase' });
    });

    request.write(firestoreData);
    request.end();
});

// Health check route
app.get('/', (req, res) => res.json({ status: 'Backend is running' }));

app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
    console.log('Firebase connection: REST API Enabled (No service-account.json needed)');
});
