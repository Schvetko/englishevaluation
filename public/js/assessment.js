(function () {
  'use strict';

  var ANSWER_LIMIT_SEC = 7 * 60;
  var REMINDER_SEC = 5 * 60;
  var PREP_LIMIT_SEC = 5 * 60;

  var SpeechRecognitionImpl =
    window.SpeechRecognition || window.webkitSpeechRecognition || null;

  var state = {
    questions: null, // { technical, everyday }
    current: null, // 'q1' | 'q2'
    answers: {
      q1: { question: '', transcript: '', durationSec: 0, mode: 'voice' },
      q2: { question: '', transcript: '', durationSec: 0, mode: 'voice' }
    },
    recognition: null,
    recognitionActive: false,
    finalTranscript: '',
    interimTranscript: '',
    answerTimerId: null,
    prepTimerId: null,
    answerStartedAt: null,
    reminderShown: false,
    voiceFailed: false
  };

  // --- DOM helpers ---
  function $(id) {
    return document.getElementById(id);
  }
  function show(id) {
    $(id).classList.remove('hidden');
  }
  function hide(id) {
    $(id).classList.add('hidden');
  }
  function setStep(stepId, cls) {
    ['step-intro', 'step-q1', 'step-q2', 'step-finish'].forEach(function (s) {
      $(s).classList.remove('active');
    });
    if (cls === 'active') $(stepId).classList.add('active');
    if (cls === 'done') $(stepId).classList.add('done');
  }
  function fmt(sec) {
    var m = Math.floor(sec / 60);
    var s = sec % 60;
    return m + ':' + (s < 10 ? '0' : '') + s;
  }
  function showError(msg) {
    var b = $('error-banner');
    b.textContent = msg;
    b.classList.remove('hidden');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }
  function clearError() {
    $('error-banner').classList.add('hidden');
  }

  // --- Speech recognition ---
  function startRecognition() {
    if (!SpeechRecognitionImpl) {
      useTextFallback();
      return;
    }
    var rec = new SpeechRecognitionImpl();
    rec.lang = 'en-US';
    rec.continuous = true;
    rec.interimResults = true;

    rec.onresult = function (event) {
      var interim = '';
      for (var i = event.resultIndex; i < event.results.length; i++) {
        var r = event.results[i];
        if (r.isFinal) {
          state.finalTranscript += r[0].transcript + ' ';
        } else {
          interim += r[0].transcript;
        }
      }
      state.interimTranscript = interim;
      renderTranscript();
    };

    rec.onerror = function (event) {
      // 'no-speech' and 'aborted' are benign; onend will restart if needed
      var fatal = ['not-allowed', 'service-not-allowed', 'language-not-supported', 'audio-capture'];
      if (fatal.indexOf(event.error) !== -1) {
        state.voiceFailed = true;
        useTextFallback();
      }
    };

    rec.onend = function () {
      // Chrome stops recognition periodically; restart while the answer is active
      if (state.recognitionActive && !state.voiceFailed) {
        try {
          rec.start();
        } catch (e) {
          /* already started */
        }
      }
    };

    state.recognition = rec;
    state.recognitionActive = true;
    try {
      rec.start();
    } catch (e) {
      state.voiceFailed = true;
      useTextFallback();
    }
  }

  function stopRecognition() {
    state.recognitionActive = false;
    if (state.recognition) {
      try {
        state.recognition.stop();
      } catch (e) {
        /* noop */
      }
      state.recognition = null;
    }
  }

  function useTextFallback() {
    stopRecognition();
    state.answers[state.current].mode = 'text';
    hide('voice-area');
    hide('rec-indicator');
    show('text-area');
  }

  function renderTranscript() {
    var box = $('transcript-box');
    var text = state.finalTranscript + state.interimTranscript;
    box.textContent = text || 'Your transcribed speech will appear here…';
    box.scrollTop = box.scrollHeight;
  }

  // --- Question flow ---
  function showQuestion(which) {
    state.current = which;
    state.finalTranscript = '';
    state.interimTranscript = '';
    state.reminderShown = false;
    state.voiceFailed = false;

    hide('screen-intro');
    hide('screen-finish');
    show('screen-question');
    show('voice-area');
    hide('text-area');
    show('rec-indicator');
    $('text-answer').value = '';
    $('transcript-box').textContent = 'Your transcribed speech will appear here…';
    $('answer-timer').textContent = '0:00';
    $('answer-timer').className = 'timer';

    if (which === 'q1') {
      setStep('step-q1', 'active');
      $('q-title').textContent = 'Question 1 · Technical';
      $('q-text').textContent = state.questions.technical;
      $('q-instructions').innerHTML =
        '<strong>Take up to 5 minutes to prepare.</strong> Think about what you want to say, ' +
        'sketch a short outline or notes. Speak for 3–7 minutes. Use the technical language ' +
        'you would use with colleagues. When you are ready, press the button below.';
      show('prep-phase');
      hide('answer-phase');
      startPrepTimer();
    } else {
      setStep('step-q2', 'active');
      $('q-title').textContent = 'Question 2 · General';
      $('q-text').textContent = state.questions.everyday;
      $('q-instructions').innerHTML =
        'No preparation needed — just answer naturally, as in a normal conversation. ' +
        'Speak for 2–5 minutes.';
      hide('prep-phase');
      beginAnswer();
    }
  }

  function startPrepTimer() {
    var remaining = PREP_LIMIT_SEC;
    $('prep-timer').textContent = fmt(remaining);
    state.prepTimerId = setInterval(function () {
      remaining--;
      $('prep-timer').textContent = fmt(remaining);
      if (remaining <= 0) {
        clearInterval(state.prepTimerId);
        beginAnswer(); // auto-start when prep time is over
      }
    }, 1000);
  }

  function beginAnswer() {
    if (state.prepTimerId) {
      clearInterval(state.prepTimerId);
      state.prepTimerId = null;
    }
    hide('prep-phase');
    show('answer-phase');
    state.answerStartedAt = Date.now();
    startRecognition();

    state.answerTimerId = setInterval(function () {
      var elapsed = Math.floor((Date.now() - state.answerStartedAt) / 1000);
      var timerEl = $('answer-timer');
      timerEl.textContent = fmt(elapsed);
      if (elapsed >= REMINDER_SEC) timerEl.className = 'timer warning';
      if (elapsed >= ANSWER_LIMIT_SEC - 30) timerEl.className = 'timer danger';

      if (elapsed >= REMINDER_SEC && !state.reminderShown) {
        state.reminderShown = true;
        show('modal-5min');
      }
      if (elapsed >= ANSWER_LIMIT_SEC) {
        finishAnswer(); // hard stop at 7 minutes
      }
    }, 1000);
  }

  function finishAnswer() {
    clearInterval(state.answerTimerId);
    state.answerTimerId = null;
    hide('modal-5min');
    stopRecognition();

    var which = state.current;
    var answer = state.answers[which];
    answer.question =
      which === 'q1' ? state.questions.technical : state.questions.everyday;
    answer.durationSec = Math.floor((Date.now() - state.answerStartedAt) / 1000);
    answer.transcript =
      answer.mode === 'text'
        ? $('text-answer').value.trim()
        : (state.finalTranscript + state.interimTranscript).trim();

    if (which === 'q1') {
      setStep('step-q1', 'done');
      showQuestion('q2');
    } else {
      setStep('step-q2', 'done');
      hide('screen-question');
      show('screen-finish');
      setStep('step-finish', 'active');
      $('candidate-name').focus();
    }
  }

  // --- Submit ---
  function submit() {
    clearError();
    var name = $('candidate-name').value.trim();
    if (!name) {
      showError('Please enter your first and last name.');
      return;
    }
    if (!state.answers.q1.transcript && !state.answers.q2.transcript) {
      showError(
        'No answer was captured for either question. Please restart the assessment and check your microphone.'
      );
      return;
    }

    $('btn-submit').disabled = true;
    show('submit-status');

    fetch('/api/evaluate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: name,
        q1: state.answers.q1,
        q2: state.answers.q2
      })
    })
      .then(function (res) {
        return res.json().then(function (data) {
          if (!res.ok) throw new Error(data.error || 'Server error');
          return data;
        });
      })
      .then(function (data) {
        window.location.href = '/results/' + data.id;
      })
      .catch(function (err) {
        $('btn-submit').disabled = false;
        hide('submit-status');
        showError('Submission failed: ' + err.message + ' — please try again.');
      });
  }

  // --- Wire up ---
  $('btn-start').addEventListener('click', function () {
    clearError();
    fetch('/api/questions')
      .then(function (res) {
        if (!res.ok) throw new Error('Could not load questions');
        return res.json();
      })
      .then(function (q) {
        state.questions = q;
        showQuestion('q1');
      })
      .catch(function (err) {
        showError(err.message);
      });
  });

  $('btn-begin-answer').addEventListener('click', beginAnswer);
  $('link-text-fallback').addEventListener('click', function (e) {
    e.preventDefault();
    // carry over anything already transcribed
    var existing = (state.finalTranscript + state.interimTranscript).trim();
    state.voiceFailed = true;
    useTextFallback();
    if (existing) $('text-answer').value = existing + ' ';
    $('text-answer').focus();
  });
  $('btn-finish-answer').addEventListener('click', finishAnswer);
  $('btn-modal-ok').addEventListener('click', function () {
    hide('modal-5min');
  });
  $('btn-submit').addEventListener('click', submit);
  $('candidate-name').addEventListener('keydown', function (e) {
    if (e.key === 'Enter') submit();
  });

  setStep('step-intro', 'active');
})();
