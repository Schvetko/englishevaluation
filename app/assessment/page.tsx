"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { upload } from "@vercel/blob/client";
import {
  ANSWER_LIMIT_SECONDS,
  EVERYDAY_QUESTIONS,
  SOFT_WARNING_SECONDS,
  TECH_SCENARIOS,
} from "@/lib/questions";

type Phase = "intro" | "question" | "name" | "submitting";
type SubPhase = "prep" | "recording" | "review";

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

const MIN_TRANSCRIPT_CHARS = 40;

export default function AssessmentPage() {
  const router = useRouter();

  const [phase, setPhase] = useState<Phase>("intro");
  const [questionIndex, setQuestionIndex] = useState<0 | 1>(0);
  const [subPhase, setSubPhase] = useState<SubPhase>("prep");

  const [questions, setQuestions] = useState<[string, string] | null>(null);
  const [answers, setAnswers] = useState<[AnswerState, AnswerState]>([
    { ...EMPTY_ANSWER },
    { ...EMPTY_ANSWER },
  ]);

  const [speechSupported, setSpeechSupported] = useState(true);
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

  useEffect(() => {
    return () => {
      stopRecognition();
      cleanupTimers();
      mediaStreamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, [stopRecognition, cleanupTimers]);

  const stopAnswer = useCallback(() => {
    if (stoppingRef.current) return;
    stoppingRef.current = true;

    stopRecognition();
    cleanupTimers();

    const finishReview = (videoBlob: Blob | null) => {
      const idx = questionIndex;
      const transcript = finalTranscriptRef.current.trim();
      setAnswers((prev) => {
        const next = [...prev] as [AnswerState, AnswerState];
        next[idx] = {
          transcript,
          durationSeconds: elapsedRef.current,
          videoBlob,
        };
        return next;
      });
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
  }, [stopRecognition, cleanupTimers, questionIndex]);

  const stopAnswerRef = useRef(stopAnswer);
  useEffect(() => {
    stopAnswerRef.current = stopAnswer;
  }, [stopAnswer]);

  const startAnswer = useCallback(async () => {
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

    timerRef.current = setInterval(() => {
      elapsedRef.current += 1;
      setElapsed(elapsedRef.current);
      if (elapsedRef.current === SOFT_WARNING_SECONDS) {
        setShowTimeWarning(true);
        setWarningShown(true);
      }
      if (elapsedRef.current >= ANSWER_LIMIT_SECONDS) {
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
    setAnswers((prev) => {
      const next = [...prev] as [AnswerState, AnswerState];
      next[questionIndex] = { ...EMPTY_ANSWER };
      return next;
    });
    setSubPhase("prep");
  }, [questionIndex]);

  const confirmAnswer = useCallback(() => {
    if (questionIndex === 0) {
      setQuestionIndex(1);
      setSubPhase("prep");
    } else {
      setPhase("name");
    }
  }, [questionIndex]);

  const submit = useCallback(async () => {
    if (!questions) return;
    setSubmitError("");
    setPhase("submitting");

    const videoUrls: string[] = [];
    try {
      for (let i = 0; i < 2; i++) {
        const blob = answers[i].videoBlob;
        if (!blob) continue;
        setSubmitStatus(`Uploading video ${i + 1} of 2…`);
        try {
          const result = await upload(
            `videos/${sessionIdRef.current}-q${i + 1}.webm`,
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
          transcript1: answers[0].transcript,
          transcript2: answers[1].transcript,
          duration1Seconds: answers[0].durationSeconds,
          duration2Seconds: answers[1].durationSeconds,
          answerMode1: "voice",
          answerMode2: "voice",
          videoUrls,
        }),
      });
      const data = (await response.json()) as { id?: string; error?: string };
      if (!response.ok || !data.id) {
        throw new Error(data.error || "Submission failed");
      }
      router.push(`/results/${data.id}`);
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : "Submission failed");
      setPhase("name");
    }
  }, [answers, firstName, lastName, questions, router]);

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

  const isTechnical = questionIndex === 0;
  const currentQuestion = questions[questionIndex];
  const currentAnswer = answers[questionIndex];
  const remaining = ANSWER_LIMIT_SECONDS - elapsed;
  const transcriptTooShort =
    currentAnswer.transcript.length < MIN_TRANSCRIPT_CHARS;

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
                For each question you can take a few minutes to prepare before
                you start speaking.
              </li>
              <li>
                Each answer is limited to <strong>7 minutes</strong>; a
                reminder appears after 5 minutes.
              </li>
              <li>
                Please allow <strong>microphone and camera</strong> access when
                the browser asks, use a quiet room, and speak clearly at a
                normal pace.
              </li>
            </ul>
            <div className="actions">
              <button className="btn" onClick={() => setPhase("question")}>
                Begin
              </button>
            </div>
          </div>
        </>
      )}

      {phase === "question" && (
        <>
          <div className="step-indicator">
            Question {questionIndex + 1} of 2 ·{" "}
            {isTechnical ? "Technical scenario" : "Everyday question"}
          </div>
          <div className="card">
            <h2>{currentQuestion}</h2>

            {subPhase === "prep" && (
              <>
                {isTechnical ? (
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
                        remaining <= 60
                          ? "over"
                          : warningShown
                            ? "warning"
                            : ""
                      }`}
                    >
                      {formatTime(elapsed)}
                    </span>
                    <span className="muted small"> / 7:00</span>
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
                        {questionIndex === 0
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
