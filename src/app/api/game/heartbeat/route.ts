import { NextResponse } from "next/server";
import { refreshSessionToken, verifySessionToken } from "@/server/session";

const MAX_IDLE_MS = 8000;

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const token = body?.token;
    if (!token || typeof token !== "string") {
      return NextResponse.json({ error: "Missing token" }, { status: 400 });
    }

    const nowMs = Date.now();
    const { payload } = verifySessionToken(token);
    if (nowMs - payload.lastBeatMs > MAX_IDLE_MS) {
      return NextResponse.json({ error: "Session expired" }, { status: 400 });
    }

    const nextToken = refreshSessionToken(token, nowMs);
    return NextResponse.json({ token: nextToken, lastBeatMs: nowMs });
  } catch (error) {
    return NextResponse.json(
      { error: (error as Error).message || "Heartbeat failed" },
      { status: 400 }
    );
  }
}
