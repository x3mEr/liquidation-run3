"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type PointerEvent,
  type TouchEvent,
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
import {
  useAccount,
  useChainId,
  usePublicClient,
  useReadContract,
  useWriteContract,
} from "wagmi";
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
  const deathCooldownUntilRef = useRef(0);

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
  const [infoOpen, setInfoOpen] = useState(false);
  const [prefetchedFinish, setPrefetchedFinish] = useState<{
    timeMs: number;
    signature: { v: number; r: `0x${string}`; s: `0x${string}` };
  } | null>(null);
  const [finishPrefetching, setFinishPrefetching] = useState(false);
  const [finishPrefetchError, setFinishPrefetchError] = useState<string | null>(
    null
  );
  const finishRequestedRef = useRef(false);
  const { address, isConnected } = useAccount();
  const chainId = useChainId();
  const contractAddress = getContractAddress(chainId);
  const onchainEnabled = Boolean(contractAddress);
  const walletConnected = isConnected;
  const { writeContractAsync } = useWriteContract();
  const publicClient = usePublicClient();

  const contractQueryOptions = {
    refetchOnWindowFocus: false,
    staleTime: 15 * 60_000,
  };

  const { data: checkInStreakDaysRaw, refetch: refetchStreak } = useReadContract({
    address: contractAddress,
    abi: liquidationRunAbi,
    functionName: "checkInStreakDays",
    args: address ? [address] : undefined,
    query: {
      enabled: Boolean(address && contractAddress),
      ...contractQueryOptions,
    },
  });

  const { data: bestTimeMsRaw, refetch: refetchBest } = useReadContract({
    address: contractAddress,
    abi: liquidationRunAbi,
    functionName: "bestTimeMs",
    args: address ? [address] : undefined,
    query: {
      enabled: Boolean(address && contractAddress),
      ...contractQueryOptions,
    },
  });

  const { data: canCheckIn, refetch: refetchCanCheckIn } = useReadContract({
    address: contractAddress,
    abi: liquidationRunAbi,
    functionName: "canCheckIn",
    args: address ? [address] : undefined,
    query: {
      enabled: Boolean(address && contractAddress),
      ...contractQueryOptions,
    },
  });

  const { data: checkInPrice } = useReadContract({
    address: contractAddress,
    abi: liquidationRunAbi,
    functionName: "checkInPrice",
    query: { enabled: Boolean(contractAddress), ...contractQueryOptions },
  });

  const { data: submitScorePrice } = useReadContract({
    address: contractAddress,
    abi: liquidationRunAbi,
    functionName: "submitScorePrice",
    query: { enabled: Boolean(contractAddress), ...contractQueryOptions },
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
    setPrefetchedFinish(null);
    setFinishPrefetchError(null);
    setFinishPrefetching(false);
    finishRequestedRef.current = false;
    updateUi(nextState);
    void startSession();
  }, [checkInStreakDays, startSession, updateUi]);

  const handleDeath = useCallback((state: GameState) => {
    deathCooldownUntilRef.current = Date.now() + 2000;
    const seconds = Math.floor(state.elapsedMs / 1000);
    const timeIndex = Math.min(3, Math.floor(seconds / 15));
    const lines = [
      pickRandom(SHORT_DEATH_MESSAGES),
      `${seconds} seconds: ${TIME_DEATH_MESSAGES[timeIndex] ?? TIME_DEATH_MESSAGES[0]}`,
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

  useEffect(() => {
    if (!uiState.dead) return;
    if (!sessionToken || !address || !chainId) return;
    if (finishRequestedRef.current) return;
    finishRequestedRef.current = true;
    setFinishPrefetching(true);
    setFinishPrefetchError(null);

    const run = async () => {
      try {
        const response = await fetch("/api/game/finish", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token: sessionToken, player: address, chainId }),
        });
        if (!response.ok) {
          setFinishPrefetchError("finish_failed");
          return;
        }
        const data = (await response.json()) as {
          timeMs?: number;
          signature?: { v: number; r: `0x${string}`; s: `0x${string}` };
        };
        if (data.signature && data.timeMs) {
          setPrefetchedFinish({ timeMs: data.timeMs, signature: data.signature });
        } else {
          setFinishPrefetchError("finish_invalid");
        }
      } catch {
        setFinishPrefetchError("finish_exception");
      } finally {
        setFinishPrefetching(false);
      }
    };

    void run();
  }, [address, chainId, sessionToken, uiState.dead]);

  const handlePointerDown = (event: PointerEvent<HTMLDivElement>) => {
    swipeStartRef.current = { x: event.clientX, y: event.clientY };
  };

  const processSwipe = (dx: number, dy: number) => {
    const state = stateRef.current;
    if (!state || !state.running || state.dead) {
      if (Date.now() < deathCooldownUntilRef.current) return;
      startGame();
      return;
    }

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

  const handlePointerUp = (event: PointerEvent<HTMLDivElement>) => {
    const state = stateRef.current;
    if (!state || !state.running || state.dead) {
      if (event.defaultPrevented) return;
      if ((event.target as Element).closest?.("[data-no-restart]")) return;
      if (Date.now() < deathCooldownUntilRef.current) return;
      startGame();
      return;
    }

    const start = swipeStartRef.current;
    swipeStartRef.current = null;
    if (!start) return;
    const dx = event.clientX - start.x;
    const dy = event.clientY - start.y;
    processSwipe(dx, dy);
  };

  const handleTouchStart = (event: TouchEvent<HTMLDivElement>) => {
    const touch = event.touches[0];
    if (!touch) return;
    swipeStartRef.current = { x: touch.clientX, y: touch.clientY };
  };

  const handleTouchEnd = (event: TouchEvent<HTMLDivElement>) => {
    const touch = event.changedTouches[0];
    if (!touch) return;
    const state = stateRef.current;
    if (!state || !state.running || state.dead) {
      if (event.defaultPrevented) return;
      const target = document.elementFromPoint(touch.clientX, touch.clientY);
      if (target?.closest?.("[data-no-restart]")) return;
      if (Date.now() < deathCooldownUntilRef.current) return;
      startGame();
      return;
    }
    const start = swipeStartRef.current;
    swipeStartRef.current = null;
    if (!start) return;
    processSwipe(touch.clientX - start.x, touch.clientY - start.y);
  };

  const elapsedSeconds = Math.floor(uiState.elapsedMs / 1000);

  const handleCheckIn = async () => {
    if (!contractAddress || !walletConnected || !checkInPrice) return;
    try {
      const hash = await writeContractAsync({
        address: contractAddress,
        abi: liquidationRunAbi,
        functionName: "checkIn",
        value: checkInPrice,
      });
      if (hash && publicClient) {
        await publicClient.waitForTransactionReceipt({ hash });
        await Promise.all([refetchStreak(), refetchCanCheckIn()]);
      }
    } catch (err) {
      // User rejected the request or tx failed — no need to surface
      if (process.env.NODE_ENV === "development" && err instanceof Error) {
        if (!err.message?.includes("rejected")) console.warn("Check-in:", err.message);
      }
    }
  };

  const handleSaveScore = async () => {
    if (!contractAddress || !walletConnected || !submitScorePrice) return;
    setSavingScore(true);
    try {
      let finishData = prefetchedFinish;
      if (!finishData) {
        const token = sessionRef.current;
        if (!token) return;
        const response = await fetch("/api/game/finish", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token, player: address, chainId }),
        });
        if (!response.ok) {
          return;
        }
        const data = (await response.json()) as {
          timeMs?: number;
          signature?: { v: number; r: `0x${string}`; s: `0x${string}` };
        };

        if (!data.signature || !data.timeMs) {
          return;
        }
        finishData = { timeMs: data.timeMs, signature: data.signature };
      }

      const hash = await writeContractAsync({
        address: contractAddress,
        abi: liquidationRunAbi,
        functionName: "submitScore",
        args: [
          finishData.timeMs,
          finishData.signature.v,
          finishData.signature.r,
          finishData.signature.s,
        ],
        value: submitScorePrice,
      });
      if (hash && publicClient) {
        await publicClient.waitForTransactionReceipt({ hash });
        await refetchBest();
      }
    } catch (err) {
      // User rejected the request or tx failed — no need to surface
      if (process.env.NODE_ENV === "development" && err instanceof Error) {
        if (!err.message?.includes("rejected")) console.warn("Save score:", err.message);
      }
    } finally {
      setSavingScore(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#05060a] text-zinc-100">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-3 px-4 pb-12 pt-4 md:px-8">
        <header className="flex flex-col gap-3">
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-semibold uppercase tracking-[0.3em] text-[#2df7ff] neon-text">
              LIQUIDATION RUN
            </h1>
            <button
              type="button"
              onClick={() => setInfoOpen(true)}
              className="flex shrink-0 items-center justify-center text-[#2df7ff] transition"
              aria-label="Game info"
            >
              <svg
                aria-hidden
                viewBox="0 0 24 24"
                className="h-5 w-5"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <circle cx="12" cy="12" r="10" />
                <path d="M12 16v-4M12 8h.01" />
              </svg>
            </button>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <button
              className="glass-panel neon-border rounded-md px-4 py-2 text-sm font-semibold uppercase tracking-[0.2em] text-[#43ff76] disabled:opacity-80"
              disabled={!walletConnected || !onchainEnabled || canCheckIn === false}
              type="button"
              onClick={handleCheckIn}
            >
              {canCheckIn === false ? "CHECKED-IN" : "CHECK-IN"}
            </button>
            <ConnectButton.Custom>
              {({
                openConnectModal,
                openAccountModal,
                openChainModal,
                account,
                chain,
              }) => {
                if (!account || !chain) {
                  return (
                    <button
                      className="glass-panel neon-border rounded-md px-4 py-2 text-sm font-semibold uppercase tracking-[0.2em] text-[#2df7ff] hover:text-white cursor-pointer"
                      type="button"
                      onClick={openConnectModal}
                    >
                      CONNECT WALLET
                    </button>
                  );
                }

                return (
                  <div className="flex items-center gap-2">
                    <button
                      className="glass-panel neon-border flex items-center gap-2 rounded-md px-3 py-2 text-xs font-semibold uppercase tracking-[0.25em] text-[#2df7ff] hover:text-white cursor-pointer"
                      type="button"
                      onClick={openChainModal}
                    >
                      {chain.iconUrl && (
                        <span
                          className="flex h-4 w-4 items-center justify-center overflow-hidden rounded-full"
                          style={{ background: chain.iconBackground }}
                        >
                          <img
                            alt={chain.name ?? "Chain"}
                            src={chain.iconUrl}
                            className="h-4 w-4"
                          />
                        </span>
                      )}
                      {chain.name}
                    </button>
                    <button
                      className="glass-panel neon-border flex items-center gap-2 rounded-md px-3 py-2 text-xs font-semibold uppercase tracking-[0.25em] text-[#2df7ff] hover:text-white cursor-pointer"
                      type="button"
                      onClick={openAccountModal}
                      aria-label="Open wallet account"
                    >
                      <span className="h-3 w-3 rounded-full bg-[#43ff76] shadow-[0_0_10px_rgba(67,255,118,0.6)]" />
                      <svg
                        aria-hidden="true"
                        viewBox="0 0 24 24"
                        className="h-4 w-4 text-[#2df7ff]"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.6"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <path d="M3.5 7.5h15a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2v-9a2 2 0 0 1 2-2Z" />
                        <path d="M3.5 7.5V6a2 2 0 0 1 2-2h9.5" />
                        <path d="M17 12h2.5" />
                      </svg>
                    </button>
                  </div>
                );
              }}
            </ConnectButton.Custom>
          </div>
          <div className="text-[11px] text-center uppercase tracking-[0.3em] text-zinc-500">
            Each day adds points to initial score
          </div>
        </header>

        {infoOpen && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center p-4"
            role="dialog"
            aria-modal="true"
            aria-labelledby="info-title"
          >
            <button
              type="button"
              className="absolute inset-0 bg-black/80 backdrop-blur-sm"
              onClick={() => setInfoOpen(false)}
              aria-label="Close"
            />
            <div className="glass-panel neon-border relative max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-xl p-6 text-left shadow-xl">
              <button
                type="button"
                onClick={() => setInfoOpen(false)}
                className="absolute right-3 top-3 rounded p-1 text-zinc-400 transition hover:bg-white/10 hover:text-zinc-100"
                aria-label="Close"
              >
                <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M18 6L6 18M6 6l12 12" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>
              <h2 id="info-title" className="mb-4 text-xl font-semibold uppercase tracking-wider text-[#2df7ff]">
                LIQUIDATION RUN
              </h2>
              <p className="mb-4 text-sm leading-relaxed text-zinc-300">
                Arcade runner: you are a crypto-trader, the price graph runs from right to left. Change your position (long/short) and leverage in sync with the price movement. Points increase when the direction matches your position; decrease when it doesn't. Zero points = liquidation.
              </p>
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-zinc-400">
                Controls
              </h3>
              <ul className="mb-4 list-inside list-disc space-y-1 text-sm text-zinc-300">
                <li>Swipe left / right — SHORT / LONG</li>
                <li>Swipe up / down — increase / decrease leverage (1x-5x)</li>
                <li>Arrow keys — same as above</li>
                <li>Tap on the screen after death — restart</li>
              </ul>
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-zinc-400">
                Objects on the time line
              </h3>
              <ul className="mb-4 space-y-3 text-sm text-zinc-300">
                <li>
                  <span className="font-semibold text-[#43ff76]">FOMO</span> — temporarily speeds up the game (more risk, more points).
                </li>
                <li>
                  <span className="font-semibold text-[#ff4d4d]">NEWS</span> — quickly changes direction and adds noise; you need to quickly flip your position.
                </li>
                <li>
                  <span className="font-semibold text-[#2df7ff]">INFLUENCER</span> — same as NEWS: quick direction change and noise; catch the moment.
                </li>
              </ul>
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-zinc-400">
                On-chain
              </h3>
              <p className="mb-4 text-sm leading-relaxed text-zinc-300">
                <span className="font-semibold text-[#43ff76]">Daily check-in</span> — builds a streak: each consecutive day adds +5 to your starting score (up to +100). More streak = more cushion at the start of each run.
              </p>
              <p className="mb-4 text-sm leading-relaxed text-zinc-300">
                <span className="font-semibold text-[#2df7ff]">Save score on-chain</span> — after a run, you can save your survival time. Your best time is stored on-chain and shown in the header; you compete for the longest run.
              </p>
            </div>
          </div>
        )}

        <section className="glass-panel neon-border relative overflow-hidden rounded-xl">
          <div className="absolute left-4 top-4 z-10 flex flex-col gap-1 text-xs uppercase tracking-[0.3em] text-zinc-400">
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
          <div className="absolute right-4 top-4 z-10 flex flex-col gap-1 text-right text-xs uppercase tracking-[0.3em] text-zinc-400">
              <div>
                STREAK:{" "}
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
          {uiState.message && (
            <div className="pointer-events-none absolute inset-x-0 top-1/2 z-10 -translate-y-1/2 text-center">
              <div className="mx-auto w-fit rounded-md bg-black/60 px-4 py-2 text-md font-semibold uppercase tracking-[0.25em] text-[#ff3bdb] text-opacity-90">
                {uiState.message.text}
              </div>
            </div>
          )}

          <div
            ref={containerRef}
            className="relative h-[520px] w-full cursor-pointer select-none touch-none md:h-[620px]"
            onPointerDown={handlePointerDown}
            onPointerUp={handlePointerUp}
            onTouchStart={handleTouchStart}
            onTouchEnd={handleTouchEnd}
            role="button"
            tabIndex={0}
          >
            <canvas ref={canvasRef} className="absolute inset-0" />
            {!uiState.running && (
              <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 bg-black/60 text-center">
                <div className="text-2xl font-semibold uppercase tracking-[0.3em] text-[#2df7ff]">
                  Tap to get rekt
                </div>
                <div className="text-xs uppercase tracking-[0.3em] text-zinc-400">
                  Switch sides. Survive the liquidation wave.
                </div>
              </div>
            )}
            {uiState.dead && (
              <>
                <div className="pointer-events-none absolute inset-0 z-10 death-flash" />
                <div
                  className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-3 bg-black/85 px-6 text-center"
                >
                <div className="text-xl font-semibold uppercase tracking-[0.35em] text-[#ff4d4d]">
                  Liquidated
                </div>
                <div className="flex flex-col gap-3 text-sm uppercase tracking-[0.2em] text-zinc-300">
                  {deathLines.map((line) => (
                    <span key={line}>{line}</span>
                  ))}
                </div>
                {/* {(() => {
                  // Log these values only when the component renders this part (e.g. when dead UI shows).
                  console.log("walletConnected:", walletConnected,
                              "onchainEnabled:", onchainEnabled,
                              "submitScorePrice:", submitScorePrice,
                              "sessionToken:", sessionToken,
                              "savingScore:", !savingScore);
                  return null;
                })()} */}
                <button
                  className="mt-4 rounded-md border border-[#2df7ff] px-4 py-3 text-xs font-semibold uppercase tracking-[0.25em] text-[#2df7ff] disabled:opacity-40"
                  disabled={
                    !walletConnected ||
                    !onchainEnabled ||
                    !submitScorePrice ||
                    (!sessionToken && !prefetchedFinish) ||
                    savingScore ||
                    finishPrefetching
                  }
                  type="button"
                  onClick={handleSaveScore}
                  data-no-restart
                  onPointerDown={(event) => event.stopPropagation()}
                  onPointerUp={(event) => event.stopPropagation()}
                  onTouchStart={(event) => event.stopPropagation()}
                  onTouchEnd={(event) => event.stopPropagation()}
                >
                  {savingScore ? "SAVING..." : "SAVE SCORE ON-CHAIN"}
                </button>
                <div className="py-3 text-[12px] uppercase tracking-[0.3em] text-zinc-400">
                  Tap to get rekt again
                </div>
                </div>
              </>
            )}
          </div>
        </section>
        <div className="flex flex-wrap items-center justify-between gap-2 px-4 text-[10px] uppercase tracking-[0.35em] text-zinc-500">
            <div>left/right: SHORT/LONG</div>
            <div>up/down: leverage</div>
          </div>
      </div>
    </div>
  );
}
