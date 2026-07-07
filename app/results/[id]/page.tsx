import Link from "next/link";
import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { getAssessment } from "@/lib/db";
import { ADMIN_COOKIE, isValidAdminCookie } from "@/lib/auth";

export const dynamic = "force-dynamic";

const BAND_LABELS: Record<string, string> = {
  independent: "Independent",
  supported: "Supported",
  needs_support: "Needs support",
};

const GAP_LABELS: Record<string, string> = {
  none: "No noticeable gap",
  moderate: "Moderate gap",
  significant: "Significant gap",
};

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default async function ResultPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  // Results are for the hiring team only — candidates never see them.
  const cookieStore = await cookies();
  if (!isValidAdminCookie(cookieStore.get(ADMIN_COOKIE)?.value)) {
    redirect("/admin");
  }

  const { id } = await params;
  const record = await getAssessment(id);
  if (!record) notFound();

  const e = record.evaluation;

  return (
    <main className="container">
      <div className="header-bar">
        <div>
          <h1>{record.candidateName}</h1>
          <p className="muted small" style={{ margin: 0 }}>
            English assessment · {formatDate(record.createdAt)}
          </p>
        </div>
        <span className={`badge ${e.overall_band}`}>
          {BAND_LABELS[e.overall_band] ?? e.overall_band}
        </span>
      </div>

      <div className="card">
        <h2>Scores</h2>
        <div className="score-row">
          <span className="score-value">{e.comprehension.score}/5</span>
          <span className="score-label">Comprehension</span>
        </div>
        <p className="muted small">{e.comprehension.comment}</p>

        <div className="score-row">
          <span className="score-value">{e.fluency.score}/5</span>
          <span className="score-label">Production / fluency</span>
        </div>
        <p className="muted small">{e.fluency.comment}</p>

        <div className="score-row">
          <span className="score-value">{e.technical_vocabulary.score}/5</span>
          <span className="score-label">
            Technical vocabulary <span className="muted">(question 1)</span>
          </span>
        </div>
        <p className="muted small">{e.technical_vocabulary.comment}</p>

        <div className="score-row">
          <span className="score-value" style={{ fontSize: "1rem" }}>
            {GAP_LABELS[e.everyday_technical_gap.gap] ??
              e.everyday_technical_gap.gap}
          </span>
          <span className="score-label">Everyday vs technical gap</span>
        </div>
        <p className="muted small" style={{ marginBottom: 0 }}>
          {e.everyday_technical_gap.comment}
        </p>
      </div>

      <div className="card">
        <h2>Observations</h2>
        <ul className="clean">
          {e.observations.map((obs, i) => (
            <li key={i}>{obs}</li>
          ))}
        </ul>
        {(e.reformulation_example.original ||
          e.reformulation_example.improved) && (
          <>
            <h2 style={{ marginTop: 20 }}>Example reformulation</h2>
            <blockquote className="reform">
              “{e.reformulation_example.original}”
            </blockquote>
            <blockquote className="reform improved">
              “{e.reformulation_example.improved}”
            </blockquote>
          </>
        )}
      </div>

      {record.videoUrls.length > 0 && (
        <div className="card">
          <h2>Video recordings</h2>
          <ul className="clean">
            {record.videoUrls.map((url, i) => (
              <li key={url}>
                <a href={url} target="_blank" rel="noopener noreferrer">
                  Answer {i + 1} video
                </a>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="card">
        <h2>Transcripts</h2>
        <p className="small" style={{ marginBottom: 4 }}>
          <strong>Q1 (technical{record.answerMode1 === "text" ? ", typed" : ""}):</strong>{" "}
          <span className="muted">{record.question1}</span>
        </p>
        <div className="transcript-box" style={{ marginBottom: 18 }}>
          {record.transcript1 || "(empty)"}
        </div>
        <p className="small" style={{ marginBottom: 4 }}>
          <strong>Q2 (everyday{record.answerMode2 === "text" ? ", typed" : ""}):</strong>{" "}
          <span className="muted">{record.question2}</span>
        </p>
        <div className="transcript-box">{record.transcript2 || "(empty)"}</div>
      </div>

      <p className="muted small">
        Result ID: {record.id} · <Link href="/admin">All assessments</Link>
      </p>
    </main>
  );
}
