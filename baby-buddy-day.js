/**
 * baby-buddy-day
 * A 24-hour ring overview (sleep / feedings / diaper changes), fed by HA
 * REST sensors that read the Baby Buddy API (see sleep_sensor.yaml as an
 * example). No direct fetch from the browser, so no CORS issue.
 *
 * Config:
 *   type: custom:baby-buddy-day
 *   sleep_entity: sensor.x_sleep_raw
 *   feedings_entity: sensor.x_feedings_raw
 *   changes_entity: sensor.x_changes_raw
 *   timer_entity: switch.x_timer   # optional: shows a running timer
 *                                  # (hourglass) regardless of what it'll
 *                                  # be used for, comes from the Baby
 *                                  # Buddy HACS integration (jcgoette).
 *   average_days: 7                # optional: shows a subtle shadow of
 *                                  # the average pattern from the last N
 *                                  # days. Omit or 0 = off.
 */

const CARD_VERSION = "0.1.1";
console.info(`%c baby-buddy-day %c v${CARD_VERSION} `, "color: white; background: #039be5; font-weight: 700;", "color: #039be5; background: transparent; font-weight: 700;");

// Single source of truth, shared by BabyBuddyDayRing.setConfig and the editor.
const CARD_DEFAULTS = { average_days: 0 };

// Only keep keys that differ from CARD_DEFAULTS (or have no default at all,
// e.g. the three required entities): mirrors the same helper in the other
// cards in this family (e.g. cover-media-card.js), so a fresh average_days:0
// from the editor's number field doesn't get persisted into saved YAML.
function stripDefaults(config) {
  const out = {};
  for (const [key, value] of Object.entries(config)) {
    if (key in CARD_DEFAULTS && value === CARD_DEFAULTS[key]) continue;
    out[key] = value;
  }
  return out;
}

// Mirrors package-tracker-card's candidatesForType/hasAttrs pattern: a
// candidate REST sensor is verified by its actual results-item shape (the
// same attribute the card itself reads via _readEntityResults), not just its
// entity_id/friendly_name. All three fields share the same "results" array
// shape, so hasAttrs alone can't always tell them apart (especially before
// Baby Buddy has any data yet, when results is still empty for all of them);
// naming hints are only a tie-breaker in that ambiguous case, same fallback
// order package-tracker-card uses.
const RAW_SENSOR_TYPES = {
  sleep_entity: {
    hints: ["sleep", "nap"],
    hasAttrs: (a) => Array.isArray(a.results) && (a.results.length === 0 || "nap" in a.results[0]),
  },
  feedings_entity: {
    hints: ["feeding", "feed"],
    hasAttrs: (a) =>
      Array.isArray(a.results) && (a.results.length === 0 || "method" in a.results[0] || "type" in a.results[0]),
  },
  changes_entity: {
    hints: ["change", "diaper"],
    hasAttrs: (a) =>
      Array.isArray(a.results) && (a.results.length === 0 || "wet" in a.results[0] || "solid" in a.results[0]),
  },
};

function hintScore(hint, entityId) {
  return entityId.toLowerCase().includes(hint) ? hint.length : 0;
}

// timer_entity has no results-attribute shape to verify against (it's a
// plain switch), so this is a pure entity_id-hint match within the switch
// domain, same idea as package-tracker-card falling back to bestTypeByHints
// when there's no structural signal to check.
function bestTimerCandidate(hass) {
  const candidates = Object.keys(hass.entities || {}).filter((entityId) => entityId.startsWith("switch."));
  const withTimerHint = candidates.filter((entityId) => entityId.toLowerCase().includes("timer"));
  return withTimerHint[0] || "";
}

// Candidates = rest-platform entity AND hasAttrs passes AND not already
// picked for a different field. Ties (typically: results still empty, so
// hasAttrs can't distinguish) are broken with naming hints.
function bestRawSensorCandidate(field, hass, used) {
  const def = RAW_SENSOR_TYPES[field];
  const candidates = [];
  for (const [entityId, info] of Object.entries(hass.entities || {})) {
    if (used.has(entityId)) continue;
    if (!(info.platform || "").toLowerCase().includes("rest")) continue;
    const attrs = hass.states[entityId]?.attributes;
    if (!attrs || !def.hasAttrs(attrs)) continue;
    candidates.push(entityId);
  }
  if (candidates.length <= 1) return candidates[0] || "";
  let best = candidates[0];
  let bestScore = -1;
  for (const entityId of candidates) {
    const score = Math.max(0, ...def.hints.map((h) => hintScore(h, entityId)));
    if (score > bestScore) {
      best = entityId;
      bestScore = score;
    }
  }
  return best;
}

// Opacity of the "average pattern" shadow layer (see average_days in the
// config); adjust this to make the shadow stand out more/less.
const AVERAGE_OPACITY = 0.05;

// Must stay equal to --ring-track-width in _css(); kept separate because
// CSS custom properties can't be used directly in JS geometry calculations
// (like the round-cap correction below).
const RING_TRACK_WIDTH = 28;

// Pure SVG path data (24x24 viewBox) for the icons in the dots, instead of
// ha-icon + foreignObject. Reason: a confirmed, still-open WebKit bug
// (home-assistant/frontend#7224, WebKit Bugzilla #23113) where HTML content
// inside an SVG foreignObject isn't treated as its own "layer"; this causes
// shifted or clipped icons on Safari/iOS, regardless of CSS adjustments.
// Pure SVG paths (no foreignObject, no HTML) sidestep that whole class of
// bug. All paths are the "solid" (non-outline) variant, sourced from
// pictogrammers.com (the official MDI source); only "diaper" doesn't exist
// as a solid variant in MDI, so that one is stuck with the outline version.
const ICON_PATHS = {
  heart:
    "M12,21.35L10.55,20.03C5.4,15.36 2,12.27 2,8.5C2,5.41 4.42,3 7.5,3C9.24,3 10.91,3.81 12,5.08C13.09,3.81 14.76,3 16.5,3C19.58,3 22,5.41 22,8.5C22,12.27 18.6,15.36 13.45,20.03L12,21.35Z",
  babyBottle:
    "M11.28 2.8L10.78 3.3A5.5 5.5 0 0 0 6.41 2.87L6.33 2.8A2.5 2.5 0 0 0 2.8 6.33L2.87 6.41A5.5 5.5 0 0 0 3.3 10.78L2.8 11.28A1.5 1.5 0 0 0 2.8 13.4L4.21 14.82A1.5 1.5 0 0 0 6.33 14.82L6.68 14.46L13.76 21.53A1.5 1.5 0 0 0 15.88 21.53L21.53 15.88A1.5 1.5 0 0 0 21.53 13.76L14.46 6.68L14.82 6.33A1.5 1.5 0 0 0 14.82 4.21L13.4 2.8A1.5 1.5 0 0 0 11.28 2.8M13.76 5.27L5.27 13.76L3.86 12.34L12.34 3.86M14.82 11.63L11.63 14.82L10.57 13.76L13.76 10.57M16.94 13.76L13.76 16.94L12.69 15.88L15.88 12.69Z",
  foodApple:
    "M20,10C22,13 17,22 15,22C13,22 13,21 12,21C11,21 11,22 9,22C7,22 2,13 4,10C6,7 9,7 11,8V5C5.38,8.07 4.11,3.78 4.11,3.78C4.11,3.78 6.77,0.19 11,5V3H13V8C15,7 18,7 20,10Z",
  water:
    "M12,20A6,6 0 0,1 6,14C6,10 12,3.25 12,3.25C12,3.25 18,10 18,14A6,6 0 0,1 12,20Z",
  emoticonPoop:
    "M11.36,2C11.15,2 10.87,2.12 10.57,2.32C10,2.7 8.85,3.9 8.4,5.1C8.06,6 8.05,6.82 8.19,7.43C7.63,7.53 7.22,7.71 7.06,7.78C6.55,8 5.47,8.96 5.37,10.45C5.34,10.97 5.41,11.5 5.57,12C4.91,12.19 4.53,12.43 4.5,12.44C4.18,12.56 3.65,12.93 3.5,13.13C3.15,13.53 2.92,14 2.79,14.5C2.5,15.59 2.6,16.83 3.13,17.83C3.42,18.39 3.82,19 4.26,19.43C5.7,20.91 8.18,21.47 10.14,21.79C12.53,22.19 15.03,22.05 17.26,21.13C20.61,19.74 21.5,17.5 21.64,16.89C21.93,15.5 21.57,14.19 21.42,13.87C21.2,13.41 20.84,12.94 20.25,12.64C19.85,12.39 19.5,12.26 19.24,12.2C19.5,11.25 19.13,10.5 18.62,9.94C17.85,9.12 17.06,9 17.06,9V9C17.32,8.5 17.42,7.9 17.28,7.32C17.12,6.61 16.73,6.16 16.22,5.86C15.7,5.55 15.06,5.4 14.4,5.28C14.08,5.22 12.75,5.03 12.2,4.27C11.75,3.65 11.74,2.53 11.62,2.2C11.57,2.07 11.5,2 11.36,2M16,9.61C16.07,9.61 16.13,9.62 16.19,9.62C17.62,9.78 18.64,11.16 18.47,12.69C18.3,14.22 17,15.34 15.57,15.18V15.18C14.14,15 13.12,13.65 13.29,12.11C13.45,10.66 14.64,9.56 16,9.61M8.62,9.61C9.95,9.65 11.06,10.78 11.16,12.21C11.28,13.75 10.21,15.08 8.78,15.19H8.77C7.34,15.3 6.08,14.14 5.96,12.6V12.6C5.85,11.06 6.92,9.73 8.35,9.62V9.62C8.44,9.61 8.53,9.61 8.62,9.61M8.64,11.31C8.6,11.31 8.57,11.31 8.53,11.32C7.97,11.39 7.57,11.9 7.64,12.45C7.7,13 8.21,13.39 8.77,13.32C9.33,13.25 9.73,12.74 9.67,12.19C9.61,11.67 9.15,11.3 8.64,11.31M15.94,11.33C15.42,11.35 15,11.75 14.96,12.28C14.92,12.83 15.35,13.31 15.91,13.34C16.5,13.38 16.96,12.95 17,12.4C17.04,11.84 16.61,11.36 16.05,11.33C16,11.33 16,11.33 15.94,11.33M8.71,16.15C9,16.14 9.26,16.23 9.5,16.28C10.68,16.5 11.7,16.53 12.19,16.53C12.68,16.53 13.69,16.5 14.86,16.28C15.27,16.2 15.74,16.03 16.11,16.28C16.59,16.6 16.24,17.75 15.5,18.53C15.04,19 13.97,19.91 12.19,19.91C10.41,19.91 9.33,19 8.88,18.53C8.14,17.75 7.79,16.6 8.26,16.28C8.4,16.19 8.55,16.15 8.71,16.15Z",
  diaperOutline:
    "M21 4H3C2.45 4 2 4.45 2 5V10C2 15.5 6.5 20 12 20C17.5 20 22 15.5 22 10V5C22 4.45 21.55 4 21 4M4 6H20V8H15V10H20C20 10.34 20 10.67 19.94 11C16.12 11.03 13.03 14.12 13 17.94C12.67 18 12.34 18 12 18C11.66 18 11.33 18 11 17.94C10.97 14.12 7.88 11.03 4.06 11C4 10.67 4 10.34 4 10H9V8H4V6M15.04 17.4C15.31 15.12 17.12 13.31 19.41 13.04C18.59 15 17 16.59 15.03 17.41M4.6 13.04C6.88 13.31 8.7 15.12 8.97 17.41C7 16.59 5.41 15 4.6 13.03Z",
  timerSand:
    "M6 2h12v6l-4 4l4 4v6H6v-6l4-4l-4-4zm10 14.5l-4-4l-4 4V20h8zm-4-5l4-4V4H8v3.5zM10 6h4v.75l-2 2l-2-2z",
};

