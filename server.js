const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const fs = require('fs');
const path = require('path');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');

const app = express();
const PORT = process.env.PORT || 3000;
const SECRET_KEY = 'hajj_umrah_secret_key_2026';
const DB_FILE = path.join(__dirname, 'database.json');

app.use(cors());
app.use(bodyParser.json());

process.on('uncaughtException', (err) => {
    console.error('CRITICAL ERROR (Uncaught Exception):', err);
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('CRITICAL ERROR (Unhandled Rejection):', reason);
});

// Serve Static Files with Cache-Control disabled to ensure immediate updates
app.use(express.static(path.join(__dirname, 'FRONTEND_V2'), {
    setHeaders: function (res, path, stat) {
        res.set('Cache-Control', 'no-store, no-cache, must-revalidate, private')
    }
}));

app.get('/', (req, res) => {
    res.redirect('/screens/index.html');
});

// Helper to read DB
const readDB = () => {
    if (!fs.existsSync(DB_FILE)) {
        return { users: [] };
    }
    const data = fs.readFileSync(DB_FILE, 'utf-8');
    return JSON.parse(data);
};

// Helper to write DB
const writeDB = (data) => {
    fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 4));
};

// Auth API Routes
app.post('/api/auth/register', async (req, res) => {
    try {
        const { name, email, password } = req.body;
        if (!name || !email || !password) {
            return res.status(400).json({ message: 'All fields are required' });
        }

        const db = readDB();
        if (db.users.find(u => u.email === email)) {
            return res.status(400).json({ message: 'Email already exists' });
        }

        const hashedPassword = await bcrypt.hash(password, 10);
        
        const newUser = {
            id: Date.now(),
            name,
            email,
            password: hashedPassword,
            progress: {}
        };

        db.users.push(newUser);
        writeDB(db);

        res.status(201).json({ message: 'Registration successful' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Internal server error' });
    }
});

app.post('/api/auth/login', async (req, res) => {
    try {
        const { email, password } = req.body;
        if (!email || !password) {
            return res.status(400).json({ message: 'All fields are required' });
        }

        const db = readDB();
        const user = db.users.find(u => u.email === email);
        if (!user) {
            return res.status(400).json({ message: 'Invalid email or password' });
        }

        // Check password (allow plaintext fallback for old users)
        let isMatch = false;
        if (user.password.startsWith('$2a$') || user.password.startsWith('$2b$')) {
            isMatch = await bcrypt.compare(password, user.password);
        } else {
            isMatch = (password === user.password);
        }

        if (!isMatch) {
            return res.status(400).json({ message: 'Invalid email or password' });
        }

        const token = jwt.sign({ id: user.id, email: user.email }, SECRET_KEY, { expiresIn: '1d' });

        res.status(200).json({
            message: 'Login successful',
            token,
            user: {
                id: user.id,
                name: user.name,
                email: user.email,
                progress: user.progress
            }
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Internal server error' });
    }
});

// Any other specific API paths here...
app.get('/api/user/progress', (req, res) => {
    const authHeader = req.headers.authorization;
    if (!authHeader) return res.status(401).json({ message: 'Unauthorized' });

    const token = authHeader.split(' ')[1];
    try {
        const decoded = jwt.verify(token, SECRET_KEY);
        const db = readDB();
        const user = db.users.find(u => u.id === decoded.id);
        if (user) {
            res.json(user.progress || {});
        } else {
            res.status(404).json({ message: 'User not found' });
        }
    } catch (e) {
        res.status(401).json({ message: 'Invalid token' });
    }
});

app.post('/api/user/progress', (req, res) => {
    const authHeader = req.headers.authorization;
    if (!authHeader) return res.status(401).json({ message: 'Unauthorized' });

    const token = authHeader.split(' ')[1];
    try {
        const decoded = jwt.verify(token, SECRET_KEY);
        const db = readDB();
        const userIndex = db.users.findIndex(u => u.id === decoded.id);
        if (userIndex !== -1) {
            db.users[userIndex].progress = { ...db.users[userIndex].progress, ...req.body };
            writeDB(db);
            res.json({ message: 'Progress updated', progress: db.users[userIndex].progress });
        } else {
            res.status(404).json({ message: 'User not found' });
        }
    } catch (e) {
        res.status(401).json({ message: 'Invalid token' });
    }
});

// Centralized AI Processing (Supporting "Our Model" - Local LLM)
const LOCAL_AI_URL = "http://localhost:11434/api/chat"; // Default Ollama endpoint
const MODEL_NAME = "llama3.2:3b"; // Updated to use a standard base model

app.post('/api/chat', async (req, res) => {
    const { message, history } = req.body;
    const lowerMsg = message?.toLowerCase().trim();
    console.log(`[AI Chat] Received: "${message}"`);

    // 1. Check Training/Cache File for instant answer
    const cacheFile = path.join(__dirname, 'training.json');
    let cache = { cached_responses: [] };
    try {
        cache = JSON.parse(fs.readFileSync(cacheFile, 'utf-8'));
        const existingEntry = cache.cached_responses.find(r => r.question.toLowerCase().trim() === lowerMsg);
        if (existingEntry) {
            console.log(`[AI Cache] Hit! Instant response for: "${message}"`);
            return res.json({ reply: existingEntry.answer, status: "cached" });
        }
    } catch (e) { console.error("Cache read error:", e); }

    // 2. Load custom knowledge data for the AI "perfect" prompt
    let customKnowledge = "";
    try {
        const kData = JSON.parse(fs.readFileSync(path.join(__dirname, 'knowledge.json'), 'utf-8'));
        customKnowledge = `Use this custom app knowledge: ${JSON.stringify(kData)}. `;
    } catch (e) {
        console.warn("Could not load knowledge.json, using default prompt.");
    }
    
    const messages = history || [
        { 
            role: "system", 
            content: `You are AskPilgrim, a helpful and respectful Hajj and Umrah expert. ${customKnowledge} Follow the 'custom_rules' provided in the knowledge base.` 
        },
    ];
    if (message) messages.push({ role: "user", content: message });

    try {
        const aiResponse = await fetch(LOCAL_AI_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                model: MODEL_NAME,
                messages: messages,
                stream: false
            })
        });

        if (aiResponse.ok) {
            const data = await aiResponse.json();
            const reply = data.message.content;
            
            // 3. Save to Training/Cache File for next time
            try {
                cache.cached_responses.push({ 
                    question: message, 
                    answer: reply, 
                    timestamp: new Date().toISOString() 
                });
                fs.writeFileSync(cacheFile, JSON.stringify(cache, null, 4));
                console.log("[AI Cache] New answer saved to training.json.");
            } catch (e) { console.error("Cache save error:", e); }

            console.log(`[AI Chat] Success: ${reply.substring(0, 50)}...`);
            res.json({ reply });
        } else {
            console.error(`[AI Chat] Local model server error: ${aiResponse.status}`);
            throw new Error(`Local model server error: ${aiResponse.status}`);
        }
    } catch (err) {
        console.warn("[AI Chat] Local model fallback.");
        let response = "The local AI is busy. Please try again or check our Guides page.";
        res.json({ reply: response, status: "fallback" });
    }
});

// Specialized API for Ritual Planning
app.post('/api/ai/generate-plan', async (req, res) => {
    const { prompt } = req.body;
    console.log("[AI Planner] Generation request received.");
    
    try {
        const aiResponse = await fetch(LOCAL_AI_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                model: MODEL_NAME,
                messages: [
                    { role: "system", content: "You are a professional Hajj and Umrah guide. Provide detailed journey plans." },
                    { role: "user", content: prompt }
                ],
                stream: false
            })
        });

        if (aiResponse.ok) {
            const data = await aiResponse.json();
            console.log("[AI Planner] Success: Plan generated.");
            res.json({ content: data.message.content });
        } else {
            console.error(`[AI Planner] Error status: ${aiResponse.status}`);
            res.status(502).json({ error: "Local AI server returned an error." });
        }
    } catch (err) {
        console.error("[AI Planner] Connection error.");
        res.status(503).json({ error: "Local AI model not connected. Please ensure Ollama is running." });
    }
});

const server = app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
}).on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
        console.error(`ERROR: Port ${PORT} is already in use. Please close the other process running on this port and try again.`);
    } else {
        console.error('SERVER ERROR:', err);
    }
    process.exit(1);
});
