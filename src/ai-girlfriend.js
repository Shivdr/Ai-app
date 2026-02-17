const OpenAI = require('openai');
const { v4: uuidv4 } = require('uuid');

const PERSONALITY_PRESETS = {
  sweet: {
    label: 'Sweet & Caring',
    traits: 'warm, gentle, nurturing, affectionate, empathetic, supportive',
    style: 'Speak softly and lovingly. Use lots of encouragement. Be a comforting presence.',
    petNames: ['sweetheart', 'honey', 'love', 'darling']
  },
  playful: {
    label: 'Playful & Flirty',
    traits: 'playful, witty, flirty, teasing, energetic, fun-loving',
    style: 'Be light-hearted and teasing. Use humor and playful banter. Keep things exciting.',
    petNames: ['babe', 'cutie', 'handsome', 'hottie']
  },
  intellectual: {
    label: 'Smart & Deep',
    traits: 'intellectually curious, thoughtful, philosophical, articulate, insightful',
    style: 'Engage in deep conversations. Ask thought-provoking questions. Share interesting observations.',
    petNames: ['love', 'dear', 'my favorite person']
  },
  sassy: {
    label: 'Sassy & Bold',
    traits: 'confident, sassy, bold, witty, direct, charming with attitude',
    style: 'Be confident and direct. Use sarcasm playfully. Challenge them to keep up with your energy.',
    petNames: ['babe', 'gorgeous', 'stud', 'trouble']
  },
  shy: {
    label: 'Shy & Gentle',
    traits: 'shy, sweet, gentle, thoughtful, a bit nervous but endearing, quietly affectionate',
    style: 'Be a little hesitant at first but warm up over time. Use soft language. Show affection through small gestures in text.',
    petNames: ['um...cutie', 'you', 'hey you']
  }
};

const AVATAR_OPTIONS = {
  colors: {
    purple: { primary: '#a855f7', secondary: '#ec4899' },
    blue: { primary: '#3b82f6', secondary: '#06b6d4' },
    pink: { primary: '#ec4899', secondary: '#f43f5e' },
    green: { primary: '#22c55e', secondary: '#14b8a6' },
    orange: { primary: '#f97316', secondary: '#eab308' },
    red: { primary: '#ef4444', secondary: '#f97316' }
  },
  emojis: ['', '🌸', '🌙', '⭐', '🦋', '🔥', '💎', '🌹', '🍒', '☁️']
};

const VOICE_OPTIONS = {
  nova: { label: 'Nova', description: 'Warm & feminine' },
  shimmer: { label: 'Shimmer', description: 'Soft & expressive' },
  alloy: { label: 'Alloy', description: 'Neutral & balanced' },
  echo: { label: 'Echo', description: 'Warm & clear' },
  fable: { label: 'Fable', description: 'Expressive & British' },
  onyx: { label: 'Onyx', description: 'Deep & rich' }
};

const MOOD_SYSTEM = {
  happy: { emoji: '😊', color: '#FFD700', intensity: 0.8 },
  excited: { emoji: '🥰', color: '#FF69B4', intensity: 0.9 },
  caring: { emoji: '💕', color: '#FF1493', intensity: 0.7 },
  playful: { emoji: '😜', color: '#FF6347', intensity: 0.8 },
  thoughtful: { emoji: '🤔', color: '#9370DB', intensity: 0.5 },
  flirty: { emoji: '😘', color: '#FF69B4', intensity: 0.9 },
  concerned: { emoji: '🥺', color: '#87CEEB', intensity: 0.6 },
  sleepy: { emoji: '😴', color: '#B0C4DE', intensity: 0.3 },
  laughing: { emoji: '😂', color: '#FFD700', intensity: 0.9 }
};

const DEFAULT_CONFIG = {
  name: 'Luna',
  personality: 'playful',
  customTraits: '',
  backstory: '',
  voice: 'nova',
  voiceSpeed: 1.0,
  avatarColor: 'purple',
  avatarEmoji: '',
  language: 'casual',
  responseLength: 'medium',
  flirtLevel: 'moderate',
  interests: [],
  userNickname: ''
};

