import Link from "next/link";

export default function HomePage() {
  return (
    <main className="container">
      <h1>English Assessment for IT Candidates</h1>
      <p className="subtitle">
        A short spoken-English assessment: two questions, up to 7 minutes of
        speaking each.
      </p>

      <div className="card">
        <h2>How it works</h2>
        <ul className="clean">
          <li>
            You will answer <strong>two questions in English, out loud</strong>:
            one technical scenario and one everyday question.
          </li>
          <li>
            Your speech is transcribed automatically and your video is
            recorded. If your browser does not support speech recognition, you
            can type your answer instead.
          </li>
          <li>
            Each answer is limited to <strong>7 minutes</strong>. You will see
            a reminder after 5 minutes.
          </li>
          <li>
            Use a desktop <strong>Chrome, Edge or Safari</strong> browser with
            a working microphone and camera.
          </li>
        </ul>
        <div className="actions">
          <Link href="/assessment" className="btn">
            Start assessment
          </Link>
        </div>
      </div>

      <p className="muted small">
        Hiring team: <Link href="/admin">admin panel</Link>
      </p>
    </main>
  );
}