// Shared between nl/en: the "ml" suffix is a unit, not a translated word,
// so this doesn't actually vary per language (unlike its neighbors).
const detailAmount = (amount, type) => ((type || "").toLowerCase().includes("solid") ? `${amount}` : `${amount} ml`);

const STRINGS = {
  nl: {
    today: "Vandaag",
    yesterday: "Gisteren",
    totalSleep: "Totale slaap",
    feedings: (n) => `${n} voeding${n === 1 ? "" : "en"}`,
    totalMl: (ml) => `${ml} ml`,
    changes: (n) => `${n} verschoning${n === 1 ? "" : "en"}`,
    error: "Entity niet gevonden",
    error_not_configured: "Geen sensoren geconfigureerd",
    error_not_configured_sub: "Kies de drie sensoren in de kaart-editor",
    months: [
      "jan", "feb", "mrt", "apr", "mei", "jun",
      "jul", "aug", "sep", "okt", "nov", "dec",
    ],
    weekdays: [
      "zondag", "maandag", "dinsdag", "woensdag", "donderdag", "vrijdag", "zaterdag",
    ],
    detailSleeping: () => `in bed`,
    detailUntil: (time) => `tot ${time}`,
    detailAmount,
    detailSinceLastFeeding: (time) => `sinds laatste voeding (${time})`,
    detailSinceLastChange: (time) => `sinds laatste verschoning (${time})`,
    detailAwake: (time) => `wakker (vanaf ${time})`,
    detailSincePrevious: (duration) => `${duration} sinds vorige`,
    detailFrom: (time) => `Vanaf ${time}`,
    detailSleptDuration: (duration) => `${duration} geslapen`,
    detailTimerRunning: () => `timer loopt`,
    timeWithGap: (time, duration) => `${time} (na ${duration})`,
    detailWet: "Plas",
    detailSolid: "Poep",
    detailBoth: "Plas en poep",
    feedingTypeLabel: (type, method) => {
      const tNorm = (type || "").toLowerCase();
      const mNorm = (method || "").toLowerCase();
      if (tNorm.includes("solid")) return "Vast voedsel";
      if (mNorm.includes("left breast")) return "Linkerborst";
      if (mNorm.includes("right breast")) return "Rechterborst";
      if (mNorm.includes("both breast")) return "Beide borsten";
      if (mNorm.includes("self fed")) return "Zelf gegeten";
      if (mNorm.includes("parent fed")) return "Gevoerd";
      if (tNorm.includes("formula")) return "Kunstvoeding (fles)";
      if (tNorm.includes("fortified")) return "Verrijkte moedermelk (fles)";
      if (tNorm.includes("breast")) return "Moedermelk (fles)";
      return "Voeding";
    },
  },
  en: {
    today: "Today",
    yesterday: "Yesterday",
    totalSleep: "Total sleep",
    feedings: (n) => `${n} feeding${n === 1 ? "" : "s"}`,
    totalMl: (ml) => `${ml} ml`,
    changes: (n) => `${n} change${n === 1 ? "" : "s"}`,
    error: "Entity not found",
    error_not_configured: "No sensors configured",
    error_not_configured_sub: "Pick the three sensors in the card editor",
    months: [
      "Jan", "Feb", "Mar", "Apr", "May", "Jun",
      "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
    ],
    weekdays: [
      "Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday",
    ],
    detailSleeping: () => `in bed`,
    detailUntil: (time) => `until ${time}`,
    detailAmount,
    detailSinceLastFeeding: (time) => `since last feeding (${time})`,
    detailSinceLastChange: (time) => `since last change (${time})`,
    detailAwake: (time) => `awake (since ${time})`,
    detailSincePrevious: (duration) => `${duration} since previous`,
    detailFrom: (time) => `From ${time}`,
    detailSleptDuration: (duration) => `${duration} slept`,
    detailTimerRunning: () => `timer running`,
    timeWithGap: (time, duration) => `${time} (after ${duration})`,
    detailWet: "Wet",
    detailSolid: "Solid",
    detailBoth: "Wet and solid",
    feedingTypeLabel: (type, method) => {
      const tNorm = (type || "").toLowerCase();
      const mNorm = (method || "").toLowerCase();
      if (tNorm.includes("solid")) return "Solid food";
      if (mNorm.includes("left breast")) return "Left breast";
      if (mNorm.includes("right breast")) return "Right breast";
      if (mNorm.includes("both breast")) return "Both breasts";
      if (mNorm.includes("self fed")) return "Self fed";
      if (mNorm.includes("parent fed")) return "Parent fed";
      if (tNorm.includes("formula")) return "Formula (bottle)";
      if (tNorm.includes("fortified")) return "Fortified breast milk (bottle)";
      if (tNorm.includes("breast")) return "Breast milk (bottle)";
      return "Feeding";
    },
  },
};

// ---- Geometry: 24h ring with a gap at the bottom -------------------------
// 0:00 at the top (12 o'clock position), clockwise. Gap at the bottom (around
// the 24:00/0:00 point at the bottom) GAP_DEGREES wide, centered on the
// bottom (270°... actually the "6 o'clock" position in SVG angle terms
// where 0° = top).
const RING_START_DEG = -90; // 0:00 above the center (SVG: -90° = top)
const TOTAL_DEG = 360;
const GAP_DEGREES = 40; // total gap size at the bottom
const HALF_GAP = GAP_DEGREES / 2;

function hourToAngle(hourFloat) {
  // hourFloat: can fall outside 0..24 (negative = before midnight
  // "yesterday", >24 = after midnight "tomorrow"); that's deliberately
  // allowed so a session spanning the day boundary can be drawn as ONE
  // uninterrupted arc. The 24h axis is scaled to the available arc width
  // (360° minus the gap at the bottom).
  const usableDeg = TOTAL_DEG - GAP_DEGREES;
  const fraction = hourFloat / 24;
  // start right after the gap (bottom-left) and end right before the gap (bottom-right)
  const startOfArc = RING_START_DEG + 180 + HALF_GAP; // left side of the gap, starting point = bottom + half gap
  return startOfArc + fraction * usableDeg;
}

function polarToXY(cx, cy, r, angleDeg) {
  const rad = (angleDeg * Math.PI) / 180;
  return {
    x: cx + r * Math.cos(rad),
    y: cy + r * Math.sin(rad),
  };
}

function describeArc(cx, cy, r, startAngle, endAngle) {
  // Avoid rendering issues for a full circle or very small arcs
  let end = endAngle;
  if (end - startAngle >= 359.99) end = startAngle + 359.99;
  const start = polarToXY(cx, cy, r, startAngle);
  const stop = polarToXY(cx, cy, r, end);
  const largeArc = end - startAngle <= 180 ? 0 : 1;
  return `M ${start.x} ${start.y} A ${r} ${r} 0 ${largeArc} 1 ${stop.x} ${stop.y}`;
}

// With stroke-linecap: round, each end of a line sticks out half a
// stroke-width past the geometric endpoint (arc length = r * θ). For an
// arc at radius r with width strokeWidth, this gives the angle (in
// degrees) you need to shorten at EACH end so the VISUAL length
// (including the round cap) matches the actual duration, instead of
// always looking half a cap-length longer than it should.
function roundCapInsetDeg(r, strokeWidth) {
  return (strokeWidth / 2 / r) * (180 / Math.PI);
}

// Shrinks an arc's angular span at one or both ends to compensate for the
// SVG round stroke cap, so the VISIBLE arc (including the cap) matches its
// real angular extent, instead of always looking half a cap-length longer
// than it should. `clippedAtStart`/`clippedAtEnd` skip the inset on ends
// that already sit exactly on the track edge (no overhang to correct
// there). Two ways callers can prevent the ends from crossing on a very
// short arc: `minVisibleSpan` falls back to a small arc centered on the
// midpoint (used for sleep segments, which can be shorter than the total
// inset); `maxInsetFraction` instead caps the inset itself as a fraction
// of the arc's own span (used for the timer, whose span keeps shrinking
// toward zero as it just starts).
function insetArcEnds(startAngle, endAngle, capInset, opts = {}) {
  const { clippedAtStart = false, clippedAtEnd = false, minVisibleSpan = 0, maxInsetFraction = null } = opts;
  const span = endAngle - startAngle;
  const effectiveInset = maxInsetFraction != null ? Math.min(capInset, span * maxInsetFraction) : capInset;
  const startInset = clippedAtStart ? 0 : effectiveInset;
  const endInset = clippedAtEnd ? 0 : effectiveInset;
  if (span - startInset - endInset >= minVisibleSpan) {
    return { a0: startAngle + startInset, a1: endAngle - endInset };
  }
  const mid = (startAngle + endAngle) / 2;
  return { a0: mid - minVisibleSpan / 2, a1: mid + minVisibleSpan / 2 };
}

// Generates very subtle hour tick marks at a given radius: used for the
// outer (feedings) and inner ring (diaper changes); the middle ring
// (sleep) is dominant enough without such a grid.
function buildHourTicks(cx, cy, r, tickLenPx) {
  const ticks = [];
  // Skip h=0 and h=24: those edges are already clearly visible because the
  // track simply stops there (the gap), a tick mark on top would be redundant.
  for (let h = 2; h < 24; h += 2) {
    const angle = hourToAngle(h);
    const inner = polarToXY(cx, cy, r - tickLenPx / 2, angle);
    const outer = polarToXY(cx, cy, r + tickLenPx / 2, angle);
    ticks.push({ x1: inner.x, y1: inner.y, x2: outer.x, y2: outer.y });
  }
  return ticks;
}
// ---- Time helpers ---------------------------------------------------------

function pad(n) {
  return n.toString().padStart(2, "0");
}

// ---- Timezone-aware date helpers -------------------------------------
// Important: we do NOT rely on the JS runtime's system/browser timezone
// (getHours, setHours, etc. always use that timezone, which on kiosks/
// companion apps is sometimes UTC instead of the local timezone). Instead
// we compute everything explicitly in the timezone Home Assistant itself
// reports (hass.config.time_zone), via Intl.DateTimeFormat; that gives a
// consistent result regardless of how the device itself is configured.

// Cache of Intl.DateTimeFormat instances per timezone (fairly expensive to
// keep recreating).
const _tzFormatterCache = new Map();
function _getZonedFormatter(timeZone) {
  let fmt = _tzFormatterCache.get(timeZone);
  if (!fmt) {
    fmt = new Intl.DateTimeFormat("en-US", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    });
    _tzFormatterCache.set(timeZone, fmt);
  }
  return fmt;
}

// Returns the calendar date/time of `date` as it would be in `timeZone`,
// independent of the current JS runtime's system timezone.
function getZonedParts(date, timeZone) {
  const parts = _getZonedFormatter(timeZone).formatToParts(date);
  const get = (type) => parts.find((p) => p.type === type).value;
  return {
    year: parseInt(get("year"), 10),
    month: parseInt(get("month"), 10),
    day: parseInt(get("day"), 10),
    // hour12:false yields "24" for midnight in some environments; %24 normalizes it.
    hour: parseInt(get("hour"), 10) % 24,
    minute: parseInt(get("minute"), 10),
    second: parseInt(get("second"), 10),
  };
}

function dateKey(d, timeZone) {
  const p = getZonedParts(d, timeZone);
  return `${p.year}-${pad(p.month)}-${pad(p.day)}`;
}

