const OpenAI = require('openai');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { v4: uuidv4 } = require('uuid');

class VoiceHandler {
  constructor() {
    this.openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY
    });
    this.ttsVoice = process.env.TTS_VOICE || 'nova';
    this.ttsModel = process.env.TTS_MODEL || 'tts-1';
    this.ttsSpeed = parseFloat(process.env.TTS_SPEED) || 1.0;
    this.sttModel = process.env.STT_MODEL || 'whisper-1';
  }

  async textToSpeech(text) {
    // Clean text for speech (remove emojis, special chars)
    const cleanText = text
      .replace(/[\u{1F600}-\u{1F64F}]/gu, '')
      .replace(/[\u{1F300}-\u{1F5FF}]/gu, '')
      .replace(/[\u{1F680}-\u{1F6FF}]/gu, '')
      .replace(/[\u{1F1E0}-\u{1F1FF}]/gu, '')
      .replace(/[\u{2600}-\u{26FF}]/gu, '')
      .replace(/[\u{2700}-\u{27BF}]/gu, '')
      .trim();

    if (!cleanText) {
      throw new Error('No speakable text after cleaning');
    }

    const response = await this.openai.audio.speech.create({
      model: this.ttsModel,
      voice: this.ttsVoice,
      input: cleanText,
      speed: this.ttsSpeed,
      response_format: 'mp3'
    });

    const buffer = Buffer.from(await response.arrayBuffer());
    return buffer;
  }

  async speechToText(audioBuffer) {
    // Write audio to temp file for the API
    const tempFile = path.join(os.tmpdir(), `voice_${uuidv4()}.webm`);

    try {
      fs.writeFileSync(tempFile, audioBuffer);

      const transcription = await this.openai.audio.transcriptions.create({
        file: fs.createReadStream(tempFile),
        model: this.sttModel,
        language: 'en'
      });

      return transcription.text;
    } finally {
      // Clean up temp file
      try {
        fs.unlinkSync(tempFile);
      } catch (e) {
        // ignore cleanup errors
      }
    }
  }
}

module.exports = { VoiceHandler };
