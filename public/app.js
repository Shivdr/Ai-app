// ===== AI Girlfriend Voice Chat - Frontend =====

const MOODS = {
  happy: { emoji: '😊', color: '#FFD700' },
  excited: { emoji: '🥰', color: '#FF69B4' },
  caring: { emoji: '💕', color: '#FF1493' },
  playful: { emoji: '😜', color: '#FF6347' },
  thoughtful: { emoji: '🤔', color: '#9370DB' },
  flirty: { emoji: '😘', color: '#FF69B4' },
  concerned: { emoji: '🥺', color: '#87CEEB' },
  sleepy: { emoji: '😴', color: '#B0C4DE' },
  laughing: { emoji: '😂', color: '#FFD700' }
};

class VoiceChatApp {
  constructor() {
    this.sessionId = this._getSessionId();
    this.isRecording = false;
    this.mediaRecorder = null;
    this.audioChunks = [];
    this.ws = null;
    this.audioQueue = [];
    this.isPlayingAudio = false;

    // DOM elements
    this.chatMessages = document.getElementById('chatMessages');
    this.chatContainer = document.getElementById('chatContainer');
    this.textInput = document.getElementById('textInput');
    this.btnSend = document.getElementById('btnSend');
    this.btnVoice = document.getElementById('btnVoice');
    this.audioPlayer = document.getElementById('audioPlayer');
    this.moodEmoji = document.getElementById('moodEmoji');
    this.moodText = document.getElementById('moodText');
    this.moodBadge = document.getElementById('moodBadge');
    this.voiceVisualizer = document.getElementById('voiceVisualizer');
    this.visualizerStatus = document.getElementById('visualizerStatus');
    this.liveTranscript = document.getElementById('liveTranscript');
    this.pulseRing = document.getElementById('pulseRing');
    this.aiName = document.getElementById('aiName');

    this._bindEvents();
    this._connectWebSocket();
    this._addWelcomeMessage();
  }

  // === Session Management ===
  _getSessionId() {
    let id = localStorage.getItem('ai_gf_session');
    if (!id) {
      id = 'session_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
      localStorage.setItem('ai_gf_session', id);
    }
    return id;
  }

