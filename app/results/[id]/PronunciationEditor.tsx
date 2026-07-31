"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Score = 1 | 2 | 3 | 4 | 5;

export default function PronunciationEditor({
  assessmentId,
  initialScore,
}: {
  assessmentId: string;
  initialScore: Score | null;
}) {
  const router = useRouter();
  const [score, setScore] = useState<Score | null>(initialScore);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const save = async (value: Score | null) => {
    setSaving(true);
    setError("");
    try {
      const res = await fetch("/api/admin/pronunciation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: assessmentId, score: value }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as {
          error?: string;
        };
        throw new Error(data.error || "Save failed");
      }
      setScore(value);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
        {([1, 2, 3, 4, 5] as Score[]).map((n) => (
          <button
            key={n}
            type="button"
            className={score === n ? "btn" : "btn secondary"}
            style={{ padding: "6px 14px" }}
            disabled={saving}
            onClick={() => save(n)}
          >
            {n}
          </button>
        ))}
        {score !== null && (
          <button
            type="button"
            className="btn secondary"
            style={{ padding: "6px 14px" }}
            disabled={saving}
            onClick={() => save(null)}
          >
            Clear
          </button>
        )}
      </div>
      {error && (
        <p className="error-text small" style={{ marginTop: 6, marginBottom: 0 }}>
          {error}
        </p>
      )}
    </div>
  );
}
