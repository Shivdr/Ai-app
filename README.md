# Luna - AI Girlfriend Voice Chat

An interactive AI companion app with real-time voice chat, text messaging, and dynamic mood/emotion system.

## Features

- **Voice Chat** - Talk using your microphone, hear AI responses spoken back
- **Text Chat** - Type messages with real-time AI responses
- **Mood System** - Dynamic emotional states (happy, excited, playful, flirty, caring, etc.)
- **Conversation Memory** - Remembers details you share across the session
- **Beautiful UI** - Dark-themed mobile-friendly chat interface
- **WebSocket Support** - Real-time communication for low-latency voice chat

## Tech Stack

- **Backend**: Node.js, Express, WebSocket (ws)
- **AI**: OpenAI GPT-4o for conversation, Whisper for speech-to-text, TTS for voice
- **Frontend**: Vanilla HTML/CSS/JS with Web Audio API

## Quick Start

### 1. Install dependencies

```bash
npm install
```

### 2. Configure environment

```bash
cp .env.example .env
```

Edit `.env` and add your OpenAI API key:

```
OPENAI_API_KEY=sk-your-key-here
```

### 3. Run the app

```bash
npm start
```

Open `http://localhost:3000` in your browser.

## Configuration

| Variable | Default | Description |
|----------|---------|-------------|
| `OPENAI_API_KEY` | - | Your OpenAI API key (required) |
| `PORT` | 3000 | Server port |
| `AI_NAME` | Luna | AI companion name |
| `TTS_VOICE` | nova | Voice style (alloy, echo, fable, onyx, nova, shimmer) |
| `CHAT_MODEL` | gpt-4o | Chat model to use |
| `MAX_CONVERSATION_HISTORY` | 50 | Max messages kept in memory |

## Project Structure

```
.
├── server.js              # Express + WebSocket server
├── src/
│   ├── ai-girlfriend.js   # AI personality, mood system, conversation engine
│   └── voice-handler.js   # OpenAI TTS and Whisper STT integration
├── public/
│   ├── index.html          # Chat UI
│   ├── styles.css          # Dark theme styles
│   └── app.js              # Frontend logic (recording, playback, chat)
├── .env.example            # Environment template
└── package.json
```
