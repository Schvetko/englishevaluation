"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function ReevaluateButton() {
  const router = useRouter();
  const [status, setStatus] = useState<"idle" | "running" | "done" | "error">(
    "idle",
  );
  const [message, setMessage] = useState("");

  const run = async () => {
    setStatus("running");
    setMessage("");
    try {
      const res = await fetch("/api/admin/reevaluate", { method: "POST" });
      const data = (await res.json()) as {
        updated?: number;
        failed?: { id: string; error: string }[];
        error?: string;
      };
      if (!res.ok) throw new Error(data.error || "Failed");
      setStatus("done");
      const failedCount = data.failed?.length ?? 0;
      setMessage(
        data.updated === 0
          ? "All assessments already use the current rubric."
          : `Re-evaluated ${data.updated} assessment(s)${
              failedCount ? `, ${failedCount} failed — check server logs` : ""
            }.`,
      );
      router.refresh();
    } catch (err) {
      setStatus("error");
      setMessage(err instanceof Error ? err.message : "Failed");
    }
  };

  return (
    <div>
      <button
        className="btn secondary"
        onClick={run}
        disabled={status === "running"}
      >
        {status === "running"
          ? "Re-evaluating…"
          : "Re-evaluate old assessments"}
      </button>
      {message && (
        <p
          className={`small ${status === "error" ? "error-text" : "muted"}`}
          style={{ marginTop: 8, marginBottom: 0 }}
        >
          {message}
        </p>
      )}
    </div>
  );
}
