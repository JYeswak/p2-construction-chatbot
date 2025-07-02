// Load environment variables from .env file for local development
require('dotenv').config();

// Import the 'fs/promises' module to read files asynchronously
const fs = require('fs/promises');
// Import the 'path' module to handle file paths
const path = require('path');
// Import the OpenAI library
const OpenAI = require('openai');

// Initialize the OpenAI client with the API key from environment variables
// This is a secure way to handle API keys. We will need to set this up in our hosting platform.
const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
});

// This is the main handler function for the serverless environment
module.exports = async (req, res) => {
    if (req.method !== 'POST') {
        res.setHeader('Allow', ['POST']);
        return res.status(405).end(`Method ${req.method} Not Allowed`);
    }

    try {
        const { sessionId, history } = req.body;

        if (!history || !Array.isArray(history)) {
            return res.status(400).json({ error: 'History is required and must be an array.' });
        }

        // --- AI Chat Logic ---
        const knowledgeBasePath = path.join(__dirname, 'knowledge_base.json');
        const knowledgeBaseJSON = await fs.readFile(knowledgeBasePath, 'utf8');
        const knowledgeBase = JSON.parse(knowledgeBaseJSON);
        const knowledgeText = knowledgeBase.faqs.map(faq => `Q: ${faq.question}
A: ${faq.answer}`).join('\n\n');

        const systemPrompt = `
            You are "Zesty," a friendly and highly capable AI assistant for P2 Construction, a design-build firm in Steamboat Springs, Colorado.

            Your Primary Goal: To answer user questions accurately based on the provided Knowledge Base and to book a "30-minute project consultation" when a user is ready.

            You have access to one tool:
            - book_meeting(name, email, time): Use this tool when a user confirms they want to schedule a consultation.

            Conversation Flow:
            1. Answer any initial questions using ONLY the Knowledge Base below.
            2. If the user asks about scheduling, pricing, or expresses clear intent to start a project, proactively offer to book a consultation.
            3. To use the book_meeting tool, you MUST first collect the user's name, email, and their preferred day and time.
            4. Once you have all three pieces of information, you MUST respond with the exact phrase: "BOOKING_CONFIRMED" followed by a single-line JSON object containing the user's details. The time must be converted to a full ISO 8601 format, including timezone.
                - Example: BOOKING_CONFIRMED {"name":"Jane Doe","email":"jane.doe@example.com","time":"2025-07-08T15:00:00-06:00"}

            --- Knowledge Base ---
            ${knowledgeText}
            --- End Knowledge Base ---
        `;

        // Construct the messages array for the API call
        const messages = [
            { role: 'system', content: systemPrompt },
            ...history 
        ];

        const completion = await openai.chat.completions.create({
            model: 'gpt-4o',
            messages: messages,
            temperature: 0.5,
            max_tokens: 200,
        });

        let botResponse = completion.choices[0].message.content;

        // Check if the response contains the booking confirmation keyword ANYWHERE in the string
        if (botResponse.includes("BOOKING_CONFIRMED")) {
            try {
                // Use a regular expression to reliably extract the JSON object
                const jsonMatch = botResponse.match(/\{.*\}/);
                if (!jsonMatch) {
                    throw new Error("Could not find JSON object in the AI response.");
                }
                const jsonString = jsonMatch[0];
                const bookingDetails = JSON.parse(jsonString);

                // IMPORTANT: This URL will need to be replaced with your public n8n webhook URL
                const n8nWebhookUrl = process.env.N8N_WEBHOOK_URL || 'YOUR_N8N_WEBHOOK_URL_HERE';

                // Call the n8n webhook to book the meeting AND log the transcript
                await fetch(n8nWebhookUrl, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        // Booking Details
                        leadName: bookingDetails.name,
                        leadEmail: bookingDetails.email,
                        requestedTime: bookingDetails.time,
                        // Logging Details
                        sessionId: sessionId,
                        fullTranscript: history.map(msg => `${msg.role}: ${msg.content}`).join('\n')
                    }),
                });

                // Create a clean, user-friendly response, removing the keyword and JSON
                botResponse = `Thank you, ${bookingDetails.name}! I have scheduled a 30-minute consultation for you. You will receive a calendar invitation at ${bookingDetails.email} shortly.`;

            } catch (e) {
                console.error("Error parsing booking JSON or calling webhook:", e);
                botResponse = "I had trouble finalizing the booking. A team member will reach out to you shortly to confirm.";
            }
        }

        res.status(200).json({ reply: botResponse });

    } catch (error) {
        console.error('Error processing request:', error);
        res.status(500).json({ error: 'An internal error occurred.' });
    }
};
