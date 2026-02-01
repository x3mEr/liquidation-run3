import {
  FOMO_MESSAGES,
  INFLUENCER_MESSAGES,
  LEVERAGES,
  NEWS_MESSAGES,
} from "./constants";
import { clamp, lerp, pickRandom, randomRange } from "./utils";
import type { CanvasSize, EventType, GameState } from "./types";

const PRICE_MIN = 0.06;
const PRICE_MAX = 0.94;

const EVENT_COOLDOWN = {
  min: 4.2, // 3.2
  max: 7.2,
};

export const createInitialState = (
  bonusPoints: number,
  nowMs: number,
  size: CanvasSize
): GameState => {
  const price = 0.5 + randomRange(-0.08, 0.08);
  return {
    running: false,
    dead: false,
    startedAtMs: nowMs,
    elapsedMs: 0,
    score: 100 + Math.min(bonusPoints, 100),
    position: "LONG",
    leverageIndex: 1,
    price,
    priceVelocity: randomRange(0.06, 0.12),
    direction: Math.random() > 0.5 ? 1 : -1,
    nextTurnIn: randomRange(0.8, 1.6),
    speed: 120,
    labelOffset: 0,
    timeLabelIndex: Math.floor(randomRange(0, 48)),
    nextEventIn: randomRange(EVENT_COOLDOWN.min, EVENT_COOLDOWN.max),
    boostUntilMs: 0,
    noiseBoostUntilMs: 0,
    message: null,
    points: [
      {
        x: size.width * 0.8,
        y: mapPriceToY(price, size.height),
      },
    ],
    events: [],
    lastPrice: price,
    bonusPoints,
  };
};

export const mapPriceToY = (price: number, height: number) => {
  const padding = height * 0.12;
  const innerHeight = height - padding * 2;
  return padding + (1 - price) * innerHeight;
};

export const updateGame = (
  state: GameState,
  dt: number,
  nowMs: number,
  size: CanvasSize
) => {
  if (!state.running || state.dead) {
    return state;
  }

  const elapsedSeconds = state.elapsedMs / 1000;
  const difficulty = clamp(elapsedSeconds / 40, 0, 1);
  const pace = 1 + difficulty * 1.4;
  const leverage = LEVERAGES[state.leverageIndex] ?? 1;
  const boostActive = nowMs < state.boostUntilMs;
  const noiseBoost = nowMs < state.noiseBoostUntilMs;

  const baseSpeed = 120 + elapsedSeconds * 4 + difficulty * 80;
  const leverageSpeed = leverage * 18;
  state.speed = baseSpeed + leverageSpeed + (boostActive ? 160 : 0);

  state.nextTurnIn -= dt * pace;
  if (state.nextTurnIn <= 0) {
    state.direction = state.direction === 1 ? -1 : 1;
    const minTurn = lerp(1.2, 0.45, difficulty);
    const maxTurn = lerp(2.0, 0.75, difficulty);
    state.nextTurnIn = randomRange(minTurn, maxTurn);
    state.priceVelocity =
      state.direction * randomRange(0.08, 0.18) * (1 + difficulty * 0.7);
  }

  const targetVelocity =
    state.direction * (0.08 + difficulty * 0.28) * (1 + leverage * 0.11);
  const noise =
    (0.16 + difficulty * 0.6 + leverage * 0.1 + (noiseBoost ? 0.6 : 0)) * dt;

  state.priceVelocity += (targetVelocity - state.priceVelocity) * 0.2;
  state.price +=
    state.priceVelocity * dt * (1 + difficulty * 0.6) +
    (Math.random() - 0.5) * noise;

  if (state.price <= PRICE_MIN || state.price >= PRICE_MAX) {
    state.price = clamp(state.price, PRICE_MIN, PRICE_MAX);
    state.direction = state.direction === 1 ? -1 : 1;
    state.priceVelocity =
      state.direction * randomRange(0.09, 0.2) * (1 + difficulty * 0.6);
  }

  const deltaPrice = state.price - state.lastPrice;
  const scoreRate = (14 + difficulty * 16) * leverage;
  const aligned =
    (deltaPrice > 0 && state.position === "LONG") ||
    (deltaPrice < 0 && state.position === "SHORT");
  state.score += (aligned ? 1 : -1.5) * scoreRate * dt;
  state.score = Math.max(state.score, 0);
  state.lastPrice = state.price;

  if (state.score <= 0) {
    state.dead = true;
  }

  state.elapsedMs += dt * 1000;
  state.points.forEach((point) => {
    point.x -= state.speed * dt;
  });
  state.points = state.points.filter((point) => point.x > -60);

  const newY = mapPriceToY(state.price, size.height);
  const lineEndX = size.width * 0.8;
  const lastPoint = state.points[state.points.length - 1];
  if (!lastPoint || lineEndX - lastPoint.x >= 6) {
    state.points.push({ x: lineEndX, y: newY });
  } else {
    lastPoint.y = newY;
  }

  state.labelOffset -= state.speed * dt;
  const spacing = size.width * 0.38;
  if (state.labelOffset <= -spacing) {
    state.labelOffset += spacing;
    state.timeLabelIndex = (state.timeLabelIndex + 1) % 48;
  }

  state.events.forEach((event) => {
    event.x -= state.speed * dt;
  });
  state.events = state.events.filter((event) => event.x > -80);

  state.nextEventIn -= dt * (1 + difficulty * 0.7);
  if (state.nextEventIn <= 0) {
    const eventType = pickEventType();
    state.events.push({
      type: eventType,
      x: size.width * 0.8 + randomRange(120, 260),
      triggered: false,
    });
    const eventMin = lerp(EVENT_COOLDOWN.min, 2.6, difficulty);
    const eventMax = lerp(EVENT_COOLDOWN.max, 4.4, difficulty);
    state.nextEventIn = randomRange(eventMin, eventMax);
  }

  const midX = size.width / 2;
  const nextEvent = state.events.find(
    (event) => !event.triggered && event.x <= midX
  );
  if (nextEvent) {
    const message = getEventMessage(nextEvent.type);
    state.message = {
      text: message,
      type: nextEvent.type,
      untilMs: nowMs + 2000,
    };
    if (nextEvent.type === "FOMO") {
      state.boostUntilMs = nowMs + 3500;
    } else {
      state.direction = state.direction === 1 ? -1 : 1;
      state.priceVelocity = state.direction * randomRange(0.18, 0.3);
      state.noiseBoostUntilMs = nowMs + 1600;
    }
    nextEvent.triggered = true;
  }

  if (state.message && nowMs > state.message.untilMs) {
    state.message = null;
  }

  return state;
};

const pickEventType = (): EventType => {
  const roll = Math.random();
  if (roll < 0.3) return "FOMO";
  if (roll < 0.7) return "NEWS";
  return "INFLUENCER";
};

const getEventMessage = (type: EventType) => {
  if (type === "FOMO") return pickRandom(FOMO_MESSAGES);
  if (type === "NEWS") return pickRandom(NEWS_MESSAGES);
  return pickRandom(INFLUENCER_MESSAGES);
};
  