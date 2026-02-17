require('dotenv').config();
const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const path = require('path');
const { AIGirlfriend } = require('./src/ai-girlfriend');
const { VoiceHandler } = require('./src/voice-handler');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

const PORT = process.env.PORT || 3000;
const HOST = process.env.HOST || 'localhost';

// Serve static files
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json({ limit: '10mb' }));

// Store active sessions
const sessions = new Map();

// REST API: Send text message
app.post('/api/chat', async (req, res) => {
  const { message, sessionId } = req.body;
  if (!message) {
    return res.status(400).json({ error: 'Message is required' });
  }

  try {
    const ai = getOrCreateSession(sessionId || 'default');
    const reply = await ai.chat(message);
    res.json({
      reply: reply.text,
      mood: reply.mood,
      sessionId: ai.sessionId
    });
  } catch (err) {
    console.error('Chat error:', err.message);
    res.status(500).json({ error: 'Failed to get response' });
  }
});

// REST API: Text-to-Speech
app.post('/api/tts', async (req, res) => {
  const { text } = req.body;
  if (!text) {
    return res.status(400).json({ error: 'Text is required' });
  }

  try {
    const voiceHandler = new VoiceHandler();
    const audioBuffer = await voiceHandler.textToSpeech(text);
    res.set({
      'Content-Type': 'audio/mpeg',
      'Content-Length': audioBuffer.length
    });
    res.send(audioBuffer);
  } catch (err) {
    console.error('TTS error:', err.message);
    res.status(500).json({ error: 'Failed to generate speech' });
  }
});

// REST API: Speech-to-Text
app.post('/api/stt', async (req, res) => {
  const chunks = [];
  req.on('data', chunk => chunks.push(chunk));
  req.on('end', async () => {
    try {
      const audioBuffer = Buffer.concat(chunks);
      const voiceHandler = new VoiceHandler();
      const text = await voiceHandler.speechToText(audioBuffer);
      res.json({ text });
    } catch (err) {
      console.error('STT error:', err.message);
      res.status(500).json({ error: 'Failed to transcribe audio' });
    }
  });
});

// REST API: Get conversation history
app.get('/api/history/:sessionId', (req, res) => {
  const ai = sessions.get(req.params.sessionId);
  if (!ai) {
    return res.json({ history: [] });
  }
  res.json({ history: ai.getHistory() });
});

// REST API: Get AI status/mood
app.get('/api/status/:sessionId', (req, res) => {
  const ai = sessions.get(req.params.sessionId);
  if (!ai) {
    return res.json({ mood: 'happy', name: process.env.AI_NAME || 'Luna' });
  }
  res.json({
    mood: ai.currentMood,
    name: ai.name,
    messageCount: ai.messageCount
  });
});

// WebSocket for real-time voice chat
wss.on('connection', (ws) => {
  console.log('Voice chat client connected');
  let ai = null;
  let voiceHandler = new VoiceHandler();

  ws.on('message', async (data) => {
    try {
      // Check if it's JSON (control message) or binary (audio)
      if (typeof data === 'string' || (data instanceof Buffer && data[0] === 0x7b)) {
        const msg = JSON.parse(data.toString());

        if (msg.type === 'init') {
          ai = getOrCreateSession(msg.sessionId || 'default');
          ws.send(JSON.stringify({
            type: 'ready',
            name: ai.name,
            mood: ai.currentMood
          }));
        } else if (msg.type === 'text') {
          if (!ai) ai = getOrCreateSession('default');
          const reply = await ai.chat(msg.text);

          ws.send(JSON.stringify({
            type: 'reply',
            text: reply.text,
            mood: reply.mood
          }));

          // Generate voice response
          try {
            const audioBuffer = await voiceHandler.textToSpeech(reply.text);
            ws.send(JSON.stringify({ type: 'audio_start' }));
            ws.send(audioBuffer);
            ws.send(JSON.stringify({ type: 'audio_end' }));
          } catch (ttsErr) {
            console.error('TTS in WS error:', ttsErr.message);
          }
        }
      } else {
        // Binary audio data - transcribe and respond
        if (!ai) ai = getOrCreateSession('default');

        const text = await voiceHandler.speechToText(data);
        ws.send(JSON.stringify({ type: 'transcription', text }));

        const reply = await ai.chat(text);
        ws.send(JSON.stringify({
          type: 'reply',
          text: reply.text,
          mood: reply.mood
        }));

        try {
          const audioBuffer = await voiceHandler.textToSpeech(reply.text);
          ws.send(JSON.stringify({ type: 'audio_start' }));
          ws.send(audioBuffer);
          ws.send(JSON.stringify({ type: 'audio_end' }));
        } catch (ttsErr) {
          console.error('TTS in WS error:', ttsErr.message);
        }
      }
    } catch (err) {
      console.error('WebSocket message error:', err.message);
      ws.send(JSON.stringify({ type: 'error', message: 'Something went wrong, try again!' }));
    }
  });

  ws.on('close', () => {
    console.log('Voice chat client disconnected');
  });
});

function getOrCreateSession(sessionId) {
  if (!sessions.has(sessionId)) {
    sessions.set(sessionId, new AIGirlfriend(sessionId));
  }
  return sessions.get(sessionId);
}

// Start server
server.listen(PORT, HOST, () => {
  console.log(`\n  AI Girlfriend Voice Chat`);
  console.log(`  ========================`);
  console.log(`  Server running at http://${HOST}:${PORT}`);
  console.log(`  AI Name: ${process.env.AI_NAME || 'Luna'}`);
  console.log(`  Voice: ${process.env.TTS_VOICE || 'nova'}\n`);
});
