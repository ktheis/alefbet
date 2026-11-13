/**
 * AlefBet Service Reader & Follow-Along Trainer
 * Main Application Controller & UI Renderer
 */

(function () {
  const zpd = new window.AlefBetEngine.ZpdEngine();
  const audio = new window.AlefBetEngine.AudioEngine();

  const state = {
    activeTab: 'follow', // 'follow' | 'spot' | 'warmup' | 'dashboard'
    selectedPrayerId: 'hamotzi',
    selectedWordInspector: null, // word object currently inspected
    showAnchorHighlights: true, // highlight known vs frontier letters inside words

    // Follow-Along Mode State
    follow: {
      isPlaying: false,
      currentWordIndex: 0,
      pointerStyle: 'stealth', // 'stealth' (default: all hints off) | 'guided' (moves word by word with hints, great if lost)
      showAnchorHighlights: false, // Off by default in stealth mode; enabled automatically in guided mode
      awaitingCheckpoint: false,
      checkpointTargetIndex: null,
      checkpointStartedAt: 0,
      checkpointFeedback: null, // { type: 'success'|'miss', message: string }
      timerId: null
    },

    // "Where Are We?" Spotting Mode State
    spot: {
      targetWordIndex: 0,
      promptStartedAt: Date.now(),
      streak: 0,
      feedback: null, // { type: 'success'|'miss', message: string, detail: string }
      wrongTappedIndices: [],
      cueType: 'context' // 'context' (phrase context + target) | 'word_only'
    },

    // Warm-up / 16-Word & Letter Drill State
    warmup: {
      subMode: 'words16', // 'words16' | 'quiz'
      selectedTierFilter: 'all', // 'all' | '1' | '2' | 'zpd'
      quizTarget: null,
      quizOptions: [],
      quizStartedAt: 0,
      quizFeedback: null
    },

    // 5th Tab: Custom Hebrew Text Input & Two Activities
    custom: {
      rawText: 'בְּרֵאשִׁית בָּרָא אֱלֹהִים אֵת הַשָּׁמַיִם וְאֵת הָאָרֶץ',
      words: [], // Parsed word objects: { index, hebrew, vocalized, translit, meaning, letters, inSystem, note }
      activity: 'system_audio', // 'system_audio' (Activity 1: Hear & find system word) | 'translit_spot' (Activity 2: Find random word by transliteration)
      targetWordIndex: null,
      promptStartedAt: Date.now(),
      streak: 0,
      feedback: null, // { type: 'success'|'miss', message: string, detail: string }
      wrongTappedIndices: [],
      showAudioHintTranslit: false
    }
  };

  function getSelectedPrayer() {
    return (
      window.AlefBetData.PRAYERS.find((p) => p.id === state.selectedPrayerId) ||
      window.AlefBetData.PRAYERS[0]
    );
  }

  // =========================================================================
  // FOLLOW-ALONG ENGINE (WITH SPEED DIAL & PHRASE-END "CATCH ME" CHECKPOINTS)
  // =========================================================================

  function stopFollowTimer() {
    if (state.follow.timerId) {
      clearTimeout(state.follow.timerId);
      state.follow.timerId = null;
    }
  }

  function startFollowAlong() {
    stopFollowTimer();
    const prayer = getSelectedPrayer();
    if (state.follow.currentWordIndex >= prayer.words.length) {
      state.follow.currentWordIndex = 0;
    }
    if (state.follow.pointerStyle === 'stealth') {
      state.selectedWordInspector = null;
    }
    state.follow.isPlaying = true;
    state.follow.awaitingCheckpoint = false;
    state.follow.checkpointFeedback = null;
    runFollowStep();
    render();
  }

  function pauseFollowAlong() {
    stopFollowTimer();
    state.follow.isPlaying = false;
    render();
  }

  function resetFollowAlong() {
    stopFollowTimer();
    state.follow.isPlaying = false;
    state.follow.currentWordIndex = 0;
    state.follow.awaitingCheckpoint = false;
    state.follow.checkpointTargetIndex = null;
    state.follow.checkpointFeedback = null;
    if (state.follow.pointerStyle === 'stealth') {
      state.selectedWordInspector = null;
    }
    render();
  }

  function runFollowStep() {
    stopFollowTimer();
    if (!state.follow.isPlaying) return;

    const prayer = getSelectedPrayer();
    const idx = state.follow.currentWordIndex;
    const word = prayer.words[idx];
    if (!word) {
      state.follow.isPlaying = false;
      render();
      return;
    }

    // Speak / chime the current word at the Speed Dial rate
    const spm = zpd.profile.speedSpm;
    audio.speakWord(word, spm);

    // Calculate duration for this word from syllable count and Speed Dial (SPM)
    const msPerSyllable = (60 * 1000) / Math.max(25, spm);
    const wordDurationMs = Math.max(550, Math.round((word.syllables || 2) * msPerSyllable));

    state.follow.timerId = setTimeout(() => {
      if (!state.follow.isPlaying) return;

      // Check if this word is the end of a phrase or sentence ("Catch Me" Checkpoint!)
      if (word.phraseEnd) {
        state.follow.isPlaying = false;
        state.follow.awaitingCheckpoint = true;
        state.follow.checkpointTargetIndex = idx;
        state.follow.checkpointStartedAt = Date.now();
        audio.playCheckpointChime();
        render();
        return;
      }

      // Otherwise advance to the next word in the phrase
      if (idx + 1 < prayer.words.length) {
        state.follow.currentWordIndex = idx + 1;
        render();
        runFollowStep();
      } else {
        state.follow.isPlaying = false;
        render();
      }
    }, wordDurationMs);
  }

  function handleFollowWordClick(wordIdx) {
    const prayer = getSelectedPrayer();
    const clickedWord = prayer.words[wordIdx];
    if (!clickedWord) return;

    // 1. If we are waiting at a "Catch Me" Checkpoint:
    if (state.follow.awaitingCheckpoint) {
      const targetIdx = state.follow.checkpointTargetIndex;
      const targetWord = prayer.words[targetIdx];
      const latencyMs = Date.now() - state.follow.checkpointStartedAt;

      zpd.profile.sessionStats.checkpointsTotal += 1;

      if (wordIdx === targetIdx) {
        // Passed the Catch Me checkpoint!
        zpd.profile.sessionStats.checkpointsPassed += 1;
        audio.playSuccessTone();
        zpd.recordWordOutcome({
          hebrew: targetWord.hebrew,
          translit: targetWord.translit,
          letters: targetWord.letters,
          success: true,
          latencyMs,
          mode: 'checkpoint'
        });

        const isLastWord = targetIdx + 1 >= prayer.words.length;
        state.follow.awaitingCheckpoint = false;
        state.follow.checkpointTargetIndex = null;
        state.selectedWordInspector = state.follow.pointerStyle === 'stealth' ? null : targetWord;

        if (isLastWord) {
          state.follow.checkpointFeedback = {
            type: 'success',
            message: `Spot on! You tracked all the way to the final word "${targetWord.hebrew}" (${targetWord.translit}). Prayer complete!`
          };
          state.follow.currentWordIndex = 0;
          render();
        } else {
          state.follow.checkpointFeedback = {
            type: 'success',
            message: `Locked on! You caught "${targetWord.hebrew}" (${targetWord.translit}) at the phrase boundary. Continuing next phrase...`
          };
          state.follow.currentWordIndex = targetIdx + 1;
          render();
          // Brief pause so user sees confirmation, then automatically resume next phrase!
          setTimeout(() => {
            if (!state.follow.awaitingCheckpoint) {
              state.follow.checkpointFeedback = null;
              state.follow.isPlaying = true;
              runFollowStep();
              render();
            }
          }, 950);
        }
      } else {
        // Tapped a different word at the checkpoint
        audio.playGentleMissTone();
        zpd.recordWordOutcome({
          hebrew: targetWord.hebrew,
          translit: targetWord.translit,
          letters: targetWord.letters,
          success: false,
          latencyMs,
          tappedWrongWord: clickedWord,
          mode: 'checkpoint'
        });
        state.selectedWordInspector = targetWord;
        state.follow.checkpointFeedback = {
          type: 'miss',
          message: `You tapped "${clickedWord.hebrew}" (${clickedWord.translit}), but the phrase ended on "${targetWord.hebrew}" (${targetWord.translit}). Tap "${targetWord.hebrew}" (outlined in amber) to resume!`
        };
        render();
      }
      return;
    }

    // 2. If not at a checkpoint: clicking a word inspects it, speaks it, and can jump or mark as Rescue
    pauseFollowAlong();
    state.follow.currentWordIndex = wordIdx;
    state.selectedWordInspector = clickedWord;
    audio.speakWord(clickedWord, zpd.profile.speedSpm);
    render();
  }

  // =========================================================================
  // "WHERE ARE WE?" WORD & PHRASE SPOTTING ENGINE
  // =========================================================================

  function pickNextSpotTarget() {
    const prayer = getSelectedPrayer();
    const words = prayer.words;

    // Weight words toward ZPD frontier or words needing help
    const weights = words.map((w, idx) => {
      if (idx === state.spot.targetWordIndex && words.length > 1) return 0.05;
      const scaff = zpd.getWordScaffolding(w);
      if (scaff.recentStumble) return 5.0;
      if (scaff.level === 'frontier') return 3.5;
      if (scaff.level === 'scaffolded') return 2.2;
      return 1.2;
    });

    const totalWeight = weights.reduce((a, b) => a + b, 0);
    let r = Math.random() * totalWeight;
    let chosenIdx = 0;
    for (let i = 0; i < weights.length; i++) {
      r -= weights[i];
      if (r <= 0) {
        chosenIdx = i;
        break;
      }
    }

    state.spot.targetWordIndex = chosenIdx;
    state.spot.promptStartedAt = Date.now();
    state.spot.wrongTappedIndices = [];
    const targetWord = prayer.words[chosenIdx];
    setTimeout(() => {
      audio.speakWord(targetWord, zpd.profile.speedSpm);
    }, 120);
  }

  function handleSpotWordClick(wordIdx) {
    const prayer = getSelectedPrayer();
    const clickedWord = prayer.words[wordIdx];
    const targetIdx = state.spot.targetWordIndex;
    const targetWord = prayer.words[targetIdx];
    const latencyMs = Date.now() - state.spot.promptStartedAt;

    zpd.profile.sessionStats.spotAttempts += 1;

    if (wordIdx === targetIdx || clickedWord.hebrew === targetWord.hebrew) {
      // Correct spot!
      zpd.profile.sessionStats.spotCorrect += 1;
      state.spot.streak += 1;
      audio.playSuccessTone();
      zpd.recordWordOutcome({
        hebrew: targetWord.hebrew,
        translit: targetWord.translit,
        letters: targetWord.letters,
        success: true,
        latencyMs,
        mode: 'spot'
      });

      state.selectedWordInspector = targetWord;
      state.spot.feedback = {
        type: 'success',
        message: `Found "${targetWord.hebrew}" (${targetWord.translit} — "${targetWord.meaning}") in ${(latencyMs / 1000).toFixed(1)}s!`,
        detail: targetWord.note || ''
      };
      render();

      setTimeout(() => {
        pickNextSpotTarget();
        render();
      }, 1100);
    } else {
      // Tapped wrong word
      state.spot.streak = 0;
      if (!state.spot.wrongTappedIndices.includes(wordIdx)) {
        state.spot.wrongTappedIndices.push(wordIdx);
      }
      audio.playGentleMissTone();
      zpd.recordWordOutcome({
        hebrew: targetWord.hebrew,
        translit: targetWord.translit,
        letters: targetWord.letters,
        success: false,
        latencyMs,
        tappedWrongWord: clickedWord,
        mode: 'spot'
      });

      state.selectedWordInspector = clickedWord;
      state.spot.feedback = {
        type: 'miss',
        message: `That word is "${clickedWord.hebrew}" (${clickedWord.translit} — "${clickedWord.meaning}").`,
        detail: `Keep scanning right-to-left for "${targetWord.translit}" (${ buildLetterHintForTarget(targetWord) })!`
      };
      render();
    }
  }

  function buildLetterHintForTarget(wordObj) {
    const firstChar = wordObj.letters[0];
    const lastChar = wordObj.letters[wordObj.letters.length - 1];
    const firstMeta = window.AlefBetData.LETTERS.find((l) => l.char === firstChar);
    const lastMeta = window.AlefBetData.LETTERS.find((l) => l.char === lastChar);
    return `starts on the right with ${firstChar} (${firstMeta ? firstMeta.name : ''}) and ends on the left with ${lastChar} (${lastMeta ? lastMeta.name : ''})`;
  }

  // =========================================================================
  // WARM-UP QUIZ GENERATOR (16 TARGET WORDS & CONFUSABLE PAIRS)
  // =========================================================================

  function generateWarmupQuiz() {
    const summary = zpd.getZpdSummary();
    const frontierChars = summary.frontierLetters.map((l) => l.char);

    // Prioritize words from the 16 curriculum words that contain frontier letters
    const allWords = window.AlefBetData.WORDS;
    const pool = allWords.filter((w) => w.letters.some((c) => frontierChars.includes(c)));
    const candidatePool = pool.length >= 3 ? pool : allWords;

    const target = candidatePool[Math.floor(Math.random() * candidatePool.length)];
    const distractors = allWords
      .filter((w) => w.hebrew !== target.hebrew)
      .sort(() => Math.random() - 0.5)
      .slice(0, 3);

    const options = [target, ...distractors].sort(() => Math.random() - 0.5);

    state.warmup.quizTarget = target;
    state.warmup.quizOptions = options;
    state.warmup.quizStartedAt = Date.now();
    state.warmup.quizFeedback = null;
  }

  function handleWarmupQuizAnswer(chosenWord) {
    const target = state.warmup.quizTarget;
    if (!target) return;
    const latencyMs = Date.now() - state.warmup.quizStartedAt;

    if (chosenWord.hebrew === target.hebrew) {
      audio.playSuccessTone();
      audio.speakWord(target, zpd.profile.speedSpm);
      zpd.recordWordOutcome({
        hebrew: target.hebrew,
        translit: target.translit,
        letters: target.letters,
        success: true,
        latencyMs,
        mode: 'warmup'
      });
      state.warmup.quizFeedback = {
        type: 'success',
        message: `Correct! ${target.hebrew} = ${target.translit} ("${target.meaning}"). ${target.anchorNote || ''}`
      };
      render();
      setTimeout(() => {
        generateWarmupQuiz();
        render();
      }, 1200);
    } else {
      audio.playGentleMissTone();
      zpd.recordWordOutcome({
        hebrew: target.hebrew,
        translit: target.translit,
        letters: target.letters,
        success: false,
        latencyMs,
        tappedWrongWord: chosenWord,
        mode: 'warmup'
      });
      state.warmup.quizFeedback = {
        type: 'miss',
        message: `You picked ${chosenWord.hebrew} (${chosenWord.translit}). Look for ${target.translit}: ${buildLetterHintForTarget(target)}.`
      };
      render();
    }
  }

  // =========================================================================
  // 5TH TAB ENGINE: CUSTOM HEBREW TEXT INPUT & TWO ACTIVITIES
  // =========================================================================

  // Dictionary of common non-system Hebrew words for polished transliteration & meaning when unvocalized
  const COMMON_NEW_WORDS_DICT = {
    'בראשית': { translit: 'Bereishit', meaning: 'In the beginning' },
    'ברא': { translit: 'bara', meaning: 'created' },
    'אלהים': { translit: 'Elohim', meaning: 'God' },
    'השמים': { translit: 'hashamayim', meaning: 'the heavens' },
    'שמים': { translit: 'shamayim', meaning: 'heavens / sky' },
    'ואת': { translit: "v'et", meaning: 'and (direct object)' },
    'שלום': { translit: 'shalom', meaning: 'peace / hello' },
    'עליכם': { translit: "'aleikhem", meaning: 'upon you' },
    'מלאכי': { translit: "mal'akhei", meaning: 'angels of' },
    'השרת': { translit: 'hasharet', meaning: 'the service / ministering' },
    'מלאך': { translit: "mal'akh", meaning: 'angel / messenger' },
    'עליון': { translit: "'elyon", meaning: 'Most High' },
    'שבת': { translit: 'Shabbat', meaning: 'Sabbath' },
    'קדש': { translit: 'kodesh', meaning: 'holiness / sacred' },
    'קדוש': { translit: 'kadosh', meaning: 'holy' },
    'אמן': { translit: 'amen', meaning: 'amen / truly' },
    'הללויה': { translit: 'halleluyah', meaning: 'praise the Lord' },
    'חיים': { translit: 'chayim', meaning: 'life' },
    'לחיים': { translit: "l'chayim", meaning: 'to life' },
    'תורה': { translit: 'Torah', meaning: 'Torah / teaching' },
    'מצוה': { translit: 'mitzvah', meaning: 'commandment' },
    'מצוות': { translit: 'mitzvot', meaning: 'commandments' },
    'תפילה': { translit: 'tefillah', meaning: 'prayer' },
    'אור': { translit: 'or', meaning: 'light' },
    'חשך': { translit: 'choshekh', meaning: 'darkness' },
    'חושך': { translit: 'choshekh', meaning: 'darkness' },
    'מים': { translit: 'mayim', meaning: 'water' },
    'יום': { translit: 'yom', meaning: 'day' },
    'לילה': { translit: 'laylah', meaning: 'night' },
    'ערב': { translit: "'erev", meaning: 'evening' },
    'בקר': { translit: 'boker', meaning: 'morning' },
    'בוקר': { translit: 'boker', meaning: 'morning' },
    'שיר': { translit: 'shir', meaning: 'song' },
    'חדש': { translit: 'chadash', meaning: 'new' },
    'לב': { translit: 'lev', meaning: 'heart' },
    'לבבך': { translit: 'levavekha', meaning: 'your heart' },
    'בית': { translit: 'bayit', meaning: 'house' },
    'אב': { translit: 'av', meaning: 'father' },
    'אם': { translit: 'em', meaning: 'mother' },
    'אחים': { translit: 'achim', meaning: 'brothers / siblings' },
    'יחד': { translit: 'yachad', meaning: 'together' },
    'הנה': { translit: 'hinei', meaning: 'behold' },
    'מה': { translit: 'mah', meaning: 'how / what' },
    'ומה': { translit: 'umah', meaning: 'and how / and what' },
    'נעים': { translit: "na'im", meaning: 'pleasant' },
    'גם': { translit: 'gam', meaning: 'also / even' },
    'כל': { translit: 'kol', meaning: 'all / every' },
    'כי': { translit: 'ki', meaning: 'for / because' },
    'לא': { translit: 'lo', meaning: 'not / no' },
    'על': { translit: "'al", meaning: 'upon / on' },
    'אל': { translit: "'el", meaning: 'to / unto' },
    'אדון': { translit: 'adon', meaning: 'master / Lord' },
    'עולם': { translit: "'olam", meaning: 'world / eternity' },
    'חסד': { translit: 'chesed', meaning: 'lovingkindness' },
    'אמת': { translit: "'emet", meaning: 'truth' },
    'צדקה': { translit: 'tzedakah', meaning: 'righteousness / charity' },
    'משפט': { translit: 'mishpat', meaning: 'justice' },
    'רחמים': { translit: 'rachamim', meaning: 'mercy / compassion' },
    'שמחה': { translit: 'simchah', meaning: 'joy' },
    'אהבה': { translit: "'ahavah", meaning: 'love' },
    'תודה': { translit: 'todah', meaning: 'thank you / thanksgiving' },
    'ירושלים': { translit: 'Yerushalayim', meaning: 'Jerusalem' },
    'ציון': { translit: 'Tziyon', meaning: 'Zion' },
    'דוד': { translit: 'David', meaning: 'David' },
    'אברהם': { translit: 'Avraham', meaning: 'Abraham' },
    'יצחק': { translit: 'Yitzchak', meaning: 'Isaac' },
    'יעקב': { translit: "Ya'akov", meaning: 'Jacob' }
  };

  const CUSTOM_TEXT_PRESETS = [
    {
      id: 'mixed_genesis',
      label: 'Mixed (Known + New): Genesis 1:1',
      text: 'בְּרֵאשִׁית בָּרָא אֱלֹהִים אֵת הַשָּׁמַיִם וְאֵת הָאָרֶץ'
    },
    {
      id: 'new_only_shalom',
      label: 'New Words Only: Shalom Aleichem',
      text: 'שָׁלוֹם עֲלֵיכֶם מַלְאֲכֵי הַשָּׁרֵת מַלְאֲכֵי עֶלְיוֹן'
    },
    {
      id: 'mixed_psalm',
      label: 'Mixed (Known + New): Hinei Mah Tov',
      text: 'הִנֵּה מַה טּוֹב וּמַה נָּעִים שֶׁבֶת אַחִים גַּם יָחַד'
    }
  ];

  let cachedSystemWordsMap = null;

  /**
   * Builds a map of all Hebrew words already in the system (Curriculum + Prayers + Audio Manifest)
   */
  function getSystemWordsMap() {
    if (cachedSystemWordsMap) return cachedSystemWordsMap;
    const map = new Map();

    // 1. Curriculum 16 target words
    (window.AlefBetData.WORDS || []).forEach((w) => {
      map.set(w.hebrew, {
        hebrew: w.hebrew,
        vocalized: w.vocalized || w.hebrew,
        translit: w.translit,
        meaning: w.meaning || 'System vocabulary word',
        letters: w.letters || Array.from(w.hebrew),
        note: w.anchorNote || w.note || 'System vocabulary word'
      });
    });

    // 2. Words from all prayers in the system
    (window.AlefBetData.PRAYERS || []).forEach((p) => {
      (p.words || []).forEach((w) => {
        if (!map.has(w.hebrew)) {
          map.set(w.hebrew, {
            hebrew: w.hebrew,
            vocalized: w.vocalized || w.hebrew,
            translit: w.translit,
            meaning: w.meaning || 'Service word',
            letters: w.letters || Array.from(w.hebrew),
            note: w.note || `From ${p.title}`
          });
        }
      });
    });

    // 3. Any additional words in AUDIO_MANIFEST
    const manifestWords = (window.AlefBetData.AUDIO_MANIFEST && window.AlefBetData.AUDIO_MANIFEST.words) || {};
    Object.keys(manifestWords).forEach((heb) => {
      if (!map.has(heb)) {
        const info = manifestWords[heb];
        map.set(heb, {
          hebrew: heb,
          vocalized: info.vocalized || heb,
          translit: info.translit || transliterateHebrewWord(info.vocalized || heb, heb),
          meaning: 'System word',
          letters: Array.from(heb),
          note: 'Word in system audio library'
        });
      }
    });

    cachedSystemWordsMap = map;
    return map;
  }

  /**
   * Algorithmic Hebrew-to-English transliterator for "new" words not in the system.
   * Supports both vocalized (niqqud) Hebrew tokens and unvocalized Hebrew consonant words.
   */
  function transliterateHebrewWord(rawToken, cleanHebrew) {
    if (!cleanHebrew) return '';

    // Check common Hebrew dictionary first
    if (COMMON_NEW_WORDS_DICT[cleanHebrew]) {
      return COMMON_NEW_WORDS_DICT[cleanHebrew].translit;
    }

    const hasNiqqud = /[\u05B0-\u05BC\u05C1\u05C2]/.test(rawToken || '');

    if (hasNiqqud) {
      // Group each base Hebrew consonant with its combining marks
      const clusters = [];
      for (const ch of Array.from(rawToken)) {
        if (ch >= '\u05D0' && ch <= '\u05EA') {
          clusters.push({ letter: ch, marks: [] });
        } else if (ch >= '\u0591' && ch <= '\u05C7' && clusters.length > 0) {
          clusters[clusters.length - 1].marks.push(ch);
        }
      }

      const out = [];
      for (let i = 0; i < clusters.length; i++) {
        const { letter, marks } = clusters[i];
        const isFirst = i === 0;
        const isLast = i === clusters.length - 1;
        const hasDagesh = marks.includes('\u05BC');
        const hasSinDot = marks.includes('\u05C2');
        const vowels = marks.filter((m) => m >= '\u05B0' && m <= '\u05BB');

        // Shuruk (וּ) or Cholam Male (וֹ)
        if (letter === 'ו') {
          if (hasDagesh && vowels.length === 0) {
            out.push('u');
            continue;
          }
          if (vowels.includes('\u05B9') || vowels.includes('\u05BA')) {
            out.push('o');
            continue;
          }
        }

        // Silent final He without mappiq, or silent Yud after i/e vowel
        if (letter === 'י' && vowels.length === 0 && !isFirst) {
          const prevMarks = clusters[i - 1].marks;
          if (prevMarks.includes('\u05B4')) {
            // Chirik male (already produced 'i')
            continue;
          }
          if (prevMarks.includes('\u05B5') || prevMarks.includes('\u05B6')) {
            out.push('y');
            continue;
          }
          if (prevMarks.includes('\u05B7') || prevMarks.includes('\u05B8')) {
            out.push('y');
            continue;
          }
        }

        if (letter === 'ה' && isLast && vowels.length === 0 && !hasDagesh) {
          out.push('h');
          continue;
        }

        if (letter === 'א' && vowels.length === 0) {
          continue;
        }

        // Consonant sound
        let cons = '';
        switch (letter) {
          case 'א': cons = isFirst ? '' : "'"; break;
          case 'ב': cons = hasDagesh || isFirst ? 'b' : 'v'; break;
          case 'ג': cons = 'g'; break;
          case 'ד': cons = 'd'; break;
          case 'ה': cons = 'h'; break;
          case 'ו': cons = 'v'; break;
          case 'ז': cons = 'z'; break;
          case 'ח': cons = 'ch'; break;
          case 'ט': cons = 't'; break;
          case 'י': cons = 'y'; break;
          case 'כ':
          case 'ך': cons = hasDagesh ? 'k' : 'kh'; break;
          case 'ל': cons = 'l'; break;
          case 'מ':
          case 'ם': cons = 'm'; break;
          case 'נ':
          case 'ן': cons = 'n'; break;
          case 'ס': cons = 's'; break;
          case 'ע': cons = isFirst ? '' : "'"; break;
          case 'פ':
          case 'ף': cons = hasDagesh ? 'p' : 'f'; break;
          case 'צ':
          case 'ץ': cons = 'tz'; break;
          case 'ק': cons = 'k'; break;
          case 'ר': cons = 'r'; break;
          case 'ש': cons = hasSinDot ? 's' : 'sh'; break;
          case 'ת': cons = 't'; break;
        }

        // Vowel sound
        let vow = '';
        for (const v of vowels) {
          if (v === '\u05B7' || v === '\u05B8' || v === '\u05B2') { vow = 'a'; break; }
          if (v === '\u05B5' || v === '\u05B6' || v === '\u05B1') { vow = 'e'; break; }
          if (v === '\u05B4') { vow = 'i'; break; }
          if (v === '\u05B9' || v === '\u05BA') { vow = 'o'; break; }
          if (v === '\u05BB') { vow = 'u'; break; }
          if (v === '\u05B3') { vow = 'o'; break; }
          if (v === '\u05B0') {
            vow = isFirst ? 'e' : '';
            break;
          }
        }

        // Furtive patach on final ח/ע/ה
        if (isLast && (letter === 'ח' || letter === 'ע') && vowels.includes('\u05B7')) {
          out.push('a' + cons);
        } else {
          out.push(cons + vow);
        }
      }

      const result = out.join('').replace(/''+/g, "'").replace(/^'/, '');
      if (result.length > 0) return result;
    }

    // Unvocalized Hebrew fallback using consonants + matres lectionis (א, ה, ו, י)
    const chars = Array.from(cleanHebrew);
    const parts = [];
    let prevProducedVowel = false;

    for (let i = 0; i < chars.length; i++) {
      const ch = chars[i];
      const isFirst = i === 0;
      const isLast = i === chars.length - 1;

      if (ch === 'ו') {
        if (isFirst) {
          parts.push('v');
          prevProducedVowel = false;
        } else {
          parts.push('o');
          prevProducedVowel = true;
        }
        continue;
      }
      if (ch === 'י') {
        if (isFirst) {
          parts.push('y');
          prevProducedVowel = false;
        } else {
          parts.push('i');
          prevProducedVowel = true;
        }
        continue;
      }
      if (ch === 'ה' && isLast && chars.length > 1) {
        if (!prevProducedVowel) parts.push('a');
        parts.push('h');
        prevProducedVowel = true;
        continue;
      }
      if (ch === 'א' || ch === 'ע') {
        if (isFirst) {
          parts.push('a');
          prevProducedVowel = true;
        } else if (!isLast) {
          parts.push("'a");
          prevProducedVowel = true;
        }
        continue;
      }

      const consMap = {
        'ב': isFirst ? 'b' : 'v',
        'ג': 'g',
        'ד': 'd',
        'ה': 'h',
        'ז': 'z',
        'ח': 'ch',
        'ט': 't',
        'כ': isFirst ? 'k' : 'kh',
        'ך': 'kh',
        'ל': 'l',
        'מ': 'm',
        'ם': 'm',
        'נ': 'n',
        'ן': 'n',
        'ס': 's',
        'פ': isFirst ? 'p' : 'f',
        'ף': 'f',
        'צ': 'tz',
        'ץ': 'tz',
        'ק': 'k',
        'ר': 'r',
        'ש': 'sh',
        'ת': 't'
      };

      const cSound = consMap[ch] || '';
      if (!isFirst && !prevProducedVowel) {
        // Insert a bridging vowel so consonant clusters are readable as transliteration
        const nextCh = chars[i + 1];
        const nextIsMater = nextCh === 'ו' || nextCh === 'י' || nextCh === 'א' || (nextCh === 'ה' && i + 1 === chars.length - 1);
        if (!nextIsMater || isLast) {
          parts.push('a');
        }
      }
      parts.push(cSound);
      prevProducedVowel = false;
    }

    return parts.join('') || cleanHebrew;
  }

  /**
   * Parses a user-supplied Hebrew passage into word objects, classifying each as
   * `inSystem: true` (already in the system) or `inSystem: false` ("new" word).
   */
  function parseCustomHebrewText(rawText) {
    const sysMap = getSystemWordsMap();
    const rawTokens = (rawText || '').split(/[\s\u05BE]+/).filter(Boolean);
    const parsedWords = [];

    rawTokens.forEach((token) => {
      // Keep Hebrew consonants + niqqud for vocalized form
      const vocalized = Array.from(token)
        .filter((ch) => (ch >= '\u0591' && ch <= '\u05C7') || (ch >= '\u05D0' && ch <= '\u05EA'))
        .join('');
      // Keep only the 27 Hebrew letters (א..ת) for clean matching
      const hebrew = Array.from(token)
        .filter((ch) => ch >= '\u05D0' && ch <= '\u05EA')
        .join('');

      if (!hebrew) return;

      const idx = parsedWords.length;
      const letters = Array.from(hebrew);

      if (sysMap.has(hebrew)) {
        const sysWord = sysMap.get(hebrew);
        parsedWords.push({
          index: idx,
          hebrew,
          vocalized: /[\u05B0-\u05C7]/.test(vocalized) ? vocalized : sysWord.vocalized,
          translit: sysWord.translit,
          meaning: sysWord.meaning,
          letters,
          inSystem: true,
          note: sysWord.note || 'Word already in the system'
        });
      } else {
        const dictEntry = COMMON_NEW_WORDS_DICT[hebrew];
        const translit = transliterateHebrewWord(vocalized, hebrew);
        parsedWords.push({
          index: idx,
          hebrew,
          vocalized: vocalized || hebrew,
          translit,
          meaning: dictEntry ? dictEntry.meaning : 'Custom passage word',
          letters,
          inSystem: false,
          note: 'New word from your custom passage'
        });
      }
    });

    return parsedWords;
  }

  function getCustomSystemWords(words) {
    return (words || []).filter((w) => w.inSystem);
  }

  /**
   * Loads & parses the custom Hebrew text, enforces the rule that if the passage contains
   * "new" words only, Activity 1 is not offered, and selects a target word.
   */
  function loadCustomPassage(rawText, autoSpeak = false) {
    state.custom.rawText = rawText;
    state.custom.words = parseCustomHebrewText(rawText);
    state.custom.feedback = null;
    state.custom.wrongTappedIndices = [];
    state.custom.showAudioHintTranslit = false;

    const systemWords = getCustomSystemWords(state.custom.words);
    if (systemWords.length === 0) {
      // Passage contains "new" words only -> Activity 1 is not offered!
      state.custom.activity = 'translit_spot';
    }

    pickNextCustomTarget(autoSpeak);
  }

  /**
   * Picks the next target word for the active custom-text activity.
   * - Activity 1 ('system_audio'): picks a word from the passage that is already in the system and speaks it.
   * - Activity 2 ('translit_spot'): picks a random word from the passage to present as transliteration.
   */
  function pickNextCustomTarget(shouldSpeak = true) {
    const words = state.custom.words;
    if (!words || words.length === 0) {
      state.custom.targetWordIndex = null;
      return;
    }

    const systemWords = getCustomSystemWords(words);
    if (state.custom.activity === 'system_audio' && systemWords.length === 0) {
      state.custom.activity = 'translit_spot';
    }

    const candidatePool =
      state.custom.activity === 'system_audio' ? systemWords : words;

    if (candidatePool.length === 0) {
      state.custom.targetWordIndex = null;
      return;
    }

    const currentTargetWord =
      state.custom.targetWordIndex !== null ? words[state.custom.targetWordIndex] : null;

    // Avoid picking the exact same Hebrew word twice in a row when multiple distinct words exist
    const distinctCandidates = currentTargetWord
      ? candidatePool.filter((w) => w.hebrew !== currentTargetWord.hebrew)
      : candidatePool;

    const poolToUse = distinctCandidates.length > 0 ? distinctCandidates : candidatePool;
    const chosenWord = poolToUse[Math.floor(Math.random() * poolToUse.length)];

    state.custom.targetWordIndex = chosenWord.index;
    state.custom.promptStartedAt = Date.now();
    state.custom.wrongTappedIndices = [];
    state.custom.showAudioHintTranslit = false;

    if (state.custom.activity === 'system_audio' && shouldSpeak) {
      setTimeout(() => {
        audio.speakWord(chosenWord, zpd.profile.speedSpm);
      }, 120);
    }
  }

  function handleCustomWordClick(wordIdx) {
    const words = state.custom.words;
    const clickedWord = words[wordIdx];
    if (!clickedWord) return;

    const targetIdx = state.custom.targetWordIndex;
    const targetWord = targetIdx !== null ? words[targetIdx] : null;
    if (!targetWord) {
      state.selectedWordInspector = clickedWord;
      audio.speakWord(clickedWord, zpd.profile.speedSpm);
      render();
      return;
    }

    const latencyMs = Date.now() - state.custom.promptStartedAt;

    if (wordIdx === targetIdx || clickedWord.hebrew === targetWord.hebrew) {
      // Found the target word!
      state.custom.streak += 1;
      audio.playSuccessTone();
      audio.speakWord(targetWord, zpd.profile.speedSpm);
      zpd.recordWordOutcome({
        hebrew: targetWord.hebrew,
        translit: targetWord.translit,
        letters: targetWord.letters,
        success: true,
        latencyMs,
        mode: 'custom_' + state.custom.activity
      });

      state.selectedWordInspector = targetWord;
      state.custom.feedback = {
        type: 'success',
        message: `Spot on! You found "${targetWord.hebrew}" (${targetWord.translit}${targetWord.meaning && targetWord.meaning !== 'Custom passage word' ? ` — "${targetWord.meaning}"` : ''}) in ${(latencyMs / 1000).toFixed(1)}s!`,
        detail: targetWord.inSystem
          ? `✓ System Word — ${targetWord.note || ''}`
          : `★ New Passage Word — ${buildLetterHintForTarget(targetWord)}`
      };
      render();

      setTimeout(() => {
        if (state.activeTab === 'custom') {
          pickNextCustomTarget(true);
          render();
        }
      }, 1250);
    } else {
      // Tapped a different word
      state.custom.streak = 0;
      if (!state.custom.wrongTappedIndices.includes(wordIdx)) {
        state.custom.wrongTappedIndices.push(wordIdx);
      }
      audio.playGentleMissTone();
      zpd.recordWordOutcome({
        hebrew: targetWord.hebrew,
        translit: targetWord.translit,
        letters: targetWord.letters,
        success: false,
        latencyMs,
        tappedWrongWord: clickedWord,
        mode: 'custom_' + state.custom.activity
      });

      state.selectedWordInspector = clickedWord;
      const clueText =
        state.custom.activity === 'system_audio'
          ? `Listen again and scan right-to-left (${buildLetterHintForTarget(targetWord)})!`
          : `Keep scanning right-to-left for "${targetWord.translit}" (${buildLetterHintForTarget(targetWord)})!`;

      state.custom.feedback = {
        type: 'miss',
        message: `You tapped "${clickedWord.hebrew}" (${clickedWord.translit}).`,
        detail: clueText
      };
      render();
    }
  }

  // Initialize custom passage words on startup
  state.custom.words = parseCustomHebrewText(state.custom.rawText);
  pickNextCustomTarget(false);

  // =========================================================================
  // RENDERING HELPERS: CONSONANT-AWARE SIDDUR WORD & LETTER ANCHORS
  // =========================================================================

  /**
   * Renders a Hebrew word's consonants individually so known anchors (א, ל, מ, ם, etc.)
   * and active ZPD frontier letters can have subtle visual cues without vowel clutter.
   */
  function renderHebrewConsonantsHtml(wordObj, scaff, mode) {
    const showColors =
      mode === 'follow'
        ? state.follow.pointerStyle !== 'stealth' && state.follow.showAnchorHighlights
        : state.showAnchorHighlights;
    if (!showColors) {
      return `<span class="hebrew-word-text">${wordObj.hebrew}</span>`;
    }
    const chars = Array.from(wordObj.hebrew);
    const spans = chars.map((ch) => {
      const lStat = zpd.profile.letters[ch];
      const status = lStat ? lStat.status : 'unintroduced';
      let cls = 'heb-char';
      if (status === 'mastered') cls += ' heb-char-mastered';
      else if (status === 'frontier') cls += ' heb-char-frontier';
      else cls += ' heb-char-unintroduced';
      return `<span class="${cls}">${ch}</span>`;
    });
    return `<span class="hebrew-word-text">${spans.join('')}</span>`;
  }

  /**
   * Renders a single Siddur Word card with adaptive ZPD scaffolding
   */
  function renderSiddurWordCard(wordObj, mode) {
    const scaff = zpd.getWordScaffolding(wordObj);
    const isStealthFollow = mode === 'follow' && state.follow.pointerStyle === 'stealth';
    const isInspected =
      state.selectedWordInspector &&
      state.selectedWordInspector.index === wordObj.index &&
      state.selectedWordInspector.hebrew === wordObj.hebrew &&
      !isStealthFollow;

    let cardClasses = ['siddur-word-card'];
    if (isStealthFollow) {
      cardClasses.push('stealth-word-card');
    } else {
      cardClasses.push(`zpd-${scaff.level}`);
      if (wordObj.phraseEnd) cardClasses.push('phrase-end-word');
    }
    if (isInspected) cardClasses.push('word-inspected');

    // Mode-specific states
    if (mode === 'follow') {
      const isCurrent = state.follow.currentWordIndex === wordObj.index;
      const isCheckpointTarget =
        state.follow.awaitingCheckpoint && state.follow.checkpointTargetIndex === wordObj.index;

      if (state.follow.awaitingCheckpoint) {
        cardClasses.push('checkpoint-selectable');
        if (isCheckpointTarget && state.follow.checkpointFeedback?.type === 'miss') {
          cardClasses.push('checkpoint-reveal-target');
        }
      } else if (state.follow.pointerStyle === 'guided') {
        if (state.follow.isPlaying && isCurrent) {
          cardClasses.push('yad-active');
        } else if (!state.follow.isPlaying && isCurrent) {
          cardClasses.push('yad-paused');
        }
      }
    } else if (mode === 'spot') {
      if (state.spot.wrongTappedIndices.includes(wordObj.index)) {
        cardClasses.push('spot-wrong-tap');
      }
    } else if (mode === 'custom') {
      if (state.custom.wrongTappedIndices.includes(wordObj.index)) {
        cardClasses.push('spot-wrong-tap');
      }
    }

    // Decide what scaffolding sub-label to show under the Hebrew consonants
    let subLabelHtml = '';
    if (isStealthFollow) {
      // In stealth mode, turn off all sub-word hints (no transliteration, partial hints, or dots)
      subLabelHtml = '';
    } else if (mode === 'custom') {
      if (state.custom.wrongTappedIndices.includes(wordObj.index)) {
        subLabelHtml = `<span class="word-scaff-hint full">${wordObj.translit}</span>`;
      } else {
        subLabelHtml = `<span class="word-scaff-hint minimal">•</span>`;
      }
    } else if (mode === 'spot' && !state.spot.wrongTappedIndices.includes(wordObj.index)) {
      // In "Where Are We?" mode, don't give away the target word's full English transliteration!
      // Instead, show partial consonant hints only on unintroduced words.
      if (scaff.level === 'scaffolded') {
        subLabelHtml = `<span class="word-scaff-hint partial">${zpd.getPartialConsonantHint(wordObj)}</span>`;
      } else {
        subLabelHtml = `<span class="word-scaff-hint minimal">•</span>`;
      }
    } else {
      // In Guided Follow-Along mode:
      if (scaff.showTranslitByDefault) {
        subLabelHtml = `<span class="word-scaff-hint full">${wordObj.translit}</span>`;
      } else if (scaff.showPartialHint) {
        subLabelHtml = `<span class="word-scaff-hint partial" title="ZPD Frontier Hint">${zpd.getPartialConsonantHint(wordObj)}</span>`;
      } else {
        subLabelHtml = `<span class="word-scaff-hint mastered-dot" title="Mastered — Pure Hebrew"></span>`;
      }
    }

    const phraseEndBadge =
      !isStealthFollow && wordObj.phraseEnd
        ? `<span class="phrase-boundary-mark" title="${wordObj.checkpointPrompt || 'Phrase boundary'}">${wordObj.isSentenceEnd ? '׃' : '׀'}</span>`
        : '';

    const actionAttr =
      mode === 'follow'
        ? `data-follow-word="${wordObj.index}"`
        : mode === 'custom'
        ? `data-custom-word="${wordObj.index}"`
        : `data-spot-word="${wordObj.index}"`;

    return `
      <button type="button" class="${cardClasses.join(' ')}" ${actionAttr}>
        <div class="siddur-word-top">
          ${renderHebrewConsonantsHtml(wordObj, scaff, mode)}
          ${phraseEndBadge}
        </div>
        ${
          subLabelHtml
            ? `<div class="siddur-word-sub">
                ${subLabelHtml}
              </div>`
            : ''
        }
      </button>
    `;
  }

  // =========================================================================
  // RENDERING: WORD & LETTER INSPECTOR DRAWER
  // =========================================================================

  function renderWordInspector(wordObj) {
    if (!wordObj) {
      return `
        <div class="inspector-card inspector-empty">
          <div class="inspector-empty-title">Tap Any Hebrew Word to Inspect or Rescue</div>
          <p class="inspector-empty-sub">
            Tapping a word speaks it aloud with authentic Hebrew audio, breaks down its consonants right-to-left (highlighting your known anchors <strong>א, ל, מ, ם</strong>), and lets you click any letter to hear its name.
          </p>
        </div>
      `;
    }

    const scaff = zpd.getWordScaffolding(wordObj);
    const wordAudioInfo = audio.getWordAudioInfo(wordObj);
    const hasHumanRecording = Boolean(wordAudioInfo && wordAudioInfo.humanAudio);
    const lettersRtl = (wordObj.letters || Array.from(wordObj.hebrew)).map((ch) => {
      const meta = window.AlefBetData.LETTERS.find((l) => l.char === ch) || {
        char: ch,
        name: ch,
        shortSound: '',
        tip: ''
      };
      const lStat = zpd.profile.letters[ch] || { status: 'unintroduced', mastery: 0.2 };
      return { ...meta, status: lStat.status, mastery: Math.round(lStat.mastery * 100) };
    });

    const badgeMap = {
      mastered: '<span class="status-pill pill-mastered">Known Anchor</span>',
      frontier: '<span class="status-pill pill-frontier">ZPD Frontier</span>',
      unintroduced: '<span class="status-pill pill-unintroduced">Scaffolded</span>'
    };

    return `
      <div class="inspector-card">
        <div class="inspector-header">
          <div class="inspector-word-main">
            <span class="inspector-hebrew" dir="rtl">${wordObj.hebrew}</span>
            <div>
              <div class="inspector-translit">${wordObj.translit} <span class="inspector-meaning">— "${wordObj.meaning}"</span></div>
              <div class="inspector-note">${wordObj.note || wordObj.anchorNote || ''}</div>
            </div>
          </div>
          <div class="inspector-actions">
            <button type="button" class="btn-secondary btn-sm" data-action="speak-inspected" title="Hear vocalized Israeli Hebrew pronunciation (${wordObj.vocalized || wordObj.hebrew})">
              🔊 Hear Word (Hebrew)
            </button>
            ${
              hasHumanRecording
                ? `<button type="button" class="btn-secondary btn-sm" data-action="speak-inspected-human" title="Hear Wikimedia Commons / Lingua Libre native speaker recording">
                    🎙️ Native Speaker Recording
                  </button>`
                : ''
            }
            <button type="button" class="btn-amber btn-sm" data-action="rescue-inspected" title="Log that you stumbled on this word so the ZPD engine gives it more scaffolding">
              ✋ Need More Help Here
            </button>
          </div>
        </div>

        <div class="inspector-letters-label">Right-to-Left Consonant Breakdown — <strong>Click any letter card to hear its Hebrew name</strong>:</div>
        <div class="inspector-letters-row" dir="rtl">
          ${lettersRtl
            .map(
              (l) => `
            <div class="letter-breakdown-chip chip-${l.status} clickable-letter-chip" dir="ltr" data-speak-letter="${l.char}" title="Click to hear ${l.name} in Hebrew">
              <div class="chip-top-row">
                <div class="chip-char">${l.char}</div>
                <span class="chip-audio-icon">🔊</span>
              </div>
              <div class="chip-name">${l.name}</div>
              <div class="chip-sound">Sound: <strong>${l.shortSound}</strong></div>
              ${badgeMap[l.status] || ''}
              <div class="chip-tip">${l.tip}</div>
            </div>
          `
            )
            .join('')}
        </div>
      </div>
    `;
  }

  // =========================================================================
  // TAB VIEWS
  // =========================================================================

  function renderFollowAlongTab() {
    const prayer = getSelectedPrayer();
    const spm = zpd.profile.speedSpm;
    const isPlaying = state.follow.isPlaying;
    const isStealth = state.follow.pointerStyle === 'stealth';
    const awaitingCp = state.follow.awaitingCheckpoint;
    const cpTargetWord =
      awaitingCp && state.follow.checkpointTargetIndex !== null
        ? prayer.words[state.follow.checkpointTargetIndex]
        : null;

    // Group words into phrases or render in a continuous Siddur RTL block with phrase markers
    const wordsHtml = prayer.words.map((w) => renderSiddurWordCard(w, 'follow')).join('');

    return `
      <div class="mode-container">
        <!-- Control Bar: Speed Dial + Pointer Mode + Playback Controls -->
        <div class="control-deck">
          <div class="speed-dial-panel">
            <div class="speed-dial-header">
              <span class="speed-dial-title">⏱️ Service Speed Dial</span>
              <span class="speed-dial-readout"><strong>${spm}</strong> syllables/min (${getSpeedLabel(spm)})</span>
            </div>
            <div class="speed-dial-controls">
              <button type="button" class="btn-dial-step" data-speed-delta="-10" title="Slower (-10 SPM)">−</button>
              <input
                type="range"
                min="30"
                max="130"
                step="5"
                value="${spm}"
                class="speed-slider"
                id="speed-dial-slider"
              />
              <button type="button" class="btn-dial-step" data-speed-delta="10" title="Faster (+10 SPM)">+</button>
            </div>
            <div class="speed-presets">
              <button type="button" class="preset-chip ${spm === 40 ? 'active' : ''}" data-speed-set="40">Slow Study (40)</button>
              <button type="button" class="preset-chip ${spm === 60 ? 'active' : ''}" data-speed-set="60">Gentle Chant (60)</button>
              <button type="button" class="preset-chip ${spm === 85 ? 'active' : ''}" data-speed-set="85">Congregation (85)</button>
              <button type="button" class="preset-chip ${spm === 110 ? 'active' : ''}" data-speed-set="110">Brisk Service (110)</button>
            </div>
          </div>

          <div class="playback-panel">
            <div class="pointer-mode-toggle">
              <label class="toggle-label">Pacing Style:</label>
              <div class="segmented-control">
                <button
                  type="button"
                  class="seg-btn ${isStealth ? 'active' : ''}"
                  data-pointer-style="stealth"
                  title="Default: turns off all hints and pointer highlights so you navigate purely by Hebrew letters and audio"
                >
                  Eye-Track Only (Stealth Check)
                </button>
                <button
                  type="button"
                  class="seg-btn ${!isStealth ? 'active' : ''}"
                  data-pointer-style="guided"
                  title="Great if you are lost: moves highlight word-by-word with ZPD transliteration & letter hints"
                >
                  Guided Pointer + Phrase Check
                </button>
              </div>
            </div>

            <div class="playback-buttons">
              ${
                !isPlaying
                  ? `<button type="button" class="btn-primary btn-lg" data-action="follow-play">
                      ▶ ${state.follow.currentWordIndex > 0 && !awaitingCp ? 'Resume Follow-Along' : 'Start Follow-Along'}
                    </button>`
                  : `<button type="button" class="btn-warning btn-lg" data-action="follow-pause">
                      ⏸ Pause Reader
                    </button>`
              }
              <button type="button" class="btn-secondary" data-action="follow-reset">
                ⏮ Restart Prayer
              </button>
              ${
                !isStealth
                  ? `<button type="button" class="btn-ghost" data-action="toggle-anchor-colors">
                      ${state.follow.showAnchorHighlights ? '🎨 Letter Colors: ON' : '🎨 Letter Colors: OFF'}
                    </button>`
                  : ''
              }
            </div>
          </div>
        </div>

        <!-- "Catch Me" Checkpoint Banner (Active at Phrase / Sentence Ends) -->
        ${
          awaitingCp && cpTargetWord
            ? `
          <div class="checkpoint-banner">
            <div class="checkpoint-icon">🎯</div>
            <div class="checkpoint-body">
              <div class="checkpoint-title">
                ${
                  isStealth
                    ? '"Catch Me" Phrase Checkpoint'
                    : `"Catch Me" Phrase Checkpoint — ${cpTargetWord.checkpointPrompt || 'End of Phrase'}`
                }
              </div>
              <div class="checkpoint-prompt">
                ${
                  isStealth
                    ? 'The reader just paused at the end of a phrase. <strong>Tap the Hebrew word where we stopped to confirm your place!</strong>'
                    : `The reader just paused on <strong>"${cpTargetWord.translit}"</strong> (<em>"${cpTargetWord.meaning}"</em>). <strong>Tap the Hebrew word where we stopped to confirm your place!</strong>`
                }
              </div>
            </div>
            <button type="button" class="btn-secondary btn-sm" data-action="hear-checkpoint-word">
              🔊 Hear Cue Again
            </button>
          </div>
        `
            : ''
        }

        ${
          state.follow.checkpointFeedback
            ? `
          <div class="feedback-banner feedback-${state.follow.checkpointFeedback.type}">
            <span>${state.follow.checkpointFeedback.message}</span>
          </div>
        `
            : ''
        }

        <!-- Siddur Reading Page -->
        <div class="siddur-sheet">
          <div class="siddur-sheet-header">
            <div>
              <h2 class="siddur-title">${prayer.title}</h2>
              <p class="siddur-subtitle">${prayer.subtitle}</p>
            </div>
            <div class="siddur-legend">
              ${
                isStealth
                  ? `<span class="legend-item">🕵️ Stealth Mode — All visual hints off (switch to Guided Mode if lost)</span>`
                  : `
                    <span class="legend-item"><span class="legend-dot dot-mastered"></span> Known Letter (א, ל, מ, ם...)</span>
                    <span class="legend-item"><span class="legend-dot dot-frontier"></span> Active ZPD Frontier</span>
                    <span class="legend-item"><span class="legend-dot dot-scaffold"></span> Unintroduced (Full Hint)</span>
                  `
              }
            </div>
          </div>

          <div class="siddur-words-flow" dir="rtl">
            ${wordsHtml}
          </div>

          <div class="siddur-translation">
            <strong>Meaning:</strong> "${prayer.translation}"
          </div>
        </div>

        ${renderWordInspector(
          isStealth
            ? state.selectedWordInspector
            : state.selectedWordInspector || prayer.words[state.follow.currentWordIndex]
        )}
      </div>
    `;
  }

  function renderSpotTheWordTab() {
    const prayer = getSelectedPrayer();
    const targetIdx = state.spot.targetWordIndex;
    const targetWord = prayer.words[targetIdx] || prayer.words[0];
    const prevWord = targetIdx > 0 ? prayer.words[targetIdx - 1] : null;

    const wordsHtml = prayer.words.map((w) => renderSiddurWordCard(w, 'spot')).join('');

    return `
      <div class="mode-container">
        <div class="spot-prompt-card">
          <div class="spot-prompt-left">
            <div class="spot-badge">🔍 "WHERE ARE WE IN THE SERVICE?" DRILL</div>
            <div class="spot-cue-main">
              Find &amp; tap: <span class="spot-target-translit">${targetWord.translit}</span>
              <span class="spot-target-meaning">("${targetWord.meaning}")</span>
            </div>
            <div class="spot-cue-context">
              ${
                prevWord
                  ? `Service Context: The reader just chanted <em>"...${prevWord.translit}"</em> and is now on <strong>"${targetWord.translit}"</strong>.`
                  : `Service Context: The reader is starting the opening word of the prayer: <strong>"${targetWord.translit}"</strong>.`
              }
            </div>
            <div class="spot-anchor-tip">
              💡 <strong>ZPD Anchor Clue:</strong> ${buildLetterHintForTarget(targetWord)}
            </div>
          </div>
          <div class="spot-prompt-actions">
            <div class="streak-pill">🔥 Streak: ${state.spot.streak}</div>
            <button type="button" class="btn-primary" data-action="spot-hear-cue">
              🔊 Hear Reader Cue
            </button>
            <button type="button" class="btn-secondary" data-action="spot-skip">
              ⏭ Next Cue
            </button>
          </div>
        </div>

        ${
          state.spot.feedback
            ? `
          <div class="feedback-banner feedback-${state.spot.feedback.type}">
            <div>
              <strong>${state.spot.feedback.message}</strong>
              ${state.spot.feedback.detail ? `<div class="feedback-detail">${state.spot.feedback.detail}</div>` : ''}
            </div>
          </div>
        `
            : ''
        }

        <div class="siddur-sheet">
          <div class="siddur-sheet-header">
            <div>
              <h2 class="siddur-title">${prayer.title} — Scan Right-to-Left (←)</h2>
              <p class="siddur-subtitle">Tap the Hebrew word that matches the reader's cue above</p>
            </div>
          </div>

          <div class="siddur-words-flow" dir="rtl">
            ${wordsHtml}
          </div>
        </div>

        ${renderWordInspector(state.selectedWordInspector)}
      </div>
    `;
  }

  function renderWarmupTab() {
    if (!state.warmup.quizTarget) {
      generateWarmupQuiz();
    }
    const target = state.warmup.quizTarget;
    const summary = zpd.getZpdSummary();
    const frontierChars = summary.frontierLetters.map((l) => l.char);

    const words16 = window.AlefBetData.WORDS.filter((w) => {
      if (state.warmup.selectedTierFilter === '1') return w.tier === 1;
      if (state.warmup.selectedTierFilter === '2') return w.tier === 2;
      if (state.warmup.selectedTierFilter === 'zpd') {
        return w.letters.some((c) => frontierChars.includes(c));
      }
      return true;
    });

    return `
      <div class="mode-container">
        <!-- Quick ZPD Word Recognition Micro-Drill -->
        <div class="quiz-box">
          <div class="quiz-box-header">
            <div>
              <span class="spot-badge">⚡ 60-SECOND ZPD ANCHOR WORD DRILL</span>
              <h3 class="quiz-prompt">
                Which Hebrew word is <strong>"${target.translit}"</strong> (<em>${target.meaning}</em>)?
              </h3>
              <p class="quiz-subnote">${target.anchorNote || ''}</p>
            </div>
            <button type="button" class="btn-secondary btn-sm" data-action="warmup-speak-quiz">
              🔊 Hear "${target.translit}"
            </button>
          </div>

          ${
            state.warmup.quizFeedback
              ? `<div class="feedback-banner feedback-${state.warmup.quizFeedback.type}">
                  ${state.warmup.quizFeedback.message}
                 </div>`
              : ''
          }

          <div class="quiz-options-grid" dir="rtl">
            ${state.warmup.quizOptions
              .map((opt) => {
                const scaff = zpd.getWordScaffolding(opt);
                return `
                <button type="button" class="quiz-option-btn" data-warmup-quiz-opt="${opt.hebrew}">
                  <div class="quiz-opt-hebrew">${renderHebrewConsonantsHtml(opt, scaff)}</div>
                </button>
              `;
              })
              .join('')}
          </div>
        </div>

        <!-- The 16 Target Vocabulary Words from Goal and Lessons.md -->
        <div class="section-card">
          <div class="section-header-row">
            <div>
              <h2 class="section-title">16 Target Vocabulary Words (from <code>Goal and Lessons.md</code>)</h2>
              <p class="section-subtitle">
                5 Starter Words + 11 Alphabet-Completing Words — clean consonant forms with your known letters (<strong>א, ל, מ, ם</strong>) highlighted in green
              </p>
            </div>
            <div class="segmented-control">
              <button type="button" class="seg-btn ${state.warmup.selectedTierFilter === 'all' ? 'active' : ''}" data-tier-filter="all">All 16</button>
              <button type="button" class="seg-btn ${state.warmup.selectedTierFilter === '1' ? 'active' : ''}" data-tier-filter="1">5 Starter Words</button>
              <button type="button" class="seg-btn ${state.warmup.selectedTierFilter === 'zpd' ? 'active' : ''}" data-tier-filter="zpd">In My ZPD Frontier</button>
              <button type="button" class="seg-btn ${state.warmup.selectedTierFilter === '2' ? 'active' : ''}" data-tier-filter="2">11 Alphabet Builders</button>
            </div>
          </div>

          <div class="vocab-grid">
            ${words16
              .map((w) => {
                const wStat = zpd.profile.words[w.hebrew] || { mastery: 0.35 };
                const pct = Math.round(wStat.mastery * 100);
                const scaff = zpd.getWordScaffolding(w);
                return `
                <div class="vocab-card zpd-${scaff.level}" data-inspect-vocab="${w.id}" title="Click to hear ${w.translit} and inspect its letters">
                  <div class="vocab-card-top">
                    <span class="vocab-tier-tag">${w.tier === 1 ? '★ Starter Word' : 'Tier 2 Builder'}</span>
                    <span class="vocab-mastery-pct">🔊 ${pct}% mastery</span>
                  </div>
                  <div class="vocab-hebrew" dir="rtl">${renderHebrewConsonantsHtml(w, scaff)}</div>
                  <div class="vocab-translit">${w.translit} — <span>${w.meaning}</span></div>
                  <div class="vocab-note">${w.anchorNote || ''}</div>
                </div>
              `;
              })
              .join('')}
          </div>
        </div>

        ${renderWordInspector(state.selectedWordInspector)}

        <!-- Look-Alike / Confusable Letter Pairs -->
        <div class="section-card">
          <h2 class="section-title">Look-Alike Letter Pairs (Service Reading Traps)</h2>
          <p class="section-subtitle">When reading at service speed without vowels, distinguishing these look-alike consonant shapes prevents losing your place. <strong>Click any letter below to hear its Hebrew name.</strong></p>
          <div class="confusables-grid">
            ${window.AlefBetData.CONFUSABLE_PAIRS.map((item) => {
              const pairButtons = item.pair
                .map(
                  (ch) =>
                    `<button type="button" class="confusable-char-btn" data-speak-letter="${ch}" title="Click to hear ${ch}">${ch} 🔊</button>`
                )
                .join(' <span class="confusable-vs">vs</span> ');
              return `
                <div class="confusable-card">
                  <div class="confusable-chars" dir="rtl">${pairButtons}</div>
                  <div class="confusable-label">${item.label}</div>
                  <div class="confusable-hint">${item.hint}</div>
                </div>
              `;
            }).join('')}
          </div>
        </div>
      </div>
    `;
  }

  function renderDashboardTab() {
    const summary = zpd.getZpdSummary();

    return `
      <div class="mode-container">
        <!-- ZPD Coaching Summary & What You Need Most Help With -->
        <div class="dashboard-top-grid">
          <div class="section-card zpd-focus-card">
            <div class="spot-badge">🎯 ZONE OF PROXIMAL DEVELOPMENT (ZPD) FOCUS</div>
            <h2 class="section-title">${summary.zpdStatusLabel}</h2>
            <p class="section-subtitle">${summary.zpdCoachingTip}</p>

            <div class="zpd-focus-columns">
              <div class="zpd-focus-box">
                <h4>Active ZPD Frontier Letters (Learning Now)</h4>
                <div class="mini-letter-list">
                  ${summary.frontierLetters
                    .map(
                      (l) => `
                    <span class="mini-letter-badge badge-frontier" title="${l.name} (${l.sound})">
                      <strong>${l.char}</strong> ${l.name} (${l.shortSound})
                    </span>
                  `
                    )
                    .join('')}
                </div>
              </div>

              <div class="zpd-focus-box">
                <h4>Needs Most Help / Extra Scaffolding</h4>
                <div class="mini-letter-list">
                  ${
                    summary.needsHelpLetters.length > 0
                      ? summary.needsHelpLetters
                          .map(
                            (l) => `
                        <span class="mini-letter-badge badge-help">
                          <strong>${l.char}</strong> ${l.name} (${Math.round(l.mastery * 100)}%)
                        </span>
                      `
                          )
                          .join('')
                      : `<span class="text-muted">No trouble spots logged yet — practice a prayer to collect telemetry!</span>`
                  }
                </div>
              </div>
            </div>
          </div>

          <div class="section-card stats-summary-card">
            <h3 class="section-title">Your Progress Snapshot</h3>
            <div class="stat-metric-row">
              <span>Known / Mastered Consonants:</span>
              <strong>${summary.masteredLetters.length} / 27</strong>
            </div>
            <div class="stat-metric-row">
              <span>Active in ZPD Frontier:</span>
              <strong>${summary.frontierLetters.length} letters</strong>
            </div>
            <div class="stat-metric-row">
              <span>Comfortable Speed Dial:</span>
              <strong>${summary.speedSpm} SPM</strong>
            </div>
            <div class="stat-metric-row">
              <span>Recent ZPD Accuracy:</span>
              <strong>${summary.recentAccuracy}%</strong>
            </div>
            <div class="dashboard-util-buttons">
              <button type="button" class="btn-secondary btn-sm" data-action="reset-profile">
                ↺ Reset to Baseline (א, ל, מ, ם)
              </button>
            </div>
          </div>
        </div>

        <!-- Interactive 27-Letter Mastery Grid -->
        <div class="section-card">
          <div class="section-header-row">
            <div>
              <h2 class="section-title">All 27 Hebrew Letters (22 Base + 5 Final <em>Sofit</em> Forms)</h2>
              <p class="section-subtitle">
                <strong>א (Alef)</strong>, <strong>ל (Lamed)</strong>, <strong>מ (Mem)</strong>, and <strong>ם (Final Mem)</strong> are pre-seeded as Known.
                Click <strong>🔊 Hear</strong> on any letter to hear its authentic Hebrew name, or click the card to cycle its status between <strong>Known</strong>, <strong>ZPD Frontier</strong>, and <strong>Unintroduced</strong>.
              </p>
            </div>
          </div>

          <div class="letters-mastery-grid" dir="rtl">
            ${summary.allLetters
              .map((l) => {
                const pct = Math.round((l.mastery || 0.2) * 100);
                return `
                  <div
                    class="letter-grid-card status-${l.status}"
                    data-cycle-letter="${l.char}"
                    dir="ltr"
                    title="Click card to toggle status (Known / Frontier / Unintroduced)"
                  >
                    <div class="lg-top">
                      <span class="lg-char">${l.char}</span>
                      <button type="button" class="btn-letter-audio" data-speak-letter="${l.char}" title="Hear ${l.name} in Hebrew">🔊</button>
                    </div>
                    <div class="lg-name">${l.name}</div>
                    <div class="lg-sound">Sound: <strong>${l.shortSound}</strong></div>
                    <div class="lg-bar-wrap">
                      <div class="lg-bar-fill" style="width: ${pct}%"></div>
                    </div>
                    <div class="lg-status-label">
                      ${l.status === 'mastered' ? '✓ Known' : l.status === 'frontier' ? '🎯 ZPD Frontier' : '⏳ Scaffolded'}
                    </div>
                  </div>
                `;
              })
              .join('')}
          </div>
        </div>
      </div>
    `;
  }

  /**
   * Renders the dynamic practice section below the Custom Text input box so live typing
   * can update the passage analysis, activities, and word cards without losing textarea focus.
   */
  function renderCustomPracticeBody() {
    const words = state.custom.words || [];
    const systemWords = getCustomSystemWords(words);
    const newWordsCount = words.length - systemWords.length;
    const hasSystemWords = systemWords.length > 0;

    // Ensure Activity 1 is never active if passage has "new" words only
    if (!hasSystemWords && state.custom.activity === 'system_audio') {
      state.custom.activity = 'translit_spot';
    }

    if (words.length === 0) {
      return `
        <div class="section-card custom-empty-state">
          <div class="inspector-empty-title">Enter or Paste Hebrew Text Above to Begin</div>
          <p class="inspector-empty-sub">
            Type or paste any Hebrew passage (with or without vowels/niqqud), or click one of the sample buttons above to practice finding words!
          </p>
        </div>
      `;
    }

    const targetWord =
      state.custom.targetWordIndex !== null && words[state.custom.targetWordIndex]
        ? words[state.custom.targetWordIndex]
        : words[0];

    const wordsHtml = words.map((w) => renderSiddurWordCard(w, 'custom')).join('');

    return `
      <!-- Passage Vocabulary Breakdown Strip -->
      <div class="custom-stats-bar">
        <div class="custom-stat-chips">
          <span class="custom-stat-pill">
            📜 Total Words: <strong>${words.length}</strong>
          </span>
          <span class="custom-stat-pill ${hasSystemWords ? 'pill-sys-available' : 'pill-sys-zero'}">
            🔊 Already in System: <strong>${systemWords.length}</strong>
          </span>
          <span class="custom-stat-pill pill-new-words">
            ✨ "New" Words: <strong>${newWordsCount}</strong>
          </span>
        </div>
        <button type="button" class="btn-ghost btn-sm" data-action="toggle-anchor-colors">
          ${state.showAnchorHighlights ? '🎨 Letter Colors: ON' : '🎨 Letter Colors: OFF'}
        </button>
      </div>

      <!-- Two Activities Selector -->
      <div class="custom-activities-grid">
        ${
          hasSystemWords
            ? `
          <button
            type="button"
            class="custom-activity-card ${state.custom.activity === 'system_audio' ? 'active' : ''}"
            data-custom-activity="system_audio"
          >
            <div class="activity-card-header">
              <span class="activity-num-badge">Activity 1</span>
              <span class="activity-avail-tag tag-available">${systemWords.length} system ${systemWords.length === 1 ? 'word' : 'words'} in passage</span>
            </div>
            <div class="activity-card-title">🔊 Hear &amp; Find a Word Already in the System</div>
            <p class="activity-card-desc">
              The app says a word from your passage that is already in the system, and you try to find and tap it.
            </p>
          </button>
        `
            : `
          <div class="custom-activity-card activity-disabled" title="Not offered because this passage contains new words only">
            <div class="activity-card-header">
              <span class="activity-num-badge">Activity 1</span>
              <span class="activity-avail-tag tag-unavailable">Not Offered (New Words Only)</span>
            </div>
            <div class="activity-card-title">🔇 Hear &amp; Find a Word Already in the System</div>
            <p class="activity-card-desc">
              This passage contains <strong>"new" words only</strong> (0 words already in the system), so Activity 1 is not offered. Practice with Activity 2!
            </p>
          </div>
        `
        }

        <button
          type="button"
          class="custom-activity-card ${state.custom.activity === 'translit_spot' ? 'active' : ''}"
          data-custom-activity="translit_spot"
        >
          <div class="activity-card-header">
            <span class="activity-num-badge">Activity 2</span>
            <span class="activity-avail-tag tag-available">All ${words.length} ${words.length === 1 ? 'word' : 'words'} eligible</span>
          </div>
          <div class="activity-card-title">🔤 Find Random Word by Transliteration</div>
          <p class="activity-card-desc">
            Presents a random word from your passage as an English transliteration, and you try to find and tap it.
          </p>
        </button>
      </div>

      <!-- Active Activity Prompt Banner -->
      ${
        state.custom.activity === 'system_audio' && targetWord
          ? `
        <div class="spot-prompt-card custom-prompt-audio">
          <div class="spot-prompt-left">
            <div class="spot-badge">🔊 ACTIVITY 1 — FIND SYSTEM WORD BY AUDIO</div>
            <div class="spot-cue-main">
              Listen to the spoken word and tap it in your Hebrew passage below!
              ${
                state.custom.showAudioHintTranslit
                  ? `<span class="spot-target-translit">${targetWord.translit}</span> <span class="spot-target-meaning">("${targetWord.meaning}")</span>`
                  : ''
              }
            </div>
            <div class="spot-cue-context">
              The app chose a word from your passage that is already in the system${targetWord.meaning ? ` (meaning: <em>"${targetWord.meaning}"</em>)` : ''}.
            </div>
            <div class="spot-anchor-tip">
              💡 <strong>ZPD Anchor Clue:</strong> ${buildLetterHintForTarget(targetWord)}
            </div>
          </div>
          <div class="spot-prompt-actions">
            <div class="streak-pill">🔥 Streak: ${state.custom.streak}</div>
            <button type="button" class="btn-primary" data-action="custom-hear-target">
              🔊 Say Word Again
            </button>
            <button type="button" class="btn-secondary btn-sm" data-action="custom-toggle-audio-hint">
              ${state.custom.showAudioHintTranslit ? '🙈 Hide Translit' : '💡 Translit Hint'}
            </button>
            <button type="button" class="btn-secondary" data-action="custom-next-word">
              ⏭ Next Word
            </button>
          </div>
        </div>
      `
          : targetWord
          ? `
        <div class="spot-prompt-card custom-prompt-translit">
          <div class="spot-prompt-left">
            <div class="spot-badge">🔤 ACTIVITY 2 — FIND WORD BY TRANSLITERATION</div>
            <div class="spot-cue-main">
              Find &amp; tap: <span class="spot-target-translit">${targetWord.translit}</span>
              ${
                targetWord.meaning && targetWord.meaning !== 'Custom passage word'
                  ? `<span class="spot-target-meaning">("${targetWord.meaning}")</span>`
                  : ''
              }
              <span class="word-origin-badge ${targetWord.inSystem ? 'origin-system' : 'origin-new'}">
                ${targetWord.inSystem ? '✓ System Word' : '★ New Word'}
              </span>
            </div>
            <div class="spot-cue-context">
              Decode the transliteration <strong>"${targetWord.translit}"</strong> and scan your Hebrew passage right-to-left (←) to find it.
            </div>
            <div class="spot-anchor-tip">
              💡 <strong>ZPD Anchor Clue:</strong> ${buildLetterHintForTarget(targetWord)}
            </div>
          </div>
          <div class="spot-prompt-actions">
            <div class="streak-pill">🔥 Streak: ${state.custom.streak}</div>
            <button type="button" class="btn-secondary" data-action="custom-hear-target" title="Hear pronunciation">
              🔊 Hear Word
            </button>
            <button type="button" class="btn-primary" data-action="custom-next-word">
              ⏭ Next Random Word
            </button>
          </div>
        </div>
      `
          : ''
      }

      ${
        state.custom.feedback
          ? `
        <div class="feedback-banner feedback-${state.custom.feedback.type}">
          <div>
            <strong>${state.custom.feedback.message}</strong>
            ${state.custom.feedback.detail ? `<div class="feedback-detail">${state.custom.feedback.detail}</div>` : ''}
          </div>
        </div>
      `
          : ''
      }

      <!-- Custom Hebrew Passage Sheet -->
      <div class="siddur-sheet">
        <div class="siddur-sheet-header">
          <div>
            <h2 class="siddur-title">Your Custom Hebrew Passage — Scan Right-to-Left (←)</h2>
            <p class="siddur-subtitle">
              ${
                state.custom.activity === 'system_audio'
                  ? 'Tap the Hebrew word that matches the system word spoken by the app'
                  : `Tap the Hebrew word that matches the transliteration "${targetWord ? targetWord.translit : ''}"`
              }
            </p>
          </div>
          <div class="siddur-legend">
            <span class="legend-item"><span class="legend-dot dot-mastered"></span> Known Letter (א, ל, מ, ם...)</span>
            <span class="legend-item"><span class="legend-dot dot-frontier"></span> Active ZPD Frontier</span>
            <span class="legend-item"><span class="legend-dot dot-scaffold"></span> Unintroduced</span>
          </div>
        </div>

        <div class="siddur-words-flow" dir="rtl">
          ${wordsHtml}
        </div>
      </div>

      ${renderWordInspector(state.selectedWordInspector)}
    `;
  }

  function renderCustomTextTab() {
    return `
      <div class="mode-container">
        <!-- Custom Hebrew Input Box -->
        <div class="section-card custom-input-card">
          <div class="section-header-row">
            <div>
              <span class="spot-badge">✍️ CUSTOM HEBREW PASSAGE BUILDER</span>
              <h2 class="section-title">Input Any Hebrew Text for Spotting Practice</h2>
              <p class="section-subtitle">
                Paste or type any Hebrew passage below (with or without vowels/niqqud). The app automatically detects which words are <strong>already in the system</strong> vs. <strong>"new" words</strong> and tailors the activities!
              </p>
            </div>
            <div class="custom-preset-group">
              <span class="preset-label">Try Sample:</span>
              ${CUSTOM_TEXT_PRESETS.map(
                (p) => `
                <button type="button" class="preset-chip" data-custom-preset="${p.id}">
                  ${p.label}
                </button>
              `
              ).join('')}
            </div>
          </div>

          <div class="custom-textarea-wrap">
            <textarea
              id="custom-hebrew-input"
              class="custom-hebrew-textarea"
              dir="rtl"
              rows="3"
              placeholder="הדבק או הקלד טקסט בעברית כאן... (Paste or type Hebrew text here)"
            >${state.custom.rawText}</textarea>
          </div>

          <div class="custom-input-actions">
            <button type="button" class="btn-primary" data-action="custom-load-text">
              🔄 Analyze &amp; New Prompt
            </button>
            <button type="button" class="btn-secondary btn-sm" data-action="custom-clear-text">
              ✕ Clear Text
            </button>
          </div>
        </div>

        <div id="custom-practice-area" class="mode-container">
          ${renderCustomPracticeBody()}
        </div>
      </div>
    `;
  }

  function getSpeedLabel(spm) {
    if (spm < 48) return 'Slow Study';
    if (spm < 72) return 'Gentle Chant';
    if (spm < 98) return 'Congregational Pace';
    return 'Brisk Service Pace';
  }

  // =========================================================================
  // MAIN SHELL RENDER & EVENT DELEGATION
  // =========================================================================

  function render() {
    const appEl = document.getElementById('app');
    if (!appEl) return;

    const summary = zpd.getZpdSummary();
    const prayer = getSelectedPrayer();

    let tabContentHtml = '';
    if (state.activeTab === 'follow') tabContentHtml = renderFollowAlongTab();
    else if (state.activeTab === 'spot') tabContentHtml = renderSpotTheWordTab();
    else if (state.activeTab === 'warmup') tabContentHtml = renderWarmupTab();
    else if (state.activeTab === 'dashboard') tabContentHtml = renderDashboardTab();
    else if (state.activeTab === 'custom') tabContentHtml = renderCustomTextTab();
    else tabContentHtml = renderDashboardTab();

    appEl.innerHTML = `
      <header class="app-header">
        <div class="brand-block">
          <div class="brand-logo" dir="rtl">א-ב</div>
          <div>
            <h1 class="brand-title">AlefBet Service Reader</h1>
            <p class="brand-subtitle">Find Your Place &amp; Follow Along in the Zone of Proximal Development</p>
          </div>
        </div>

        <!-- ZPD Live Status Pill -->
        <div class="zpd-header-strip">
          <div class="zpd-pill-group" title="Letters you already know and use as visual anchors">
            <span class="zpd-pill-label">Known Anchors:</span>
            <span class="zpd-pill-chars" dir="rtl">
              ${summary.masteredLetters.map((l) => l.char).join(' ')}
            </span>
          </div>
          <div class="zpd-pill-divider"></div>
          <div class="zpd-pill-group" title="Letters currently in your Zone of Proximal Development">
            <span class="zpd-pill-label">Active ZPD Frontier:</span>
            <span class="zpd-pill-chars frontier-chars" dir="rtl">
              ${summary.frontierLetters.map((l) => l.char).join(' ')}
            </span>
          </div>
        </div>

        <div class="header-controls">
          <button
            type="button"
            class="btn-icon"
            data-action="toggle-voice-source"
            title="Switch between Vocalized Israeli Hebrew Studio Audio (consistent across all 40 words &amp; 27 letters) and Wikimedia Commons Native Speaker Recordings (where available)"
          >
            ${audio.preferHumanRecording ? '🎙️ Voice: Wikimedia Human' : '🇮🇱 Voice: Israeli Hebrew'}
          </button>
          <button type="button" class="btn-icon" data-action="toggle-mute" title="Toggle Audio">
            ${audio.muted ? '🔇 Muted' : '🔊 Audio On'}
          </button>
        </div>
      </header>

      <!-- Navigation & Prayer Selector Bar -->
      <nav class="top-nav-bar">
        <div class="mode-tabs">
          <button type="button" class="mode-tab ${state.activeTab === 'follow' ? 'active' : ''}" data-tab="follow">
            📖 1. Paced Follow-Along
          </button>
          <button type="button" class="mode-tab ${state.activeTab === 'spot' ? 'active' : ''}" data-tab="spot">
            🔍 2. "Where Are We?" Spotting
          </button>
          <button type="button" class="mode-tab ${state.activeTab === 'warmup' ? 'active' : ''}" data-tab="warmup">
            ⚡ 3. 16 Target Words &amp; Drills
          </button>
          <button type="button" class="mode-tab ${state.activeTab === 'dashboard' ? 'active' : ''}" data-tab="dashboard">
            📊 4. ZPD Mastery (${summary.masteredLetters.length}/27)
          </button>
          <button type="button" class="mode-tab ${state.activeTab === 'custom' ? 'active' : ''}" data-tab="custom">
            ✍️ 5. Custom Hebrew Text
          </button>
        </div>

        ${
          state.activeTab === 'follow' || state.activeTab === 'spot'
            ? `
          <div class="prayer-selector-wrap">
            <label for="prayer-select">Service Passage:</label>
            <select id="prayer-select" class="prayer-select">
              ${window.AlefBetData.PRAYERS.map(
                (p) => `
                <option value="${p.id}" ${p.id === prayer.id ? 'selected' : ''}>
                  ${p.title} (${p.hebrewTitle})
                </option>
              `
              ).join('')}
            </select>
          </div>
        `
            : ''
        }
      </nav>

      <main class="main-content">
        ${tabContentHtml}
      </main>
    `;

    bindDynamicInputs();
  }

  function bindDynamicInputs() {
    const slider = document.getElementById('speed-dial-slider');
    if (slider) {
      slider.addEventListener('input', (e) => {
        const val = parseInt(e.target.value, 10);
        zpd.setSpeedSpm(val);
        render();
      });
    }

    const prayerSelect = document.getElementById('prayer-select');
    if (prayerSelect) {
      prayerSelect.addEventListener('change', (e) => {
        pauseFollowAlong();
        state.selectedPrayerId = e.target.value;
        state.follow.currentWordIndex = 0;
        state.follow.awaitingCheckpoint = false;
        state.follow.checkpointFeedback = null;
        state.selectedWordInspector = null;
        if (state.activeTab === 'spot') {
          pickNextSpotTarget();
        }
        render();
      });
    }

    const customInput = document.getElementById('custom-hebrew-input');
    if (customInput) {
      customInput.addEventListener('input', (e) => {
        loadCustomPassage(e.target.value, false);
        const practiceArea = document.getElementById('custom-practice-area');
        if (practiceArea) {
          practiceArea.innerHTML = renderCustomPracticeBody();
        }
      });
    }
  }

  // Global Event Delegation for clicks
  document.addEventListener('click', (e) => {
    const tabBtn = e.target.closest('[data-tab]');
    if (tabBtn) {
      pauseFollowAlong();
      state.activeTab = tabBtn.getAttribute('data-tab');
      if (state.activeTab === 'spot') {
        state.spot.feedback = null;
        pickNextSpotTarget();
      } else if (state.activeTab === 'custom') {
        state.custom.feedback = null;
        if (!state.custom.words || state.custom.words.length === 0) {
          loadCustomPassage(state.custom.rawText, true);
        } else {
          pickNextCustomTarget(true);
        }
      }
      render();
      return;
    }

    const followWordBtn = e.target.closest('[data-follow-word]');
    if (followWordBtn) {
      const idx = parseInt(followWordBtn.getAttribute('data-follow-word'), 10);
      handleFollowWordClick(idx);
      return;
    }

    const spotWordBtn = e.target.closest('[data-spot-word]');
    if (spotWordBtn) {
      const idx = parseInt(spotWordBtn.getAttribute('data-spot-word'), 10);
      handleSpotWordClick(idx);
      return;
    }

    const customWordBtn = e.target.closest('[data-custom-word]');
    if (customWordBtn) {
      const idx = parseInt(customWordBtn.getAttribute('data-custom-word'), 10);
      handleCustomWordClick(idx);
      return;
    }

    const customActivityBtn = e.target.closest('[data-custom-activity]');
    if (customActivityBtn) {
      const desiredActivity = customActivityBtn.getAttribute('data-custom-activity');
      const systemWords = getCustomSystemWords(state.custom.words);
      if (desiredActivity === 'system_audio' && systemWords.length === 0) {
        return; // Not offered when passage has new words only
      }
      state.custom.activity = desiredActivity;
      state.custom.feedback = null;
      pickNextCustomTarget(true);
      render();
      return;
    }

    const customPresetBtn = e.target.closest('[data-custom-preset]');
    if (customPresetBtn) {
      const presetId = customPresetBtn.getAttribute('data-custom-preset');
      const preset = CUSTOM_TEXT_PRESETS.find((p) => p.id === presetId);
      if (preset) {
        state.selectedWordInspector = null;
        // If preset has system words, default to Activity 1 so user can experience both; if new words only, loadCustomPassage automatically switches to Activity 2!
        state.custom.activity = 'system_audio';
        loadCustomPassage(preset.text, true);
        render();
      }
      return;
    }

    const speedDeltaBtn = e.target.closest('[data-speed-delta]');
    if (speedDeltaBtn) {
      const delta = parseInt(speedDeltaBtn.getAttribute('data-speed-delta'), 10);
      zpd.setSpeedSpm(zpd.profile.speedSpm + delta);
      render();
      return;
    }

    const speedSetBtn = e.target.closest('[data-speed-set]');
    if (speedSetBtn) {
      const val = parseInt(speedSetBtn.getAttribute('data-speed-set'), 10);
      zpd.setSpeedSpm(val);
      render();
      return;
    }

    const pointerStyleBtn = e.target.closest('[data-pointer-style]');
    if (pointerStyleBtn) {
      const nextStyle = pointerStyleBtn.getAttribute('data-pointer-style');
      state.follow.pointerStyle = nextStyle;
      if (nextStyle === 'guided') {
        state.follow.showAnchorHighlights = true;
      } else {
        state.selectedWordInspector = null;
      }
      render();
      return;
    }

    const tierFilterBtn = e.target.closest('[data-tier-filter]');
    if (tierFilterBtn) {
      state.warmup.selectedTierFilter = tierFilterBtn.getAttribute('data-tier-filter');
      render();
      return;
    }

    const quizOptBtn = e.target.closest('[data-warmup-quiz-opt]');
    if (quizOptBtn) {
      const heb = quizOptBtn.getAttribute('data-warmup-quiz-opt');
      const wordObj = window.AlefBetData.WORDS.find((w) => w.hebrew === heb);
      if (wordObj) handleWarmupQuizAnswer(wordObj);
      return;
    }

    const inspectVocabCard = e.target.closest('[data-inspect-vocab]');
    if (inspectVocabCard) {
      const id = inspectVocabCard.getAttribute('data-inspect-vocab');
      const w = window.AlefBetData.WORDS.find((x) => x.id === id);
      if (w) {
        state.selectedWordInspector = w;
        audio.speakWord(w, zpd.profile.speedSpm);
        render();
      }
      return;
    }

    const speakLetterBtn = e.target.closest('[data-speak-letter]');
    if (speakLetterBtn) {
      e.stopPropagation();
      const char = speakLetterBtn.getAttribute('data-speak-letter');
      audio.speakLetter(char, zpd.profile.speedSpm);
      return;
    }

    const cycleLetterBtn = e.target.closest('[data-cycle-letter]');
    if (cycleLetterBtn) {
      const char = cycleLetterBtn.getAttribute('data-cycle-letter');
      audio.speakLetter(char, zpd.profile.speedSpm);
      const current = zpd.profile.letters[char]?.status || 'unintroduced';
      const next =
        current === 'unintroduced' ? 'frontier' : current === 'frontier' ? 'mastered' : 'unintroduced';
      zpd.setLetterStatus(char, next);
      render();
      return;
    }

    const actionBtn = e.target.closest('[data-action]');
    if (actionBtn) {
      const action = actionBtn.getAttribute('data-action');
      const prayer = getSelectedPrayer();

      switch (action) {
        case 'follow-play':
          startFollowAlong();
          break;
        case 'follow-pause':
          pauseFollowAlong();
          break;
        case 'follow-reset':
          resetFollowAlong();
          break;
        case 'toggle-anchor-colors':
          if (state.activeTab === 'follow') {
            state.follow.showAnchorHighlights = !state.follow.showAnchorHighlights;
          } else {
            state.showAnchorHighlights = !state.showAnchorHighlights;
          }
          render();
          break;
        case 'hear-checkpoint-word': {
          const cpWord = prayer.words[state.follow.checkpointTargetIndex];
          if (cpWord) audio.speakWord(cpWord, zpd.profile.speedSpm);
          break;
        }
        case 'spot-hear-cue': {
          const tWord = prayer.words[state.spot.targetWordIndex];
          if (tWord) audio.speakWord(tWord, zpd.profile.speedSpm);
          break;
        }
        case 'spot-skip':
          state.spot.feedback = null;
          pickNextSpotTarget();
          render();
          break;
        case 'custom-load-text': {
          const inputEl = document.getElementById('custom-hebrew-input');
          const textVal = inputEl ? inputEl.value : state.custom.rawText;
          loadCustomPassage(textVal, true);
          render();
          break;
        }
        case 'custom-clear-text':
          state.selectedWordInspector = null;
          loadCustomPassage('', false);
          render();
          break;
        case 'custom-hear-target': {
          const tWord =
            state.custom.targetWordIndex !== null
              ? state.custom.words[state.custom.targetWordIndex]
              : null;
          if (tWord) audio.speakWord(tWord, zpd.profile.speedSpm);
          break;
        }
        case 'custom-toggle-audio-hint':
          state.custom.showAudioHintTranslit = !state.custom.showAudioHintTranslit;
          render();
          break;
        case 'custom-next-word':
          state.custom.feedback = null;
          pickNextCustomTarget(true);
          render();
          break;
        case 'warmup-speak-quiz':
          if (state.warmup.quizTarget) {
            audio.speakWord(state.warmup.quizTarget, zpd.profile.speedSpm);
          }
          break;
        case 'speak-inspected': {
          const w = state.selectedWordInspector || prayer.words[state.follow.currentWordIndex];
          if (w) audio.speakWord(w, zpd.profile.speedSpm, 'studio');
          break;
        }
        case 'speak-inspected-human': {
          const w = state.selectedWordInspector || prayer.words[state.follow.currentWordIndex];
          if (w) audio.speakWord(w, zpd.profile.speedSpm, 'human');
          break;
        }
        case 'toggle-voice-source':
          audio.preferHumanRecording = !audio.preferHumanRecording;
          render();
          break;
        case 'rescue-inspected': {
          const w = state.selectedWordInspector || prayer.words[state.follow.currentWordIndex];
          if (w) {
            zpd.recordRescueTap(w);
            audio.speakWord(w, Math.max(35, zpd.profile.speedSpm - 15));
            render();
          }
          break;
        }
        case 'toggle-mute':
          audio.muted = !audio.muted;
          render();
          break;
        case 'reset-profile':
          if (confirm('Reset your ZPD progress back to the baseline (א, ל, מ, ם known)?')) {
            zpd.resetProfile();
            render();
          }
          break;
      }
    }
  });

  // Initialize on DOM ready
  window.addEventListener('DOMContentLoaded', () => {
    render();
  });
})();
