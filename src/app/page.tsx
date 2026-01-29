"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type PointerEvent,
} from "react";
import {
  EGO_DEATH_MESSAGES,
  LEVERAGE_DEATH_MESSAGES,
  LEVERAGES,
  SHORT_DEATH_MESSAGES,
  TIME_DEATH_MESSAGES,
} from "@/game/constants";
import { createInitialState, updateGame } from "@/game/engine";
import { renderGame } from "@/game/render";
import { pickRandom } from "@/game/utils";
import type { CanvasSize, GameState } from "@/game/types";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { useAccount, useChainId, useReadContract, useWriteContract } from "wagmi";
import { liquidationRunAbi } from "@/web3/abi";
import { getContractAddress } from "@/web3/contracts";

const uiRefreshMs = 90;

export default function Home() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const stateRef = useRef<GameState | null>(null);
  const sizeRef = useRef<CanvasSize>({ width: 0, height: 0, ratio: 1 });
  const lastFrameRef = useRef<number>(0);
  const lastUiUpdateRef = useRef<number>(0);
  const swipeStartRef = useRef<{ x: number; y: number } | null>(null);
  const sessionRef = useRef<string | null>(null);

  const [uiState, setUiState] = useState<{
    running: boolean;
    dead: boolean;
    position: string;
    leverage: number;
    score: number;
    elapsedMs: number;
    message: { text: string; type: string } | null;
  }>({
    running: false,
    dead: false,
    position: "LONG",
    leverage: LEVERAGES[1],
    score: 0,
    elapsedMs: 0,
    message: null as { text: string; type: string } | null,
  });
  const [sessionToken, setSessionToken] = useState<string | null>(null);
  const [savingScore, setSavingScore] = useState(false);
  const [deathLines, setDeathLines] = useState<string[]>([]);
  const { address, isConnected } = useAccount();
  const chainId = useChainId();
  const contractAddress = getContractAddress(chainId);
  const onchainEnabled = Boolean(contractAddress);
  const walletConnected = isConnected;
  const { writeContractAsync } = useWriteContract();

  const { data: checkInStreakDaysRaw } = useReadContract({
    address: contractAddress,
    abi: liquidationRunAbi,
    functionName: "checkInStreakDays",
    args: address ? [address] : undefined,
    query: { enabled: Boolean(address && contractAddress) },
  });

  const { data: bestTimeMsRaw } = useReadContract({
    address: contractAddress,
    abi: liquidationRunAbi,
    functionName: "bestTimeMs",
    args: address ? [address] : undefined,
    query: { enabled: Boolean(address && contractAddress) },
  });

  const { data: canCheckIn } = useReadContract({
    address: contractAddress,
    abi: liquidationRunAbi,
    functionName: "canCheckIn",
    args: address ? [address] : undefined,
    query: { enabled: Boolean(address && contractAddress) },
  });

  const { data: checkInPrice } = useReadContract({
    address: contractAddress,
    abi: liquidationRunAbi,
    functionName: "checkInPrice",
    query: { enabled: Boolean(contractAddress) },
  });

  const { data: submitScorePrice } = useReadContract({
    address: contractAddress,
    abi: liquidationRunAbi,
    functionName: "submitScorePrice",
    query: { enabled: Boolean(contractAddress) },
  });

  const checkInStreakDays = Number(checkInStreakDaysRaw ?? 0);
  const bestTimeMs = Number(bestTimeMsRaw ?? 0);

  const updateUi = useCallback((state: GameState) => {
    setUiState({
      running: state.running,
      dead: state.dead,
      position: state.position,
      leverage: LEVERAGES[state.leverageIndex] ?? 1,
      score: Math.round(state.score),
      elapsedMs: state.elapsedMs,
      message: state.message
        ? { text: state.message.text, type: state.message.type }
        : null,
    });
  }, []);

  const setToken = useCallback((token: string | null) => {
    sessionRef.current = token;
    setSessionToken(token);
  }, []);

  const startSession = useCallback(async () => {
    const response = await fetch("/api/game/start", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        player: address,
        chainId,
      }),
    });
    if (!response.ok) {
      setToken(null);
      return;
    }
    const data = (await response.json()) as { token?: string };
    setToken(data.token ?? null);
  }, [address, chainId, setToken]);

  const startGame = useCallback(() => {
    const nowMs = performance.now();
    const size = sizeRef.current;
    if (!size.width || !size.height) return;

    const bonus = Math.min(checkInStreakDays * 5, 100);
    const nextState = createInitialState(bonus, nowMs, size);
    nextState.running = true;
    nextState.startedAtMs = nowMs;
    nextState.elapsedMs = 0;
    nextState.score = 100 + bonus;
    nextState.dead = false;
    nextState.message = null;
    stateRef.current = nextState;
    setDeathLines([]);
    updateUi(nextState);
    void startSession();
  }, [checkInStreakDays, startSession, updateUi]);

  const handleDeath = useCallback((state: GameState) => {
    const seconds = Math.round(state.elapsedMs / 1000);
    const timeIndex = Math.min(3, Math.floor(seconds / 15));
    const lines = [
      pickRandom(SHORT_DEATH_MESSAGES),
      `Ликвидирован на ${seconds} секунде`,
      TIME_DEATH_MESSAGES[timeIndex] ?? TIME_DEATH_MESSAGES[0],
    ];
    if (state.leverageIndex >= 3) {
      lines.push(pickRandom(LEVERAGE_DEATH_MESSAGES));
    }
    lines.push(pickRandom(EGO_DEATH_MESSAGES));
    setDeathLines(lines);
  }, []);

  useLayoutEffect(() => {
    if (!containerRef.current) return;
    const element = containerRef.current;
    const canvas = canvasRef.current;

    const resize = () => {
      const rect = element.getBoundingClientRect();
      const ratio = window.devicePixelRatio || 1;
      sizeRef.current = {
        width: rect.width,
        height: rect.height,
        ratio,
      };
      if (canvas) {
        canvas.width = rect.width * ratio;
        canvas.height = rect.height * ratio;
        canvas.style.width = `${rect.width}px`;
        canvas.style.height = `${rect.height}px`;
      }
    };

    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    let rafId: number;

    const loop = (time: number) => {
      const state = stateRef.current;
      const size = sizeRef.current;
      const canvas = canvasRef.current;
      if (!state) {
        rafId = requestAnimationFrame(loop);
        return;
      }

      const lastTime = lastFrameRef.current || time;
      const dt = Math.min((time - lastTime) / 1000, 0.05);
      lastFrameRef.current = time;

      updateGame(state, dt, time, size);

      if (canvas) {
        const ctx = canvas.getContext("2d");
        if (ctx) {
          renderGame(ctx, state, size);
        }
      }

      if (time - lastUiUpdateRef.current > uiRefreshMs) {
        lastUiUpdateRef.current = time;
        updateUi(state);
      }

      if (state.dead && deathLines.length === 0) {
        handleDeath(state);
      }

      rafId = requestAnimationFrame(loop);
    };

    rafId = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(rafId);
  }, [deathLines.length, handleDeath, updateUi]);

  useEffect(() => {
    const handleKey = (event: KeyboardEvent) => {
      const state = stateRef.current;
      if (!state || !state.running || state.dead) return;
      if (event.key === "ArrowLeft") state.position = "SHORT";
      if (event.key === "ArrowRight") state.position = "LONG";
      if (event.key === "ArrowUp") {
        state.leverageIndex = Math.min(
          state.leverageIndex + 1,
          LEVERAGES.length - 1
        );
      }
      if (event.key === "ArrowDown") {
        state.leverageIndex = Math.max(state.leverageIndex - 1, 0);
      }
    };

    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, []);

  useEffect(() => {
    if (!uiState.running || uiState.dead) return;
    if (!sessionRef.current) return;
    const interval = setInterval(async () => {
      const token = sessionRef.current;
      if (!token) return;
      try {
        const response = await fetch("/api/game/heartbeat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token }),
        });
        if (!response.ok) {
          setToken(null);
          return;
        }
        const data = (await response.json()) as { token?: string };
        if (data.token) setToken(data.token);
      } catch {
        setToken(null);
      }
    }, 2500);

    return () => clearInterval(interval);
  }, [setToken, uiState.dead, uiState.running]);

  const handlePointerDown = (event: PointerEvent<HTMLDivElement>) => {
    swipeStartRef.current = { x: event.clientX, y: event.clientY };
  };

  const handlePointerUp = (event: PointerEvent<HTMLDivElement>) => {
    const state = stateRef.current;
    if (!state || !state.running || state.dead) {
      startGame();
      return;
    }

    const start = swipeStartRef.current;
    swipeStartRef.current = null;
    if (!start) return;
    const dx = event.clientX - start.x;
    const dy = event.clientY - start.y;
    const absX = Math.abs(dx);
    const absY = Math.abs(dy);
    if (Math.max(absX, absY) < 24) return;

    if (absX > absY) {
      state.position = dx > 0 ? "LONG" : "SHORT";
    } else {
      if (dy < 0) {
        state.leverageIndex = Math.min(
          state.leverageIndex + 1,
          LEVERAGES.length - 1
        );
      } else {
        state.leverageIndex = Math.max(state.leverageIndex - 1, 0);
      }
    }
  };

  const elapsedSeconds = Math.floor(uiState.elapsedMs / 1000);

  const handleCheckIn = async () => {
    if (!contractAddress || !walletConnected || !checkInPrice) return;
    await writeContractAsync({
      address: contractAddress,
      abi: liquidationRunAbi,
      functionName: "checkIn",
      value: checkInPrice,
    });
  };

  const handleSaveScore = async () => {
    if (!contractAddress || !walletConnected || !submitScorePrice) return;
    const token = sessionRef.current;
    if (!token) return;
    setSavingScore(true);
    try {
      const response = await fetch("/api/game/finish", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, player: address, chainId }),
      });
      if (!response.ok) {
        setSavingScore(false);
        return;
      }
      const data = (await response.json()) as {
        timeMs?: number;
        signature?: { v: number; r: `0x${string}`; s: `0x${string}` };
      };

      if (!data.signature || !data.timeMs) {
        setSavingScore(false);
        return;
      }

      await writeContractAsync({
        address: contractAddress,
        abi: liquidationRunAbi,
        functionName: "submitScore",
        args: [data.timeMs, data.signature.v, data.signature.r, data.signature.s],
        value: submitScorePrice,
      });
    } finally {
      setSavingScore(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#05060a] text-zinc-100">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-4 px-4 pb-12 pt-6 md:px-8">
        <header className="flex flex-col gap-3">
          <div className="text-2xl font-semibold uppercase tracking-[0.3em] text-[#2df7ff] neon-text">
            LIQUIDATION RUN
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <button
              className="glass-panel neon-border rounded-md px-4 py-2 text-sm font-semibold uppercase tracking-[0.2em] text-[#43ff76] disabled:opacity-40"
              disabled={!walletConnected || !onchainEnabled || canCheckIn === false}
              type="button"
              onClick={handleCheckIn}
            >
              CHECK-IN
            </button>
            <ConnectButton.Custom>
              {({ openConnectModal, account, chain }) => (
                <button
                  className="glass-panel neon-border rounded-md px-4 py-2 text-sm font-semibold uppercase tracking-[0.2em] text-[#2df7ff]"
                  type="button"
                  onClick={openConnectModal}
                >
                  {account && chain ? "WALLET CONNECTED" : "CONNECT WALLET"}
                </button>
              )}
            </ConnectButton.Custom>
          </div>
          <div className="flex flex-wrap items-center gap-6 text-xs uppercase tracking-[0.3em] text-zinc-400">
            <div>
              CHECK-IN STREAK:{" "}
              <span className="text-zinc-200">{checkInStreakDays}</span>
            </div>
            <div>
              BEST:{" "}
              <span className="text-zinc-200">
                {bestTimeMs ? `${Math.floor(bestTimeMs / 1000)}s` : "—"}
              </span>
            </div>
            {/* {!onchainEnabled && (
              <div className="text-[10px] text-zinc-500">
                On-chain disabled.
              </div>
            )} */}
          </div>
        </header>

        <section className="glass-panel neon-border relative overflow-hidden rounded-xl">
          <div className="absolute left-4 top-4 z-10 flex flex-col gap-2 text-xs uppercase tracking-[0.3em] text-zinc-400">
            <div>
              POSITION:{" "}
              <span
                className={
                  uiState.position === "LONG" ? "success" : "danger"
                }
              >
                {uiState.position}
              </span>
            </div>
            <div>
              LEVERAGE:{" "}
              <span className="text-zinc-100">{uiState.leverage}x</span>
            </div>
            <div>
              SCORE: <span className="text-zinc-100">{uiState.score}</span>
            </div>
            <div>
              TIME: <span className="text-zinc-100">{elapsedSeconds}s</span>
            </div>
          </div>

          <div className="absolute right-4 top-4 z-10 text-right text-[10px] uppercase tracking-[0.4em] text-zinc-500">
            <div>Swipe left/right: SHORT/LONG</div>
            <div>Swipe up/down: leverage</div>
            <div>Arrows: same</div>
          </div>

          {uiState.message && (
            <div className="pointer-events-none absolute inset-x-0 top-1/2 z-10 -translate-y-1/2 text-center">
              <div className="mx-auto w-fit rounded-md bg-black/60 px-4 py-2 text-xs font-semibold uppercase tracking-[0.25em] text-[#ff3bdb]">
                {uiState.message.text}
              </div>
            </div>
          )}

          <div
            ref={containerRef}
            className="relative h-[520px] w-full cursor-pointer select-none md:h-[620px]"
            onPointerDown={handlePointerDown}
            onPointerUp={handlePointerUp}
            role="button"
            tabIndex={0}
          >
            <canvas ref={canvasRef} className="absolute inset-0" />
            {!uiState.running && (
              <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 bg-black/60 text-center">
                <div className="text-2xl font-semibold uppercase tracking-[0.3em] text-[#2df7ff]">
                  Tap to Run
                </div>
                <div className="text-xs uppercase tracking-[0.3em] text-zinc-400">
                  Switch sides. Survive the liquidation wave.
                </div>
              </div>
            )}
            {uiState.dead && (
              <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 bg-black/70 px-6 text-center">
                <div className="text-xl font-semibold uppercase tracking-[0.35em] text-[#ff4d4d]">
                  Liquidated
                </div>
                <div className="flex flex-col gap-1 text-sm uppercase tracking-[0.2em] text-zinc-300">
                  {deathLines.map((line) => (
                    <span key={line}>{line}</span>
                  ))}
                </div>
                <button
                  className="mt-4 rounded-md border border-[#2df7ff] px-4 py-2 text-xs font-semibold uppercase tracking-[0.25em] text-[#2df7ff] disabled:opacity-40"
                  disabled={
                    !walletConnected ||
                    !onchainEnabled ||
                    !submitScorePrice ||
                    !sessionToken ||
                    savingScore
                  }
                  type="button"
                  onClick={handleSaveScore}
                >
                  {savingScore ? "SAVING..." : "SAVE SCORE ON-CHAIN"}
                </button>
                <div className="text-[10px] uppercase tracking-[0.3em] text-zinc-500">
                  Tap to restart instantly.
                </div>
              </div>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
