import { NextResponse } from "next/server";
import crypto from "crypto";
import { createSessionToken } from "@/server/session";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const player =
      typeof body?.player === "string" ? body.player.toLowerCase() : undefined;
    const chainId = Number(body?.chainId);
    const nonce = crypto.randomBytes(16).toString("hex");
    const nowMs = Date.now();

    const token = createSessionToken(
      {
        startAtMs: nowMs,
        nonce,
        player,
        chainId: Number.isFinite(chainId) ? chainId : undefined,
      },
      nowMs
    );

    return NextResponse.json({ token, startAtMs: nowMs });
  } catch (error) {
    return NextResponse.json(
      { error: (error as Error).message || "Failed to start" },
      { status: 400 }
    );
  }
}
