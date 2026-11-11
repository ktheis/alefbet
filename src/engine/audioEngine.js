/**
 * Audio & Liturgical Cadence Engine
 * Uses pre-fetched authentic Israeli Hebrew audio files (src/audio/words/*.mp3 & src/audio/letters/*.mp3)
 * plus optional Wikimedia Commons / Lingua Libre native human speaker recordings (*_human.wav).
 * Falls back to Web Speech TTS only if an audio file cannot be played.
 */

window.AlefBetEngine = window.AlefBetEngine || {};

(function () {
  class AudioEngine {
    constructor() {
      this.muted = false;
      this.ttsEnabled = true;
      this.preferHumanRecording = false; // false = consistent Vocalized Israeli Studio MP3; true = Wikimedia human WAV when available
      this.hebrewVoice = null;
      this.fallbackVoice = null;
      this.audioCtx = null;
      this.activeAudio = null;
      this.audioCache = new Map();
      this.initVoices();
      this.preloadCoreAudio();
    }

    initVoices() {
      if (!('speechSynthesis' in window)) return;
      const load = () => {
        const voices = window.speechSynthesis.getVoices() || [];
        this.hebrewVoice = voices.find((v) => v.lang && v.lang.toLowerCase().startsWith('he')) || null;
        this.fallbackVoice =
          voices.find((v) => v.lang && v.lang.toLowerCase().startsWith('en') && v.default) ||
          voices[0] ||
          null;
      };
      load();
      window.speechSynthesis.onvoiceschanged = load;
    }

    preloadCoreAudio() {
      const manifest = window.AlefBetData && window.AlefBetData.AUDIO_MANIFEST;
      if (!manifest) return;
      // Pre-warm Audio objects for the 16 starter/builder words and 27 letters
      Object.values(manifest.words || {}).forEach((info) => {
        if (info.mp3) {
          const a = new Audio();
          a.preload = 'auto';
          a.src = info.mp3;
          this.audioCache.set(info.mp3, a);
        }
      });
      Object.values(manifest.letters || {}).forEach((info) => {
        if (info.mp3) {
          const a = new Audio();
          a.preload = 'auto';
          a.src = info.mp3;
          this.audioCache.set(info.mp3, a);
        }
      });
    }

    ensureAudioCtx() {
      if (!this.audioCtx && (window.AudioContext || window.webkitAudioContext)) {
        const Ctx = window.AudioContext || window.webkitAudioContext;
        this.audioCtx = new Ctx();
      }
      if (this.audioCtx && this.audioCtx.state === 'suspended') {
        this.audioCtx.resume();
      }
    }

    stopCurrentAudio() {
      if (this.activeAudio) {
        try {
          this.activeAudio.pause();
          this.activeAudio.currentTime = 0;
        } catch (e) {}
        this.activeAudio = null;
      }
      if ('speechSynthesis' in window) {
        try {
          window.speechSynthesis.cancel();
        } catch (e) {}
      }
    }

    /**
     * Play a local audio file URL at a playback rate proportional to Speed Dial (SPM)
     */
    playAudioUrl(url, speedSpm = 60, onErrorFallback = null) {
      if (!url) {
        if (onErrorFallback) onErrorFallback();
        return;
      }
      try {
        this.stopCurrentAudio();
        let audioEl = this.audioCache.get(url);
        if (!audioEl) {
          audioEl = new Audio(url);
          this.audioCache.set(url, audioEl);
        } else {
          audioEl.currentTime = 0;
        }

        // Map Speed Dial (30..130 SPM, where 65 SPM is natural 1.0x) to clean playbackRate
        const rate = Math.max(0.75, Math.min(1.45, speedSpm / 65));
        audioEl.playbackRate = rate;
        if ('preservesPitch' in audioEl) audioEl.preservesPitch = true;
        if ('webkitPreservesPitch' in audioEl) audioEl.webkitPreservesPitch = true;
        audioEl.volume = 0.95;

        this.activeAudio = audioEl;
        const playPromise = audioEl.play();
        if (playPromise && typeof playPromise.catch === 'function') {
          playPromise.catch(() => {
            if (onErrorFallback) onErrorFallback();
          });
        }
      } catch (e) {
        if (onErrorFallback) onErrorFallback();
      }
    }

    /**
     * Returns metadata about the available authentic audio for a word
     */
    getWordAudioInfo(wordObj) {
      if (!wordObj) return null;
      const manifest = window.AlefBetData && window.AlefBetData.AUDIO_MANIFEST;
      if (!manifest || !manifest.words) return null;
      return manifest.words[wordObj.hebrew] || null;
    }

    /**
     * Returns metadata about the available authentic audio for a Hebrew letter
     */
    getLetterAudioInfo(charOrId) {
      if (!charOrId) return null;
      const manifest = window.AlefBetData && window.AlefBetData.AUDIO_MANIFEST;
      if (!manifest || !manifest.letters) return null;
      if (manifest.letters[charOrId]) return manifest.letters[charOrId];
      return Object.values(manifest.letters).find((l) => l.id === charOrId) || null;
    }

    /**
     * Speaks a Hebrew word using pre-fetched authentic Hebrew audio (or specific variant 'mp3' | 'human')
     */
    speakWord(wordObj, speedSpm = 60, forceVariant = null) {
      if (this.muted || !this.ttsEnabled || !wordObj) {
        this.playStepTick();
        return;
      }

      const info = this.getWordAudioInfo(wordObj);
      if (info) {
        let chosenUrl = info.mp3 || info.primary;
        if (forceVariant === 'human' && info.humanAudio) {
          chosenUrl = info.humanAudio;
        } else if (forceVariant === 'studio' && info.mp3) {
          chosenUrl = info.mp3;
        } else if (this.preferHumanRecording && info.humanAudio) {
          chosenUrl = info.humanAudio;
        }

        if (chosenUrl) {
          this.playAudioUrl(chosenUrl, speedSpm, () => {
            this.speakWordFallbackTts(wordObj, speedSpm);
          });
          return;
        }
      }

      this.speakWordFallbackTts(wordObj, speedSpm);
    }

    /**
     * Speaks a Hebrew letter's authentic name (e.g. אָלֶף, בֵּית, מֵם סוֹפִית)
     */
    speakLetter(charOrId, speedSpm = 65) {
      if (this.muted || !this.ttsEnabled || !charOrId) return;

      const info = this.getLetterAudioInfo(charOrId);
      if (info && (info.mp3 || info.primary)) {
        const url = info.mp3 || info.primary;
        this.playAudioUrl(url, speedSpm, () => {
          this.playStepTick();
        });
        return;
      }

      this.playStepTick();
    }

    speakWordFallbackTts(wordObj, speedSpm = 60) {
      if (!('speechSynthesis' in window)) {
        this.playStepTick();
        return;
      }
      try {
        window.speechSynthesis.cancel();
        const rate = Math.max(0.65, Math.min(1.45, speedSpm / 65));
        const utter = new SpeechSynthesisUtterance();
        if (this.hebrewVoice) {
          const spokenHeb = wordObj.hebrew === 'יהוה' ? 'אֲדֹנָי' : (wordObj.vocalized || wordObj.hebrew);
          utter.text = spokenHeb;
          utter.voice = this.hebrewVoice;
          utter.lang = 'he-IL';
        } else {
          utter.text = (wordObj.translit || '').replace(/'/g, '');
          if (this.fallbackVoice) utter.voice = this.fallbackVoice;
        }
        utter.rate = rate;
        utter.volume = 0.9;
        window.speechSynthesis.speak(utter);
      } catch (e) {
        this.playStepTick();
      }
    }

    playStepTick() {
      if (this.muted) return;
      try {
        this.ensureAudioCtx();
        if (!this.audioCtx) return;
        const osc = this.audioCtx.createOscillator();
        const gain = this.audioCtx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(440, this.audioCtx.currentTime);
        gain.gain.setValueAtTime(0.03, this.audioCtx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, this.audioCtx.currentTime + 0.06);
        osc.connect(gain);
        gain.connect(this.audioCtx.destination);
        osc.start();
        osc.stop(this.audioCtx.currentTime + 0.06);
      } catch (e) {}
    }

    playCheckpointChime() {
      if (this.muted) return;
      try {
        this.ensureAudioCtx();
        if (!this.audioCtx) return;
        const now = this.audioCtx.currentTime;
        [523.25, 659.25].forEach((freq, idx) => {
          const osc = this.audioCtx.createOscillator();
          const gain = this.audioCtx.createGain();
          osc.type = 'triangle';
          osc.frequency.setValueAtTime(freq, now + idx * 0.09);
          gain.gain.setValueAtTime(0.08, now + idx * 0.09);
          gain.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.09 + 0.22);
          osc.connect(gain);
          gain.connect(this.audioCtx.destination);
          osc.start(now + idx * 0.09);
          osc.stop(now + idx * 0.09 + 0.22);
        });
      } catch (e) {}
    }

    playSuccessTone() {
      if (this.muted) return;
      try {
        this.ensureAudioCtx();
        if (!this.audioCtx) return;
        const now = this.audioCtx.currentTime;
        [587.33, 880].forEach((freq, idx) => {
          const osc = this.audioCtx.createOscillator();
          const gain = this.audioCtx.createGain();
          osc.type = 'sine';
          osc.frequency.setValueAtTime(freq, now + idx * 0.07);
          gain.gain.setValueAtTime(0.08, now + idx * 0.07);
          gain.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.07 + 0.18);
          osc.connect(gain);
          gain.connect(this.audioCtx.destination);
          osc.start(now + idx * 0.07);
          osc.stop(now + idx * 0.07 + 0.18);
        });
      } catch (e) {}
    }

    playGentleMissTone() {
      if (this.muted) return;
      try {
        this.ensureAudioCtx();
        if (!this.audioCtx) return;
        const now = this.audioCtx.currentTime;
        const osc = this.audioCtx.createOscillator();
        const gain = this.audioCtx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(310, now);
        osc.frequency.linearRampToValueAtTime(260, now + 0.18);
        gain.gain.setValueAtTime(0.08, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.2);
        osc.connect(gain);
        gain.connect(this.audioCtx.destination);
        osc.start(now);
        osc.stop(now + 0.2);
      } catch (e) {}
    }
  }

  window.AlefBetEngine.AudioEngine = AudioEngine;
})();