// Midnight (00:00:00) of the calendar day of `d`, in `timeZone`, expressed
// as a normal (internally UTC) Date object pointing at that exact instant.
function startOfDay(d, timeZone) {
  const p = getZonedParts(d, timeZone);
  // We don't know the UTC offset of that timezone on that date up front
  // (it can change with DST), so we approximate it via the difference
  // between the "naive" UTC time of the zoned parts and the real UTC time of `d`.
  const naiveUtcOfD = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  // Round to the minute: real timezone offsets are always a whole number
  // of minutes, but `d.getTime()` (unlike getZonedParts' second precision)
  // also has a millisecond part; without rounding that leaks unnoticed
  // into the end result. Two calls with d values only a few ms apart
  // (e.g. "now" at two moments within the same second) would then produce
  // a different "midnight" instant for the exact same calendar day;
  // enough to sometimes make an adjacent >/< comparison come out wrong
  // (like with the day navigation from yesterday to today).
  const offsetMs = Math.round((naiveUtcOfD - d.getTime()) / 60_000) * 60_000;
  // Midnight in the zone, as a "naive" UTC value, corrected with the offset.
  const naiveMidnight = Date.UTC(p.year, p.month - 1, p.day, 0, 0, 0, 0);
  return new Date(naiveMidnight - offsetMs);
}

function endOfDay(d, timeZone) {
  const start = startOfDay(d, timeZone);
  // Not simply start + 24h: a local day can be 23h or 25h long on a DST
  // transition day (see _changeDay's own re-normalization for the same
  // reason). Adding 36h from this day's midnight always lands somewhere
  // in the afternoon of the NEXT calendar day regardless of whether today
  // was 23h or 25h; startOfDay then finds that day's real midnight, and
  // subtracting 1ms gives the correct end of TODAY.
  const nextMidnight = startOfDay(new Date(start.getTime() + 36 * 3_600_000), timeZone);
  return new Date(nextMidnight.getTime() - 1);
}

function hoursSinceMidnight(d, midnight) {
  return (d.getTime() - midnight.getTime()) / 3_600_000;
}

// Shorthand for the "convert a Date to its ring angle" combo, repeated
// throughout _render() for every layer (sleep, timer, feedings, changes,
// gaps, the "now" marker).
function dateToAngle(date, midnight) {
  return hourToAngle(hoursSinceMidnight(date, midnight));
}

// Splits minutes into hours+minutes, rounding the total before splitting;
// otherwise Math.round on the minutes remainder (e.g. 59.6) could round
// up to 60 without the hour counting it, producing "6h 60m".
function splitMinutes(totalMinutes) {
  const rounded = Math.round(totalMinutes);
  return { h: Math.floor(rounded / 60), m: rounded % 60 };
}

function formatDuration(totalMinutes) {
  const { h, m } = splitMinutes(totalMinutes);
  if (h <= 0) return `${m}m`;
  return `${h}:${pad(m)}`;
}

function formatTotalSleep(totalMinutes, lang) {
  const { h, m } = splitMinutes(totalMinutes);
  if (lang === "nl") return `${h}u ${pad(m)}m`;
  return `${h}h ${pad(m)}m`;
}

// Readable duration in words (e.g. "2h 15m", or just "2h" for whole hours);
// for use in running text, unlike formatDuration's compact "2:15"
// notation which fits better on the ring itself.
function formatDurationWords(totalMinutes, lang) {
  const { h, m } = splitMinutes(totalMinutes);
  const hUnit = lang === "nl" ? "u" : "h";
  if (h <= 0) return `${m}m`;
  if (m === 0) return `${h}${hUnit}`;
  return `${h}${hUnit} ${m}m`;
}

function formatTimeOfDay(date, timeZone) {
  const p = getZonedParts(date, timeZone);
  return `${pad(p.hour)}:${pad(p.minute)}`;
}

// Picks a suitable icon for a feeding based on Baby Buddy's `type`/`method`
// fields (raw API values, so we match case-insensitively and on substring
// since the exact casing can differ per source).
function feedingIcon(type, method) {
  const t = (type || "").toLowerCase();
  const m = (method || "").toLowerCase();
  if (t.includes("solid")) return ICON_PATHS.foodApple;
  if (m.includes("breast")) return ICON_PATHS.heart;
  // Formula, (fortified) breast milk via bottle, self fed, parent fed, or
  // unknown: the bottle is the most neutral, recognizable choice here.
  return ICON_PATHS.babyBottle;
}

// Picks a suitable icon for a diaper change based on wet/solid. Solid
// (possibly combined with wet) takes priority, since that's the most
// meaningful/distinct case to recognize at a glance.
function changeIcon(wet, solid) {
  if (solid) return ICON_PATHS.emoticonPoop;
  if (wet) return ICON_PATHS.water;
  // No non-outline "diaper" icon available in MDI: a deliberate exception
  // to the "no outline icons" rule, since there's simply no alternative here.
  return ICON_PATHS.diaperOutline;
}

// Baby Buddy has exactly 4 fixed color values for a "solid" change (see the
// official HA integration docs: Black, Brown, Green, Yellow). Instead of
// using those literally (bright green/yellow would clash on the ring), we
// use muted tones that are close to each other and to the neutral base
// color in brightness/saturation, just enough distinction to see it's
// different, without disturbing the calm of the ring. For wet/neutral
// (no color registered) it just stays blue.
const CHANGE_COLOR_MAP = {
  black: "#5c5752",
  brown: "#8a6f5c",
  green: "#7a8a72",
  yellow: "#a89968",
};
function changeColor(solid, color) {
  if (!solid) return "var(--info-color, #39a0ed)";
  const key = (color || "").toLowerCase();
  // Solid with no registered color: brown is the most common/expected
  // color, a better default than falling back to the "wet" blue.
  return CHANGE_COLOR_MAP[key] || CHANGE_COLOR_MAP.brown;
}

// Finds an item by key in a list, comparing with String(); keys come from
// the Baby Buddy API as a number, but from data-key DOM attributes as a
// string, so this avoids a silent type mismatch.
function findByKey(list, key) {
  return list.find((item) => String(item.key) === key);
}

// Simple 1D k-means: groups a list of numbers (here: hours-of-day, 0-24)
// into k clusters. Used for the "average pattern": events from the last N
// days are pooled and clustered so e.g. 6 feedings a day across multiple
// days converge into ~6 recognizable clusters, instead of forcing a fixed
// time grid. We deliberately ignore the circular nature of a clock (23:50
// and 00:10 are numerically far apart); for baby rhythms that's rarely a
// problem, and it keeps the algorithm simple.
function kMeans1D(values, k, maxIterations = 25) {
  if (values.length === 0 || k <= 0) return [];
  const n = Math.min(k, values.length);
  const sorted = [...values].sort((a, b) => a - b);
  // Init: k centroids spread across the data range (not purely random,
  // that gives more stable/reproducible clusters).
  let centroids = Array.from({ length: n }, (_, i) => sorted[Math.floor((i + 0.5) * sorted.length / n)]);

  let assignments = new Array(values.length).fill(0);
  for (let iter = 0; iter < maxIterations; iter++) {
    let changed = false;
    for (let i = 0; i < values.length; i++) {
      let best = 0;
      let bestDist = Infinity;
      for (let c = 0; c < centroids.length; c++) {
        const dist = Math.abs(values[i] - centroids[c]);
        if (dist < bestDist) {
          bestDist = dist;
          best = c;
        }
      }
      if (assignments[i] !== best) changed = true;
      assignments[i] = best;
    }
    const sums = new Array(centroids.length).fill(0);
    const counts = new Array(centroids.length).fill(0);
    for (let i = 0; i < values.length; i++) {
      sums[assignments[i]] += values[i];
      counts[assignments[i]] += 1;
    }
    centroids = centroids.map((old, c) => (counts[c] > 0 ? sums[c] / counts[c] : old));
    if (!changed) break;
  }

  const clusters = centroids.map(() => ({ points: [], indices: [] }));
  for (let i = 0; i < values.length; i++) {
    clusters[assignments[i]].points.push(values[i]);
    clusters[assignments[i]].indices.push(i);
  }
  return clusters
    .map((cl, c) => ({ mean: centroids[c], points: cl.points, indices: cl.indices }))
    .filter((cl) => cl.points.length > 0)
    .sort((a, b) => a.mean - b.mean);
}

// Render template for a clickable "dot" (feeding/diaper/timer icon): an
// invisible hit-area circle, a visible circle, and an icon inside it via
// foreignObject. extraClass may be empty (the timer has no wet/solid/
// neutral variants the way changeDots does).
//
// Icon positioning is deliberately handled carefully because of a
// confirmed bug acknowledged by an HA core developer
// (home-assistant/frontend#7224): a global line-height style gets
// inherited by the div inside the foreignObject, which changes that div's
// height with zoom level; this shifts the icon and sometimes clips it on
// iOS. We therefore set line-height EXPLICITLY to 0 on the wrapper
// (overriding the global style), and give --mdc-icon-size an EXACT pixel
// value inline (instead of a "100%" that has to resolve through multiple
// CSS percentage layers, which can differ per browser) so the icon size
// doesn't depend on incidental percentage resolution.
// icon here is PATH DATA (from ICON_PATHS), not an mdi: name, rendered as
// pure SVG (nested <svg><path>), not as ha-icon inside a foreignObject.
// That sidesteps a confirmed, still-open WebKit bug where HTML content
// inside an SVG foreignObject isn't correctly treated as its own layer
// (see the ICON_PATHS comment above); pure SVG icons don't have that
// problem, on any platform.
function renderDot({ kind, key, x, y, hitR, visR, icon, isSelected, extraClass = "", fillColor = null }) {
  const iconSize = visR * 2 - 6; // slightly smaller than the visible circle
  const half = iconSize / 2;
  const cls = [`${kind}-dot`, extraClass, "selectable", isSelected ? "selected" : ""].filter(Boolean).join(" ");
  const fillStyle = fillColor ? ` style="fill: ${fillColor};"` : "";
  return `
    <g class="${cls}" data-kind="${kind}" data-key="${key}">
      <circle cx="${x}" cy="${y}" r="${hitR}" class="dot-hit-area" />
      <circle cx="${x}" cy="${y}" r="${visR}" class="dot-visible"${fillStyle} />
      <svg x="${x - half}" y="${y - half}" width="${iconSize}" height="${iconSize}" viewBox="0 0 24 24" class="dot-icon-svg" pointer-events="none">
        <path d="${icon}" />
      </svg>
    </g>`;
}

// ---------------------------------------------------------------------------

