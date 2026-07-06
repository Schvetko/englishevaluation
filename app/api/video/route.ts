import { NextResponse } from "next/server";
import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";

export const runtime = "nodejs";

// Client-side upload handshake for candidate videos (Vercel Blob).
// Client uploads go straight to Blob storage, bypassing the 4.5 MB
// serverless request body limit — necessary for multi-minute recordings.
export async function POST(request: Request) {
  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    return NextResponse.json(
      { error: "Video storage is not configured (BLOB_READ_WRITE_TOKEN missing)" },
      { status: 501 },
    );
  }

  const body = (await request.json()) as HandleUploadBody;
  try {
    const result = await handleUpload({
      body,
      request,
      onBeforeGenerateToken: async () => ({
        allowedContentTypes: ["video/webm", "video/mp4", "audio/webm"],
        maximumSizeInBytes: 500 * 1024 * 1024,
        addRandomSuffix: true,
      }),
      onUploadCompleted: async () => {
        // Nothing to do server-side; the client passes blob URLs to /api/evaluate.
      },
    });
    return NextResponse.json(result);
  } catch (err) {
    console.error("Blob upload handshake failed:", err);
    return NextResponse.json({ error: "Upload failed" }, { status: 400 });
  }
}
