import Link from "next/link";
import { cookies } from "next/headers";
import { listAssessments } from "@/lib/db";
import { ADMIN_COOKIE, isValidAdminCookie } from "@/lib/auth";
import {
  AUTO_SCORE_MAX,
  autoScoreTotal,
  getScoreBand,
  hasCurrentRubric,
} from "@/lib/scoring";
import ReevaluateButton from "./ReevaluateButton";

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

export default async function AdminPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const cookieStore = await cookies();
  const { error } = await searchParams;
  const authed = isValidAdminCookie(cookieStore.get(ADMIN_COOKIE)?.value);

  if (!authed) {
    return (
      <main className="container">
        <h1>Admin</h1>
        <p className="subtitle">Hiring team access</p>
        <div className="card" style={{ maxWidth: 420 }}>
          <form method="POST" action="/api/admin/login">
            <label className="form-label" htmlFor="password">
              Password
            </label>
            <input
              id="password"
              name="password"
              type="password"
              className="field"
              autoFocus
            />
            {error === "1" && (
              <p className="error-text small">Wrong password.</p>
            )}
            {error === "unconfigured" && (
              <p className="error-text small">
                ADMIN_PASSWORD is not configured on the server.
              </p>
            )}
            <div className="actions">
              <button type="submit" className="btn">
                Sign in
              </button>
            </div>
          </form>
        </div>
      </main>
    );
  }

  const assessments = await listAssessments();

  return (
    <main className="container wide">
      <div className="header-bar">
        <h1>Assessments</h1>
        <span className="muted small">{assessments.length} total</span>
      </div>
      {assessments.length > 0 && (
        <div className="card">
          <ReevaluateButton />
          <p className="muted small" style={{ marginTop: 8, marginBottom: 0 }}>
            Re-runs the current 6-category rubric on any assessment still
            scored under an older version. Pronunciation scores you've
            already entered are kept.
          </p>
        </div>
      )}
      <div className="card">
        {assessments.length === 0 ? (
          <p className="muted">
            No assessments yet. Send candidates to{" "}
            <Link href="/assessment">/assessment</Link>.
          </p>
        ) : (
          <table className="admin-table">
            <thead>
              <tr>
                <th>Candidate</th>
                <th>Date</th>
                <th>Score</th>
                <th>Video</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {assessments.map((a) => {
                const legacy = !hasCurrentRubric(a.evaluation);
                const autoTotal = legacy ? null : autoScoreTotal(a.evaluation);
                const total =
                  autoTotal !== null && a.pronunciationScore !== null
                    ? autoTotal + a.pronunciationScore
                    : null;
                const band = total !== null ? getScoreBand(total) : null;
                return (
                  <tr key={a.id}>
                    <td>{a.candidateName}</td>
                    <td className="muted">{formatDate(a.createdAt)}</td>
                    <td>
                      {legacy ? (
                        <span className="badge needs_support">
                          Legacy format
                        </span>
                      ) : band ? (
                        <span className="badge independent">
                          {total}/30 · {band.label}
                        </span>
                      ) : (
                        <span className="badge supported">
                          {autoTotal}/{AUTO_SCORE_MAX} · pending
                        </span>
                      )}
                    </td>
                    <td className="muted small">
                      {a.videoUrls.length > 0
                        ? `${a.videoUrls.length} file(s)`
                        : "—"}
                    </td>
                    <td>
                      <Link href={`/results/${a.id}`}>Details →</Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </main>
  );
}
