require('dotenv').config();
const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const path = require('path');
const { AIGirlfriend, PERSONALITY_PRESETS, AVATAR_OPTIONS, VOICE_OPTIONS, DEFAULT_CONFIG } = require('./src/ai-girlfriend');
const { VoiceHandler } = require('./src/voice-handler');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

const PORT = process.env.PORT || 3000;
const HOST = process.env.HOST || 'localhost';

// Serve static files
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json({ limit: '10mb' }));

// Store active sessions and their configs
const sessions = new Map();
const sessionConfigs = new Map();

// === Customization API ===

// Get all customization options (presets, voices, avatars, etc.)
app.get('/api/customize/options', (req, res) => {
  res.json({
    personalities: PERSONALITY_PRESETS,
    avatarColors: AVATAR_OPTIONS.colors,
    avatarEmojis: AVATAR_OPTIONS.emojis,
    voices: VOICE_OPTIONS,
    defaults: DEFAULT_CONFIG,
    languages: {
      casual: 'Casual & Chill',
      formal: 'Formal & Elegant',
      slang: 'Gen-Z / Internet Slang',
      poetic: 'Poetic & Lyrical'
    },
    responseLengths: {
      short: 'Short & Punchy',
      medium: 'Balanced',
      long: 'Detailed & Expressive'
    },
    flirtLevels: {
      none: 'Just Friends',
      subtle: 'Subtle Hints',
      moderate: 'Naturally Flirty',
      high: 'Very Flirty'
    },
    interestOptions: [
      'Music', 'Gaming', 'Anime', 'Movies', 'Cooking', 'Fitness',
      'Art', 'Travel', 'Books', 'Technology', 'Fashion', 'Nature',
      'Photography', 'Science', 'Sports', 'Dancing', 'Astrology', 'Memes'
    ]
  });
});

// Get current config for a session
app.get('/api/customize/:sessionId', (req, res) => {
  const config = sessionConfigs.get(req.params.sessionId) || DEFAULT_CONFIG;
  res.json({ config });
});

// Update config for a session
app.post('/api/customize/:sessionId', (req, res) => {
  const { config } = req.body;
  if (!config) {
    return res.status(400).json({ error: 'Config is required' });
  }

  const sessionId = req.params.sessionId;
  const mergedConfig = { ...DEFAULT_CONFIG, ...config };
  sessionConfigs.set(sessionId, mergedConfig);

  // Update existing AI session if active
  const ai = sessions.get(sessionId);
  if (ai) {
    ai.updateConfig(mergedConfig);
  }

  res.json({
    config: mergedConfig,
    message: 'Settings updated!'
  });
});

// === Chat API ===

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

// Text-to-Speech (uses session voice config)
app.post('/api/tts', async (req, res) => {
  const { text, sessionId } = req.body;
  if (!text) {
    return res.status(400).json({ error: 'Text is required' });
  }

  try {
    const config = sessionConfigs.get(sessionId) || DEFAULT_CONFIG;
    const voiceHandler = new VoiceHandler({
      voice: config.voice,
      speed: config.voiceSpeed
    });
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

// Speech-to-Text
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

// Get conversation history
app.get('/api/history/:sessionId', (req, res) => {
  const ai = sessions.get(req.params.sessionId);
  if (!ai) {
    return res.json({ history: [] });
  }
  res.json({ history: ai.getHistory() });
});

// Get AI status/mood
app.get('/api/status/:sessionId', (req, res) => {
  const ai = sessions.get(req.params.sessionId);
  const config = sessionConfigs.get(req.params.sessionId) || DEFAULT_CONFIG;
  if (!ai) {
    return res.json({ mood: 'happy', name: config.name });
  }
  res.json({
    mood: ai.currentMood,
    name: ai.name,
    messageCount: ai.messageCount
  });
});

// Reset conversation (keep config)
app.post('/api/reset/:sessionId', (req, res) => {
  const sessionId = req.params.sessionId;
  sessions.delete(sessionId);
  res.json({ message: 'Conversation reset!' });
});

// WebSocket for real-time voice chat
wss.on('connection', (ws) => {
  console.log('Voice chat client connected');
  let ai = null;
  let voiceHandler = new VoiceHandler();

  ws.on('message', async (data) => {
    try {
      if (typeof data === 'string' || (data instanceof Buffer && data[0] === 0x7b)) {
        const msg = JSON.parse(data.toString());

        if (msg.type === 'init') {
          ai = getOrCreateSession(msg.sessionId || 'default');
          const config = sessionConfigs.get(msg.sessionId) || DEFAULT_CONFIG;
          voiceHandler = new VoiceHandler({
            voice: config.voice,
            speed: config.voiceSpeed
          });
          ws.send(JSON.stringify({
            type: 'ready',
            name: ai.name,
            mood: ai.currentMood,
            config: ai.getConfig()
          }));
        } else if (msg.type === 'text') {
          if (!ai) ai = getOrCreateSession('default');
          const reply = await ai.chat(msg.text);

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
        } else if (msg.type === 'config_updated') {
          // Refresh voice handler with new config
          const config = sessionConfigs.get(msg.sessionId) || DEFAULT_CONFIG;
          voiceHandler = new VoiceHandler({
            voice: config.voice,
            speed: config.voiceSpeed
          });
        }
      } else {
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
    const config = sessionConfigs.get(sessionId) || {};
    sessions.set(sessionId, new AIGirlfriend(sessionId, config));
  }
  return sessions.get(sessionId);
}

// Start server
server.listen(PORT, HOST, () => {
  console.log(`\n  AI Girlfriend Voice Chat`);
  console.log(`  ========================`);
  console.log(`  Server running at http://${HOST}:${PORT}`);
  console.log(`  Default AI: ${DEFAULT_CONFIG.name}`);
  console.log(`  Default Voice: ${DEFAULT_CONFIG.voice}\n`);
});