class BabyBuddyDayRing extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    // Provisional timezone until the first `hass` update (which provides
    // hass.config.time_zone) comes in; that always happens before the first render.
    this._timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    this._viewDate = startOfDay(new Date(), this._timeZone);
    this._tickTimer = null;
    // Selected event (sleep segment, feeding, diaper change, or timer)
    // whose details are shown in the center. null = show the day summary.
    this._selectedEvent = null;

    // One delegated click listener on shadowRoot ITSELF, attached once;
    // shadowRoot itself is never replaced (only its innerHTML, on every
    // render). A listener re-attached to a fresh element each time (like
    // before) can miss a click if a render happens between the start and
    // end of a tap/click (e.g. from a sensor update or the 30s tick),
    // because the element the user tapped may already have been replaced
    // by then. Delegation on a never-replaced ancestor is immune to that:
    // the click always bubbles up to shadowRoot, no matter how recently a render happened.
    this.shadowRoot.addEventListener("click", (ev) => {
      const prevBtn = ev.target.closest("#prev");
      if (prevBtn) return this._changeDay(-1);
      const nextBtn = ev.target.closest("#next");
      if (nextBtn) return this._changeDay(1);
      const dotOrArc = ev.target.closest("[data-kind]");
      if (dotOrArc) {
        const kind = dotOrArc.getAttribute("data-kind");
        const key = dotOrArc.getAttribute("data-key");
        return this._selectEvent({ kind, key });
      }
      const centerText = ev.target.closest("#center-text");
      if (centerText && this._selectedEvent) return this._selectEvent(null);
    });
  }

  // Never throws, even with the three required sensors still unset (e.g. a
  // freshly-added card, or the card picker's preview before getStubConfig
  // finds anything real to suggest): _render() shows an inline
  // "no sensors configured" message instead, same non-throwing pattern as
  // cover-media-card's "no player configured" handling.
  setConfig(config) {
    this._config = { ...CARD_DEFAULTS, ...config };
  }

  static getConfigElement() { return document.createElement("baby-buddy-day-editor"); }

  static getStubConfig(hass) {
    const used = new Set();
    const pick = (field) => {
      const entityId = bestRawSensorCandidate(field, hass, used);
      if (entityId) used.add(entityId);
      return entityId;
    };
    const config = {
      sleep_entity: pick("sleep_entity"),
      feedings_entity: pick("feedings_entity"),
      changes_entity: pick("changes_entity"),
    };
    const timerEntity = bestTimerCandidate(hass);
    if (timerEntity) config.timer_entity = timerEntity;
    return config;
  }

  set hass(hass) {
    const firstRun = !this._hass;
    // Only the states of the three entities this card actually uses are
    // relevant. HA continuously passes the full hass tree to all cards,
    // even for changes that have nothing to do with this card, without
    // this check, _render() (and with it a full DOM replacement, including
    // the prev/next buttons and all click listeners) would run dozens of
    // times per minute, which can make a click coincide with a DOM
    // replacement and thus "disappear".
    const relevantIds = [this._config && this._config.sleep_entity, this._config && this._config.feedings_entity, this._config && this._config.changes_entity, this._config && this._config.timer_entity].filter(Boolean);
    const relevantChanged =
      firstRun ||
      !this._hass ||
      relevantIds.some((id) => hass.states[id] !== this._hass.states[id]) ||
      hass.language !== this._hass.language ||
      (hass.config && hass.config.time_zone) !== (this._hass.config && this._hass.config.time_zone);

    this._hass = hass;
    this._lang = (hass.language || "en").startsWith("nl") ? "nl" : "en";
    // HA's own configured timezone: not the timezone of the browser/
    // device this card happens to be running on (which can differ, e.g.
    // for a kiosk or companion app that's set to UTC). Fall back to the
    // system timezone only if hass.config unexpectedly is missing.
    this._timeZone =
      (hass.config && hass.config.time_zone) ||
      Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (firstRun) {
      // _viewDate was computed in the constructor with a provisional
      // (browser) timezone, before we knew hass.config.time_zone, now
      // that it's known, recompute "today" with the correct timezone.
      this._viewDate = startOfDay(new Date(), this._timeZone);
      // Short tick for a live-counting running sleep session and in case
      // no hass update comes in for a while (pure re-render, no network).
      this._tickTimer = setInterval(() => {
        if (document.hidden) return;
        if (this._hasLiveActivity()) this._render();
      }, 30 * 1000);
    }
    if (relevantChanged) this._render();
  }

  getCardSize() {
    return 6;
  }

  disconnectedCallback() {
    if (this._tickTimer) clearInterval(this._tickTimer);
  }

  _isViewingToday() {
    const tz = this._timeZone;
    return dateKey(this._viewDate, tz) === dateKey(startOfDay(new Date(), tz), tz);
  }

  // Cheap "is a re-render worth it" check for the 30s tick: reads raw
  // entity state directly instead of running the full _getDayData()
  // pipeline (filtering/mapping over sleep, feedings, AND changes, plus
  // the prevSleep/prevFeeding/prevChange lookups) just to answer a yes/no
  // question the tick asks every 30 seconds. Only relevant when viewing
  // "today": a running sleep session or timer can't change what's shown
  // on a historical day's already-fixed ring, so ticking there would just
  // force a wasted full re-render every 30s for no visible change.
  _hasLiveActivity() {
    if (!this._isViewingToday()) return false;
    const sleepRaw = this._readEntityResults(this._config.sleep_entity);
    if (sleepRaw && sleepRaw.some((s) => !s.end)) return true;
    const timerEntity = this._config.timer_entity;
    if (timerEntity) {
      const state = this._hass.states[timerEntity];
      if (state && state.state === "on") return true;
    }
    return false;
  }

  // ---- Reading data from hass.states ---------------------------------------

  _readEntityResults(entityId) {
    if (!entityId) return [];
    const state = this._hass.states[entityId];
    if (!state || state.state === "unavailable" || state.state === "unknown") {
      // Entity doesn't exist, or the REST sensor doesn't have valid data
      // (yet) (e.g. during HA startup or if Baby Buddy just didn't respond).
      return null;
    }
    const results = state.attributes && state.attributes.results;
    return Array.isArray(results) ? results : [];
  }

  _readTimer() {
    const entityId = this._config.timer_entity;
    if (!entityId) return null;
    const state = this._hass.states[entityId];
    if (!state || state.state !== "on") return null;
    const startRaw = state.attributes && state.attributes.start;
    if (!startRaw) return null;
    return { start: new Date(startRaw) };
  }

  _getDayData() {
    const tz = this._timeZone;
    const viewDate = this._viewDate;
    // sleepRangeStart: 12:00 local time on the day before the viewed day;
    // a wide margin only for SLEEP, so a session that started the evening
    // before and continues into the morning is fully included.
    // Feedings/changes are point-in-time events without that problem; for
    // those layers we filter strictly on their own calendar day (otherwise
    // events from the evening before would leak in).
    const viewMidnight = startOfDay(viewDate, tz);
    const sleepRangeStart = new Date(viewMidnight.getTime() - 12 * 3_600_000);
    const rangeStart = viewMidnight;
    const rangeEnd = endOfDay(viewDate, tz);

    const sleepRaw = this._readEntityResults(this._config.sleep_entity);
    const feedingsRaw = this._readEntityResults(this._config.feedings_entity);
    const changesRaw = this._readEntityResults(this._config.changes_entity);

    const missing = [];
    if (sleepRaw === null) missing.push(this._config.sleep_entity);
    if (feedingsRaw === null) missing.push(this._config.feedings_entity);
    if (changesRaw === null) missing.push(this._config.changes_entity);

    // start/end define an event's own span (end null/falsy = still running,
    // treated as "until now"); rStart/rEnd define the visible window it's
    // tested against. Sleep and the other layers only differ in which
    // window they pass in (see sleepRangeStart's comment above).
    const overlaps = (start, end, rStart, rEnd) => {
      const s = new Date(start);
      const e = end ? new Date(end) : new Date();
      return e >= rStart && s <= rEnd;
    };

    const sleep = (sleepRaw || [])
      .filter((s) => overlaps(s.start, s.end, sleepRangeStart, rangeEnd))
      .map((s) => ({
        key: s.id,
        start: new Date(s.start),
        end: s.end ? new Date(s.end) : null,
        nap: !!s.nap,
      }));

    const feedings = (feedingsRaw || [])
      .filter((f) => overlaps(f.start, f.end || f.start, rangeStart, rangeEnd))
      .map((f) => ({
        key: f.id,
        time: new Date(f.start),
        type: f.type || null,
        method: f.method || null,
        amount: typeof f.amount === "number" ? f.amount : null,
      }));

    const changes = (changesRaw || [])
      .filter((c) => overlaps(c.time, c.time, rangeStart, rangeEnd))
      .map((c) => ({
        key: c.id,
        time: new Date(c.time),
        wet: !!c.wet,
        solid: !!c.solid,
        color: c.color || null,
      }));

    // Running timer: only relevant if it also falls within the current
    // time window (otherwise a timer that's been running for days would
    // show up on every day), AND only if there's no running sleep session
    // yet; that takes priority so two "running" arcs are never drawn on
    // top of each other.
    const hasRunningSleep = sleep.some((s) => !s.end);
    const timerRaw = this._readTimer();
    const timer = !hasRunningSleep && timerRaw && overlaps(timerRaw.start, null, rangeStart, rangeEnd) ? timerRaw : null;

    // For the gap calculation (time between events), the first visible
    // event of the day is only a "real" gap if we also know the very last
    // event before the visible range; that's by definition outside
    // rangeStart, so we look it up in the raw (unfiltered) data.
    // getStart defaults to getEnd: point-in-time events (feedings, changes)
    // have no separate start, only sleep sessions (which can still be
    // running) need a distinct accessor for each.
    const latestBefore = (raw, getEnd, beforeTime, getStart = getEnd) => {
      let best = null;
      for (const item of raw || []) {
        const end = getEnd(item);
        if (end < beforeTime && (!best || end > getEnd(best))) best = item;
      }
      if (!best) return null;
      return { end: getEnd(best), start: getStart(best) };
    };
    const prevSleep = latestBefore(
      sleepRaw,
      (s) => (s.end ? new Date(s.end) : new Date(s.start)),
      sleepRangeStart,
      (s) => new Date(s.start)
    );
    const prevFeeding = latestBefore(
      feedingsRaw,
      (f) => new Date(f.start),
      rangeStart
    );
    const prevChange = latestBefore(
      changesRaw,
      (c) => new Date(c.time),
      rangeStart
    );

    return { sleep, feedings, changes, timer, missing, prevSleep, prevFeeding, prevChange, sleepRaw, feedingsRaw, changesRaw };
  }

  // ---- Navigation --------------------------------------------------------

  _changeDay(delta) {
    const tz = this._timeZone;
    // _viewDate is always already midnight (in HA's timezone); a day
    // forward/back is therefore simply ±24h in milliseconds, re-normalized
    // to midnight to correctly handle any DST jumps (23h or 25h days).
    const shifted = new Date(this._viewDate.getTime() + delta * 24 * 3_600_000);
    const next = startOfDay(shifted, tz);
    // Don't show the future
    if (next > startOfDay(new Date(), tz)) return;
    this._viewDate = next;
    this._selectedEvent = null;
    this._render();
  }

  // ---- Selection (tap-to-reveal) -------------------------------------------

  _selectEvent(eventData) {
    // Tapping the exact same selection again (or the center itself)
    // returns to the summary.
    const isSame =
      this._selectedEvent &&
      eventData &&
      this._selectedEvent.kind === eventData.kind &&
      this._selectedEvent.key === eventData.key;
    this._selectedEvent = isSame ? null : eventData;
    this._render();
  }

  // Whether a given (kind, key) combination is currently selected: key
  // may be a number (comes straight from the API data), data-key
  // attributes in the DOM are always strings, so we compare as a string.
  _isSelected(kind, key) {
    return !!this._selectedEvent && this._selectedEvent.kind === kind && this._selectedEvent.key === String(key);
  }

  // ---- Rendering ----------------------------------------------------------

  _titleLabel(t) {
    const tz = this._timeZone;
    const today = startOfDay(new Date(), tz);
    const daysAgo = Math.round((today.getTime() - this._viewDate.getTime()) / (24 * 3_600_000));
    if (daysAgo === 0) return t.today;
    if (daysAgo === 1) return t.yesterday;
    const p = getZonedParts(this._viewDate, tz);
    if (daysAgo >= 2 && daysAgo <= 7) {
      // getUTCDay() on _viewDate itself is NOT safe here: _viewDate is
      // midnight in tz, but that instant can already fall on the previous
      // UTC calendar day internally (e.g. 00:00 Amsterdam summer time =
      // 22:00 UTC the day before), which would give a wrong weekday
      // index. We therefore derive the weekday from TODAY'S WEEKDAY
      // (which we can determine separately) minus daysAgo, modulo 7.
      const todayWeekday = getZonedParts(new Date(), tz);
      const todayDow = new Date(Date.UTC(todayWeekday.year, todayWeekday.month - 1, todayWeekday.day)).getUTCDay();
      const dow = ((todayDow - daysAgo) % 7 + 7) % 7;
      return `${t.weekdays[dow]} ${p.day} ${t.months[p.month - 1]}`;
    }
    const thisYear = getZonedParts(today, tz).year;
    const yearSuffix = p.year !== thisYear ? ` ${p.year}` : "";
    return `${p.day} ${t.months[p.month - 1]}${yearSuffix}`;
  }

  // Finds the gap that lies directly before a given event (the gap key
  // always ends in "|<eventKey>", see _buildGaps). Returns null if there's
  // no preceding event known (e.g. truly the very first event ever).
  _findGapBefore(gapList, eventKey) {
    return gapList.find((g) => g.key.endsWith(`|${eventKey}`)) || null;
  }

  // Shared 3-line template every branch below builds ("label" / "value" /
  // optional "sub"); sub is omitted entirely (not just left empty) when
  // null, matching what each branch already did by hand.
  _centerBlock(label, value, sub) {
    return `
      <div class="center-label">${label}</div>
      <div class="center-value">${value}</div>
      ${sub != null && sub !== "" ? `<div class="center-sub">${sub}</div>` : ""}
    `;
  }

  _renderCenterContent(t, data, totalSleepMinutes, sleepSegments, feedingPoints, changePoints, timerSegment, allGaps) {
    const tz = this._timeZone;
    const sel = this._selectedEvent;
    if (!sel) {
      const totalMl = data.feedings.reduce((sum, f) => sum + (f.amount || 0), 0);
      const hasMl = data.feedings.some((f) => f.amount != null);
      const feedingLine = hasMl ? t.totalMl(totalMl) : t.feedings(data.feedings.length);
      return this._centerBlock(t.totalSleep, formatTotalSleep(totalSleepMinutes, this._lang), feedingLine);
    }

    if (sel.kind === "sleep") {
      const seg = findByKey(sleepSegments, sel.key);
      if (!seg) return "";
      const gap = this._findGapBefore(allGaps.sleep, sel.key);
      const startStr = formatTimeOfDay(seg.realStart, tz);
      // Actual duration based on the real start/end, not seg.minutes
      // (that's clipped at midnight and would only show today's part).
      const realMinutes = seg.realEnd
        ? (seg.realEnd.getTime() - seg.realStart.getTime()) / 60000
        : seg.minutes;
      const durationWords = formatDurationWords(realMinutes, this._lang);
      if (seg.realEnd) {
        const endStr = formatTimeOfDay(seg.realEnd, tz);
        const labelLine = gap ? t.detailSincePrevious(formatDurationWords(gap.minutes, this._lang)) : "&nbsp;";
        return this._centerBlock(labelLine, `${startStr} - ${endStr}`, t.detailSleptDuration(durationWords));
      }
      return this._centerBlock(t.detailFrom(startStr), durationWords, t.detailSleeping());
    }

    if (sel.kind === "feeding") {
      const f = findByKey(feedingPoints, sel.key);
      if (!f) return "";
      const gap = this._findGapBefore(allGaps.feeding, sel.key);
      const timeStr = formatTimeOfDay(f.time, tz);
      const timeLine = gap ? t.timeWithGap(timeStr, formatDuration(gap.minutes)) : timeStr;
      const typeLabel = t.feedingTypeLabel(f.type, f.method);
      // Main value: amount if it was recorded (unit depends on the type;
      // Baby Buddy has no fixed unit per record, so we only show "ml" for
      // liquid feedings, not solid food). Type/method is always in the
      // text, not just as a fallback; the heart icon for breastfeeding
      // isn't obvious to everyone otherwise, and standalone icons aren't a
      // substitute for readable text.
      const mainValue = f.amount != null ? t.detailAmount(f.amount, f.type) : typeLabel;
      const subValue = f.amount != null ? typeLabel : null;
      return this._centerBlock(timeLine, mainValue, subValue);
    }

    if (sel.kind === "change") {
      const c = findByKey(changePoints, sel.key);
      if (!c) return "";
      const gap = this._findGapBefore(allGaps.change, sel.key);
      const timeStr = formatTimeOfDay(c.time, tz);
      const timeLine = gap ? t.timeWithGap(timeStr, formatDuration(gap.minutes)) : timeStr;
      const typeLabel = c.wet && c.solid ? t.detailBoth : c.solid ? t.detailSolid : t.detailWet;
      return this._centerBlock(timeLine, typeLabel, c.color);
    }

    if (sel.kind === "timer" && timerSegment) {
      const startStr = formatTimeOfDay(timerSegment.realStart, tz);
      const durationWords = formatDurationWords(timerSegment.minutes, this._lang);
      return this._centerBlock(t.detailFrom(startStr), durationWords, t.detailTimerRunning());
    }

    if (sel.kind === "gap") {
      // sel.key has the form "layer|restkey" (e.g. "feeding|prev|123"); the
      // layer determines which gap list we search, the rest is the unique
      // key within that list.
      const sepIdx = sel.key.indexOf("|");
      const layer = sel.key.slice(0, sepIdx);
      const restKey = sel.key.slice(sepIdx + 1);
      const list = allGaps[layer] || [];
      const gap = list.find((g) => g.key === restKey);
      if (!gap) return "";
      const durationStr = formatDurationWords(gap.minutes, this._lang);
      const lastTimeStr = formatTimeOfDay(gap.startTime, tz);
      // A distinct, recognizable phrase per layer instead of a generic "X
      // ago", for sleep this is concretely the wake time ("awake"), for
      // feeding/change specifically which type of event happened last.
      const subLineByLayer = {
        sleep: t.detailAwake(lastTimeStr),
        feeding: t.detailSinceLastFeeding(lastTimeStr),
        change: t.detailSinceLastChange(lastTimeStr),
      };
      // Default matches the old ternary chain's implicit fallback: an
      // unrecognized layer still gets readable text instead of no sub-line.
      const subLine = subLineByLayer[layer] ?? t.detailSinceLastChange(lastTimeStr);
      return this._centerBlock("&nbsp;", durationStr, subLine);
    }

    return "";
  }

  _buildSleepSegments(sleepEvents, midnight, timeZone) {
    const segments = [];
    const now = new Date();
    const dayEnd = endOfDay(midnight, timeZone);

    for (const s of sleepEvents) {
      const rawEnd = s.end || now;
      // Only show if the session actually falls on "today" or is still running.
      if (rawEnd < midnight) continue;
      // The DRAWN segment never starts before midnight of the viewed day
      // (angle 110°, exactly where the track also starts); a night's
      // sleep that started last evening therefore only shows the "today"
      // portion on the ring. The actual start time (possibly before
      // midnight) is preserved in realStart, for the detail panel.
      const segStart = s.start < midnight ? midnight : s.start;
      const segEnd = rawEnd > dayEnd ? dayEnd : rawEnd;
      if (segEnd <= segStart) continue;

      const minutes = (segEnd.getTime() - segStart.getTime()) / 60000;
      const running = !s.end;

      segments.push({
        key: s.key,
        startAngle: dateToAngle(segStart, midnight),
        endAngle: dateToAngle(segEnd, midnight),
        label: formatDuration(minutes),
        minutes,
        running,
        isNap: !!s.nap,
        // Whether this end coincides with the track edge itself (clipped):
        // if so, no segment gap is needed there, only the cap correction
        // (see sleepArcs construction in _render).
        clippedAtStart: s.start < midnight,
        clippedAtEnd: rawEnd > dayEnd,
        // Unclipped, real times (for the detail panel, segStart/segEnd
        // are clipped to the day boundary and so aren't always the actual time).
        realStart: s.start,
        realEnd: s.end,
      });
    }
    return segments;
  }

  // Computes the "average pattern" of the last N full days (so excluding
  // today, which isn't complete yet): for each layer, the average number
  // of events per day is determined, and the pooled timestamps from those
  // days are clustered into that many clusters (kMeans1D); this gives,
  // e.g. for an average of 6 feedings/day, six recognizable "around what
  // time does this usually happen" groups, instead of a fixed time grid.
  // sleepRaw/feedingsRaw/changesRaw are the UNFILTERED arrays from the REST
  // sensor (the same source data _getDayData uses).
  // Merges clusters that are too close together (point-in-time events) or
  // overlap (arcs with a duration); otherwise two near-simultaneous
  // clusters can look like visibly stacked transparency, giving an
  // unintended "darker spot" instead of calmly showing a single pattern.
  _mergeCloseClusters(clusters, minGapHours) {
    if (clusters.length <= 1) return clusters;
    const sorted = [...clusters].sort((a, b) => a.mean - b.mean);
    const merged = [sorted[0]];
    for (let i = 1; i < sorted.length; i++) {
      const last = merged[merged.length - 1];
      const cl = sorted[i];
      const lastEnd = last.mean + (last.durationHours || 0);
      const gap = cl.mean - lastEnd;
      if (gap < minGapHours) {
        // Merge into one cluster via a weighted average (by point count);
        // for arcs, pick the duration so it still covers the furthest-
        // reaching end of both.
        const totalCount = (last.count || 1) + (cl.count || 1);
        const mean = (last.mean * (last.count || 1) + cl.mean * (cl.count || 1)) / totalCount;
        const mergedEnd = Math.max(lastEnd, cl.mean + (cl.durationHours || 0));
        merged[merged.length - 1] = {
          mean,
          count: totalCount,
          ...(last.durationHours != null ? { durationHours: mergedEnd - mean } : {}),
        };
      } else {
        merged.push(cl);
      }
    }
    return merged;
  }

  _buildAverages(sleepRaw, feedingsRaw, changesRaw, viewDate, tz, averageDays) {
    const empty = { sleep: [], feedings: [], changes: [] };
    if (!averageDays || averageDays <= 0) return empty;
    // _readEntityResults returns null (not []) while a sensor is
    // unavailable/unknown; without this guard a transient outage on any
    // one of the three would throw inside the .map() calls below and
    // break the whole card instead of just showing the "missing" status.
    sleepRaw = sleepRaw || [];
    feedingsRaw = feedingsRaw || [];
    changesRaw = changesRaw || [];

    const viewMidnight = startOfDay(viewDate, tz);
    const rangeStart = new Date(viewMidnight.getTime() - averageDays * 24 * 3_600_000);
    // Up to (excluding) today; only count fully completed days, otherwise
    // a still-incomplete "today" would skew the average.
    const rangeEnd = viewMidnight;

    // Groups timestamps per calendar day (in tz) and returns { hoursByDay,
    // totalCount }, needed to determine the average-count-per-day without
    // letting days with zero events count as "add a 0".
    const groupByDay = (dates) => {
      const byDay = new Map();
      for (const d of dates) {
        if (d < rangeStart || d >= rangeEnd) continue;
        const key = dateKey(d, tz);
        const hour = hoursSinceMidnight(d, startOfDay(d, tz));
        if (!byDay.has(key)) byDay.set(key, []);
        byDay.get(key).push(hour);
      }
      return byDay;
    };

    // Minimum spacing between two dot clusters: comparable to the visual
    // diameter of a dot on the ring, converted to hours.
    const DOT_MERGE_GAP_HOURS = 0.75;

    const clusterLayer = (byDay) => {
      const days = [...byDay.values()];
      if (days.length === 0) return [];
      const allHours = days.flat();
      const avgPerDay = Math.max(1, Math.round(allHours.length / days.length));
      const raw = kMeans1D(allHours, avgPerDay).map((cl) => ({ mean: cl.mean, count: cl.points.length }));
      return this._mergeCloseClusters(raw, DOT_MERGE_GAP_HOURS);
    };

    const feedingByDay = groupByDay(feedingsRaw.map((f) => new Date(f.start)));
    const changeByDay = groupByDay(changesRaw.map((c) => new Date(c.time)));
    const feedingClusters = clusterLayer(feedingByDay);
    const changeClusters = clusterLayer(changeByDay);

    // Sleep: cluster on the START time of each session, and also track the
    // average duration per cluster so we can show an arc (start to
    // start+duration), not just a point.
    const sleepEvents = sleepRaw
      .map((s) => ({ start: new Date(s.start), end: s.end ? new Date(s.end) : null }))
      .filter((s) => s.end && s.start >= rangeStart && s.start < rangeEnd);
    const sleepByDay = new Map();
    for (const s of sleepEvents) {
      const key = dateKey(s.start, tz);
      const hour = hoursSinceMidnight(s.start, startOfDay(s.start, tz));
      const durationH = (s.end.getTime() - s.start.getTime()) / 3_600_000;
      if (!sleepByDay.has(key)) sleepByDay.set(key, []);
      sleepByDay.get(key).push({ hour, durationH });
    }
    const sleepDays = [...sleepByDay.values()];
    let sleepClusters = [];
    if (sleepDays.length > 0) {
      const allSleep = sleepDays.flat();
      const avgPerDay = Math.max(1, Math.round(allSleep.length / sleepDays.length));
      const hourClusters = kMeans1D(allSleep.map((s) => s.hour), avgPerDay);
      // Link each session back to its cluster via index (not via value
      // matching, which could group incorrectly if sessions happen to
      // have identical hour values) to compute the average duration per cluster.
      const rawSleepClusters = hourClusters.map((cl) => {
        const matching = cl.indices.map((i) => allSleep[i]);
        const avgDuration = matching.reduce((sum, s) => sum + s.durationH, 0) / matching.length;
        return { mean: cl.mean, durationHours: avgDuration, count: matching.length };
      });
      // Unlike dots, arcs are allowed to just touch each other without
      // being merged; we only merge on real overlap (gap < 0).
      sleepClusters = this._mergeCloseClusters(rawSleepClusters, 0);
    }

    return {
      sleep: sleepClusters,
      feedings: feedingClusters.map((cl) => ({ mean: cl.mean })),
      changes: changeClusters.map((cl) => ({ mean: cl.mean })),
    };
  }

  // Computes the "gaps" between consecutive events on a single layer.
  // events: array of { key, start, end }: for point-in-time events
  // (feeding/change) start === end. prevEvent: the last event before the
  // visible range (can be null if truly nothing is known). Returns an
  // array of { key, startTime, endTime, minutes } for each gap, including
  // the latest-until-now one if applicable (only on "today").
  _buildGaps(events, prevEvent, dayEnd) {
    const gaps = [];
    const sorted = [...events].sort((a, b) => a.start - b.start);

    let cursor = prevEvent ? prevEvent.end : null;
    let cursorKey = "prev";
    for (const ev of sorted) {
      if (cursor) {
        const minutes = (ev.start.getTime() - cursor.getTime()) / 60000;
        if (minutes > 0) {
          gaps.push({
            key: `${cursorKey}|${ev.key}`,
            startTime: cursor,
            endTime: ev.start,
            minutes,
          });
        }
      }
      cursor = ev.end;
      cursorKey = String(ev.key);
    }

    // Last gap: from the last event until now, but only on "today", on
    // completed days, "until now" has no meaning.
    if (cursor && this._isViewingToday()) {
      const now = new Date();
      if (now > cursor && now <= dayEnd) {
        const minutes = (now.getTime() - cursor.getTime()) / 60000;
        gaps.push({
          key: `${cursorKey}|now`,
          startTime: cursor,
          endTime: now,
          minutes,
        });
      }
    }

    return gaps;
  }

  _render() {
    if (!this._hass || !this._config) return;
    const t = STRINGS[this._lang] || STRINGS.en;
    const tz = this._timeZone;
    const data = this._getDayData();

    // Average pattern from the last N days; only show on "today" (on
    // historical days, "the average of the last N days before that day"
    // is confusing and not very useful).
    const averages = this._isViewingToday()
      ? this._buildAverages(data.sleepRaw, data.feedingsRaw, data.changesRaw, this._viewDate, tz, this._config.average_days)
      : { sleep: [], feedings: [], changes: [] };

    const midnight = startOfDay(this._viewDate, tz);
    const dayEnd = endOfDay(midnight, tz);
    const sleepSegments = this._buildSleepSegments(data.sleep, midnight, tz);
    // Each segment's `minutes` is already clipped to [midnight, dayEnd]
    // (see _buildSleepSegments), the same clipping this total needs.
    const totalSleepMinutes = sleepSegments.reduce((sum, seg) => sum + seg.minutes, 0);

    // Gaps between consecutive events, per layer, clickable but invisible,
    // shows in the center how much time was in between.
    const sleepGapEvents = data.sleep.map((s) => ({ key: s.key, start: s.start, end: s.end || new Date() }));
    const sleepGaps = this._buildGaps(sleepGapEvents, data.prevSleep, dayEnd);
    const feedingGapEvents = data.feedings.map((f) => ({ key: f.key, start: f.time, end: f.time }));
    const feedingGaps = this._buildGaps(feedingGapEvents, data.prevFeeding, dayEnd);
    const changeGapEvents = data.changes.map((c) => ({ key: c.key, start: c.time, end: c.time }));
    const changeGaps = this._buildGaps(changeGapEvents, data.prevChange, dayEnd);

    // Running timer (regardless of what it'll be used for) as a separate,
    // neutral segment: from timer start until now.
    let timerSegment = null;
    if (data.timer) {
      const segStart = data.timer.start < midnight ? midnight : data.timer.start;
      const now = new Date();
      const segEnd = now > dayEnd ? dayEnd : now;
      if (segEnd > segStart) {
        // The duration label uses the ACTUAL timer start (can be before
        // midnight), not the clipped segStart that's only for the ring
        // arc; otherwise the label would show too short a duration if
        // the timer already started yesterday.
        const realMinutes = (now.getTime() - data.timer.start.getTime()) / 60000;
        timerSegment = {
          key: "timer",
          startAngle: dateToAngle(segStart, midnight),
          endAngle: dateToAngle(segEnd, midnight),
          label: formatDuration(realMinutes),
          minutes: realMinutes,
          realStart: data.timer.start,
        };
      }
    }

    const feedingPoints = data.feedings.map((f) => ({
      key: f.key,
      time: f.time,
      type: f.type,
      method: f.method,
      amount: f.amount,
      angle: dateToAngle(f.time, midnight),
    }));

    const changePoints = data.changes.map((c) => ({
      key: c.key,
      time: c.time,
      angle: dateToAngle(c.time, midnight),
      wet: c.wet,
      solid: c.solid,
      color: c.color,
    }));

    const isToday = this._isViewingToday();
    const canGoForward = !isToday;

    const size = 442;
    const cx = size / 2;
    const cy = size / 2;
    // Three concentric rings: feedings outside, sleep in the middle,
    // diaper changes inside. Rings sit tightly against each other
    // (minimal margin) and are thicker so the icons on the dots are
    // bigger and clearer. Details no longer sit permanently on the ring.
    // tapping a segment/dot shows them in the center.
    const feedingR = 191;
    const ringR = 159; // sleep (main ring, keeps its name for the rest of the code)
    const changeR = 127;
    // Radius for the 00:00/23:59 gap labels: just outside the outermost
    // ring, in the gap itself, so they visually anchor to the ring's own
    // two loose ends (hourToAngle(0) / hourToAngle(24)) instead of floating
    // at an unrelated position. Consumed as a %-of-container position by a
    // plain HTML overlay (see gap-label below), not as native SVG <text> --
    // SVG text scales its font-size down with the viewBox, which reads as
    // illegibly tiny once the ring is rendered smaller than its 442-unit
    // viewBox (i.e. basically always).
    const gapLabelR = feedingR + RING_TRACK_WIDTH;
    const gapLabelPos = (hour) => polarToXY(cx, cy, gapLabelR, hourToAngle(hour));

    // Small visual margin between consecutive sleep segments so they
    // never visually stick together, even if they nearly touch in time.
    const SEGMENT_GAP_DEG = 1.4;
    // stroke-linecap: round makes each end stick out half a stroke-width;
    // without correction, segments would look longer than their actual
    // duration. We subtract that overshoot, together with the segment
    // gap. For very short naps this could make the arc "invert" (start
    // after end); instead of asymmetrically clamping the inset then
    // (which would make the segment look skewed relative to its actual
    // time), we show a minimal arc (in practice a small circle, thanks to
    // the round cap) centered on the middle of the actual period.
    const sleepCapInset = roundCapInsetDeg(ringR, RING_TRACK_WIDTH);
    const totalInset = SEGMENT_GAP_DEG + sleepCapInset;
    const MIN_VISIBLE_SPAN_DEG = 0.5; // generous enough for a valid arc; the round cap does the rest
    const sleepArcs = sleepSegments.map((seg) => {
      // At the track edge (clipped), the geometric starting point already
      // lies exactly on hourToAngle(0)/hourToAngle(24), precisely where
      // the track itself also starts/ends, with the same stroke-width and
      // thus the same round-cap overhang. No inset needed there: see
      // insetArcEnds' clippedAtStart/clippedAtEnd handling.
      const { a0, a1 } = insetArcEnds(seg.startAngle, seg.endAngle, totalInset, {
        clippedAtStart: seg.clippedAtStart,
        clippedAtEnd: seg.clippedAtEnd,
        minVisibleSpan: MIN_VISIBLE_SPAN_DEG,
      });
      const path = describeArc(cx, cy, ringR, a0, a1);
      return { seg, path };
    });

    let timerArcPath = null;
    let timerIconPos = null;
    if (timerSegment) {
      // Correct both ends for the round-cap overhang, so the VISIBLE arc
      // (incl. round cap) ends exactly at "now"; the icon moves along to
      // that corrected endpoint, not to the uncorrected
      // timerSegment.endAngle. maxInsetFraction clamps the inset itself
      // (rather than falling back to a minimum span) so a timer that just
      // started doesn't go "negative".
      const { a0: correctedStart, a1: correctedEnd } = insetArcEnds(
        timerSegment.startAngle,
        timerSegment.endAngle,
        roundCapInsetDeg(ringR, RING_TRACK_WIDTH),
        { maxInsetFraction: 0.4 }
      );
      timerArcPath = describeArc(cx, cy, ringR, correctedStart, correctedEnd);
      // Hourglass icon with its CENTER on the actual "now" instant (the
      // uncorrected end angle of the segment), not on the cap-corrected
      // arc endpoint, which would place the edge of the dot at now
      // instead of the center.
      const iconPos = polarToXY(cx, cy, ringR, timerSegment.endAngle);
      timerIconPos = { x: iconPos.x, y: iconPos.y };
    }

    // Dots sit at their exact time on their own ring radius. On busy
    // days, events that happen close together can slightly overlap,
    // deliberately accepted in exchange for compact, closely-spaced rings.
    const feedingDots = feedingPoints.map((p) => ({
      ...polarToXY(cx, cy, feedingR, p.angle),
      key: p.key,
      time: p.time,
      type: p.type,
      method: p.method,
    }));
    const changeDots = changePoints.map((p) => ({
      ...polarToXY(cx, cy, changeR, p.angle),
      key: p.key,
      time: p.time,
      wet: p.wet,
      solid: p.solid,
      color: p.color,
    }));

    const feedingTicks = buildHourTicks(cx, cy, feedingR, 11);
    const sleepTicks = buildHourTicks(cx, cy, ringR, 11);
    const changeTicks = buildHourTicks(cx, cy, changeR, 11);

    // "Now" marker: three separate, short tick marks (one per ring) at
    // the current time. Visually identical to the regular hour ticks
    // (same length/thickness), only the color (accent) makes the
    // difference. Only relevant on the "today" view.
    let nowMarkers = null;
    if (this._isViewingToday()) {
      const now = new Date();
      const nowAngle = dateToAngle(now, midnight);
      const markerLen = 11; // same length as buildHourTicks(..., 11)
      const makeMarker = (radius) => {
        const p1 = polarToXY(cx, cy, radius - markerLen / 2, nowAngle);
        const p2 = polarToXY(cx, cy, radius + markerLen / 2, nowAngle);
        return { x1: p1.x, y1: p1.y, x2: p2.x, y2: p2.y };
      };
      nowMarkers = [makeMarker(feedingR), makeMarker(ringR), makeMarker(changeR)];
    }

    // Converts one layer's gaps into clickable (invisible) arc paths, in
    // two categories: "merged" (in-between gaps, the click area before an
    // event belongs to that event, see _renderCenterContent) and "tail"
    // (the until-now gap after the last event, which has no following
    // event to belong to and so stays its own clickable selection).
    // Clipped to the visible part of the day, so a gap running from
    // yesterday into today only gets today's part as its angle range.
    const buildGapArcs = (gaps, radius, layer) => {
      const merged = [];
      const tail = [];
      for (const g of gaps) {
        const clippedStart = g.startTime < midnight ? midnight : g.startTime;
        const clippedEnd = g.endTime > dayEnd ? dayEnd : g.endTime;
        if (clippedEnd <= clippedStart) continue;
        const startAngle = dateToAngle(clippedStart, midnight);
        const endAngle = dateToAngle(clippedEnd, midnight);
        const isTail = g.key.endsWith("|now");
        if (endAngle - startAngle < (isTail ? 0.5 : 0.3)) continue;
        const path = describeArc(cx, cy, radius, startAngle, endAngle);
        if (isTail) {
          tail.push({ key: g.key, path });
        } else {
          const eventKey = g.key.slice(g.key.lastIndexOf("|") + 1);
          merged.push({ path, kind: layer, key: eventKey });
        }
      }
      return { merged, tail };
    };

    const sleepArcsByGap = buildGapArcs(sleepGaps, ringR, "sleep");
    const feedingArcsByGap = buildGapArcs(feedingGaps, feedingR, "feeding");
    const changeArcsByGap = buildGapArcs(changeGaps, changeR, "change");

    // Average pattern (shadow layer): same shape as real events, but
    // transparent and non-interactive, purely a visual indication of
    // "this usually happens around this time", across the whole day
    // (including the part that hasn't happened yet).
    const avgSleepArcs = averages.sleep.map((cl) => {
      // Clip to [0, 24], just like real sleep segments (see
      // _buildSleepSegments), the drawn arc must never run past the day
      // boundaries, otherwise it would shoot through the gap zone at the bottom.
      const startHour = Math.max(0, cl.mean);
      const endHour = Math.min(24, cl.mean + cl.durationHours);
      if (endHour <= startHour) return null;
      const startAngle = hourToAngle(startHour);
      const endAngle = hourToAngle(endHour);
      return describeArc(cx, cy, ringR, startAngle, endAngle);
    }).filter(Boolean);
    const avgFeedingDots = averages.feedings.map((cl) => polarToXY(cx, cy, feedingR, hourToAngle(cl.mean)));
    const avgChangeDots = averages.changes.map((cl) => polarToXY(cx, cy, changeR, hourToAngle(cl.mean)));

    this.shadowRoot.innerHTML = `
      <style>${this._css()}</style>
      <ha-card>
        <div class="header">
          <button class="nav-btn" id="prev" aria-label="previous">
            <ha-icon icon="mdi:chevron-left"></ha-icon>
          </button>
          <div class="title">
            <span>${this._titleLabel(t)}</span>
          </div>
          <button class="nav-btn" id="next" ${canGoForward ? "" : "disabled"} aria-label="next">
            <ha-icon icon="mdi:chevron-right"></ha-icon>
          </button>
        </div>

        <div class="ring-wrap">
          <svg viewBox="0 0 ${size} ${size}" class="ring-svg">
            <!-- outer ring (feedings): track + very subtle hour ticks -->
            <path d="${describeArc(cx, cy, feedingR, RING_START_DEG + 180 + HALF_GAP, RING_START_DEG + 180 - HALF_GAP + 360)}"
                  class="track track-outer" fill="none" />
            ${feedingTicks
              .map((tk) => `<line x1="${tk.x1}" y1="${tk.y1}" x2="${tk.x2}" y2="${tk.y2}" class="tick" />`)
              .join("")}

            <!-- middle ring (sleep, main ring): track + very subtle hour ticks -->
            <path d="${describeArc(cx, cy, ringR, RING_START_DEG + 180 + HALF_GAP, RING_START_DEG + 180 - HALF_GAP + 360)}"
                  class="track" fill="none" />
            ${sleepTicks
              .map((tk) => `<line x1="${tk.x1}" y1="${tk.y1}" x2="${tk.x2}" y2="${tk.y2}" class="tick" />`)
              .join("")}

            <!-- inner ring (diaper changes): track + very subtle hour ticks -->
            <path d="${describeArc(cx, cy, changeR, RING_START_DEG + 180 + HALF_GAP, RING_START_DEG + 180 - HALF_GAP + 360)}"
                  class="track track-inner" fill="none" />
            ${changeTicks
              .map((tk) => `<line x1="${tk.x1}" y1="${tk.y1}" x2="${tk.x2}" y2="${tk.y2}" class="tick" />`)
              .join("")}

            <!-- average pattern (shadow layer): purely decorative, not
                 clickable, always below the real data so an expectation
                 that came true simply "fills in" the shadow. -->
            ${avgSleepArcs.map((path) => `<path d="${path}" fill="none" class="avg-sleep-arc" />`).join("")}
            ${avgFeedingDots.map((p) => `<circle cx="${p.x}" cy="${p.y}" r="14" class="avg-dot" />`).join("")}
            ${avgChangeDots.map((p) => `<circle cx="${p.x}" cy="${p.y}" r="13" class="avg-dot" />`).join("")}

            <!-- "now" marker: drawn below the events just like the hour
                 ticks, so an event always sits on top of it on overlap.
                 Three separate tick marks, one per ring. -->
            ${
              nowMarkers
                ? nowMarkers
                    .map((m) => `<line x1="${m.x1}" y1="${m.y1}" x2="${m.x2}" y2="${m.y2}" class="now-marker" />`)
                    .join("")
                : ""
            }

            <!-- merged hit areas: the click area before an event (the gap
                 before it) now belongs to that event itself, not to a
                 separate gap detail. Bottom layer so events above always
                 take priority on overlap. -->
            ${[feedingArcsByGap, sleepArcsByGap, changeArcsByGap]
              .flatMap((layer) => layer.merged)
              .map((g) => `<path d="${g.path}" fill="none" class="gap-hit" data-kind="${g.kind}" data-key="${g.key}" />`)
              .join("")}

            <!-- gaps: invisible but clickable, bottom layer so they never
                 block a click on an event above them -->
            ${[
              ["feeding", feedingArcsByGap],
              ["sleep", sleepArcsByGap],
              ["change", changeArcsByGap],
            ]
              .flatMap(([layerName, layer]) => layer.tail.map((g) => ({ layerName, ...g })))
              .map((g) => `<path d="${g.path}" fill="none" class="gap-hit" data-kind="gap" data-key="${g.layerName}|${g.key}" />`)
              .join("")}

            <!-- sleep segments: night sleep thicker/darker, naps thinner/lighter -->
            ${sleepArcs
              .map(({ seg, path }) => {
                const isSelected = this._isSelected("sleep", seg.key);
                const classes = [
                  "sleep-arc",
                  "selectable",
                  seg.isNap ? "nap" : "night",
                  seg.running ? "running" : "",
                ]
                  .filter(Boolean)
                  .join(" ");
                // Selection indicator as a white "halo" exactly behind the
                // arc: same path/radius, just wider and drawn below it, so
                // the edge sticks out evenly all around, even at the
                // rounded ends, because it's literally the same shape.
                const outline = isSelected
                  ? `<path d="${path}" fill="none" class="selection-outline" />`
                  : "";
                return `${outline}<path d="${path}" fill="none" class="${classes}" data-kind="sleep" data-key="${seg.key}" />`;
              })
              .join("")}

            <!-- running timer: neutral segment, undecided what it'll become -->
            ${
              timerArcPath
                ? `${
                    this._isSelected("timer", "timer")
                      ? `<path d="${timerArcPath}" fill="none" class="selection-outline" />`
                      : ""
                  }<path d="${timerArcPath}" fill="none" class="timer-arc selectable" data-kind="timer" data-key="timer" />`
                : ""
            }
            ${
              timerIconPos
                ? renderDot({
                    kind: "timer",
                    key: "timer",
                    x: timerIconPos.x,
                    y: timerIconPos.y,
                    hitR: 17,
                    visR: 14,
                    icon: ICON_PATHS.timerSand,
                    isSelected: this._isSelected("timer", "timer"),
                  })
                : ""
            }

            <!-- feeding dots -->
            ${feedingDots
              .map((p) => {
                const isSelected = this._isSelected("feeding", p.key);
                return renderDot({
                  kind: "feeding",
                  key: p.key,
                  x: p.x,
                  y: p.y,
                  hitR: 17,
                  visR: 14,
                  icon: feedingIcon(p.type, p.method),
                  isSelected,
                });
              })
              .join("")}

            <!-- diaper change dots -->
            ${changeDots
              .map((p) => {
                const isSelected = this._isSelected("change", p.key);
                return renderDot({
                  kind: "change",
                  key: p.key,
                  x: p.x,
                  y: p.y,
                  hitR: 16,
                  visR: 13,
                  icon: changeIcon(p.wet, p.solid),
                  isSelected,
                  extraClass: p.solid ? "solid" : p.wet ? "wet" : "neutral",
                  fillColor: changeColor(p.solid, p.color),
                });
              })
              .join("")}
          </svg>

          <div class="center-text${this._selectedEvent ? " has-selection" : ""}" id="center-text">
            ${this._renderCenterContent(t, data, totalSleepMinutes, sleepSegments, feedingPoints, changePoints, timerSegment, { sleep: sleepGaps, feeding: feedingGaps, change: changeGaps })}
          </div>

          <!-- 00:00/23:59 gap labels: plain HTML (not SVG <text>, which
               scales its font-size down with the viewBox and reads as
               illegibly tiny), but positioned via the same polarToXY used
               for the ring itself, converted to a %-of-container offset, so
               they still visually anchor to the ring's own two loose ends
               (hourToAngle(0)/hourToAngle(24)) instead of an arbitrary
               position unrelated to the ring geometry. transform:
               translate(-50%,-50%) centers the label ON that point, same
               effect as text-anchor/dominant-baseline:middle would give an
               SVG <text>. -->
          <div class="gap-label" style="left:${(gapLabelPos(0).x / size) * 100}%; top:${(gapLabelPos(0).y / size) * 100}%;">00:00</div>
          <div class="gap-label" style="left:${(gapLabelPos(24).x / size) * 100}%; top:${(gapLabelPos(24).y / size) * 100}%;">23:59</div>
        </div>

        ${(() => {
          // Distinguish "never configured at all" (fresh card, or the card
          // picker's preview before getStubConfig finds anything to
          // suggest) from "configured, but that entity isn't found" --
          // same split cover-media-card makes between "no player
          // configured" and "player not found".
          const noneConfigured = ["sleep_entity", "feedings_entity", "changes_entity"].every(
            (field) => !this._config[field]
          );
          if (noneConfigured) {
            return `<div class="status error">${t.error_not_configured}<br>${t.error_not_configured_sub}</div>`;
          }
          const missing = data.missing.filter(Boolean);
          return missing.length > 0 ? `<div class="status error">${t.error}: ${missing.join(", ")}</div>` : "";
        })()}
      </ha-card>
    `;
  }

  _css() {
    return `
      ha-card {
        --ring-track-width: ${RING_TRACK_WIDTH}px;
        padding: 16px 16px 20px;
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 4px;
      }
      .header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        width: 100%;
        max-width: 360px;
      }
      .title {
        display: flex;
        align-items: center;
        gap: 6px;
        font-size: 1.25rem;
        font-weight: 700;
        color: var(--primary-text-color);
      }
      .nav-btn {
        background: none;
        border: none;
        padding: 6px;
        border-radius: 50%;
        cursor: pointer;
        display: flex;
        color: var(--secondary-text-color);
      }
      .nav-btn:disabled {
        opacity: 0.25;
        cursor: default;
      }
      .nav-btn ha-icon {
        --mdc-icon-size: 22px;
      }
      .nav-btn:not(:disabled):hover {
        color: var(--primary-color);
      }
      .ring-wrap {
        position: relative;
        width: 100%;
        max-width: 360px;
        aspect-ratio: 1 / 1;
        margin: 0 auto;
      }
      .ring-svg {
        width: 100%;
        height: 100%;
        overflow: visible;
      }
      .track {
        stroke: var(--divider-color, #444);
        stroke-width: var(--ring-track-width);
        stroke-linecap: round;
        opacity: 0.35;
      }
      .track-outer,
      .track-inner {
        stroke-width: var(--ring-track-width);
        stroke-linecap: round;
        opacity: 0.35;
      }
      .tick {
        stroke: var(--divider-color, #444);
        stroke-width: 1;
        stroke-linecap: round;
        opacity: 0.3;
      }
      .now-marker {
        stroke: var(--accent-color, var(--primary-color));
        stroke-width: 1;
        stroke-linecap: round;
        pointer-events: none;
      }
      .avg-sleep-arc {
        stroke: var(--primary-text-color, #fff);
        stroke-width: var(--ring-track-width);
        stroke-linecap: round;
        opacity: ${AVERAGE_OPACITY};
        pointer-events: none;
      }
      .avg-dot {
        fill: var(--primary-text-color, #fff);
        opacity: ${AVERAGE_OPACITY};
        pointer-events: none;
      }
      .gap-hit {
        stroke: transparent;
        stroke-width: var(--ring-track-width);
        cursor: pointer;
      }
      .dot-hit-area {
        fill: transparent;
        cursor: pointer;
      }
      .sleep-arc {
        stroke-linecap: round;
      }
      .selectable {
        cursor: pointer;
      }
      .selection-outline {
        stroke: var(--primary-text-color, #fff);
        stroke-width: calc(var(--ring-track-width) + 6px);
        stroke-linecap: round;
        pointer-events: none;
      }
      .feeding-dot.selected circle.dot-visible,
      .change-dot.selected circle.dot-visible,
      .timer-dot.selected circle.dot-visible {
        stroke: var(--primary-text-color, #fff);
        stroke-width: 3;
      }
      .sleep-arc.night,
      .sleep-arc.nap {
        stroke: var(--primary-color);
        stroke-width: var(--ring-track-width);
      }
      .sleep-arc.running {
        stroke: var(--accent-color, var(--primary-color));
        opacity: 0.85;
      }
      .timer-arc {
        stroke: var(--accent-color, var(--primary-color));
        stroke-width: var(--ring-track-width);
        stroke-linecap: round;
      }
      .timer-dot circle.dot-visible {
        fill: var(--accent-color, var(--primary-color));
        stroke: var(--card-background-color);
        stroke-width: 2;
      }
      .feeding-dot circle.dot-visible {
        fill: var(--success-color, #43a047);
        stroke: var(--card-background-color);
        stroke-width: 2;
      }
      .change-dot circle.dot-visible {
        stroke: var(--card-background-color);
        stroke-width: 2;
        fill: var(--info-color, #39a0ed);
      }
      .dot-icon-svg {
        fill: var(--card-background-color, #fff);
        pointer-events: none;
      }
      .center-text {
        position: absolute;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        text-align: center;
        width: 48%;
      }
      .center-text.has-selection {
        cursor: pointer;
      }
      .center-label {
        color: var(--secondary-text-color);
        font-size: 0.78rem;
      }
      .center-value {
        color: var(--primary-text-color);
        font-size: 1.65rem;
        font-weight: 800;
        line-height: 1.1;
        margin: 2px 0 6px;
      }
      .center-sub {
        color: var(--secondary-text-color);
        font-size: 0.78rem;
      }
      .gap-label {
        position: absolute;
        transform: translate(-50%, -50%);
        font-size: 0.75rem;
        color: var(--secondary-text-color);
        white-space: nowrap;
      }
      .status {
        font-size: 0.8rem;
        color: var(--secondary-text-color);
        margin-top: 8px;
      }
      .status.error {
        color: var(--error-color, #db4437);
      }
    `;
  }
}

