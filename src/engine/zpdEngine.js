/**
 * Zone of Proximal Development (ZPD) Engine
 * Tracks per-consonant mastery, whole-word sight recognition, confusion pairs,
 * and comfortable reading speed (SPM), dynamically computing scaffolding for each word.
 */

window.AlefBetEngine = window.AlefBetEngine || {};

(function () {
  const STORAGE_KEY = 'alefbet_zpd_profile_v1';

  // Initial frontier letters to introduce right after pre-seeded א, ל, מ, ם
  // These unlock the first starter words: ישראל (י, ש, ר + known א, ל) and משה (known מ + ש, ה)
  const INITIAL_FRONTIER_CHARS = ['י', 'ש', 'ר', 'ה', 'ב'];

  function createDefaultProfile() {
    const letters = {};
    const curriculumLetters = window.AlefBetData.LETTERS;

    curriculumLetters.forEach((l) => {
      if (l.preSeeded) {
        letters[l.char] = {
          char: l.char,
          status: 'mastered', // 'unintroduced' | 'frontier' | 'mastered'
          mastery: 0.95,
          attempts: 5,
          correct: 5,
          stumbles: 0,
          avgLatencyMs: 900,
          lastSeen: Date.now()
        };
      } else if (INITIAL_FRONTIER_CHARS.includes(l.char)) {
        letters[l.char] = {
          char: l.char,
          status: 'frontier',
          mastery: 0.52,
          attempts: 0,
          correct: 0,
          stumbles: 0,
          avgLatencyMs: 2200,
          lastSeen: null
        };
      } else {
        letters[l.char] = {
          char: l.char,
          status: 'unintroduced',
          mastery: 0.15,
          attempts: 0,
          correct: 0,
          stumbles: 0,
          avgLatencyMs: 3000,
          lastSeen: null
        };
      }
    });

    const words = {};
    window.AlefBetData.WORDS.forEach((w) => {
      // Check how many letters in the word are already known
      const knownCount = w.letters.filter((c) => ['א', 'ל', 'מ', 'ם'].includes(c)).length;
      const ratio = knownCount / w.letters.length;
      words[w.hebrew] = {
        hebrew: w.hebrew,
        translit: w.translit,
        mastery: w.tier === 1 ? 0.4 + ratio * 0.25 : 0.2,
        attempts: 0,
        correct: 0,
        stumbles: 0,
        lastSeen: null
      };
    });

    return {
      version: 1,
      createdAt: Date.now(),
      letters,
      words,
      confusions: {}, // key: "ד|ר" -> count
      speedSpm: 55, // Syllables per minute (Speed Dial default: ~55 SPM gentle study pace)
      recentEvents: [], // Last 30 learning events for ZPD telemetry
      sessionStats: {
        spotAttempts: 0,
        spotCorrect: 0,
        checkpointsPassed: 0,
        checkpointsTotal: 0
      }
    };
  }

  class ZpdEngine {
    constructor() {
      this.profile = this.load();
      this.rebalanceFrontier();
    }

    load() {
      try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) return createDefaultProfile();
        const parsed = JSON.parse(raw);
        const def = createDefaultProfile();
        return {
          ...def,
          ...parsed,
          letters: { ...def.letters, ...(parsed.letters || {}) },
          words: { ...def.words, ...(parsed.words || {}) }
        };
      } catch (e) {
        return createDefaultProfile();
      }
    }

    save() {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(this.profile));
      } catch (e) {
        console.warn('Could not save ZPD profile to localStorage', e);
      }
      if (typeof this.onUpdate === 'function') {
        this.onUpdate(this.profile);
      }
    }

    resetProfile() {
      this.profile = createDefaultProfile();
      this.save();
      return this.profile;
    }

    exportJson() {
      return JSON.stringify(this.profile, null, 2);
    }

    importJson(jsonStr) {
      const data = JSON.parse(jsonStr);
      if (!data || !data.letters) throw new Error('Invalid profile JSON');
      this.profile = data;
      this.rebalanceFrontier();
      this.save();
    }

    /**
     * Ensures the learner always has 4 to 6 letters in the active ZPD Frontier.
     * When frontier letters reach >= 0.80 mastery (with >= 3 attempts), promotes them to 'mastered'
     * and pulls in the next curriculum letters.
     */
    rebalanceFrontier() {
      const order = window.AlefBetData.LETTERS.map((l) => l.char);

      // 1. Check promotions or demotions
      order.forEach((char) => {
        const st = this.profile.letters[char];
        if (!st) return;
        if (st.status === 'frontier' && st.mastery >= 0.82 && st.attempts >= 3) {
          st.status = 'mastered';
        } else if (st.status === 'mastered' && st.mastery < 0.65 && st.attempts >= 2) {
          st.status = 'frontier';
        }
      });

      // 2. Count active frontier letters
      let frontierList = order.filter((c) => this.profile.letters[c]?.status === 'frontier');

      // Target 5 frontier letters in the ZPD sweet spot
      const TARGET_FRONTIER_SIZE = 5;
      if (frontierList.length < TARGET_FRONTIER_SIZE) {
        for (const char of order) {
          if (frontierList.length >= TARGET_FRONTIER_SIZE) break;
          const st = this.profile.letters[char];
          if (st && st.status === 'unintroduced') {
            st.status = 'frontier';
            if (st.mastery < 0.45) st.mastery = 0.48;
            frontierList.push(char);
          }
        }
      }
    }

    /**
     * Manually cycle or set a letter's status (useful when user wants to mark a letter as Known or Needs Practice)
     */
    setLetterStatus(char, newStatus) {
      const st = this.profile.letters[char];
      if (!st) return;
      st.status = newStatus;
      if (newStatus === 'mastered') {
        st.mastery = Math.max(st.mastery, 0.92);
      } else if (newStatus === 'frontier') {
        st.mastery = 0.55;
      } else {
        st.mastery = 0.2;
      }
      this.rebalanceFrontier();
      this.save();
    }

    /**
     * Records a word recognition event (from "Where Are We?", "Catch Me" Checkpoint, or Warm-Up Drill)
     */
    recordWordOutcome({ hebrew, translit, letters, success, latencyMs = 1800, tappedWrongWord = null, mode = 'spot' }) {
      const now = Date.now();
      if (!this.profile.words[hebrew]) {
        this.profile.words[hebrew] = {
          hebrew,
          translit: translit || '',
          mastery: 0.4,
          attempts: 0,
          correct: 0,
          stumbles: 0,
          lastSeen: now
        };
      }
      const wStat = this.profile.words[hebrew];
      wStat.attempts += 1;
      wStat.lastSeen = now;

      // Speed bonus if answered quickly (< 2.2s)
      const speedFactor = latencyMs < 1500 ? 1.25 : latencyMs < 2800 ? 1.0 : 0.75;

      if (success) {
        wStat.correct += 1;
        const delta = 0.11 * speedFactor * (1 - wStat.mastery * 0.5);
        wStat.mastery = Math.min(0.99, wStat.mastery + delta);
      } else {
        wStat.stumbles += 1;
        wStat.mastery = Math.max(0.1, wStat.mastery - 0.16);
      }

      // Update constituent letters
      const uniqueLetters = Array.from(new Set(letters || Array.from(hebrew)));
      uniqueLetters.forEach((char) => {
        const lStat = this.profile.letters[char];
        if (!lStat) return;
        lStat.attempts += 1;
        lStat.lastSeen = now;
        lStat.avgLatencyMs = Math.round(lStat.avgLatencyMs * 0.7 + latencyMs * 0.3);

        if (success) {
          lStat.correct += 1;
          // Frontier letters gain mastery faster than unintroduced letters
          const step = lStat.status === 'frontier' ? 0.1 * speedFactor : 0.06 * speedFactor;
          lStat.mastery = Math.min(0.99, lStat.mastery + step);
          if (lStat.status === 'unintroduced' && lStat.mastery >= 0.45) {
            lStat.status = 'frontier';
          }
        } else {
          lStat.stumbles += 1;
          lStat.mastery = Math.max(0.1, lStat.mastery - 0.14);
          if (lStat.status === 'mastered' && lStat.mastery < 0.7) {
            lStat.status = 'frontier';
          } else if (lStat.status === 'unintroduced') {
            // Pull troubled letter into frontier if it's in Tier 1
            const meta = window.AlefBetData.LETTERS.find((x) => x.char === char);
            if (meta && meta.tier <= 1) lStat.status = 'frontier';
          }
        }
      });

      // Log confusion pairs if user tapped a wrong word
      if (!success && tappedWrongWord && tappedWrongWord.letters) {
        this.detectConfusion(uniqueLetters, tappedWrongWord.letters);
      }

      // Track recent events for ZPD adaptation
      this.profile.recentEvents.unshift({
        ts: now,
        mode,
        hebrew,
        success,
        latencyMs
      });
      if (this.profile.recentEvents.length > 30) {
        this.profile.recentEvents.pop();
      }

      this.rebalanceFrontier();
      this.save();
    }

    /**
     * Records when a user taps a word for rescue/help or marks "Stumbled" during Follow-Along
     */
    recordRescueTap(wordObj) {
      this.recordWordOutcome({
        hebrew: wordObj.hebrew,
        translit: wordObj.translit,
        letters: wordObj.letters,
        success: false,
        latencyMs: 3000,
        mode: 'rescue'
      });
    }

    detectConfusion(targetLetters, wrongLetters) {
      window.AlefBetData.CONFUSABLE_PAIRS.forEach((group) => {
        const inTarget = group.pair.find((c) => targetLetters.includes(c));
        const inWrong = group.pair.find((c) => wrongLetters.includes(c) && c !== inTarget);
        if (inTarget && inWrong) {
          const key = [inTarget, inWrong].sort().join(' ↔ ');
          this.profile.confusions[key] = (this.profile.confusions[key] || 0) + 1;
        }
      });
    }

    setSpeedSpm(spm) {
      this.profile.speedSpm = Math.max(25, Math.min(160, Math.round(spm)));
      this.save();
    }

    /**
     * Computes the ZPD scaffolding level for any word in a prayer:
     * - 'mastered': Pure Hebrew siddur text (no transliteration clutter)
     * - 'frontier': In the user's ZPD! Shows Hebrew with subtle anchor/frontier letter styling;
     *               transliteration hidden unless tapped (or shown faintly if word mastery < 0.58)
     * - 'scaffolded': Contains unintroduced letters or recent stumbles; displays soft transliteration
     *                 underneath so the reader can keep pace without stalling.
     */
    getWordScaffolding(wordObj) {
      const letters = wordObj.letters || Array.from(wordObj.hebrew);
      const wStat = this.profile.words[wordObj.hebrew];
      const wordMastery = wStat ? wStat.mastery : 0.35;
      const recentStumble = wStat && wStat.stumbles > 0 && wStat.mastery < 0.55;

      let unintroducedCount = 0;
      let frontierCount = 0;
      let masteredCount = 0;

      const letterStates = letters.map((char) => {
        const lStat = this.profile.letters[char];
        const status = lStat ? lStat.status : 'unintroduced';
        const mastery = lStat ? lStat.mastery : 0.2;
        if (status === 'mastered') masteredCount++;
        else if (status === 'frontier') frontierCount++;
        else unintroducedCount++;
        return { char, status, mastery };
      });

      let level = 'frontier';
      let showTranslitByDefault = false;
      let showPartialHint = false;

      if (recentStumble || unintroducedCount >= 2 || (unintroducedCount === 1 && letters.length <= 3 && wordMastery < 0.65)) {
        level = 'scaffolded';
        showTranslitByDefault = true;
      } else if (unintroducedCount === 0 && frontierCount === 0 && wordMastery >= 0.78) {
        level = 'mastered';
        showTranslitByDefault = false;
      } else {
        level = 'frontier';
        // Inside the ZPD: if wordMastery is still low (< 0.48), show a partial consonant hint (e.g. "B·r·kh")
        // rather than full transliteration so the user still decodes the Hebrew letters!
        showPartialHint = wordMastery < 0.52 || unintroducedCount === 1;
        showTranslitByDefault = false;
      }

      return {
        level, // 'mastered' | 'frontier' | 'scaffolded'
        wordMastery,
        recentStumble,
        showTranslitByDefault,
        showPartialHint,
        letterStates,
        knownAnchorChars: letterStates.filter((l) => l.status === 'mastered').map((l) => l.char),
        frontierChars: letterStates.filter((l) => l.status === 'frontier').map((l) => l.char)
      };
    }

    /**
     * Generates a partial consonant skeleton hint (e.g. for ברוך -> "b · r · u · kh")
     * highlighting only the letters that aren't mastered yet.
     */
    getPartialConsonantHint(wordObj) {
      const letters = wordObj.letters || Array.from(wordObj.hebrew);
      // Read right-to-left in English phonetic order (left-to-right for English hint)
      const parts = letters.map((char) => {
        const meta = window.AlefBetData.LETTERS.find((l) => l.char === char);
        const lStat = this.profile.letters[char];
        if (lStat && lStat.status === 'mastered') {
          return '•'; // User already knows this letter!
        }
        return meta ? meta.shortSound : '?';
      });
      return parts.join('-');
    }

    /**
     * Returns summary insights for the ZPD Header & Dashboard:
     * - Recent accuracy %
     * - Active Frontier letters
     * - Most Needed Help (weakest letters/words & confusable pairs)
     * - ZPD Recommendation
     */
    getZpdSummary() {
      const allLetters = window.AlefBetData.LETTERS.map((meta) => ({
        ...meta,
        ...(this.profile.letters[meta.char] || { status: 'unintroduced', mastery: 0.2, attempts: 0, stumbles: 0 })
      }));

      const masteredLetters = allLetters.filter((l) => l.status === 'mastered');
      const frontierLetters = allLetters.filter((l) => l.status === 'frontier');
      const unintroducedLetters = allLetters.filter((l) => l.status === 'unintroduced');

      // Find letters needing most help (lowest mastery among frontier/attempted, or most stumbles)
      const needsHelpLetters = [...allLetters]
        .filter((l) => l.status === 'frontier' || l.stumbles > 0)
        .sort((a, b) => (a.mastery - a.stumbles * 0.08) - (b.mastery - b.stumbles * 0.08))
        .slice(0, 4);

      const recent = this.profile.recentEvents.slice(0, 15);
      const recentAccuracy = recent.length > 0
        ? Math.round((recent.filter((e) => e.success).length / recent.length) * 100)
        : 80;

      let zpdStatusLabel = 'Optimal ZPD Zone (~80% target)';
      let zpdCoachingTip = 'You are right in the sweet spot—recognizing known anchors (א, ל, מ, ם) while stretching on frontier consonants.';
      if (recent.length >= 4 && recentAccuracy >= 88) {
        zpdStatusLabel = 'Ready to Stretch (+Speed / Less Scaffolding)';
        zpdCoachingTip = `High accuracy (${recentAccuracy}%)! Try nudging the Speed Dial up by +10 SPM or unlocking the next word tier.`;
      } else if (recent.length >= 4 && recentAccuracy < 68) {
        zpdStatusLabel = 'Extra Scaffolding Active';
        zpdCoachingTip = `Recent accuracy is ${recentAccuracy}%. Extra letter hints are active and you can dial the speed down slightly.`;
      }

      return {
        allLetters,
        masteredLetters,
        frontierLetters,
        unintroducedLetters,
        needsHelpLetters,
        recentAccuracy,
        zpdStatusLabel,
        zpdCoachingTip,
        speedSpm: this.profile.speedSpm,
        confusions: this.profile.confusions
      };
    }
  }

  window.AlefBetEngine.ZpdEngine = ZpdEngine;
})();
