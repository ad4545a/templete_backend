const express = require('express');
const path = require('path');
const fs = require('fs');
const https = require('https');
const cors = require('cors');
const multer = require('multer');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

const upload = multer({ storage: multer.memoryStorage() }); // File saved to memory

// Telegram Config
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || '8349030448:AAEnSbQnaPKSNuDXvsfb18HaeguvFynCJOM';
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID || '5175497565';

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
app.post('/api/register', upload.single('profilePic'), async (req, res) => {
    let profilePhotoId = "";

    // If an image was uploaded, send it to Telegram Bot
    if (req.file && TELEGRAM_CHAT_ID) {
        try {
            console.log("Uploading photo to Telegram...");
            const blob = new Blob([req.file.buffer], { type: req.file.mimetype });
            const form = new FormData();
            form.append('chat_id', TELEGRAM_CHAT_ID);
            form.append('photo', blob, req.file.originalname);

            const telegramRes = await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendPhoto`, {
                method: 'POST',
                body: form
            });
            const telegramData = await telegramRes.json();
            
            if (telegramData.ok) {
                const photos = telegramData.result.photo;
                profilePhotoId = photos[photos.length - 1].file_id; // Get highest resolution
                console.log(`Telegram Upload Success! file_id: ${profilePhotoId}`);
            } else {
                console.error("Telegram API response error:", telegramData);
            }
        } catch (e) {
            console.error("Failed to post to Telegram:", e);
        }
    }

    const photoUrl = profilePhotoId ? `https://templete-backend.onrender.com/api/photo/${profilePhotoId}` : '';

    const registrationData = {
        title: req.body.title || '',
        name: req.body.name || '',
        fatherName: req.body.fatherName || '',
        dob: req.body.dob || '',
        dateOfBirth: req.body.dob || '',
        category: req.body.category || '',
        profession: req.body.profession || '',
        firmName: req.body.firmName || '',
        mobile: req.body.mobile || '',
        whatsapp: req.body.whatsapp || '',
        aadhaar: req.body.aadhaar || '',
        PrivateJobDesignation: req.body.PrivateJobDesignation || '',
        Govt: req.body.Govt || '',
        OtherProfession: req.body.OtherProfession || '',
        state: req.body.state || '',
        district: req.body.district || '',
        city: req.body.city || '',
        address: req.body.address || '',
        pincode: req.body.pincode || '',
        photoUrl,
        profilePhotoId,
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

// Upload endpoint for admin app to upload member photos to Telegram
app.post('/api/upload-photo', upload.single('photo'), async (req, res) => {
    if (!req.file) {
        return res.status(400).json({ error: 'No photo file provided' });
    }

    try {
        console.log("Admin upload: Uploading photo to Telegram...");
        const blob = new Blob([req.file.buffer], { type: req.file.mimetype });
        const form = new FormData();
        form.append('chat_id', TELEGRAM_CHAT_ID);
        form.append('photo', blob, req.file.originalname || 'member_photo.jpg');

        const telegramRes = await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendPhoto`, {
            method: 'POST',
            body: form
        });
        const telegramData = await telegramRes.json();

        if (telegramData.ok) {
            const photos = telegramData.result.photo;
            const fileId = photos[photos.length - 1].file_id; // Highest resolution
            console.log(`Admin upload success! file_id: ${fileId}`);
            res.json({ success: true, file_id: fileId });
        } else {
            console.error("Telegram API error:", telegramData);
            res.status(500).json({ error: 'Telegram upload failed', details: telegramData.description });
        }
    } catch (e) {
        console.error("Admin upload error:", e);
        res.status(500).json({ error: 'Failed to upload photo' });
    }
});

// Proxy endpoint to fetch the image from Telegram
app.get('/api/photo/:file_id', async (req, res) => {
    const { file_id } = req.params;
    try {
        // Step 1: Get File Path
        const fileRes = await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/getFile?file_id=${file_id}`);
        const fileData = await fileRes.json();
        
        if (!fileData.ok) {
            return res.status(404).json({ error: 'File not found on Telegram' });
        }
        
        // Step 2: Download File
        const filePath = fileData.result.file_path;
        const downloadUrl = `https://api.telegram.org/file/bot${TELEGRAM_BOT_TOKEN}/${filePath}`;
        
        const photoRes = await fetch(downloadUrl);
        if (!photoRes.ok) throw new Error("Failed to download photo");
        
        // Forward content type and pipe stream to client
        res.setHeader('Content-Type', photoRes.headers.get('content-type'));
        res.setHeader('Cache-Control', 'public, max-age=86400'); // Cache for 1 day
        
        // Instead of loading to memory, pass the body buffer directly.
        // ArrayBuffer converted to Node Buffer.
        const arrayBuffer = await photoRes.arrayBuffer();
        res.end(Buffer.from(arrayBuffer));

    } catch (e) {
        console.error("Image proxy error:", e);
        res.status(500).json({ error: 'Failed to proxy image' });
    }
});

// Health check route
app.get('/', (req, res) => res.json({ status: 'Backend is running' }));


app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
    console.log('Firebase connection: REST API Enabled (No service-account.json needed)');
});