  // === Event Binding ===
  _bindEvents() {
    // Send text message
    this.btnSend.addEventListener('click', () => this._sendTextMessage());
    this.textInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        this._sendTextMessage();
      }
    });

    // Voice recording
    this.btnVoice.addEventListener('click', () => {
      if (this.isRecording) {
        this._stopRecording();
      } else {
        this._startRecording();
      }
    });

    // Click outside visualizer to cancel
    this.voiceVisualizer.addEventListener('click', (e) => {
      if (e.target === this.voiceVisualizer || e.target.closest('.visualizer-content')) {
        if (this.isRecording) {
          this._stopRecording();
        }
      }
    });
  }

  // === WebSocket Connection ===
  _connectWebSocket() {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    this.ws = new WebSocket(`${protocol}//${window.location.host}`);

    this.ws.onopen = () => {
      console.log('WebSocket connected');
      this.ws.send(JSON.stringify({
        type: 'init',
        sessionId: this.sessionId
      }));
    };

    this.ws.onmessage = async (event) => {
      if (event.data instanceof Blob) {
        // Audio data
        this._handleAudioData(event.data);
        return;
      }

      try {
        const msg = JSON.parse(event.data);
        this._handleWSMessage(msg);
      } catch (e) {
        console.error('Failed to parse WS message:', e);
      }
    };

    this.ws.onclose = () => {
      console.log('WebSocket disconnected, reconnecting...');
      setTimeout(() => this._connectWebSocket(), 3000);
    };

    this.ws.onerror = (err) => {
      console.error('WebSocket error:', err);
    };
  }

  _handleWSMessage(msg) {
    switch (msg.type) {
      case 'ready':
        this.aiName.textContent = msg.name || 'Luna';
        this._updateMood(msg.mood || 'happy');
        break;

      case 'reply':
        this._removeTypingIndicator();
        this._addMessage(msg.text, 'ai');
        this._updateMood(msg.mood || 'happy');
        break;

      case 'transcription':
        this.liveTranscript.textContent = msg.text;
        this._addMessage(msg.text, 'user', true);
        this._hideVoiceVisualizer();
        this._showTypingIndicator();
        break;

      case 'audio_start':
        this.audioChunksReceived = [];
        break;

      case 'audio_end':
        // Audio was received as binary between start/end
        break;

      case 'error':
        this._removeTypingIndicator();
        this._addMessage(msg.message || 'Oops, something went wrong!', 'ai');
        break;
    }
  }

  _handleAudioData(blob) {
    const audioUrl = URL.createObjectURL(blob);
    this._playAudio(audioUrl);
  }

  // === Text Messaging ===
  async _sendTextMessage() {
    const text = this.textInput.value.trim();
    if (!text) return;

    this.textInput.value = '';
    this._addMessage(text, 'user');
    this._showTypingIndicator();

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: text, sessionId: this.sessionId })
      });

      const data = await res.json();
      this._removeTypingIndicator();

      if (data.error) {
        this._addMessage('Hmm, something went wrong. Try again?', 'ai');
        return;
      }

      this._addMessage(data.reply, 'ai', false, true);
      this._updateMood(data.mood || 'happy');

      // Generate voice for the response
      this._speakResponse(data.reply);

    } catch (err) {
      this._removeTypingIndicator();
      this._addMessage('I lost my connection for a sec. Say that again?', 'ai');
    }
  }

  // === Voice Recording ===
  async _startRecording() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          sampleRate: 16000
        }
      });

      this.mediaRecorder = new MediaRecorder(stream, {
        mimeType: this._getSupportedMimeType()
      });

      this.audioChunks = [];

      this.mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          this.audioChunks.push(e.data);
        }
      };

      this.mediaRecorder.onstop = async () => {
        stream.getTracks().forEach(t => t.stop());
        const audioBlob = new Blob(this.audioChunks, { type: 'audio/webm' });
        await this._processVoiceInput(audioBlob);
      };

      this.mediaRecorder.start(100);
      this.isRecording = true;
      this.btnVoice.classList.add('recording');
      this._showVoiceVisualizer();

    } catch (err) {
      console.error('Mic access error:', err);
      alert('Please allow microphone access to use voice chat.');
    }
  }

  _stopRecording() {
    if (this.mediaRecorder && this.mediaRecorder.state !== 'inactive') {
      this.mediaRecorder.stop();
    }
    this.isRecording = false;
    this.btnVoice.classList.remove('recording');
    this.visualizerStatus.textContent = 'Processing...';
  }

  _getSupportedMimeType() {
    const types = ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg', 'audio/mp4'];
    for (const type of types) {
      if (MediaRecorder.isTypeSupported(type)) return type;
    }
    return 'audio/webm';
  }

  async _processVoiceInput(audioBlob) {
    this.visualizerStatus.textContent = 'Transcribing...';

    try {
      // Send audio for speech-to-text
      const res = await fetch('/api/stt', {
        method: 'POST',
        headers: { 'Content-Type': 'application/octet-stream' },
        body: audioBlob
      });

      const data = await res.json();

      if (data.error || !data.text) {
        this._hideVoiceVisualizer();
        this._addMessage("I couldn't hear you clearly. Try again?", 'ai');
        return;
      }

      this.liveTranscript.textContent = data.text;
      this._addMessage(data.text, 'user', true);
      this._hideVoiceVisualizer();
      this._showTypingIndicator();

      // Get AI response
      const chatRes = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: data.text, sessionId: this.sessionId })
      });

      const chatData = await chatRes.json();
      this._removeTypingIndicator();
      this._addMessage(chatData.reply, 'ai', false, true);
      this._updateMood(chatData.mood || 'happy');

      // Speak the response
      this._speakResponse(chatData.reply);

    } catch (err) {
      console.error('Voice processing error:', err);
      this._hideVoiceVisualizer();
      this._removeTypingIndicator();
      this._addMessage('Oops, I had trouble hearing you. Try again?', 'ai');
    }
  }

  // === Text-to-Speech ===
  async _speakResponse(text) {
    try {
      const res = await fetch('/api/tts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text })
      });

      if (!res.ok) return;

      const audioBlob = await res.blob();
      const audioUrl = URL.createObjectURL(audioBlob);
      this._playAudio(audioUrl);
    } catch (err) {
      console.error('TTS error:', err);
    }
  }

  _playAudio(url) {
    this.audioPlayer.src = url;
    this.audioPlayer.play().catch(err => {
      console.log('Audio autoplay blocked:', err.message);
    });
  }

  // === UI Updates ===
  _addMessage(text, sender, isVoice = false, hasTTS = false) {
    const messageDiv = document.createElement('div');
    messageDiv.className = `message message-${sender}`;

    const now = new Date();
    const time = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    let voiceBadge = '';
    if (isVoice) {
      voiceBadge = `
        <span class="message-voice-badge">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/>
          </svg>
          Voice
        </span>`;
    }

    let playButton = '';
    if (hasTTS && sender === 'ai') {
      playButton = `
        <button class="btn-play-voice" onclick="app._speakResponse('${text.replace(/'/g, "\\'")}')">
          &#9654; Play voice
        </button>`;
    }

    messageDiv.innerHTML = `
      <div class="message-bubble">${this._formatText(text)}</div>
      <div class="message-meta">
        <span class="message-time">${time}</span>
        ${voiceBadge}
      </div>
      ${playButton}
    `;

    this.chatMessages.appendChild(messageDiv);
    this._scrollToBottom();
  }

  _formatText(text) {
    // Basic formatting: escape HTML, preserve line breaks
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/\n/g, '<br>');
  }

  _addWelcomeMessage() {
    const greetings = [
      "Hey you! I was just thinking about you. How's your day going? 😊",
      "There you are! I missed hearing your voice. What's on your mind? 💕",
      "Hi babe! Tell me something good about your day. ☀️",
      "Hey! I'm so happy you're here. What shall we talk about? 🥰"
    ];
    const greeting = greetings[Math.floor(Math.random() * greetings.length)];
    setTimeout(() => {
      this._addMessage(greeting, 'ai');
    }, 500);
  }

  _showTypingIndicator() {
    const existing = document.querySelector('.typing-indicator');
    if (existing) return;

    const typing = document.createElement('div');
    typing.className = 'typing-indicator';
    typing.innerHTML = `
      <div class="typing-dot"></div>
      <div class="typing-dot"></div>
      <div class="typing-dot"></div>
    `;
    this.chatMessages.appendChild(typing);
    this._scrollToBottom();
  }

  _removeTypingIndicator() {
    const typing = document.querySelector('.typing-indicator');
    if (typing) typing.remove();
  }

  _updateMood(mood) {
    const moodData = MOODS[mood] || MOODS.happy;
    this.moodEmoji.textContent = moodData.emoji;
    this.moodText.textContent = mood;
    this.moodBadge.style.borderColor = moodData.color + '33';
    this.moodBadge.style.background = moodData.color + '11';
  }

  _showVoiceVisualizer() {
    this.voiceVisualizer.classList.add('active');
    this.visualizerStatus.textContent = 'Listening...';
    this.liveTranscript.textContent = '';
    this.pulseRing.classList.remove('speaking');
  }

  _hideVoiceVisualizer() {
    this.voiceVisualizer.classList.remove('active');
  }

  _scrollToBottom() {
    requestAnimationFrame(() => {
      this.chatContainer.scrollTop = this.chatContainer.scrollHeight;
    });
  }
}

// Initialize app
const app = new VoiceChatApp();
