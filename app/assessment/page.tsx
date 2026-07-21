"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { upload } from "@vercel/blob/client";
import {
  ANSWER_LIMIT_SECONDS,
  EVERYDAY_QUESTIONS,
  FOLLOWUP_LIMIT_SECONDS,
  SOFT_WARNING_SECONDS,
  TECH_SCENARIOS,
} from "@/lib/questions";

type Slot = "q1" | "followup" | "q2";
type Phase = "intro" | "flow" | "name" | "submitting" | "done";
type SubPhase = "prep" | "loading" | "recording" | "review";

interface AnswerState {
  transcript: string;
  durationSeconds: number;
  videoBlob: Blob | null;
}

// Web Speech API is not in the standard TS DOM lib.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnySpeechRecognition = any;

function getSpeechRecognitionCtor(): (new () => AnySpeechRecognition) | null {
  if (typeof window === "undefined") return null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const w = window as any;
  return w.SpeechRecognition || w.webkitSpeechRecognition || null;
}

function formatTime(totalSeconds: number): string {
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

const EMPTY_ANSWER: AnswerState = {
  transcript: "",
  durationSeconds: 0,
  videoBlob: null,
};

const MIN_TRANSCRIPT_CHARS: Record<Slot, number> = {
  q1: 40,
  followup: 20,
  q2: 40,
};

const TIME_LIMITS: Record<Slot, number> = {
  q1: ANSWER_LIMIT_SECONDS,
  followup: FOLLOWUP_LIMIT_SECONDS,
  q2: ANSWER_LIMIT_SECONDS,
};

// The follow-up is a listening-comprehension check, not a reading one — it
// is spoken aloud and never shown as text. One replay is allowed, mirroring
// asking a real person to repeat themselves once.
const MAX_FOLLOWUP_PLAYS = 2;

export default function AssessmentPage() {
  const [phase, setPhase] = useState<Phase>("intro");
  const [activeSlot, setActiveSlot] = useState<Slot>("q1");
  const [subPhase, setSubPhase] = useState<SubPhase>("prep");

  const [questions, setQuestions] = useState<[string, string] | null>(null);
  const [followupQuestion, setFollowupQuestion] = useState("");
  const [answers, setAnswers] = useState<Record<Slot, AnswerState>>({
    q1: { ...EMPTY_ANSWER },
    followup: { ...EMPTY_ANSWER },
    q2: { ...EMPTY_ANSWER },
  });

  const [speechSupported, setSpeechSupported] = useState(true);
  const [ttsSupported, setTtsSupported] = useState(true);
  const [followupPlayCount, setFollowupPlayCount] = useState(0);
  const [followupSpeaking, setFollowupSpeaking] = useState(false);
  const [micBlocked, setMicBlocked] = useState(false);
  const [liveTranscript, setLiveTranscript] = useState("");
  const [interim, setInterim] = useState("");
  const [elapsed, setElapsed] = useState(0);
  const [showTimeWarning, setShowTimeWarning] = useState(false);
  const [warningShown, setWarningShown] = useState(false);
  const [cameraError, setCameraError] = useState(false);

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [submitError, setSubmitError] = useState("");
  const [submitStatus, setSubmitStatus] = useState("");

  const recognitionRef = useRef<AnySpeechRecognition | null>(null);
  const recognitionActiveRef = useRef(false);
  const restartTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const finalTranscriptRef = useRef("");
  const interimRef = useRef("");
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const elapsedRef = useRef(0);
  const stoppingRef = useRef(false);
  const activeSlotRef = useRef<Slot>("q1");
  const videoPreviewRef = useRef<HTMLVideoElement | null>(null);
  const sessionIdRef = useRef<string>("");

  // Pick random questions once, client-side.
  useEffect(() => {
    const tech =
      TECH_SCENARIOS[Math.floor(Math.random() * TECH_SCENARIOS.length)];
    const everyday =
      EVERYDAY_QUESTIONS[Math.floor(Math.random() * EVERYDAY_QUESTIONS.length)];
    setQuestions([tech.prompt, everyday]);
    setSpeechSupported(Boolean(getSpeechRecognitionCtor()));
    setTtsSupported(
      typeof window !== "undefined" && "speechSynthesis" in window,
    );
    sessionIdRef.current =
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : String(Date.now());
  }, []);

  const foldInterimIntoFinal = useCallback(() => {
    // Chrome sometimes ends recognition without finalising the last
    // hypothesis — keep it so no speech is lost.
    const pending = interimRef.current.trim();
    if (pending) {
      finalTranscriptRef.current +=
        (finalTranscriptRef.current ? " " : "") + pending;
      interimRef.current = "";
      setLiveTranscript(finalTranscriptRef.current);
      setInterim("");
    }
  }, []);

  const stopRecognition = useCallback(() => {
    recognitionActiveRef.current = false;
    if (restartTimerRef.current) {
      clearTimeout(restartTimerRef.current);
      restartTimerRef.current = null;
    }
    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop();
      } catch {
        /* already stopped */
      }
      recognitionRef.current = null;
    }
    foldInterimIntoFinal();
  }, [foldInterimIntoFinal]);

  const startRecognition = useCallback(() => {
    const Ctor = getSpeechRecognitionCtor();
    if (!Ctor) return;

    const spawn = () => {
      if (!recognitionActiveRef.current) return;
      const recognition = new Ctor();
      recognition.lang = "en-US";
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.maxAlternatives = 1;

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      recognition.onresult = (event: any) => {
        let interimText = "";
        for (let i = event.resultIndex; i < event.results.length; i++) {
          const result = event.results[i];
          if (result.isFinal) {
            const text = result[0].transcript.trim();
            if (text) {
              finalTranscriptRef.current +=
                (finalTranscriptRef.current ? " " : "") + text;
            }
          } else {
            interimText += result[0].transcript;
          }
        }
        interimRef.current = interimText;
        setLiveTranscript(finalTranscriptRef.current);
        setInterim(interimText);
      };

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      recognition.onerror = (event: any) => {
        if (
          event.error === "not-allowed" ||
          event.error === "service-not-allowed"
        ) {
          recognitionActiveRef.current = false;
          setMicBlocked(true);
        }
        // Everything else ("no-speech", "network", "aborted") falls
        // through to onend, where we restart.
      };

      recognition.onend = () => {
        foldInterimIntoFinal();
        recognitionRef.current = null;
        // Chrome stops recognition after pauses in speech. Restart with a
        // short delay — an immediate start() can throw and would kill the
        // whole restart chain.
        if (recognitionActiveRef.current) {
          restartTimerRef.current = setTimeout(spawn, 250);
        }
      };

      recognitionRef.current = recognition;
      try {
        recognition.start();
      } catch {
        // start() can throw if the previous instance is still winding
        // down — retry shortly instead of giving up.
        recognitionRef.current = null;
        if (recognitionActiveRef.current) {
          restartTimerRef.current = setTimeout(spawn, 500);
        }
      }
    };

    recognitionActiveRef.current = true;
    spawn();
  }, [foldInterimIntoFinal]);

  const cleanupTimers = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const playFollowupQuestion = useCallback(() => {
    if (typeof window === "undefined" || !window.speechSynthesis) return;
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(followupQuestion);
    utterance.lang = "en-US";
    utterance.rate = 0.95;
    utterance.onstart = () => setFollowupSpeaking(true);
    utterance.onend = () => {
      setFollowupSpeaking(false);
      setFollowupPlayCount((c) => c + 1);
    };
    utterance.onerror = () => setFollowupSpeaking(false);
    window.speechSynthesis.speak(utterance);
  }, [followupQuestion]);

  useEffect(() => {
    return () => {
      stopRecognition();
      cleanupTimers();
      mediaStreamRef.current?.getTracks().forEach((t) => t.stop());
      if (typeof window !== "undefined" && window.speechSynthesis) {
        window.speechSynthesis.cancel();
      }
    };
  }, [stopRecognition, cleanupTimers]);

  const stopAnswerRef = useRef<() => void>(() => {});

  const stopAnswer = useCallback(() => {
    if (stoppingRef.current) return;
    stoppingRef.current = true;

    stopRecognition();
    cleanupTimers();

    const slot = activeSlotRef.current;

    const finishReview = (videoBlob: Blob | null) => {
      const transcript = finalTranscriptRef.current.trim();
      setAnswers((prev) => ({
        ...prev,
        [slot]: {
          transcript,
          durationSeconds: elapsedRef.current,
          videoBlob,
        },
      }));
      setSubPhase("review");
      stoppingRef.current = false;
    };

    const recorder = mediaRecorderRef.current;
    if (recorder && recorder.state !== "inactive") {
      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, {
          type: recorder.mimeType || "video/webm",
        });
        mediaStreamRef.current?.getTracks().forEach((t) => t.stop());
        mediaStreamRef.current = null;
        mediaRecorderRef.current = null;
        finishReview(blob.size > 0 ? blob : null);
      };
      recorder.stop();
    } else {
      mediaStreamRef.current?.getTracks().forEach((t) => t.stop());
      mediaStreamRef.current = null;
      finishReview(null);
    }
  }, [stopRecognition, cleanupTimers]);

  useEffect(() => {
    stopAnswerRef.current = stopAnswer;
  }, [stopAnswer]);

  const startAnswer = useCallback(async () => {
    const slot = activeSlotRef.current;
    finalTranscriptRef.current = "";
    interimRef.current = "";
    setLiveTranscript("");
    setInterim("");
    setElapsed(0);
    elapsedRef.current = 0;
    setWarningShown(false);
    setShowTimeWarning(false);
    setCameraError(false);
    setMicBlocked(false);
    chunksRef.current = [];

    // Camera + mic for the video recording (best-effort; the assessment
    // continues without video if the camera is unavailable).
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 640 }, height: { ideal: 480 } },
        audio: true,
      });
      mediaStreamRef.current = stream;
      if (videoPreviewRef.current) {
        videoPreviewRef.current.srcObject = stream;
      }
      const preferredMime = "video/webm;codecs=vp8,opus";
      const recorder = new MediaRecorder(stream, {
        mimeType: MediaRecorder.isTypeSupported(preferredMime)
          ? preferredMime
          : undefined,
        videoBitsPerSecond: 600_000,
        audioBitsPerSecond: 64_000,
      });
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      recorder.start(1000);
      mediaRecorderRef.current = recorder;
    } catch {
      setCameraError(true);
    }

    setSubPhase("recording");

    // Give the recorder a moment to settle before recognition grabs the
    // microphone as a second consumer.
    setTimeout(() => startRecognition(), 400);

    const limit = TIME_LIMITS[slot];
    timerRef.current = setInterval(() => {
      elapsedRef.current += 1;
      setElapsed(elapsedRef.current);
      if (slot !== "followup" && elapsedRef.current === SOFT_WARNING_SECONDS) {
        setShowTimeWarning(true);
        setWarningShown(true);
      }
      if (elapsedRef.current >= limit) {
        stopAnswerRef.current();
      }
    }, 1000);
  }, [startRecognition]);

  useEffect(() => {
    // Attach the live stream to the preview element once it renders.
    if (
      subPhase === "recording" &&
      videoPreviewRef.current &&
      mediaStreamRef.current
    ) {
      videoPreviewRef.current.srcObject = mediaStreamRef.current;
    }
  }, [subPhase]);

  const retryAnswer = useCallback(() => {
    const slot = activeSlotRef.current;
    setAnswers((prev) => ({ ...prev, [slot]: { ...EMPTY_ANSWER } }));
    if (slot === "followup") {
      // Give a fresh set of listens for the retry attempt.
      setFollowupPlayCount(0);
    }
    // Always back to "prep" — for the follow-up slot this reuses the
    // already-generated question rather than asking the model again.
    setSubPhase("prep");
  }, []);

  const goToSlot = useCallback((slot: Slot) => {
    activeSlotRef.current = slot;
    setActiveSlot(slot);
    if (slot === "followup") {
      setFollowupPlayCount(0);
    }
    setSubPhase(slot === "followup" ? "loading" : "prep");
  }, []);

  const requestFollowup = useCallback(async () => {
    try {
      const response = await fetch("/api/followup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          question: questions?.[0] ?? "",
          transcript: answers.q1.transcript,
        }),
      });
      const data = (await response.json()) as {
        question?: string;
        error?: string;
      };
      if (!response.ok || !data.question) {
        throw new Error(data.error || "Follow-up generation failed");
      }
      setFollowupQuestion(data.question);
      setSubPhase("prep");
    } catch (err) {
      // Follow-up is a bonus signal — never block the assessment on it.
      console.error("Follow-up generation failed, skipping:", err);
      goToSlot("q2");
    }
  }, [questions, answers, goToSlot]);

  const confirmAnswer = useCallback(() => {
    if (activeSlot === "q1") {
      goToSlot("followup");
    } else if (activeSlot === "followup") {
      goToSlot("q2");
    } else {
      setPhase("name");
    }
  }, [activeSlot, goToSlot]);

  useEffect(() => {
    if (
      phase === "flow" &&
      activeSlot === "followup" &&
      subPhase === "loading"
    ) {
      requestFollowup();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, activeSlot, subPhase]);

  const submit = useCallback(async () => {
    if (!questions) return;
    setSubmitError("");
    setPhase("submitting");

    const slotsWithVideo: Slot[] = ["q1", "followup", "q2"];
    const videoUrls: string[] = [];
    try {
      for (const slot of slotsWithVideo) {
        const blob = answers[slot].videoBlob;
        if (!blob) continue;
        setSubmitStatus("Uploading video…");
        try {
          const result = await upload(
            `videos/${sessionIdRef.current}-${slot}.webm`,
            blob,
            { access: "public", handleUploadUrl: "/api/video" },
          );
          videoUrls.push(result.url);
        } catch (err) {
          // Video is best-effort — never block the evaluation on it.
          console.error("Video upload failed:", err);
        }
      }

      setSubmitStatus("Evaluating your answers… this takes up to a minute.");
      const response = await fetch("/api/evaluate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          candidateName: `${firstName.trim()} ${lastName.trim()}`.trim(),
          question1: questions[0],
          question2: questions[1],
          transcript1: answers.q1.transcript,
          transcript2: answers.q2.transcript,
          duration1Seconds: answers.q1.durationSeconds,
          duration2Seconds: answers.q2.durationSeconds,
          followupQuestion: followupQuestion || undefined,
          followupTranscript: answers.followup.transcript || undefined,
          followupDurationSeconds: answers.followup.durationSeconds,
          videoUrls,
        }),
      });
      const data = (await response.json()) as { id?: string; error?: string };
      if (!response.ok || !data.id) {
        throw new Error(data.error || "Submission failed");
      }
      setPhase("done");
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : "Submission failed");
      setPhase("name");
    }
  }, [answers, firstName, lastName, questions, followupQuestion]);

  if (!questions) {
    return (
      <main className="container">
        <p className="muted">Loading…</p>
      </main>
    );
  }

  // Voice is mandatory — block unsupported browsers up front.
  if (!speechSupported) {
    return (
      <main className="container">
        <h1>English Assessment</h1>
        <div className="card">
          <h2>This browser is not supported</h2>
          <p>
            The assessment requires spoken answers, and your browser does not
            support speech recognition.
          </p>
          <p>
            Please open this page in <strong>Google Chrome, Microsoft Edge or
            Safari on a desktop computer</strong> and try again.
          </p>
        </div>
      </main>
    );
  }

  const currentQuestion =
    activeSlot === "q1"
      ? questions[0]
      : activeSlot === "q2"
        ? questions[1]
        : followupQuestion;
  const currentAnswer = answers[activeSlot];
  const limit = TIME_LIMITS[activeSlot];
  const remaining = limit - elapsed;
  const transcriptTooShort =
    currentAnswer.transcript.length < MIN_TRANSCRIPT_CHARS[activeSlot];

  const stepLabel =
    activeSlot === "q1"
      ? "Question 1 of 2 · Technical scenario"
      : activeSlot === "followup"
        ? "Unscripted follow-up"
        : "Question 2 of 2 · Everyday question";

  return (
    <main className="container">
      {phase === "intro" && (
        <>
          <h1>English Assessment</h1>
          <p className="subtitle">Two spoken questions · about 15–20 minutes</p>
          <div className="card">
            <h2>Before you start</h2>
            <ul className="clean">
              <li>
                You will answer <strong>2 questions in English, speaking out
                loud</strong>. Your speech is transcribed automatically and
                your video is recorded.
              </li>
              <li>
                <strong>Question 1</strong> is a technical scenario.{" "}
                <strong>Question 2</strong> is an everyday question.
              </li>
              <li>
                Right after question 1, you will get one short{" "}
                <strong>follow-up question spoken out loud</strong> (not shown
                as text) based on your own answer — that one has{" "}
                <strong>no preparation time</strong>, so just listen and
                answer naturally.
              </li>
              <li>
                For questions 1 and 2 you can take a few minutes to prepare
                before you start speaking. Each of those answers is limited to{" "}
                <strong>7 minutes</strong>, with a reminder after 5 minutes.
              </li>
              <li>
                Please allow <strong>microphone and camera</strong> access when
                the browser asks, use a quiet room, turn your{" "}
                <strong>volume on</strong> for the follow-up question, and
                speak clearly at a normal pace.
              </li>
            </ul>
            <div className="actions">
              <button
                className="btn"
                onClick={() => {
                  goToSlot("q1");
                  setPhase("flow");
                }}
              >
                Begin
              </button>
            </div>
          </div>
        </>
      )}

      {phase === "flow" && (
        <>
          <div className="step-indicator">{stepLabel}</div>
          <div className="card">
            {subPhase === "loading" ? (
              <>
                <h2>Preparing your follow-up question…</h2>
                <p className="muted">One moment.</p>
              </>
            ) : activeSlot === "followup" ? (
              <h2>Follow-up question</h2>
            ) : (
              <h2>{currentQuestion}</h2>
            )}

            {subPhase === "prep" && activeSlot !== "followup" && (
              <>
                {activeSlot === "q1" ? (
                  <div className="card inner">
                    <p style={{ marginTop: 0 }}>
                      <strong>Take about 5 minutes to prepare.</strong> Read
                      the scenario carefully, think about what you want to
                      say, and feel free to jot down a few notes on paper.
                    </p>
                    <p className="muted" style={{ marginBottom: 0 }}>
                      If it helps, you can instead describe the most recent
                      feature you worked on — in technical language, as you
                      would to a colleague. Structure matters: situation →
                      what you did → outcome.
                    </p>
                  </div>
                ) : (
                  <div className="card inner">
                    <p style={{ margin: 0 }}>
                      This one is just a normal conversation question — take a
                      moment to think, then speak naturally. No preparation
                      needed.
                    </p>
                  </div>
                )}
                <p className="muted small">
                  When you press <strong>Start answering</strong>, recording
                  begins. Speak in English, out loud. You will have up to 7
                  minutes; a reminder appears at 5 minutes.
                </p>
                <div className="actions">
                  <button className="btn" onClick={startAnswer}>
                    Start answering
                  </button>
                </div>
              </>
            )}

            {subPhase === "prep" && activeSlot === "followup" && (
              <>
                {ttsSupported ? (
                  <>
                    <div className="card inner">
                      <p style={{ margin: 0 }}>
                        You will <strong>hear</strong> one short follow-up
                        question about what you just said — it is not shown
                        as text, so listen carefully. There is{" "}
                        <strong>no preparation time</strong>: answer right
                        away, as you would on a real call. You can replay it{" "}
                        <strong>once</strong> if you need to. You will have up
                        to <strong>2 minutes</strong> to answer.
                      </p>
                    </div>
                    <div className="actions">
                      {followupPlayCount === 0 ? (
                        <button
                          className="btn"
                          onClick={playFollowupQuestion}
                          disabled={followupSpeaking}
                        >
                          {followupSpeaking
                            ? "🔊 Playing…"
                            : "🔊 Play the question"}
                        </button>
                      ) : (
                        <>
                          <button
                            className="btn"
                            onClick={startAnswer}
                            disabled={followupSpeaking}
                          >
                            Start answering
                          </button>
                          {followupPlayCount < MAX_FOLLOWUP_PLAYS && (
                            <button
                              className="btn secondary"
                              onClick={playFollowupQuestion}
                              disabled={followupSpeaking}
                            >
                              {followupSpeaking
                                ? "🔊 Playing…"
                                : "🔁 Replay question"}
                            </button>
                          )}
                        </>
                      )}
                    </div>
                  </>
                ) : (
                  <>
                    <div className="card inner">
                      <p style={{ marginTop: 0 }}>
                        Your browser cannot read the question aloud, so here it
                        is written instead. There is{" "}
                        <strong>no preparation time</strong> — answer right
                        away. You will have up to <strong>2 minutes</strong>.
                      </p>
                      <p style={{ marginBottom: 0, fontWeight: 600 }}>
                        {followupQuestion}
                      </p>
                    </div>
                    <div className="actions">
                      <button className="btn" onClick={startAnswer}>
                        Start answering
                      </button>
                    </div>
                  </>
                )}
              </>
            )}

            {subPhase === "recording" && (
              <>
                <div
                  className="header-bar"
                  style={{ marginTop: 8, marginBottom: 16 }}
                >
                  <div>
                    <span className="rec-dot" />
                    <span
                      className={`timer ${
                        remaining <= 30
                          ? "over"
                          : activeSlot !== "followup" && warningShown
                            ? "warning"
                            : ""
                      }`}
                    >
                      {formatTime(elapsed)}
                    </span>
                    <span className="muted small">
                      {" "}
                      / {formatTime(limit)}
                    </span>
                  </div>
                  <video
                    ref={videoPreviewRef}
                    className="preview"
                    autoPlay
                    muted
                    playsInline
                  />
                </div>

                {cameraError && (
                  <p className="small" style={{ color: "var(--amber)" }}>
                    Camera is unavailable — continuing without video
                    recording.
                  </p>
                )}
                {micBlocked && (
                  <p className="small error-text">
                    Microphone access is blocked, so your speech cannot be
                    recognised. Allow microphone access in the browser
                    (usually the icon in the address bar), then press{" "}
                    <strong>Finish this answer</strong> and record again.
                  </p>
                )}

                <p className="muted small" style={{ marginBottom: 6 }}>
                  Speak in English — live transcript:
                </p>
                <div className="transcript-box">
                  {liveTranscript}
                  {interim && <span className="muted"> {interim}</span>}
                  {!liveTranscript && !interim && (
                    <span className="muted">Listening…</span>
                  )}
                </div>
                <p className="muted small" style={{ marginTop: 8 }}>
                  If the transcript is not appearing while you speak, check
                  that your microphone is working and allowed for this site.
                </p>

                <div className="actions">
                  <button className="btn danger" onClick={stopAnswer}>
                    Finish this answer
                  </button>
                </div>
              </>
            )}

            {subPhase === "review" && (
              <>
                {transcriptTooShort ? (
                  <>
                    <p className="error-text">
                      We could not capture your speech
                      {currentAnswer.transcript
                        ? " — only a small fragment was recognised."
                        : "."}
                    </p>
                    <div className="card inner">
                      <p style={{ marginTop: 0 }}>Please check:</p>
                      <ul className="clean" style={{ marginBottom: 0 }}>
                        <li>
                          the microphone is plugged in and allowed for this
                          site (icon in the address bar);
                        </li>
                        <li>you are using desktop Chrome, Edge or Safari;</li>
                        <li>
                          you speak clearly, at a normal volume, close to the
                          microphone.
                        </li>
                      </ul>
                    </div>
                    {currentAnswer.transcript && (
                      <div className="transcript-box" style={{ marginTop: 12 }}>
                        {currentAnswer.transcript}
                      </div>
                    )}
                    <div className="actions">
                      <button className="btn" onClick={retryAnswer}>
                        Record this answer again
                      </button>
                      {currentAnswer.transcript.length > 0 && (
                        <button
                          className="btn secondary"
                          onClick={confirmAnswer}
                        >
                          Continue anyway
                        </button>
                      )}
                    </div>
                  </>
                ) : (
                  <>
                    <p className="muted small">
                      Answer recorded (
                      {formatTime(currentAnswer.durationSeconds)}). Here is
                      what we captured:
                    </p>
                    <div className="transcript-box">
                      {currentAnswer.transcript}
                    </div>
                    <div className="actions">
                      <button className="btn" onClick={confirmAnswer}>
                        {activeSlot === "q1"
                          ? "Continue to follow-up"
                          : activeSlot === "followup"
                            ? "Continue to question 2"
                            : "Continue"}
                      </button>
                      <button className="btn secondary" onClick={retryAnswer}>
                        Record again
                      </button>
                    </div>
                  </>
                )}
              </>
            )}
          </div>
        </>
      )}

      {(phase === "name" || phase === "submitting") && (
        <>
          <div className="step-indicator">Final step</div>
          <div className="card">
            <h2>Almost done — tell us who you are</h2>
            <div className="grid-2">
              <div>
                <label className="form-label" htmlFor="first-name">
                  First name
                </label>
                <input
                  id="first-name"
                  className="field"
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                  autoComplete="given-name"
                />
              </div>
              <div>
                <label className="form-label" htmlFor="last-name">
                  Last name
                </label>
                <input
                  id="last-name"
                  className="field"
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                  autoComplete="family-name"
                />
              </div>
            </div>
            {submitError && (
              <p className="error-text small" style={{ marginTop: 12 }}>
                {submitError}
              </p>
            )}
            <div className="actions">
              <button
                className="btn"
                onClick={submit}
                disabled={
                  phase === "submitting" ||
                  !firstName.trim() ||
                  !lastName.trim()
                }
              >
                {phase === "submitting" ? "Submitting…" : "Finish assessment"}
              </button>
            </div>
            {phase === "submitting" && (
              <p className="muted small" style={{ marginTop: 12 }}>
                {submitStatus || "Working…"}
              </p>
            )}
          </div>
        </>
      )}

      {phase === "done" && (
        <div className="card" style={{ textAlign: "center", padding: 40 }}>
          <h1 style={{ marginBottom: 12 }}>Thank you!</h1>
          <p className="muted" style={{ margin: 0 }}>
            Your assessment has been submitted. The hiring team will review it
            and get back to you. You can close this page now.
          </p>
        </div>
      )}

      {showTimeWarning && (
        <div className="modal-overlay" role="dialog" aria-modal="true">
          <div className="modal">
            <h2 style={{ marginTop: 0 }}>5 minutes have passed</h2>
            <p>
              Please start wrapping up your answer. Recording stops
              automatically at <strong>7 minutes</strong>.
            </p>
            <button className="btn" onClick={() => setShowTimeWarning(false)}>
              Got it
            </button>
          </div>
        </div>
      )}
    </main>
  );
}
