import { formatTimeLabel } from "./utils";
import type { CanvasSize, GameState } from "./types";

export const renderGame = (
  ctx: CanvasRenderingContext2D,
  state: GameState,
  size: CanvasSize
) => {
  const { width, height, ratio } = size;
  ctx.save();
  ctx.scale(ratio, ratio);

  ctx.fillStyle = "#05060a";
  ctx.fillRect(0, 0, width, height);

  drawGrid(ctx, state, size);
  drawEvents(ctx, state, size);
  drawPriceLine(ctx, state, size);

  ctx.restore();
};

const drawEvents = (
  ctx: CanvasRenderingContext2D,
  state: GameState,
  size: CanvasSize
) => {
  const { height } = size;
  const baseY = height - 28;

  ctx.save();
  ctx.lineWidth = 1;

  state.events.forEach((event) => {
    const style = getEventStyle(event.type);
    const glow = style.glow;

    ctx.save();
    ctx.strokeStyle = style.color;
    //ctx.fillStyle = style.color;
    ctx.shadowColor = glow;
    //ctx.shadowBlur = 14;

    //ctx.beginPath();
    //ctx.moveTo(event.x, baseY - 10);
    //ctx.lineTo(event.x, baseY + 10);
    //ctx.stroke();

    //ctx.beginPath();
    //ctx.arc(event.x, baseY, 4.2, 0, Math.PI * 2);
    //ctx.fill();

    ctx.shadowBlur = 0;
    ctx.fillStyle = style.label;
    ctx.font = "bold 16px monospace";
    ctx.textAlign = "center";
    ctx.textBaseline = "bottom";
    ctx.fillText(style.tag, event.x, baseY - 12);

    drawEventIcon(ctx, event.x, baseY - 2, style.icon, style.color);
    ctx.restore();
  });

  ctx.restore();
};

const getEventStyle = (type: GameState["events"][number]["type"]) => {
  if (type === "FOMO") {
    return {
      tag: "FOMO",
      color: "rgba(67, 255, 118, 0.95)",
      glow: "rgba(67, 255, 118, 0.7)",
      label: "rgba(67, 255, 118, 0.9)",
      icon: "rocket",
    } as const;
  }
  if (type === "NEWS") {
    return {
      tag: "NEWS",
      color: "rgba(255, 77, 77, 0.95)",
      glow: "rgba(255, 77, 77, 0.7)",
      label: "rgba(255, 77, 77, 0.9)",
      icon: "alert",
    } as const;
  }
  return {
    tag: "INFL",
    color: "rgba(45, 247, 255, 0.95)",
    glow: "rgba(45, 247, 255, 0.7)",
    label: "rgba(45, 247, 255, 0.9)",
    icon: "wave",
  } as const;
};

const drawEventIcon = (
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  icon: "rocket" | "alert" | "wave",
  color: string
) => {
  ctx.save();
  ctx.lineWidth = 1.4;
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.translate(x, y);

  if (icon === "rocket") {
    ctx.beginPath();
    ctx.moveTo(0, -6);
    ctx.lineTo(4, 0);
    ctx.lineTo(0, 6);
    ctx.lineTo(-4, 0);
    ctx.closePath();
    ctx.stroke();
  } else if (icon === "alert") {
    ctx.beginPath();
    ctx.moveTo(0, -6);
    ctx.lineTo(6, 6);
    ctx.lineTo(-6, 6);
    ctx.closePath();
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(0, -2);
    ctx.lineTo(0, 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(0, 4.5, 0.6, 0, Math.PI * 2);
    ctx.fill();
  } else {
    ctx.beginPath();
    ctx.moveTo(-6, 2);
    ctx.quadraticCurveTo(-3, -2, 0, 2);
    ctx.quadraticCurveTo(3, 6, 6, 2);
    ctx.stroke();
  }
  ctx.restore();
};

const drawGrid = (
  ctx: CanvasRenderingContext2D,
  state: GameState,
  size: CanvasSize
) => {
  const { width, height } = size;
  const spacing = width * 0.38;
  const baseX = state.labelOffset % spacing;

  ctx.save();
  ctx.strokeStyle = "rgba(45, 247, 255, 0.15)";
  ctx.lineWidth = 1;

  for (let i = -1; i < 5; i += 1) {
    const x = baseX + i * spacing;
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, height);
    ctx.stroke();
  }

  ctx.strokeStyle = "rgba(255, 59, 219, 0.15)";
  for (let i = 1; i <= 3; i += 1) {
    const y = (height / 4) * i;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(width, y);
    ctx.stroke();
  }

  ctx.fillStyle = "rgba(230, 232, 255, 0.65)";
  ctx.font = "12px var(--font-geist-mono), monospace";
  ctx.textAlign = "center";
  ctx.textBaseline = "bottom";

  for (let i = -1; i < 5; i += 1) {
    const index = (state.timeLabelIndex + i) % 48;
    const label = formatTimeLabel((index + 48) % 48);
    const x = baseX + i * spacing;
    ctx.fillText(label, x, height - 8);
  }

  ctx.restore();
};

const drawPriceLine = (
  ctx: CanvasRenderingContext2D,
  state: GameState,
  size: CanvasSize
) => {
  const { width, height } = size;
  const clipWidth = width * 0.8;

  ctx.save();
  ctx.beginPath();
  ctx.rect(0, 0, clipWidth, height);
  ctx.clip();

  ctx.lineWidth = 2;
  ctx.strokeStyle = "rgba(45, 247, 255, 0.9)";
  ctx.shadowColor = "rgba(45, 247, 255, 0.6)";
  ctx.shadowBlur = 12;
  ctx.beginPath();

  state.points.forEach((point, index) => {
    if (index === 0) {
      ctx.moveTo(point.x, point.y);
    } else {
      ctx.lineTo(point.x, point.y);
    }
  });
  ctx.stroke();

  ctx.restore();
};
