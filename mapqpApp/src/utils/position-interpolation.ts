export type MotionFix = {
  latitude: number; longitude: number; timestamp: number;
  speed?: number | null; heading?: number | null; accuracy: number;
};

// Self-contained so the same tested predictor can run inside the map WebView.
// These estimates are display-only; GPS remains the source for navigation logic.
export function createPositionInterpolator() {
  type Point = [number, number];
  let fix: MotionFix | null = null;
  let route: Point[] | null = null;
  let speed = 0, heading = 0, received = 0;
  let correction: Point = [0, 0];
  const scale = (lat: number) => Math.max(1, 111320 * Math.cos(lat * Math.PI / 180));
  const distance = (a: Point, b: Point) => Math.hypot((b[0] - a[0]) * 111320, (b[1] - a[1]) * scale(a[0]));
  const validHeading = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value) && value >= 0 && value < 360;

  function predict(now: number): Point | null {
    if (!fix) return null;
    const origin: Point = [fix.latitude, fix.longitude];
    // Stop predicting after a short missed-update window instead of drifting forever.
    let remaining = speed * Math.min(3, Math.max(0, (now - received) / 1000));
    if (remaining === 0) return origin;
    if (route && route.length > 1) {
      let best = Infinity, segment = 0, projection: Point = origin;
      for (let i = 0; i < route.length - 1; i++) {
        const a = route[i], b = route[i + 1];
        const x = (b[1] - a[1]) * scale(origin[0]), y = (b[0] - a[0]) * 111320;
        const length2 = x * x + y * y;
        if (!length2) continue;
        const t = Math.max(0, Math.min(1, (((origin[1] - a[1]) * scale(origin[0])) * x + (origin[0] - a[0]) * 111320 * y) / length2));
        const point: Point = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
        const d = distance(origin, point);
        if (d < best) { best = d; segment = i; projection = point; }
      }
      const a = route[segment], b = route[segment + 1];
      const radians = heading * Math.PI / 180;
      const forward = (b[0] - a[0]) * 111320 * Math.cos(radians) + (b[1] - a[1]) * scale(origin[0]) * Math.sin(radians);
      if (forward >= 0 && best <= Math.min(25, Math.max(10, fix.accuracy))) {
        let point = projection;
        for (let i = segment + 1; i < route.length; i++) {
          const next = route[i], length = distance(point, next);
          if (remaining <= length && length > 0) {
            const t = remaining / length;
            return [point[0] + (next[0] - point[0]) * t, point[1] + (next[1] - point[1]) * t];
          }
          remaining -= length; point = next;
        }
        return point; // Never project beyond the selected destination.
      }
    }
    const radians = heading * Math.PI / 180;
    return [origin[0] + Math.cos(radians) * remaining / 111320,
      origin[1] + Math.sin(radians) * remaining / scale(origin[0])];
  }

  function sample(now: number): Point | null {
    const point = predict(now);
    if (!point) return null;
    const weight = Math.max(0, 1 - (now - received) / 600);
    return [point[0] + correction[0] * weight, point[1] + correction[1] * weight];
  }

  return {
    reset() { fix = null; route = null; speed = 0; correction = [0, 0]; },
    sample,
    update(next: MotionFix, geometry: Point[] | null, now: number) {
      if (![next.latitude, next.longitude, next.timestamp, now].every(Number.isFinite)) return;
      if (fix && next.timestamp < fix.timestamp) return;
      if (fix && next.timestamp === fix.timestamp) {
        route = geometry;
        if (validHeading(next.heading)) heading = next.heading;
        return;
      }
      const previous = fix;
      const displayed = sample(now);
      const elapsed = previous ? (next.timestamp - previous.timestamp) / 1000 : 0;
      const moved = previous ? distance([previous.latitude, previous.longitude], [next.latitude, next.longitude]) : 0;
      const inferredSpeed = elapsed >= 0.5 && elapsed <= 15 && moved > Math.max(2, next.accuracy * 0.25) ? moved / elapsed : 0;
      const reportedSpeed = typeof next.speed === "number" && Number.isFinite(next.speed) && next.speed >= 0 ? next.speed : inferredSpeed;
      speed = reportedSpeed >= 0.3 && reportedSpeed <= 3 && next.accuracy <= 30 ? reportedSpeed : 0;
      if (validHeading(next.heading)) heading = next.heading;
      else if (previous && moved > 1) heading = (Math.atan2((next.longitude - previous.longitude) * scale(next.latitude), (next.latitude - previous.latitude) * 111320) * 180 / Math.PI + 360) % 360;
      else if (!geometry || geometry.length < 2) speed = 0;
      // Old cached fixes must not animate as though they just arrived.
      if (now - next.timestamp > 5000 || next.timestamp > now + 1000) speed = 0;
      fix = next; route = geometry; received = now;
      correction = displayed && distance(displayed, [next.latitude, next.longitude]) < 20
        ? [displayed[0] - next.latitude, displayed[1] - next.longitude] : [0, 0];
    },
  };
}