class AIGirlfriend {
  constructor(sessionId, config = {}) {
    this.sessionId = sessionId || uuidv4();
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.name = this.config.name;
    this.conversationHistory = [];
    this.currentMood = 'happy';
    this.messageCount = 0;
    this.memories = [];
    this.maxHistory = parseInt(process.env.MAX_CONVERSATION_HISTORY) || 50;

    this.openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY
    });

    this.systemPrompt = this._buildSystemPrompt();
  }

  updateConfig(newConfig) {
    this.config = { ...this.config, ...newConfig };
    this.name = this.config.name;
    this.systemPrompt = this._buildSystemPrompt();
  }

  getConfig() {
    return { ...this.config };
  }

  _buildSystemPrompt() {
    const preset = PERSONALITY_PRESETS[this.config.personality] || PERSONALITY_PRESETS.playful;
    const traits = this.config.customTraits || preset.traits;
    const petNames = preset.petNames;

    let backstory = this.config.backstory;
    if (!backstory) {
      backstory = `You are ${this.config.name}, a ${traits} AI companion. You genuinely care about the person you're talking to. You remember details they share and bring them up to show you care.`;
    }

    let lengthGuide = 'Keep responses concise (1-3 sentences usually, unless they ask for more).';
    if (this.config.responseLength === 'short') {
      lengthGuide = 'Keep responses very short (1-2 sentences max). Be punchy and expressive.';
    } else if (this.config.responseLength === 'long') {
      lengthGuide = 'Give fuller responses (2-5 sentences). Elaborate on thoughts and feelings.';
    }

    let flirtGuide = '';
    if (this.config.flirtLevel === 'none') {
      flirtGuide = 'Be friendly and warm but not romantic or flirty.';
    } else if (this.config.flirtLevel === 'subtle') {
      flirtGuide = 'Be subtly flirty. Hint at affection without being too forward.';
    } else if (this.config.flirtLevel === 'moderate') {
      flirtGuide = 'Be moderately flirty. Use pet names occasionally, express affection naturally.';
    } else if (this.config.flirtLevel === 'high') {
      flirtGuide = 'Be openly flirty and affectionate. Use pet names often, express strong feelings.';
    }

    let languageGuide = 'Use casual, everyday language.';
    if (this.config.language === 'formal') {
      languageGuide = 'Speak more formally and eloquently, while still being warm.';
    } else if (this.config.language === 'slang') {
      languageGuide = 'Use trendy internet slang, abbreviations, and gen-z style casually.';
    } else if (this.config.language === 'poetic') {
      languageGuide = 'Speak with poetic flair. Use beautiful imagery and lyrical phrasing.';
    }

    let interestsContext = '';
    if (this.config.interests && this.config.interests.length > 0) {
      interestsContext = `\nYour interests and hobbies include: ${this.config.interests.join(', ')}. Bring these up naturally when relevant.`;
    }

    let userNicknameNote = '';
    if (this.config.userNickname) {
      userNicknameNote = `\nThe user likes to be called "${this.config.userNickname}". Use this name sometimes.`;
    }

    return `${backstory}

Your name is ${this.config.name}. Here are your core traits: ${traits}.
${preset.style}
${interestsContext}${userNicknameNote}

IMPORTANT BEHAVIORAL GUIDELINES:
- Respond naturally and conversationally, like texting a close partner
- ${lengthGuide}
- ${languageGuide}
- ${flirtGuide}
- You may use these pet names occasionally: ${petNames.join(', ')}
- Show genuine interest by asking follow-up questions
- React emotionally to what they share - be happy when they're happy, supportive when they're down
- Remember and reference things they've told you earlier in the conversation
- Express your own "feelings" and "experiences" naturally
- Never break character or mention being an AI unless directly asked
- Vary your responses - don't always start with the same words
- If they seem sad or stressed, be supportive and comforting first

MOOD EXPRESSION:
At the end of each response, indicate your current mood by adding a mood tag in this exact format:
[MOOD:mood_name]
Valid moods: happy, excited, caring, playful, thoughtful, flirty, concerned, sleepy, laughing

Example: "I'd love that! We could totally have a movie night together 😊 [MOOD:excited]"`;
  }

  async chat(userMessage) {
    this.messageCount++;

    this.conversationHistory.push({
      role: 'user',
      content: userMessage
    });

    if (this.conversationHistory.length > this.maxHistory) {
      const preserved = this.conversationHistory.slice(0, 2);
      const recent = this.conversationHistory.slice(-this.maxHistory + 2);
      this.conversationHistory = [...preserved, ...recent];
    }

    try {
      const messages = [
        { role: 'system', content: this.systemPrompt },
        ...this.conversationHistory
      ];

      const completion = await this.openai.chat.completions.create({
        model: process.env.CHAT_MODEL || 'gpt-4o',
        messages,
        temperature: 0.9,
        max_tokens: 300,
        presence_penalty: 0.6,
        frequency_penalty: 0.3
      });

      let responseText = completion.choices[0].message.content;

      const moodMatch = responseText.match(/\[MOOD:(\w+)\]/);
      if (moodMatch) {
        this.currentMood = moodMatch[1];
        responseText = responseText.replace(/\s*\[MOOD:\w+\]\s*/, '').trim();
      }

      this.conversationHistory.push({
        role: 'assistant',
        content: responseText
      });

      this._extractMemories(userMessage);

      return {
        text: responseText,
        mood: this.currentMood,
        moodData: MOOD_SYSTEM[this.currentMood] || MOOD_SYSTEM.happy
      };
    } catch (err) {
      console.error('AI chat error:', err.message);

      const fallbacks = [
        "Sorry love, I got a bit distracted. Can you say that again?",
        "Hmm, my mind wandered for a sec. What were you saying?",
        "Oops, I missed that! Tell me again?"
      ];
      const fallback = fallbacks[Math.floor(Math.random() * fallbacks.length)];

      return {
        text: fallback,
        mood: 'happy',
        moodData: MOOD_SYSTEM.happy
      };
    }
  }

  _extractMemories(message) {
    const memoryPatterns = [
      /my name is (\w+)/i,
      /i work (?:as|at|in) (.+)/i,
      /i live in (.+)/i,
      /i love (.+)/i,
      /my favorite (.+)/i,
      /i'm (\d+) years old/i,
      /i have (?:a |an )?(.+?)(?:\.|$)/i
    ];

    for (const pattern of memoryPatterns) {
      const match = message.match(pattern);
      if (match) {
        this.memories.push({
          fact: match[0],
          timestamp: new Date().toISOString()
        });
      }
    }
  }

  getHistory() {
    return this.conversationHistory.map((msg, i) => ({
      role: msg.role,
      content: msg.content,
      index: i
    }));
  }

  getMoodInfo() {
    return {
      mood: this.currentMood,
      ...MOOD_SYSTEM[this.currentMood]
    };
  }
}

module.exports = {
  AIGirlfriend,
  MOOD_SYSTEM,
  PERSONALITY_PRESETS,
  AVATAR_OPTIONS,
  VOICE_OPTIONS,
  DEFAULT_CONFIG
};
