export const clamp = (value: number, min: number, max: number) =>
  Math.min(Math.max(value, min), max);

export const randomRange = (min: number, max: number) =>
  min + Math.random() * (max - min);

export const pickRandom = <T,>(list: readonly T[]) =>
  list[Math.floor(Math.random() * list.length)];

export const lerp = (start: number, end: number, t: number) =>
  start + (end - start) * t;

export const formatTimeLabel = (index: number) => {
  const totalMinutes = (index * 30) % (24 * 60);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  const hh = hours.toString().padStart(2, "0");
  const mm = minutes.toString().padStart(2, "0");
  return `${hh}:${mm}`;
};
