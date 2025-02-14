const express = require('express');
const crypto = require('crypto');
const { MongoClient } = require('mongodb');
const OpenAIClient = require('./openai-client');

const app = express();
app.use(express.json());

// MongoDB Atlas connection string (replace with your actual connection string)
const MONGODB_URI = "urlMong";
const DB_NAME = "privacy_vault";
const COLLECTION_NAME = "tokens";

let tokenCollection;
const openAIClient = new OpenAIClient("apiKey");

// Connect to MongoDB
async function connectToMongo() {
    try {
        const client = await MongoClient.connect(MONGODB_URI);
        const db = client.db(DB_NAME);
        tokenCollection = db.collection(COLLECTION_NAME);
        console.log('Connected to MongoDB Atlas');
    } catch (error) {
        console.error('MongoDB connection error:', error);
        process.exit(1);
    }
}

// Regular expressions for PII detection
const PII_PATTERNS = {
    // Spanish/Latin American name pattern
    name: /[A-ZÁ-Ú][a-zá-ú]+(?:\s+[A-ZÁ-Ú][a-zá-ú]+)+/g,
    
    // Email pattern
    email: /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g,
    
    // Phone pattern (Colombian format in this case)
    phone: /\b\d{10}\b/g
};

// Modified generateToken function
function generateToken(type, input) {
    const hash = crypto
        .createHash('md5')
        .update(input)
        .digest('hex')
        .substring(0, 12);
    return `${type}_${hash}`;
}

// Modified anonymizeMessage function to use MongoDB
async function anonymizeMessage(message) {
    let anonymizedMessage = message;
    
    for (const [type, pattern] of Object.entries(PII_PATTERNS)) {
        anonymizedMessage = await anonymizedMessage.replace(pattern, async (match) => {
            const token = generateToken(type.toUpperCase(), match);
            
            // Store in MongoDB
            await tokenCollection.updateOne(
                { token },
                { $set: { originalValue: match } },
                { upsert: true }
            );
            
            return token;
        });
    }

    return anonymizedMessage;
}

// Modified deanonymizeMessage function to use MongoDB
async function deanonymizeMessage(anonymizedMessage) {
    let deanonymizedMessage = anonymizedMessage;
    const tokenPattern = /([A-Z]+_[a-f0-9]{12})/g;
    
    const tokens = anonymizedMessage.match(tokenPattern) || [];
    
    for (const token of tokens) {
        const doc = await tokenCollection.findOne({ token });
        if (doc) {
            deanonymizedMessage = deanonymizedMessage.replace(
                token, 
                doc.originalValue
            );
        }
    }

    return deanonymizedMessage;
}

// New endpoint that processes the message through OpenAI
app.post('/process-with-ai', async (req, res) => {
    try {
        const { message } = req.body;
        
        if (!message) {
            return res.status(400).json({ 
                error: 'Message is required in the request body' 
            });
        }

        // Step 1: Anonymize the message
        const anonymizedMessage = await anonymizeMessage(message);
        console.log('1. Anonymized:', anonymizedMessage);

        // Step 2: Process with OpenAI
        const prompt = `Given this anonymized message: "${anonymizedMessage}", 
            provide a brief response acknowledging the information. 
            Keep the tokens (like NAME_xxx, EMAIL_xxx) in your response.`;

        const aiResponse = await openAIClient.generateCompletion(prompt, {
            maxTokens: 150,
            temperature: 0.7
        });
        console.log('2. AI Response:', aiResponse);

        // Step 3: Deanonymize the AI response
        const deanonymizedResponse = await deanonymizeMessage(aiResponse);
        console.log('3. Deanonymized:', deanonymizedResponse);

        // Return all steps for transparency
        res.json({
            original: message,
            anonymized: anonymizedMessage,
            aiResponse: aiResponse,
            deanonymized: deanonymizedResponse
        });

    } catch (error) {
        console.error('Processing error:', error);
        res.status(500).json({ 
            error: 'Internal server error during processing',
            details: error.message 
        });
    }
});

// Modified anonymize endpoint
app.post('/anonymize', async (req, res) => {
    try {
        const { message } = req.body;
        
        if (!message) {
            return res.status(400).json({ 
                error: 'Message is required in the request body' 
            });
        }

        const anonymizedMessage = await anonymizeMessage(message);
        res.json({ anonymizedMessage });
    } catch (error) {
        console.error('Anonymization error:', error);
        res.status(500).json({ 
            error: 'Internal server error during anonymization' 
        });
    }
});

// Modified deanonymize endpoint
app.post('/deanonymize', async (req, res) => {
    try {
        const { anonymizedMessage } = req.body;
        
        if (!anonymizedMessage) {
            return res.status(400).json({ 
                error: 'Anonymized message is required in the request body' 
            });
        }

        const message = await deanonymizeMessage(anonymizedMessage);
        res.json({ message });
    } catch (error) {
        console.error('Deanonymization error:', error);
        res.status(500).json({ 
            error: 'Internal server error during deanonymization' 
        });
    }
});

// Modified server startup
const PORT = process.env.PORT || 3001;
connectToMongo().then(() => {
    app.listen(PORT, () => {
        console.log(`Server running on port ${PORT}`);
    });
}); 