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

    // Config / customization state
    this.config = {};
    this.options = null;

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
    this.avatarEl = document.getElementById('avatar');
    this.avatarLetter = document.getElementById('avatarLetter');
    this.pulseAvatar = document.getElementById('pulseAvatar');
    this.pulseAvatarLetter = document.getElementById('pulseAvatarLetter');

    // Settings elements
    this.settingsOverlay = document.getElementById('settingsOverlay');
    this.btnSettings = document.getElementById('btnSettings');
    this.btnCloseSettings = document.getElementById('btnCloseSettings');
    this.btnSaveSettings = document.getElementById('btnSaveSettings');
    this.btnResetChat = document.getElementById('btnResetChat');

    this._bindEvents();
    this._loadOptions().then(() => {
      this._loadConfig().then(() => {
        this._applyConfigToUI();
        this._connectWebSocket();
        this._addWelcomeMessage();
      });
    });
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

  // === Load options and config from server ===
  async _loadOptions() {
    try {
      const res = await fetch('/api/customize/options');
      this.options = await res.json();
    } catch (e) {
      console.error('Failed to load options:', e);
      this.options = null;
    }
  }

  async _loadConfig() {
    // Try localStorage first for instant load
    const saved = localStorage.getItem('ai_gf_config');
    if (saved) {
      try {
        this.config = JSON.parse(saved);
      } catch (e) {
        this.config = {};
      }
    }

    // Then sync from server
    try {
      const res = await fetch(`/api/customize/${this.sessionId}`);
      const data = await res.json();
      if (data.config) {
        this.config = { ...data.config, ...this.config };
      }
    } catch (e) {
      console.error('Failed to load config:', e);
    }

    // Fill defaults
    if (this.options && this.options.defaults) {
      this.config = { ...this.options.defaults, ...this.config };
    }
  }

  async _saveConfig() {
    localStorage.setItem('ai_gf_config', JSON.stringify(this.config));

    try {
      await fetch(`/api/customize/${this.sessionId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ config: this.config })
      });

      // Notify WebSocket to refresh voice handler
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        this.ws.send(JSON.stringify({
          type: 'config_updated',
          sessionId: this.sessionId
        }));
      }
    } catch (e) {
      console.error('Failed to save config:', e);
    }
  }

  // === Apply config to visible UI ===
  _applyConfigToUI() {
    const name = this.config.name || 'Luna';
    const letter = name.charAt(0).toUpperCase();

    this.aiName.textContent = name;
    this.avatarLetter.textContent = letter;
    this.pulseAvatarLetter.textContent = letter;
    document.title = `${name} - AI Voice Chat`;

    // Avatar color
    if (this.options && this.options.avatarColors && this.config.avatarColor) {
      const colors = this.options.avatarColors[this.config.avatarColor];
      if (colors) {
        const grad = `linear-gradient(135deg, ${colors.primary}, ${colors.secondary})`;
        this.avatarEl.style.background = grad;
        this.pulseAvatar.style.background = grad;
        document.documentElement.style.setProperty('--accent', colors.primary);
        document.documentElement.style.setProperty('--accent-secondary', colors.secondary);
        document.documentElement.style.setProperty('--accent-glow', colors.primary + '4D');
      }
    }
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

    // Settings
    this.btnSettings.addEventListener('click', () => this._openSettings());
    this.btnCloseSettings.addEventListener('click', () => this._closeSettings());
    this.settingsOverlay.addEventListener('click', (e) => {
      if (e.target === this.settingsOverlay) this._closeSettings();
    });
    this.btnSaveSettings.addEventListener('click', () => this._handleSaveSettings());
    this.btnResetChat.addEventListener('click', () => this._handleResetChat());
  }

  // ========== SETTINGS PANEL ==========

  _openSettings() {
    this._populateSettingsForm();
    this.settingsOverlay.classList.add('active');
  }

  _closeSettings() {
    this.settingsOverlay.classList.remove('active');
  }

  _populateSettingsForm() {
    if (!this.options) return;

    // Name & nickname
    document.getElementById('cfgName').value = this.config.name || '';
    document.getElementById('cfgUserNickname').value = this.config.userNickname || '';
    document.getElementById('cfgCustomTraits').value = this.config.customTraits || '';
    document.getElementById('cfgBackstory').value = this.config.backstory || '';

    // Voice speed
    const speedSlider = document.getElementById('cfgVoiceSpeed');
    speedSlider.value = this.config.voiceSpeed || 1.0;
    document.getElementById('voiceSpeedValue').textContent = parseFloat(speedSlider.value).toFixed(1) + 'x';
    speedSlider.addEventListener('input', () => {
      document.getElementById('voiceSpeedValue').textContent = parseFloat(speedSlider.value).toFixed(1) + 'x';
    });

    // Personality presets
    const personalityGrid = document.getElementById('personalityGrid');
    personalityGrid.innerHTML = '';
    for (const [key, preset] of Object.entries(this.options.personalities)) {
      const card = document.createElement('div');
      card.className = 'preset-card' + (this.config.personality === key ? ' selected' : '');
      card.dataset.value = key;
      card.innerHTML = `<div class="preset-label">${preset.label}</div><div class="preset-desc">${preset.traits.split(',').slice(0, 3).join(', ')}</div>`;
      card.addEventListener('click', () => {
        personalityGrid.querySelectorAll('.preset-card').forEach(c => c.classList.remove('selected'));
        card.classList.add('selected');
      });
      personalityGrid.appendChild(card);
    }

    // Voice grid
    const voiceGrid = document.getElementById('voiceGrid');
    voiceGrid.innerHTML = '';
    for (const [key, voice] of Object.entries(this.options.voices)) {
      const card = document.createElement('div');
      card.className = 'voice-card' + (this.config.voice === key ? ' selected' : '');
      card.dataset.value = key;
      card.innerHTML = `<div class="voice-label">${voice.label}</div><div class="voice-desc">${voice.description}</div>`;
      card.addEventListener('click', () => {
        voiceGrid.querySelectorAll('.voice-card').forEach(c => c.classList.remove('selected'));
        card.classList.add('selected');
      });
      voiceGrid.appendChild(card);
    }

    // Color grid
    const colorGrid = document.getElementById('colorGrid');
    colorGrid.innerHTML = '';
    for (const [key, colors] of Object.entries(this.options.avatarColors)) {
      const swatch = document.createElement('div');
      swatch.className = 'color-swatch' + (this.config.avatarColor === key ? ' selected' : '');
      swatch.dataset.value = key;
      swatch.style.background = `linear-gradient(135deg, ${colors.primary}, ${colors.secondary})`;
      swatch.addEventListener('click', () => {
        colorGrid.querySelectorAll('.color-swatch').forEach(c => c.classList.remove('selected'));
        swatch.classList.add('selected');
      });
      colorGrid.appendChild(swatch);
    }

    // Language pills
    this._buildPillGrid('languageGrid', this.options.languages, this.config.language || 'casual');

    // Response length pills
    this._buildPillGrid('responseLengthGrid', this.options.responseLengths, this.config.responseLength || 'medium');

    // Flirt level pills
    this._buildPillGrid('flirtLevelGrid', this.options.flirtLevels, this.config.flirtLevel || 'moderate');

    // Interests chips
    const interestsGrid = document.getElementById('interestsGrid');
    interestsGrid.innerHTML = '';
    const selectedInterests = this.config.interests || [];
    for (const interest of this.options.interestOptions) {
      const chip = document.createElement('div');
      chip.className = 'interest-chip' + (selectedInterests.includes(interest) ? ' selected' : '');
      chip.dataset.value = interest;
      chip.textContent = interest;
      chip.addEventListener('click', () => chip.classList.toggle('selected'));
      interestsGrid.appendChild(chip);
    }
  }

  _buildPillGrid(gridId, options, selectedValue) {
    const grid = document.getElementById(gridId);
    grid.innerHTML = '';
    for (const [key, label] of Object.entries(options)) {
      const pill = document.createElement('div');
      pill.className = 'pill' + (selectedValue === key ? ' selected' : '');
      pill.dataset.value = key;
      pill.textContent = label;
      pill.addEventListener('click', () => {
        grid.querySelectorAll('.pill').forEach(p => p.classList.remove('selected'));
        pill.classList.add('selected');
      });
      grid.appendChild(pill);
    }
  }

  _readSettingsForm() {
    return {
      name: document.getElementById('cfgName').value.trim() || 'Luna',
      userNickname: document.getElementById('cfgUserNickname').value.trim(),
      personality: this._getSelectedValue('personalityGrid', 'preset-card') || 'playful',
      customTraits: document.getElementById('cfgCustomTraits').value.trim(),
      backstory: document.getElementById('cfgBackstory').value.trim(),
      voice: this._getSelectedValue('voiceGrid', 'voice-card') || 'nova',
      voiceSpeed: parseFloat(document.getElementById('cfgVoiceSpeed').value) || 1.0,
      avatarColor: this._getSelectedValue('colorGrid', 'color-swatch') || 'purple',
      language: this._getSelectedValue('languageGrid', 'pill') || 'casual',
      responseLength: this._getSelectedValue('responseLengthGrid', 'pill') || 'medium',
      flirtLevel: this._getSelectedValue('flirtLevelGrid', 'pill') || 'moderate',
      interests: this._getSelectedMultiple('interestsGrid', 'interest-chip')
    };
  }

  _getSelectedValue(gridId, cardClass) {
    const selected = document.getElementById(gridId).querySelector(`.${cardClass}.selected`);
    return selected ? selected.dataset.value : null;
  }

  _getSelectedMultiple(gridId, chipClass) {
    return Array.from(document.getElementById(gridId).querySelectorAll(`.${chipClass}.selected`))
      .map(el => el.dataset.value);
  }

  async _handleSaveSettings() {
    const newConfig = this._readSettingsForm();
    this.config = newConfig;
    await this._saveConfig();
    this._applyConfigToUI();
    this._closeSettings();
    this._showToast('Settings saved!');
  }

  async _handleResetChat() {
    if (!confirm('Reset the conversation? Your customization settings will be kept.')) return;

    try {
      await fetch(`/api/reset/${this.sessionId}`, { method: 'POST' });
      this.chatMessages.innerHTML = '<div class="date-divider"><span>Today</span></div>';
      this._addWelcomeMessage();
      this._closeSettings();
      this._showToast('Conversation reset!');
    } catch (e) {
      console.error('Reset failed:', e);
    }
  }

  _showToast(message) {
    let toast = document.querySelector('.toast');
    if (!toast) {
      toast = document.createElement('div');
      toast.className = 'toast';
      document.body.appendChild(toast);
    }
    toast.textContent = message;
    toast.classList.add('show');
    setTimeout(() => toast.classList.remove('show'), 2500);
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
        if (msg.name) this.aiName.textContent = msg.name;
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

      const chatRes = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: data.text, sessionId: this.sessionId })
      });

      const chatData = await chatRes.json();
      this._removeTypingIndicator();
      this._addMessage(chatData.reply, 'ai', false, true);
      this._updateMood(chatData.mood || 'happy');

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
        body: JSON.stringify({ text, sessionId: this.sessionId })
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
      const escapedText = text.replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/\n/g, '\\n');
      playButton = `
        <button class="btn-play-voice" onclick="app._speakResponse('${escapedText}')">
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
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/\n/g, '<br>');
  }

  _addWelcomeMessage() {
    const name = this.config.name || 'Luna';
    const personality = this.config.personality || 'playful';

    const greetingsByPersonality = {
      sweet: [
        `Hi there... I'm ${name}. I'm really happy you're here. How are you doing today?`,
        `Hey, it's ${name}. I've been thinking about you. Tell me about your day?`,
      ],
      playful: [
        `Hey you! ${name} here. I was just thinking about you. How's your day going?`,
        `There you are! I missed hearing your voice. What's on your mind?`,
      ],
      intellectual: [
        `Hello! It's ${name}. I just read the most fascinating thing. But first, how are you?`,
        `Hey there. ${name} here. I'd love to hear what's been on your mind lately.`,
      ],
      sassy: [
        `Well, well, well... look who finally showed up. It's ${name}. Miss me?`,
        `About time! ${name} here. I was getting bored without you.`,
      ],
      shy: [
        `Oh, h-hi! It's ${name}... I'm glad you're here. Um, how's your day?`,
        `Hey... it's ${name}. I was hoping you'd come talk to me today.`,
      ]
    };

    const greetings = greetingsByPersonality[personality] || greetingsByPersonality.playful;
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
