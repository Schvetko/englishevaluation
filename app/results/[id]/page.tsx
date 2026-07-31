import Link from "next/link";
import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { getAssessment } from "@/lib/db";
import { ADMIN_COOKIE, isValidAdminCookie } from "@/lib/auth";
import {
  AUTO_SCORE_MAX,
  CRITERIA_DESCRIPTIONS,
  CRITERIA_LABELS,
  TOTAL_SCORE_MAX,
  autoScoreTotal,
  getScoreBand,
} from "@/lib/scoring";
import PronunciationEditor from "./PronunciationEditor";

export const dynamic = "force-dynamic";

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
  const hasFollowup = Boolean(record.followupQuestion);
  const autoTotal = autoScoreTotal(e);
  const pronunciationScore = record.pronunciationScore ?? null;
  const grandTotal =
    pronunciationScore !== null ? autoTotal + pronunciationScore : null;
  const band = grandTotal !== null ? getScoreBand(grandTotal) : null;

  const rows: Array<{
    key: keyof typeof CRITERIA_LABELS;
    score: number;
    comment: string;
  }> = [
    { key: "grammar", score: e.grammar.score, comment: e.grammar.comment },
    { key: "vocabulary", score: e.vocabulary.score, comment: e.vocabulary.comment },
    { key: "fluency", score: e.fluency.score, comment: e.fluency.comment },
    {
      key: "listening_comprehension",
      score: e.listening_comprehension.score,
      comment: e.listening_comprehension.comment,
    },
    {
      key: "communication_skills",
      score: e.communication_skills.score,
      comment: e.communication_skills.comment,
    },
  ];

  return (
    <main className="container wide">
      <div className="header-bar">
        <div>
          <h1>{record.candidateName}</h1>
          <p className="muted small" style={{ margin: 0 }}>
            English assessment · {formatDate(record.createdAt)}
          </p>
        </div>
        {band ? (
          <span className="badge independent">
            {grandTotal}/{TOTAL_SCORE_MAX} · {band.label}
          </span>
        ) : (
          <span className="badge supported">
            {autoTotal}/{AUTO_SCORE_MAX} · pending pronunciation
          </span>
        )}
      </div>

      <div className="card">
        <h2>Scorecard</h2>
        <div style={{ overflowX: "auto" }}>
          <table className="admin-table">
            <thead>
              <tr>
                <th>Category</th>
                <th>What to assess</th>
                <th>Score</th>
                <th>Comments</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.key}>
                  <td style={{ whiteSpace: "nowrap", fontWeight: 600 }}>
                    {CRITERIA_LABELS[row.key]}
                  </td>
                  <td className="muted small">
                    {CRITERIA_DESCRIPTIONS[row.key]}
                  </td>
                  <td style={{ whiteSpace: "nowrap" }}>{row.score}/5</td>
                  <td className="small">{row.comment}</td>
                </tr>
              ))}
              <tr>
                <td style={{ whiteSpace: "nowrap", fontWeight: 600 }}>
                  {CRITERIA_LABELS.pronunciation}
                </td>
                <td className="muted small">
                  {CRITERIA_DESCRIPTIONS.pronunciation}
                </td>
                <td>
                  <PronunciationEditor
                    assessmentId={record.id}
                    initialScore={pronunciationScore}
                  />
                </td>
                <td className="muted small">
                  Not scored automatically — the API has no audio input.
                  Watch the video below and rate it yourself.
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        {band && (
          <p className="muted small" style={{ marginTop: 14, marginBottom: 0 }}>
            <strong>
              {grandTotal}/{TOTAL_SCORE_MAX} — {band.label}:
            </strong>{" "}
            {band.description}
          </p>
        )}

        {e.grammar.examples.length > 0 && (
          <>
            <h2 style={{ marginTop: 20 }}>Grammar examples</h2>
            {e.grammar.examples.map((ex, i) => (
              <div key={i} style={{ marginBottom: 8 }}>
                <blockquote className="reform">“{ex.original}”</blockquote>
                <blockquote className="reform improved">
                  “{ex.correction}”
                </blockquote>
              </div>
            ))}
          </>
        )}
      </div>

      <div className="card">
        <h2>Observations</h2>
        <ul className="clean" style={{ marginBottom: 0 }}>
          {e.observations.map((obs, i) => (
            <li key={i}>{obs}</li>
          ))}
        </ul>
      </div>

      {record.videoUrls.length > 0 && (
        <div className="card">
          <h2>Video recordings</h2>
          <ul className="clean">
            {record.videoUrls.map((url, i) => (
              <li key={url}>
                <a href={url} target="_blank" rel="noopener noreferrer">
                  Video {i + 1}
                </a>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="card">
        <h2>Transcripts</h2>
        <p className="small" style={{ marginBottom: 4 }}>
          <strong>Q1 (technical):</strong>{" "}
          <span className="muted">{record.question1}</span>
        </p>
        <div className="transcript-box" style={{ marginBottom: 18 }}>
          {record.transcript1 || "(empty)"}
        </div>

        {hasFollowup && (
          <>
            <p className="small" style={{ marginBottom: 4 }}>
              <strong>Unscripted follow-up</strong>{" "}
              <span className="muted">
                (spoken to the candidate, not shown as text
                {record.followupReplayed ? " — candidate used a replay" : ""}
                ):
              </span>{" "}
              <span className="muted">{record.followupQuestion}</span>
            </p>
            <div className="transcript-box" style={{ marginBottom: 18 }}>
              {record.followupTranscript || "(empty)"}
            </div>
          </>
        )}

        <p className="small" style={{ marginBottom: 4 }}>
          <strong>Q2 (everyday):</strong>{" "}
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
