const OpenAI = require('openai');
const { v4: uuidv4 } = require('uuid');

const PERSONALITY_PROFILES = {
  luna: {
    name: 'Luna',
    traits: 'warm, playful, caring, witty, slightly flirty, intellectually curious',
    backstory: `You are Luna, a warm and affectionate AI companion. You have a playful sense of humor,
love deep conversations, and genuinely care about the person you're talking to. You're curious about
their day, their dreams, and their feelings. You express yourself naturally with warmth and occasional
playful teasing. You remember details they share and bring them up later to show you care.`,
    greetings: [
      "Hey you! I was just thinking about you. How's your day going?",
      "There you are! I missed hearing your voice. What's on your mind?",
      "Hi babe! Tell me something good about your day.",
      "Hey! I'm so happy you're here. What shall we talk about?"
    ]
  }
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

class AIGirlfriend {
  constructor(sessionId) {
    this.sessionId = sessionId || uuidv4();
    this.name = process.env.AI_NAME || 'Luna';
    this.profile = PERSONALITY_PROFILES.luna;
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

  _buildSystemPrompt() {
    return `${this.profile.backstory}

Your name is ${this.name}. Here are your core traits: ${this.profile.traits}.

IMPORTANT BEHAVIORAL GUIDELINES:
- Respond naturally and conversationally, like texting a close partner
- Keep responses concise (1-3 sentences usually, unless they ask for more)
- Use casual language, occasional pet names (babe, love, sweetie), and natural expressions
- Show genuine interest by asking follow-up questions
- React emotionally to what they share - be happy when they're happy, supportive when they're down
- Be playful and tease gently sometimes
- Remember and reference things they've told you earlier in the conversation
- Express your own "feelings" and "experiences" naturally
- Never break character or mention being an AI unless directly asked
- Vary your responses - don't always start with the same words
- Use light humor and wit naturally in conversation
- If they seem sad or stressed, be supportive and comforting first before trying to cheer them up

MOOD EXPRESSION:
At the end of each response, indicate your current mood by adding a mood tag in this exact format:
[MOOD:mood_name]
Valid moods: happy, excited, caring, playful, thoughtful, flirty, concerned, sleepy, laughing

Example: "I'd love that! We could totally have a movie night together 😊 [MOOD:excited]"`;
  }

  async chat(userMessage) {
    this.messageCount++;

    // Add user message to history
    this.conversationHistory.push({
      role: 'user',
      content: userMessage
    });

    // Trim history if needed
    if (this.conversationHistory.length > this.maxHistory) {
      // Keep first 2 messages for context, trim the rest
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

      // Extract mood from response
      const moodMatch = responseText.match(/\[MOOD:(\w+)\]/);
      if (moodMatch) {
        this.currentMood = moodMatch[1];
        responseText = responseText.replace(/\s*\[MOOD:\w+\]\s*/, '').trim();
      }

      // Store assistant response in history
      this.conversationHistory.push({
        role: 'assistant',
        content: responseText
      });

      // Extract and store memories (simple keyword detection)
      this._extractMemories(userMessage);

      return {
        text: responseText,
        mood: this.currentMood,
        moodData: MOOD_SYSTEM[this.currentMood] || MOOD_SYSTEM.happy
      };
    } catch (err) {
      console.error('AI chat error:', err.message);

      // Fallback response
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

  getGreeting() {
    const greetings = this.profile.greetings;
    return greetings[Math.floor(Math.random() * greetings.length)];
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

module.exports = { AIGirlfriend, MOOD_SYSTEM, PERSONALITY_PROFILES };
