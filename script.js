document.addEventListener('DOMContentLoaded', () => {
    const chatBubble = document.getElementById('chat-bubble');
    const chatContainer = document.getElementById('chat-container');
    const closeBtn = document.getElementById('close-btn');
    const chatBox = document.getElementById('chat-box');
    const userInput = document.getElementById('user-input');
    const sendBtn = document.getElementById('send-btn');

    let sessionId = null;
    let chatHistory = [];

    // --- Event Listeners for opening and closing the chat ---
    chatBubble.addEventListener('click', () => {
        chatContainer.style.display = 'flex';
        chatBubble.style.display = 'none';
        // Start a new session when the chat is opened
        startNewSession();
    });

    closeBtn.addEventListener('click', () => {
        console.log("Close button clicked!"); // <-- THIS IS THE NEW TEST
        chatContainer.style.display = 'none';
        chatBubble.style.display = 'block';
        // Log the session when the chat is closed
        logChatSession();
    });

    const startNewSession = () => {
        // Generate a simple unique ID for the session
        sessionId = `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        chatHistory = [];
        // Clear the chatBox of old messages
        chatBox.innerHTML = ''; 
        addMessage("Hi there! I'm the AI assistant for P2 Construction. How can I help you today?", 'assistant');
    };

    // --- Core Chat Logic ---

    // Updated addMessage to also save to history
    const addMessage = (message, sender) => {
        const messageElement = document.createElement('div');
        // Use 'assistant' for CSS class if sender is 'assistant'
        const senderClass = sender === 'assistant' ? 'bot' : sender;
        messageElement.classList.add('chat-message', `${senderClass}-message`);
        messageElement.innerHTML = `<p>${message}</p>`;
        chatBox.appendChild(messageElement);
        chatBox.scrollTop = chatBox.scrollHeight;

        // Save message to history (don't save the form)
        if (!message.includes('<form')) {
            chatHistory.push({ role: sender, content: message });
        }
    };

    // Updated handleSendMessage to send history
    const handleSendMessage = async () => {
        const message = userInput.value.trim();
        if (message === '') return;

        addMessage(message, 'user');
        userInput.value = '';
        showTypingIndicator();

        try {
            const response = await fetch('/api/index.js', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                // Send the session ID and the full history
                body: JSON.stringify({ sessionId, history: chatHistory }),
            });

            hideTypingIndicator();
            if (!response.ok) throw new Error('Network response was not ok.');

            const data = await response.json();
            const botReply = data.reply;

            if (botReply.includes("What is your name and email address?")) {
                addMessage(botReply, 'assistant');
                showLeadCaptureForm();
            } else {
                addMessage(botReply, 'assistant');
            }

        } catch (error) {
            hideTypingIndicator();
            console.error('Error fetching bot reply:', error);
            addMessage("I'm having trouble connecting. Please try again later.", 'assistant');
        }
    };

    const showLeadCaptureForm = () => {
        const formHTML = `
            <form id="lead-form" class="lead-capture-form">
                <input type="text" id="name-input" placeholder="Your Name" required>
                <input type="email" id="email-input" placeholder="Your Email" required>
                <button type="submit">Submit</button>
            </form>
        `;
        addMessage(formHTML, 'bot'); // 'bot' is fine here as it's not sent to the API
        document.getElementById('lead-form').addEventListener('submit', handleLeadSubmit);
    };

    const handleLeadSubmit = async (e) => {
        e.preventDefault();
        const name = document.getElementById('name-input').value;
        const email = document.getElementById('email-input').value;

        addMessage("Thank you! We've received your information and will be in touch shortly.", 'assistant');
        e.target.innerHTML = '<p>Submitted.</p>';

        // Add captured lead info to chat history for logging
        chatHistory.push({ role: 'system', content: `Lead Captured: Name=${name}, Email=${email}` });

        // Immediately log the session now that the lead has been captured
        logChatSession();
    };

    // --- New function to log the session ---
    const logChatSession = async () => {
        if (!chatHistory || chatHistory.length <= 1) return;

        const fullTranscript = chatHistory.map(msg => `${msg.role}: ${msg.content}`).join('\n');
        const leadInfo = chatHistory.find(msg => msg.role === 'system' && msg.content.startsWith('Lead Captured'));
        
        let leadName = '';
        let leadEmail = '';
        if (leadInfo) {
            const parts = leadInfo.content.split(', ');
            leadName = parts[0].split('=')[1];
            leadEmail = parts[1].split('=')[1];
        }

        const payload = {
            sessionId: sessionId,
            fullTranscript: fullTranscript,
            leadName: leadName,
            leadEmail: leadEmail
        };

        // IMPORTANT: This URL will need to be replaced with your public n8n webhook URL
        const n8nWebhookUrl = 'YOUR_N8N_WEBHOOK_URL_HERE'; 

        try {
            await fetch(n8nWebhookUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
            });
        } catch (error) {
            console.error('Error logging chat session:', error);
        }
    };


    // --- Helper functions for typing indicator ---
    const showTypingIndicator = () => {
        const indicator = document.createElement('div');
        indicator.classList.add('typing-indicator');
        indicator.id = 'typing-indicator';
        indicator.innerHTML = '<span></span><span></span><span></span>';
        chatBox.appendChild(indicator);
        chatBox.scrollTop = chatBox.scrollHeight;
    };

    const hideTypingIndicator = () => {
        const indicator = document.getElementById('typing-indicator');
        if (indicator) {
            indicator.remove();
        }
    };

    // Send message when the send button is clicked
    sendBtn.addEventListener('click', handleSendMessage);

    // Send message when Enter key is pressed in the input field
    userInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            handleSendMessage();
        }
    });

    // Start the first session when the page loads
    // startNewSession(); // We now start the session on bubble click
});
