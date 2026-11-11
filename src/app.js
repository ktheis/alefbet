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
      pointerStyle: 'guided', // 'guided' (moves word by word, then checks at phrase end) | 'stealth' (hides pointer mid-phrase, asks where we landed at phrase end!)
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
        state.selectedWordInspector = targetWord;

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
  // RENDERING HELPERS: CONSONANT-AWARE SIDDUR WORD & LETTER ANCHORS
  // =========================================================================

  /**
   * Renders a Hebrew word's consonants individually so known anchors (א, ל, מ, ם, etc.)
   * and active ZPD frontier letters can have subtle visual cues without vowel clutter.
   */
  function renderHebrewConsonantsHtml(wordObj, scaff) {
    if (!state.showAnchorHighlights) {
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
    const isInspected =
      state.selectedWordInspector &&
      state.selectedWordInspector.index === wordObj.index &&
      state.selectedWordInspector.hebrew === wordObj.hebrew;

    let cardClasses = ['siddur-word-card', `zpd-${scaff.level}`];
    if (wordObj.phraseEnd) cardClasses.push('phrase-end-word');
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
      } else if (state.follow.isPlaying) {
        if (state.follow.pointerStyle === 'guided' && isCurrent) {
          cardClasses.push('yad-active');
        } else if (state.follow.pointerStyle === 'stealth') {
          // In stealth eye-tracking mode, only highlight the first word of the phrase briefly!
          const prayer = getSelectedPrayer();
          const prevWord = prayer.words[wordObj.index - 1];
          const isPhraseStart = wordObj.index === 0 || (prevWord && prevWord.phraseEnd);
          if (isCurrent && isPhraseStart) {
            cardClasses.push('yad-stealth-start');
          }
        }
      } else if (isCurrent) {
        cardClasses.push('yad-paused');
      }
    } else if (mode === 'spot') {
      if (state.spot.wrongTappedIndices.includes(wordObj.index)) {
        cardClasses.push('spot-wrong-tap');
      }
    }

    // Decide what scaffolding sub-label to show under the Hebrew consonants
    let subLabelHtml = '';
    if (mode === 'spot' && !state.spot.wrongTappedIndices.includes(wordObj.index)) {
      // In "Where Are We?" mode, don't give away the target word's full English transliteration!
      // Instead, show partial consonant hints only on unintroduced words.
      if (scaff.level === 'scaffolded') {
        subLabelHtml = `<span class="word-scaff-hint partial">${zpd.getPartialConsonantHint(wordObj)}</span>`;
      } else {
        subLabelHtml = `<span class="word-scaff-hint minimal">•</span>`;
      }
    } else {
      // In Follow-Along mode:
      if (scaff.showTranslitByDefault) {
        subLabelHtml = `<span class="word-scaff-hint full">${wordObj.translit}</span>`;
      } else if (scaff.showPartialHint) {
        subLabelHtml = `<span class="word-scaff-hint partial" title="ZPD Frontier Hint">${zpd.getPartialConsonantHint(wordObj)}</span>`;
      } else {
        subLabelHtml = `<span class="word-scaff-hint mastered-dot" title="Mastered — Pure Hebrew"></span>`;
      }
    }

    const phraseEndBadge = wordObj.phraseEnd
      ? `<span class="phrase-boundary-mark" title="${wordObj.checkpointPrompt || 'Phrase boundary'}">${wordObj.isSentenceEnd ? '׃' : '׀'}</span>`
      : '';

    const actionAttr =
      mode === 'follow'
        ? `data-follow-word="${wordObj.index}"`
        : `data-spot-word="${wordObj.index}"`;

    return `
      <button type="button" class="${cardClasses.join(' ')}" ${actionAttr}>
        <div class="siddur-word-top">
          ${renderHebrewConsonantsHtml(wordObj, scaff)}
          ${phraseEndBadge}
        </div>
        <div class="siddur-word-sub">
          ${subLabelHtml}
        </div>
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
                  class="seg-btn ${state.follow.pointerStyle === 'guided' ? 'active' : ''}"
                  data-pointer-style="guided"
                  title="Moves highlight word-by-word and pauses at phrase ends for a Catch Me check"
                >
                  Guided Pointer + Phrase Check
                </button>
                <button
                  type="button"
                  class="seg-btn ${state.follow.pointerStyle === 'stealth' ? 'active' : ''}"
                  data-pointer-style="stealth"
                  title="Shows only the start of the phrase while reading aloud, then tests if your eyes stayed to the phrase end!"
                >
                  Eye-Track Only (Stealth Check)
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
              <button type="button" class="btn-ghost" data-action="toggle-anchor-colors">
                ${state.showAnchorHighlights ? '🎨 Letter Colors: ON' : '🎨 Letter Colors: OFF'}
              </button>
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
                "Catch Me" Phrase Checkpoint — ${cpTargetWord.checkpointPrompt || 'End of Phrase'}
              </div>
              <div class="checkpoint-prompt">
                The reader just paused on <strong>"${cpTargetWord.translit}"</strong> (<em>"${cpTargetWord.meaning}"</em>).
                <strong>Tap the Hebrew word where we stopped to confirm your place!</strong>
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
              <span class="legend-item"><span class="legend-dot dot-mastered"></span> Known Letter (א, ל, מ, ם...)</span>
              <span class="legend-item"><span class="legend-dot dot-frontier"></span> Active ZPD Frontier</span>
              <span class="legend-item"><span class="legend-dot dot-scaffold"></span> Unintroduced (Full Hint)</span>
            </div>
          </div>

          <div class="siddur-words-flow" dir="rtl">
            ${wordsHtml}
          </div>

          <div class="siddur-translation">
            <strong>Meaning:</strong> "${prayer.translation}"
          </div>
        </div>

        ${renderWordInspector(state.selectedWordInspector || prayer.words[state.follow.currentWordIndex])}
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
      state.follow.pointerStyle = pointerStyleBtn.getAttribute('data-pointer-style');
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
          state.showAnchorHighlights = !state.showAnchorHighlights;
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
