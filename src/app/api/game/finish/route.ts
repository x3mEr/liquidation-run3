import { NextResponse } from "next/server";
import {
  createPublicClient,
  encodePacked,
  http,
  keccak256,
  parseSignature,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { liquidationRunAbi } from "@/web3/abi";
import { getContractAddress } from "@/web3/contracts";
import { getChainById } from "@/server/chain";
import { verifySessionToken } from "@/server/session";

const MAX_IDLE_MS = 30000;
const MAX_TIME_MS = 10 * 60 * 1000;

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

    const playerFromBody =
      typeof body?.player === "string" ? body.player.toLowerCase() : undefined;
    const player = payload.player ?? playerFromBody;
    if (payload.player && playerFromBody && payload.player !== playerFromBody) {
      return NextResponse.json(
        { error: "Player mismatch" },
        { status: 400 }
      );
    }

    const chainId = Number(body?.chainId ?? payload.chainId);
    const timeMs = Math.min(
      Math.max(nowMs - payload.startAtMs, 0),
      MAX_TIME_MS
    );
    const response: {
      timeMs: number;
      signature?: { v: number; r: `0x${string}`; s: `0x${string}` };
      nonce?: string;
    } = { timeMs };

    if (!player || !chainId) {
      return NextResponse.json(response);
    }

    const contractAddress = getContractAddress(chainId);
    const chain = getChainById(chainId);
    if (!contractAddress || !chain) {
      return NextResponse.json(response);
    }

    const signerKey = process.env.SIGNER_PRIVATE_KEY;
    if (!signerKey) {
      return NextResponse.json(
        { error: "SIGNER_PRIVATE_KEY is not set" },
        { status: 500 }
      );
    }

    const account = privateKeyToAccount(
      (signerKey.startsWith("0x") ? signerKey : `0x${signerKey}`) as `0x${string}`
    );

    const publicClient = createPublicClient({
      chain,
      transport: http(chain.rpcUrls.default.http[0]),
    });

    const nonce = await publicClient.readContract({
      address: contractAddress,
      abi: liquidationRunAbi,
      functionName: "nonces",
      args: [player as `0x${string}`],
    });

    const messageHash = keccak256(
      encodePacked(
        ["address", "uint32", "uint256"],
        [player as `0x${string}`, timeMs, nonce]
      )
    );

    const signatureHex = await account.signMessage({
      message: { raw: messageHash },
    });
    const { r, s, v } = parseSignature(signatureHex);

    response.signature = { v: Number(v), r, s };
    response.nonce = nonce.toString();

    return NextResponse.json(response);
  } catch (error) {
    return NextResponse.json(
      { error: (error as Error).message || "Finish failed" },
      { status: 400 }
    );
  }
}