if (!customElements.get("baby-buddy-day")) {
  customElements.define("baby-buddy-day", BabyBuddyDayRing);
}

window.customCards = window.customCards || [];
// Guarded like customElements.define above: a duplicate module load (HA
// resource cache-bust, dashboard resource re-added) would otherwise list
// this card twice in the card picker.
if (!window.customCards.some((c) => c.type === "baby-buddy-day")) {
  window.customCards.push({
    type: "baby-buddy-day",
    name: "Baby Buddy Day Card",
    description: "24-hour ring overview of sleep, feedings and diaper changes via Baby Buddy.",
    preview: true,
    documentationURL: "https://github.com/klaptafel/ha-baby-buddy-day-card",
    version: CARD_VERSION,
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Editor
// ─────────────────────────────────────────────────────────────────────────────

const FIELD_LABELS = {
  sleep_entity: "Sleep sensor",
  feedings_entity: "Feedings sensor",
  changes_entity: "Changes sensor",
  timer_entity: "Timer helper (optional)",
  average_days: "Average overlay: days (optional, 0 = off)",
};

class BabyBuddyDayCardEditor extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });
  }

  setConfig(config) {
    this._config = { ...CARD_DEFAULTS, ...config };
    if (!this._built) return;
    // Echo of our own _fire(): update the existing <ha-form>'s `.data` in
    // place instead of tearing down and rebuilding the DOM, so a field that
    // currently has focus (e.g. while the user is still typing) doesn't
    // lose it. Same underlying issue and fix as cover-media-card's editor.
    if (this._form) this._form.data = this._config;
  }

  set hass(hass) {
    this._hass = hass;
    if (this._form) this._form.hass = hass;
  }

  connectedCallback() {
    if (this._built) return;
    this._init();
  }

  // Saves config to HA and fires config-changed, stripping the average_days
  // default back out (mirrors CARD_DEFAULTS/stripDefaults in the other
  // cards in this family) so a fresh, untouched editor doesn't persist
  // average_days: 0 into saved YAML.
  _fire(config) {
    this._config = config;
    this.dispatchEvent(
      new CustomEvent("config-changed", {
        detail: { config: stripDefaults(config) },
        bubbles: true,
        composed: true,
      })
    );
  }

  _init() {
    this._built = true;
    this._tab = "sources";
    const root = this.shadowRoot;

    root.appendChild(
      Object.assign(document.createElement("style"), {
        textContent: `
      :host { display: block; }
      ha-form { display: block; }

      .editor-card {
        border: 1px solid var(--divider-color);
        border-radius: var(--ha-card-border-radius, 12px);
        overflow: hidden;
        background: var(--ha-card-background, var(--card-background-color, #fff));
      }

      .tab-bar {
        display: flex;
        border-bottom: 1px solid var(--divider-color);
      }
      .tab-btn {
        flex: 1; padding: 12px 4px; border: none; background: none;
        font-family: inherit; font-size: 13px; font-weight: 500;
        color: var(--secondary-text-color); cursor: pointer;
        border-bottom: 2px solid transparent; margin-bottom: -1px;
        transition: color .15s, border-color .15s;
      }
      .tab-btn:hover  { color: var(--primary-text-color); }
      .tab-btn.active { color: var(--primary-color); border-bottom-color: var(--primary-color); font-weight: 600; }

      .tab-content { padding: 20px 16px 16px; }

      .version-link {
        display: block; font-size: 11px; color: var(--secondary-text-color);
        text-decoration: none; text-align: center;
        padding: 10px 16px 12px;
        border-top: 1px solid var(--divider-color);
      }
      .version-link:hover { text-decoration: underline; }
    `,
      })
    );

    const card = document.createElement("div");
    card.className = "editor-card";

    const tabBar = document.createElement("div");
    tabBar.className = "tab-bar";
    [
      ["sources", "Sources"],
      ["options", "Options"],
    ].forEach(([id, label]) => {
      const btn = Object.assign(document.createElement("button"), {
        className: "tab-btn" + (id === this._tab ? " active" : ""),
        textContent: label,
      });
      btn.dataset.tab = id;
      btn.addEventListener("click", () => {
        if (this._tab === id) return;
        this._tab = id;
        tabBar.querySelectorAll(".tab-btn").forEach((b) => b.classList.toggle("active", b.dataset.tab === id));
        this._renderTab();
      });
      tabBar.appendChild(btn);
    });
    card.appendChild(tabBar);

    this._content = document.createElement("div");
    this._content.className = "tab-content";
    card.appendChild(this._content);

    card.appendChild(
      Object.assign(document.createElement("a"), {
        href: "https://github.com/klaptafel/ha-baby-buddy-day-card",
        target: "_blank",
        rel: "noopener noreferrer",
        className: "version-link",
        textContent: `Baby Buddy Day Card v${CARD_VERSION}`,
      })
    );

    root.appendChild(card);
    this._renderTab();
  }

  _renderTab() {
    this._content.innerHTML = "";
    this._form = null;

    const schema =
      this._tab === "sources"
        ? [
            { name: "sleep_entity", required: true, selector: { entity: { domain: "sensor" } } },
            { name: "feedings_entity", required: true, selector: { entity: { domain: "sensor" } } },
            { name: "changes_entity", required: true, selector: { entity: { domain: "sensor" } } },
          ]
        : [
            { name: "timer_entity", selector: { entity: { domain: "switch" } } },
            { name: "average_days", selector: { number: { min: 0, max: 30, mode: "box" } } },
          ];

    const form = document.createElement("ha-form");
    form.hass = this._hass;
    form.schema = schema;
    form.data = this._config;
    form.computeLabel = (s) => FIELD_LABELS[s.name] ?? s.name;
    form.addEventListener("value-changed", (e) => this._fire({ ...this._config, ...e.detail.value }));

    this._form = form;
    this._content.appendChild(form);
  }
}

if (!customElements.get("baby-buddy-day-editor")) {
  customElements.define("baby-buddy-day-editor", BabyBuddyDayCardEditor);
}
