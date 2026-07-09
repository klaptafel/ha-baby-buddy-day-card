/**
 * baby-buddy-day
 * Versie: 0.1.1
 * Een 24-uurs ring-overzicht (slaap / voedingen / luiers), gevoed door HA
 * REST-sensoren die de Baby Buddy API uitlezen (zie sleep_sensor.yaml als
 * voorbeeld). Geen rechtstreekse fetch vanuit de browser, dus geen CORS-issue.
 *
 * Config:
 *   type: custom:baby-buddy-day
 *   sleep_entity: sensor.x_slaap_raw
 *   feedings_entity: sensor.x_voedingen_raw
 *   changes_entity: sensor.x_luiers_raw
 *   timer_entity: switch.x_timer   # optioneel: toont een lopende timer
 *                                  # (zandloper) ongeacht waarvoor 'm straks
 *                                  # gebruikt wordt, komt uit de Baby Buddy
 *                                  # HACS-integratie (jcgoette).
 *   average_days: 7                # optioneel: toont een subtiele schaduw
 *                                  # van het gemiddelde patroon van de
 *                                  # laatste N dagen. Weglaten of 0 = uit.
 */

const CARD_VERSION = "0.1.1";
console.info(`%c baby-buddy-day %c v${CARD_VERSION} `, "color: white; background: #039be5; font-weight: 700;", "color: #039be5; background: transparent; font-weight: 700;");

// Transparantie van de "gemiddelde patroon"-schaduwlaag (zie average_days in
// de config) — pas dit aan om de schaduw meer/minder te laten opvallen.
const AVERAGE_OPACITY = 0.05;

// Moet gelijk blijven aan --ring-track-width in _css() — los gehouden omdat
// CSS-custom-properties niet rechtstreeks in JS-geometrie-berekeningen te
// gebruiken zijn (zoals de round-cap-correctie hieronder).
const RING_TRACK_WIDTH = 28;

// Pure SVG-pad-data (24x24 viewBox) voor de iconen in de stippen, in plaats
// van ha-icon + foreignObject. Reden: een bevestigde, nog open WebKit-bug
// (home-assistant/frontend#7224, WebKit Bugzilla #23113) waarbij HTML-content
// in een SVG-foreignObject niet als eigen "layer" wordt behandeld — dat geeft
// op Safari/iOS verschoven of afgeknipte iconen, los van CSS-aanpassingen.
// Pure SVG-paden (geen foreignObject, geen HTML) omzeilen die hele bug-klasse.
// Alle paden zijn de "solid" (niet-outline) variant, opgehaald van
// pictogrammers.com (officiële MDI-bron) — alleen "diaper" bestaat niet als
// solid-variant in MDI, dus die ene blijft noodgedwongen de outline-versie.
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

const STRINGS = {
  nl: {
    today: "Vandaag",
    yesterday: "Gisteren",
    morning: "Ochtend",
    night: "Nacht",
    totalSleep: "Totale slaap",
    feedings: (n) => `${n} voeding${n === 1 ? "" : "en"}`,
    totalMl: (ml) => `${ml} ml`,
    changes: (n) => `${n} verschoning${n === 1 ? "" : "en"}`,
    error: "Entity niet gevonden",
    months: [
      "jan", "feb", "mrt", "apr", "mei", "jun",
      "jul", "aug", "sep", "okt", "nov", "dec",
    ],
    weekdays: [
      "zondag", "maandag", "dinsdag", "woensdag", "donderdag", "vrijdag", "zaterdag",
    ],
    detailSleeping: () => `in bed`,
    detailUntil: (time) => `tot ${time}`,
    detailAmount: (amount, type) => ((type || "").toLowerCase().includes("solid") ? `${amount}` : `${amount} ml`),
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
    morning: "Morning",
    night: "Night",
    totalSleep: "Total sleep",
    feedings: (n) => `${n} feeding${n === 1 ? "" : "s"}`,
    totalMl: (ml) => `${ml} ml`,
    changes: (n) => `${n} change${n === 1 ? "" : "s"}`,
    error: "Entity not found",
    months: [
      "Jan", "Feb", "Mar", "Apr", "May", "Jun",
      "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
    ],
    weekdays: [
      "Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday",
    ],
    detailSleeping: () => `in bed`,
    detailUntil: (time) => `until ${time}`,
    detailAmount: (amount, type) => ((type || "").toLowerCase().includes("solid") ? `${amount}` : `${amount} ml`),
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

// ---- Geometrie: 24u-ring met gap onderaan -------------------------------
// 0:00 boven (12 uur-positie), kloksgewijs. Gap onderaan (rond 24:00/0:00 punt
// onderin) van GAP_DEGREES breed, gecentreerd op de onderkant (270°... eigenlijk
// op "6 uur"-positie in SVG-hoektermen waarbij 0° = boven).
const RING_START_DEG = -90; // 0:00 boven het midden (SVG: -90° = boven)
const TOTAL_DEG = 360;
const GAP_DEGREES = 40; // totale gatgrootte onderaan
const HALF_GAP = GAP_DEGREES / 2;

function hourToAngle(hourFloat) {
  // hourFloat: kan buiten 0..24 vallen (negatief = vóór middernacht "gisteren",
  // >24 = na middernacht "morgen"); dat is bewust toegestaan zodat een
  // doorlopende sessie over de daggrens als ÉÉN ononderbroken boog getekend
  // kan worden. De 24h-as wordt geschaald naar de beschikbare boogbreedte
  // (360° minus de gap onderaan).
  const usableDeg = TOTAL_DEG - GAP_DEGREES;
  const fraction = hourFloat / 24;
  // start net na de gap (linksonder) en eindig net voor de gap (rechtsonder)
  const startOfArc = RING_START_DEG + 180 + HALF_GAP; // linkerkant van de gap, beginpunt = onderaan + halve gap
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
  // Voorkom rendering-issues bij volledige cirkel of zeer kleine bogen
  let end = endAngle;
  if (end - startAngle >= 359.99) end = startAngle + 359.99;
  const start = polarToXY(cx, cy, r, startAngle);
  const stop = polarToXY(cx, cy, r, end);
  const largeArc = end - startAngle <= 180 ? 0 : 1;
  return `M ${start.x} ${start.y} A ${r} ${r} 0 ${largeArc} 1 ${stop.x} ${stop.y}`;
}

// Bij stroke-linecap: round steekt elk uiteinde van een lijn een halve
// stroke-width voorbij het geometrische eindpunt uit (booglengte = r * θ).
// Voor een boog op straal r met breedte strokeWidth geeft dit de hoek
// (in graden) die je aan ELK uiteinde moet inkorten zodat de VISUELE lengte
// (inclusief de ronde kap) overeenkomt met de werkelijke tijdsduur, in
// plaats van er telkens een halve kap-lengte langer uit te zien.
function roundCapInsetDeg(r, strokeWidth) {
  return (strokeWidth / 2 / r) * (180 / Math.PI);
}

// Genereert hele subtiele uur-streepjes op een gegeven straal — gebruikt
// voor de buiten- (voeding) en binnenring (luiers); de middenring (slaap)
// is dominant genoeg zonder zo'n raster.
function buildHourTicks(cx, cy, r, tickLenPx) {
  const ticks = [];
  // h=0 en h=24 overslaan: die randen zijn al duidelijk zichtbaar doordat de
  // track daar simpelweg stopt (de gap), een streepje erbovenop is overbodig.
  for (let h = 2; h < 24; h += 2) {
    const angle = hourToAngle(h);
    const inner = polarToXY(cx, cy, r - tickLenPx / 2, angle);
    const outer = polarToXY(cx, cy, r + tickLenPx / 2, angle);
    ticks.push({ x1: inner.x, y1: inner.y, x2: outer.x, y2: outer.y });
  }
  return ticks;
}
// ---- Tijd-helpers ---------------------------------------------------------

function pad(n) {
  return n.toString().padStart(2, "0");
}

// ---- Tijdzone-bewuste datum-helpers --------------------------------------
// Belangrijk: we vertrouwen NIET op de systeem-/browser-tijdzone van de
// JS-runtime (getHours, setHours, etc. gebruiken altijd die tijdzone, wat in
// kiosks/companion-apps soms UTC is in plaats van de lokale tijdzone). In
// plaats daarvan berekenen we alles expliciet in de tijdzone die Home
// Assistant zelf rapporteert (hass.config.time_zone), via Intl.DateTimeFormat
// — dat geeft consistent dezelfde uitkomst ongeacht hoe het apparaat zelf is
// geconfigureerd.

// Cache van Intl.DateTimeFormat-instanties per tijdzone (vrij duur om steeds
// opnieuw aan te maken).
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

// Geeft de kalenderdatum/tijd van `date` zoals die zou zijn in `timeZone`,
// los van de systeemtijdzone van de huidige JS-runtime.
function getZonedParts(date, timeZone) {
  const parts = _getZonedFormatter(timeZone).formatToParts(date);
  const get = (type) => parts.find((p) => p.type === type).value;
  return {
    year: parseInt(get("year"), 10),
    month: parseInt(get("month"), 10),
    day: parseInt(get("day"), 10),
    // hour12:false geeft "24" voor middernacht in sommige omgevingen; %24 normaliseert.
    hour: parseInt(get("hour"), 10) % 24,
    minute: parseInt(get("minute"), 10),
    second: parseInt(get("second"), 10),
  };
}

function dateKey(d, timeZone) {
  const p = getZonedParts(d, timeZone);
  return `${p.year}-${pad(p.month)}-${pad(p.day)}`;
}

// Middernacht (00:00:00) van de kalenderdag van `d`, in `timeZone`,
// uitgedrukt als een normaal (UTC-interne) Date-object dat naar dat exacte
// instant verwijst.
function startOfDay(d, timeZone) {
  const p = getZonedParts(d, timeZone);
  // We weten niet vooraf de UTC-offset van die tijdzone op die datum (kan
  // wisselen door zomertijd), dus benaderen we die door het verschil tussen
  // de "naive" UTC-tijd van de zoned-parts en de echte UTC-tijd van `d`.
  const naiveUtcOfD = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  // Afronden op de minuut: echte tijdzone-offsets zijn altijd een heel
  // aantal minuten, maar `d.getTime()` heeft (in tegenstelling tot de
  // seconde-precisie van getZonedParts) ook een millisecondendeel — zonder
  // afronding lekt dat ongemerkt door in het eindresultaat. Twee aanroepen
  // met d-waarden die maar een paar ms verschillen (bv. "nu" op twee
  // momenten binnen dezelfde seconde) zouden dan een verschillend
  // "middernacht"-tijdstip voor exact dezelfde kalenderdag opleveren —
  // genoeg om een aangrenzende >/<-vergelijking soms verkeerd te laten
  // uitvallen (zoals bij de dag-navigatie van gisteren naar vandaag).
  const offsetMs = Math.round((naiveUtcOfD - d.getTime()) / 60_000) * 60_000;
  // Middernacht in de zone, als "naive" UTC-waarde, gecorrigeerd met de offset.
  const naiveMidnight = Date.UTC(p.year, p.month - 1, p.day, 0, 0, 0, 0);
  return new Date(naiveMidnight - offsetMs);
}

function endOfDay(d, timeZone) {
  const start = startOfDay(d, timeZone);
  return new Date(start.getTime() + 24 * 3_600_000 - 1);
}

function hoursSinceMidnight(d, midnight) {
  return (d.getTime() - midnight.getTime()) / 3_600_000;
}

// Splitst minuten in uren+minuten, met afronding op het totaal vóór het
// splitsen — anders kan Math.round op de minuten-rest (bv. 59.6) naar 60
// afronden zonder dat het uur meetelt, wat "6u 60m" zou opleveren.
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

// Leesbare duur in woorden (bv. "2u 15m", of kortweg "2u" bij hele uren) —
// voor gebruik in lopende tekst, in tegenstelling tot formatDuration's
// compacte "2:15"-notatie die beter past op de ring zelf.
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

// Kiest een passend icoon voor een voeding op basis van de Baby Buddy
// `type`/`method`-velden (ruwe API-waarden, dus we matchen case-insensitive
// en op deelstring omdat de exacte casing kan verschillen per bron).
function feedingIcon(type, method) {
  const t = (type || "").toLowerCase();
  const m = (method || "").toLowerCase();
  if (t.includes("solid")) return ICON_PATHS.foodApple;
  if (m.includes("breast")) return ICON_PATHS.heart;
  // Formula, (fortified) breast milk via fles, self fed, parent fed, of
  // onbekend: het flesje is hier de meest neutrale, herkenbare keuze.
  return ICON_PATHS.babyBottle;
}

// Kiest een passend icoon voor een luier op basis van wet/solid. Poep
// (eventueel met plas erbij) krijgt voorrang, want dat is het meest
// betekenisvolle/afwijkende geval om in één oogopslag te herkennen.
function changeIcon(wet, solid) {
  if (solid) return ICON_PATHS.emoticonPoop;
  if (wet) return ICON_PATHS.water;
  // Geen niet-outline "diaper"-icoon beschikbaar in MDI — bewuste
  // uitzondering op de "geen outline-iconen"-regel, want er is hier
  // simpelweg geen alternatief.
  return ICON_PATHS.diaperOutline;
}

// Baby Buddy kent voor een "solid" verschoning precies 4 vaste kleurwaarden
// (zie de officiële HA-integratie-documentatie: Black, Brown, Green, Yellow).
// In plaats van die letterlijk (fel groen/geel zou op de ring schreeuwen)
// gebruiken we gedempte tinten die qua helderheid/verzadiging dicht bij
// elkaar en bij de neutrale basiskleur liggen — net genoeg onderscheid om
// te zien dat het afwijkt, zonder de rust van de ring te verstoren. Bij
// plas/neutraal (geen kleur geregistreerd) blijft het gewoon blauw.
const CHANGE_COLOR_MAP = {
  black: "#5c5752",
  brown: "#8a6f5c",
  green: "#7a8a72",
  yellow: "#a89968",
};
function changeColor(solid, color) {
  if (!solid) return "var(--info-color, #39a0ed)";
  const key = (color || "").toLowerCase();
  // Poep zonder geregistreerde kleur: bruin is de meest voorkomende/
  // verwachte kleur, een betere default dan terugvallen op het blauw van
  // een "natte" verschoning.
  return CHANGE_COLOR_MAP[key] || CHANGE_COLOR_MAP.brown;
}

// Zoekt een item op key in een lijst, met String()-vergelijking — keys komen
// uit de Baby Buddy API als getal, maar uit data-key DOM-attributen als
// string, dus dit voorkomt een stilzwijgende type-mismatch.
function findByKey(list, key) {
  return list.find((item) => String(item.key) === key);
}

// Eenvoudige 1D k-means: groepeert een lijst getallen (hier: uren-van-de-dag,
// 0-24) in k clusters. Gebruikt voor het "gemiddelde patroon": events van de
// laatste N dagen worden gepoold en geclusterd zodat bv. 6 voedingen per dag
// over meerdere dagen heen tot ~6 herkenbare clusters samenkomen, in plaats
// van een vast tijdraster te forceren. We negeren bewust de cirkelvormige
// aard van een klok (23:50 en 00:10 liggen numeriek ver uit elkaar) — voor
// baby-ritmes is dat zelden een probleem, en het houdt het algoritme simpel.
function kMeans1D(values, k, maxIterations = 25) {
  if (values.length === 0 || k <= 0) return [];
  const n = Math.min(k, values.length);
  const sorted = [...values].sort((a, b) => a - b);
  // Init: k centroids verspreid over het bereik van de data (niet puur
  // willekeurig, dat geeft stabielere/reproduceerbare clusters).
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

// Render-template voor een klikbare "stip" (voeding/luier/timer-icoon): een
// onzichtbare hit-area-cirkel, een zichtbare cirkel, en een icoon erin via
// foreignObject. extraClass mag leeg zijn (timer heeft geen wet/solid/neutral
// varianten zoals changeDots dat heeft).
//
// Icoon-positionering is bewust voorzichtig opgezet vanwege een bevestigde,
// door een HA-core-developer erkende bug (home-assistant/frontend#7224):
// een globale line-height-stijl wordt overgeërfd door de div in de
// foreignObject, waardoor de hoogte van die div verandert met zoomniveau —
// dat verschuift het icoon en knipt het op iOS soms af. We zetten daarom
// line-height EXPLICIET op 0 op de wrapper (negeert de globale stijl), en
// geven --mdc-icon-size een EXACTE pixelwaarde inline (i.p.v. een "100%" die
// door meerdere CSS-percentage-lagen heen moet resolven, wat per browser
// kan verschillen) zodat de icoon-grootte niet van toevallige
// percentage-resolutie afhangt.
// icon hier is PAD-DATA (uit ICON_PATHS), geen mdi:-naam — gerenderd als
// pure SVG (geneste <svg><path>), niet als ha-icon in een foreignObject. Dat
// omzeilt een bevestigde, nog open WebKit-bug waarbij HTML-content in een
// SVG-foreignObject niet correct als eigen layer wordt behandeld (zie
// ICON_PATHS-comment hierboven) — puur-SVG-iconen hebben dat probleem niet,
// op geen enkel platform.
function renderDot({ kind, key, x, y, hitR, visR, icon, isSelected, extraClass = "", fillColor = null }) {
  const iconSize = visR * 2 - 6; // iets kleiner dan de zichtbare cirkel
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
    // Voorlopige tijdzone tot de eerste `hass`-update (die hass.config.time_zone
    // levert) binnenkomt — dat gebeurt altijd vóór de eerste render.
    this._timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    this._viewDate = startOfDay(new Date(), this._timeZone);
    this._tickTimer = null;
    // Geselecteerd event (slaap-segment, voeding, luier of timer) waarvan de
    // details in het midden getoond worden. null = toon de dag-samenvatting.
    this._selectedEvent = null;

    // Eén gedelegeerde click-listener op shadowRoot ZELF, eenmalig gekoppeld
    // — shadowRoot wordt nooit vervangen (alleen zijn innerHTML, bij elke
    // render). Een listener die telkens opnieuw aan een vers element wordt
    // gekoppeld (zoals voorheen) kan een klik missen als er een render
    // tussen het begin en eind van een tik/klik plaatsvindt (bv. door een
    // sensor-update of de 30s-tick), omdat het element waar de gebruiker op
    // tikte dan al vervangen kan zijn. Delegatie op een nooit-vervangen
    // voorouder is daar immuun voor: de klik bubbelt altijd omhoog naar
    // shadowRoot, hoe vaak er ook net gerenderd is.
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

  setConfig(config) {
    const required = ["sleep_entity", "feedings_entity", "changes_entity"];
    for (const field of required) {
      if (!config[field]) {
        throw new Error(`baby-buddy-day: ${field} is verplicht in de config`);
      }
    }
    this._config = config;
  }

  set hass(hass) {
    const firstRun = !this._hass;
    // Alleen de states van de drie entiteiten die deze kaart daadwerkelijk
    // gebruikt zijn relevant. HA geeft de volledige hass-tree continu door
    // aan alle kaarten, ook bij wijzigingen die niets met deze kaart te
    // maken hebben — zonder deze check zou _render() (en daarmee een volledige
    // DOM-vervanging, inclusief de prev/next-knoppen en alle klik-listeners)
    // tientallen keren per minuut draaien, wat een klik soms laat samenvallen
    // met een DOM-vervanging en dus "verdwijnen".
    const relevantIds = [this._config && this._config.sleep_entity, this._config && this._config.feedings_entity, this._config && this._config.changes_entity, this._config && this._config.timer_entity].filter(Boolean);
    const relevantChanged =
      firstRun ||
      !this._hass ||
      relevantIds.some((id) => hass.states[id] !== this._hass.states[id]) ||
      hass.language !== this._hass.language ||
      (hass.config && hass.config.time_zone) !== (this._hass.config && this._hass.config.time_zone);

    this._hass = hass;
    this._lang = (hass.language || "en").startsWith("nl") ? "nl" : "en";
    // HA's eigen, geconfigureerde tijdzone — niet de tijdzone van de browser/
    // het apparaat waarop deze kaart toevallig draait (die kan afwijken, bv.
    // bij een kiosk of companion-app die op UTC staat). Fallback op de
    // systeemtijdzone alleen als hass.config onverwacht ontbreekt.
    this._timeZone =
      (hass.config && hass.config.time_zone) ||
      Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (firstRun) {
      // _viewDate werd in de constructor berekend met een voorlopige
      // (browser-)tijdzone, vóór we hass.config.time_zone kenden — nu die
      // bekend is, herberekenen we "vandaag" met de juiste tijdzone.
      this._viewDate = startOfDay(new Date(), this._timeZone);
      // Korte tick voor live-tellende lopende slaap en voor het geval er
      // even geen hass-update binnenkomt (puur re-render, geen netwerk).
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

  _hasLiveActivity() {
    const data = this._getDayData();
    return data.sleep.some((s) => !s.end) || !!data.timer;
  }

  // ---- Data uit hass.states lezen ---------------------------------------

  _readEntityResults(entityId) {
    if (!entityId) return [];
    const state = this._hass.states[entityId];
    if (!state || state.state === "unavailable" || state.state === "unknown") {
      // Entity bestaat niet, of de REST-sensor heeft (nog) geen geldige data
      // (bv. tijdens HA-opstart of als Baby Buddy net niet reageerde).
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
    // sleepRangeStart: 12:00 lokaal de dag vóór de bekeken dag — brede marge
    // alleen voor SLAAP, zodat een sessie die de avond ervoor begon en 's
    // ochtends doorloopt volledig wordt meegenomen. Feedings/changes zijn
    // puntmomenten zonder dat probleem; voor die lagen filteren we strikt op
    // de eigen kalenderdag (anders lekken events van de avond ervoor door).
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

    const inSleepRange = (start, end) => {
      const s = new Date(start);
      const e = end ? new Date(end) : new Date();
      return e >= sleepRangeStart && s <= rangeEnd;
    };
    const inRange = (start, end) => {
      const s = new Date(start);
      const e = end ? new Date(end) : new Date();
      return e >= rangeStart && s <= rangeEnd;
    };

    const sleep = (sleepRaw || [])
      .filter((s) => inSleepRange(s.start, s.end))
      .map((s) => ({
        key: s.id,
        start: new Date(s.start),
        end: s.end ? new Date(s.end) : null,
        nap: !!s.nap,
      }));

    const feedings = (feedingsRaw || [])
      .filter((f) => inRange(f.start, f.end || f.start))
      .map((f) => ({
        key: f.id,
        time: new Date(f.start),
        type: f.type || null,
        method: f.method || null,
        amount: typeof f.amount === "number" ? f.amount : null,
      }));

    const changes = (changesRaw || [])
      .filter((c) => inRange(c.time, c.time))
      .map((c) => ({
        key: c.id,
        time: new Date(c.time),
        wet: !!c.wet,
        solid: !!c.solid,
        color: c.color || null,
      }));

    // Lopende timer: alleen relevant als die ook in het huidige tijdvenster
    // valt (anders zou een timer die al dagen loopt op elke dag verschijnen),
    // én alleen als er nog geen lopende sleep-sessie is — die heeft voorrang
    // zodat er nooit twee "lopende" bogen over elkaar getekend worden.
    const hasRunningSleep = sleep.some((s) => !s.end);
    const timerRaw = this._readTimer();
    const timer = !hasRunningSleep && timerRaw && inRange(timerRaw.start, null) ? timerRaw : null;

    // Voor de gap-berekening (tijd tussen events) is het eerste zichtbare
    // event van de dag pas een "echte" gap als we ook het allerlaatste event
    // vóór de zichtbare range kennen — dat ligt per definitie buiten
    // rangeStart, dus we zoeken het op in de ruwe (ongefilterde) data.
    const latestBefore = (raw, getEnd, getStart, beforeTime) => {
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
      (s) => new Date(s.start),
      sleepRangeStart
    );
    const prevFeeding = latestBefore(
      feedingsRaw,
      (f) => new Date(f.start),
      (f) => new Date(f.start),
      rangeStart
    );
    const prevChange = latestBefore(
      changesRaw,
      (c) => new Date(c.time),
      (c) => new Date(c.time),
      rangeStart
    );

    return { sleep, feedings, changes, timer, missing, prevSleep, prevFeeding, prevChange, sleepRaw, feedingsRaw, changesRaw };
  }

  // ---- Navigatie --------------------------------------------------------

  _changeDay(delta) {
    const tz = this._timeZone;
    // _viewDate is altijd al middernacht (in HA's tijdzone); een dag verder/
    // terug is dus simpelweg ±24u in milliseconden, opnieuw genormaliseerd
    // naar middernacht om eventuele DST-sprongen (23u of 25u dagen) correct
    // op te vangen.
    const shifted = new Date(this._viewDate.getTime() + delta * 24 * 3_600_000);
    const next = startOfDay(shifted, tz);
    // Geen toekomst tonen
    if (next > startOfDay(new Date(), tz)) return;
    this._viewDate = next;
    this._selectedEvent = null;
    this._render();
  }

  // ---- Selectie (tap-to-reveal) -------------------------------------------

  _selectEvent(eventData) {
    // Nogmaals tikken op exact dezelfde selectie (of op het midden zelf)
    // keert terug naar de samenvatting.
    const isSame =
      this._selectedEvent &&
      eventData &&
      this._selectedEvent.kind === eventData.kind &&
      this._selectedEvent.key === eventData.key;
    this._selectedEvent = isSame ? null : eventData;
    this._render();
  }

  // Of een gegeven (kind, key)-combinatie momenteel geselecteerd is — key
  // mag een getal zijn (komt rechtstreeks uit de API-data), data-key-
  // attributen in de DOM zijn altijd strings, dus we vergelijken als string.
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
      // getUTCDay() op _viewDate zelf is hier NIET veilig: _viewDate is
      // middernacht in tz, maar dat tijdstip kan intern al op de vorige
      // UTC-kalenderdag liggen (bv. 00:00 Amsterdam-zomertijd = 22:00 UTC
      // de dag ervoor), wat een verkeerde weekdag-index zou geven. We
      // leiden de weekdag daarom af van de WEEKDAG VAN VANDAAG (die we al
      // los kunnen bepalen) minus daysAgo, modulo 7.
      const todayWeekday = getZonedParts(new Date(), tz);
      const todayDow = new Date(Date.UTC(todayWeekday.year, todayWeekday.month - 1, todayWeekday.day)).getUTCDay();
      const dow = ((todayDow - daysAgo) % 7 + 7) % 7;
      return `${t.weekdays[dow]} ${p.day} ${t.months[p.month - 1]}`;
    }
    const thisYear = getZonedParts(today, tz).year;
    const yearSuffix = p.year !== thisYear ? ` ${p.year}` : "";
    return `${p.day} ${t.months[p.month - 1]}${yearSuffix}`;
  }

  // Zoekt de gap die direct vóór een gegeven event ligt (de gap-key eindigt
  // altijd op "|<eventKey>" — zie _buildGaps). Geeft null als er geen
  // voorafgaand event bekend is (bv. echt het eerste event ooit).
  _findGapBefore(gapList, eventKey) {
    return gapList.find((g) => g.key.endsWith(`|${eventKey}`)) || null;
  }

  _renderCenterContent(t, data, totalSleepMinutes, sleepSegments, feedingPoints, changePoints, timerSegment, allGaps) {
    const tz = this._timeZone;
    const sel = this._selectedEvent;
    if (!sel) {
      const totalMl = data.feedings.reduce((sum, f) => sum + (f.amount || 0), 0);
      const hasMl = data.feedings.some((f) => f.amount != null);
      const feedingLine = hasMl ? t.totalMl(totalMl) : t.feedings(data.feedings.length);
      return `
        <div class="center-label">${t.totalSleep}</div>
        <div class="center-value">${formatTotalSleep(totalSleepMinutes, this._lang)}</div>
        <div class="center-sub">${feedingLine}</div>
      `;
    }

    if (sel.kind === "sleep") {
      const seg = findByKey(sleepSegments, sel.key);
      if (!seg) return "";
      const gap = this._findGapBefore(allGaps.sleep, sel.key);
      const startStr = formatTimeOfDay(seg.realStart, tz);
      // Werkelijke duur op basis van de echte start/eind, niet seg.minutes
      // (die is geclipt op middernacht en toont dan alleen het vandaag-deel).
      const realMinutes = seg.realEnd
        ? (seg.realEnd.getTime() - seg.realStart.getTime()) / 60000
        : seg.minutes;
      const durationWords = formatDurationWords(realMinutes, this._lang);
      if (seg.realEnd) {
        const endStr = formatTimeOfDay(seg.realEnd, tz);
        const labelLine = gap ? t.detailSincePrevious(formatDurationWords(gap.minutes, this._lang)) : "&nbsp;";
        return `
          <div class="center-label">${labelLine}</div>
          <div class="center-value">${startStr} - ${endStr}</div>
          <div class="center-sub">${t.detailSleptDuration(durationWords)}</div>
        `;
      }
      return `
        <div class="center-label">${t.detailFrom(startStr)}</div>
        <div class="center-value">${durationWords}</div>
        <div class="center-sub">${t.detailSleeping()}</div>
      `;
    }

    if (sel.kind === "feeding") {
      const f = findByKey(feedingPoints, sel.key);
      if (!f) return "";
      const gap = this._findGapBefore(allGaps.feeding, sel.key);
      const timeStr = formatTimeOfDay(f.time, tz);
      const timeLine = gap ? t.timeWithGap(timeStr, formatDuration(gap.minutes)) : timeStr;
      const typeLabel = t.feedingTypeLabel(f.type, f.method);
      // Hoofdwaarde: hoeveelheid als die geregistreerd is (eenheid hangt af
      // van het type — Baby Buddy kent geen vaste eenheid per record, dus we
      // tonen "ml" alleen bij vloeibare voeding, niet bij vast voedsel).
      // Type/methode staat altijd in de tekst, niet alleen als fallback —
      // het hartje-icoon voor borstvoeding is anders niet voor iedereen
      // duidelijk, en losse iconen zijn geen vervanging voor leesbare tekst.
      const mainValue = f.amount != null ? t.detailAmount(f.amount, f.type) : typeLabel;
      const subValue = f.amount != null ? typeLabel : null;
      return `
        <div class="center-label">${timeLine}</div>
        <div class="center-value">${mainValue}</div>
        ${subValue ? `<div class="center-sub">${subValue}</div>` : ""}
      `;
    }

    if (sel.kind === "change") {
      const c = findByKey(changePoints, sel.key);
      if (!c) return "";
      const gap = this._findGapBefore(allGaps.change, sel.key);
      const timeStr = formatTimeOfDay(c.time, tz);
      const timeLine = gap ? t.timeWithGap(timeStr, formatDuration(gap.minutes)) : timeStr;
      const typeLabel = c.wet && c.solid ? t.detailBoth : c.solid ? t.detailSolid : t.detailWet;
      return `
        <div class="center-label">${timeLine}</div>
        <div class="center-value">${typeLabel}</div>
        ${c.color ? `<div class="center-sub">${c.color}</div>` : ""}
      `;
    }

    if (sel.kind === "timer" && timerSegment) {
      const startStr = formatTimeOfDay(timerSegment.realStart, tz);
      const durationWords = formatDurationWords(timerSegment.minutes, this._lang);
      return `
        <div class="center-label">${t.detailFrom(startStr)}</div>
        <div class="center-value">${durationWords}</div>
        <div class="center-sub">${t.detailTimerRunning()}</div>
      `;
    }

    if (sel.kind === "gap") {
      // sel.key heeft de vorm "laag|restkey" (bv. "feeding|prev|123"); de
      // laag bepaalt welke gap-lijst we doorzoeken, de rest is de unieke key
      // binnen die lijst.
      const sepIdx = sel.key.indexOf("|");
      const layer = sel.key.slice(0, sepIdx);
      const restKey = sel.key.slice(sepIdx + 1);
      const list = allGaps[layer] || [];
      const gap = list.find((g) => g.key === restKey);
      if (!gap) return "";
      const durationStr = formatDurationWords(gap.minutes, this._lang);
      const lastTimeStr = formatTimeOfDay(gap.startTime, tz);
      // Per laag een eigen, herkenbare zin in plaats van een generieke
      // "X geleden" — bij slaap is dit concreet de wektijd ("wakker"), bij
      // voeding/luier specifiek welk type event het laatst gebeurde.
      const subLine =
        layer === "sleep"
          ? t.detailAwake(lastTimeStr)
          : layer === "feeding"
          ? t.detailSinceLastFeeding(lastTimeStr)
          : t.detailSinceLastChange(lastTimeStr);
      return `
        <div class="center-label">&nbsp;</div>
        <div class="center-value">${durationStr}</div>
        <div class="center-sub">${subLine}</div>
      `;
    }

    return "";
  }

  _buildSleepSegments(sleepEvents, midnight, timeZone) {
    const segments = [];
    const now = new Date();
    const dayEnd = endOfDay(midnight, timeZone);

    for (const s of sleepEvents) {
      const rawEnd = s.end || now;
      // Alleen tonen als de sessie ook echt op "vandaag" uitkomt of nog loopt.
      if (rawEnd < midnight) continue;
      // Het GETEKENDE segment start nooit vóór middernacht van de bekeken
      // dag (hoek 110°, exact waar de track ook begint) — een nachtslaap die
      // gisteravond begon, toont op de ring dus alleen het "vandaag"-deel.
      // De werkelijke starttijd (eventueel vóór middernacht) blijft bewaard
      // in realStart, voor het detailpaneel.
      const segStart = s.start < midnight ? midnight : s.start;
      const segEnd = rawEnd > dayEnd ? dayEnd : rawEnd;
      if (segEnd <= segStart) continue;

      const startHour = hoursSinceMidnight(segStart, midnight);
      const endHour = hoursSinceMidnight(segEnd, midnight);
      const minutes = (segEnd.getTime() - segStart.getTime()) / 60000;
      const running = !s.end;

      segments.push({
        key: s.key,
        startAngle: hourToAngle(startHour),
        endAngle: hourToAngle(endHour),
        label: formatDuration(minutes),
        minutes,
        running,
        isNap: !!s.nap,
        // Of dit uiteinde samenvalt met de track-rand zelf (geclipt) — zo
        // ja, dan is daar geen segment-tussenruimte nodig, alleen de
        // kap-correctie (zie sleepArcs-opbouw in _render).
        clippedAtStart: s.start < midnight,
        clippedAtEnd: rawEnd > dayEnd,
        // Ongeclipte, echte tijden (voor het detailpaneel — segStart/segEnd
        // zijn geclipt op de daggrens en dus niet altijd de werkelijke tijd).
        realStart: s.start,
        realEnd: s.end,
      });
    }
    return segments;
  }

  // Berekent het "gemiddelde patroon" van de laatste N volledige dagen (dus
  // exclusief vandaag, dat nog niet compleet is): voor elke laag wordt het
  // gemiddeld aantal events per dag bepaald, en de gepoolde tijdstippen van
  // die dagen worden naar dat aantal clusters geclusterd (kMeans1D) — dat
  // geeft bv. bij gemiddeld 6 voedingen/dag zes herkenbare "rond welk
  // tijdstip gebeurt dit meestal"-groepen, in plaats van een vast tijdraster.
  // sleepRaw/feedingsRaw/changesRaw zijn de ONGEFILTERDE arrays van de
  // REST-sensor (dezelfde brondata als _getDayData gebruikt).
  // Voegt clusters samen die te dicht bij elkaar liggen (puntmomenten) of
  // elkaar overlappen (bogen met een duur) — anders kunnen twee bijna-
  // gelijktijdige clusters als zichtbaar opeengestapelde transparantie
  // ogen, wat een onbedoeld "donkerder plekje" geeft in plaats van rustig
  // één enkel patroon te tonen.
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
        // Gewogen gemiddelde (op punt-aantal) samenvoegen tot één cluster;
        // bij bogen de duur zo kiezen dat hij het verst reikende uiteinde
        // van beide nog steeds dekt.
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

    const viewMidnight = startOfDay(viewDate, tz);
    const rangeStart = new Date(viewMidnight.getTime() - averageDays * 24 * 3_600_000);
    // Tot (exclusief) vandaag — alleen volledig afgesloten dagen meetellen,
    // anders trekt een nog-incomplete "vandaag" het gemiddelde scheef.
    const rangeEnd = viewMidnight;

    // Groepeert tijdstippen per kalenderdag (in tz) en geeft { hoursByDay,
    // totalCount } terug — nodig om het gemiddeld-aantal-per-dag te bepalen
    // zonder dagen zonder enig event te laten meewegen als "0 erbij".
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

    // Minimale tussenruimte tussen twee stippen-clusters: vergelijkbaar met
    // de visuele diameter van een stip op de ring, in uren omgerekend.
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

    // Slaap: clusteren op START-tijd van elke sessie, en per cluster ook de
    // gemiddelde duur bijhouden zodat we een boog (start tot start+duur)
    // kunnen tonen, niet alleen een punt.
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
      // Koppel elke sessie terug aan zijn cluster via index (niet via
      // waarde-matching, dat zou bij toevallig identieke uur-waarden tussen
      // sessies verkeerd kunnen groeperen) om de gemiddelde duur per cluster
      // te berekenen.
      const rawSleepClusters = hourClusters.map((cl) => {
        const matching = cl.indices.map((i) => allSleep[i]);
        const avgDuration = matching.reduce((sum, s) => sum + s.durationH, 0) / matching.length;
        return { mean: cl.mean, durationHours: avgDuration, count: matching.length };
      });
      // Bogen mogen, anders dan stippen, elkaar net raken zonder samengevoegd
      // te worden — pas bij echte overlap (gap < 0) voegen we samen.
      sleepClusters = this._mergeCloseClusters(rawSleepClusters, 0);
    }

    return {
      sleep: sleepClusters,
      feedings: feedingClusters.map((cl) => ({ mean: cl.mean })),
      changes: changeClusters.map((cl) => ({ mean: cl.mean })),
    };
  }

  // Berekent de "gaps" (tussenpozen) tussen opeenvolgende events op één laag.
  // events: array van { key, start, end } — voor puntmomenten (voeding/
  // luier) is start === end. prevEvent: het laatst-voorafgaande event vóór
  // de zichtbare range (kan null zijn als er echt niets bekend is). Retourneert
  // array van { key, startTime, endTime, minutes } voor elke tussenpoos,
  // inclusief de laatste-tot-nu als dat van toepassing is (alleen op "vandaag").
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

    // Laatste gap: van het laatste event tot nu, maar alleen op "vandaag" —
    // op afgesloten dagen heeft "tot nu" geen betekenis.
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

    // Gemiddelde-patroon van de laatste N dagen — alleen op "vandaag" tonen
    // (op historische dagen is "het gemiddelde van de laatste N dagen vóór
    // díe dag" verwarrend en weinig nuttig).
    const averages = this._isViewingToday()
      ? this._buildAverages(data.sleepRaw, data.feedingsRaw, data.changesRaw, this._viewDate, tz, this._config.average_days)
      : { sleep: [], feedings: [], changes: [] };

    const midnight = startOfDay(this._viewDate, tz);
    const dayEnd = endOfDay(midnight, tz);
    const totalSleepMinutes = data.sleep.reduce((sum, s) => {
      const segStart = s.start < midnight ? midnight : s.start;
      const rawEnd = s.end || new Date();
      const segEnd = rawEnd > dayEnd ? dayEnd : rawEnd;
      if (segEnd <= segStart) return sum;
      return sum + (segEnd.getTime() - segStart.getTime()) / 60000;
    }, 0);

    const sleepSegments = this._buildSleepSegments(data.sleep, midnight, tz);

    // Gaps tussen opeenvolgende events, per laag — klikbaar maar onzichtbaar,
    // toont in het midden hoeveel tijd ertussen zat.
    const sleepGapEvents = data.sleep.map((s) => ({ key: s.key, start: s.start, end: s.end || new Date() }));
    const sleepGaps = this._buildGaps(sleepGapEvents, data.prevSleep, dayEnd);
    const feedingGapEvents = data.feedings.map((f) => ({ key: f.key, start: f.time, end: f.time }));
    const feedingGaps = this._buildGaps(feedingGapEvents, data.prevFeeding, dayEnd);
    const changeGapEvents = data.changes.map((c) => ({ key: c.key, start: c.time, end: c.time }));
    const changeGaps = this._buildGaps(changeGapEvents, data.prevChange, dayEnd);

    // Lopende timer (ongeacht waarvoor 'm straks gebruikt wordt) als los,
    // neutraal segment: van timer-start tot nu.
    let timerSegment = null;
    if (data.timer) {
      const segStart = data.timer.start < midnight ? midnight : data.timer.start;
      const now = new Date();
      const segEnd = now > dayEnd ? dayEnd : now;
      if (segEnd > segStart) {
        const startHour = hoursSinceMidnight(segStart, midnight);
        const endHour = hoursSinceMidnight(segEnd, midnight);
        // Duur-label gebruikt de WERKELIJKE timer-start (kan vóór middernacht
        // liggen), niet de geclipte segStart die alleen voor de ring-boog
        // dient — anders toont het label een te korte duur als de timer al
        // gisteren begon.
        const realMinutes = (now.getTime() - data.timer.start.getTime()) / 60000;
        timerSegment = {
          key: "timer",
          startAngle: hourToAngle(startHour),
          endAngle: hourToAngle(endHour),
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
      angle: hourToAngle(hoursSinceMidnight(f.time, midnight)),
    }));

    const changePoints = data.changes.map((c) => ({
      key: c.key,
      time: c.time,
      angle: hourToAngle(hoursSinceMidnight(c.time, midnight)),
      wet: c.wet,
      solid: c.solid,
      color: c.color,
    }));

    const isToday = this._isViewingToday();
    const canGoForward = !isToday;

    const size = 442;
    const cx = size / 2;
    const cy = size / 2;
    // Drie concentrische ringen: voedingen buiten, slaap in het midden,
    // luiers binnen. Ringen liggen vlak tegen elkaar aan (minimale marge) en
    // zijn dikker zodat de iconen op de stippen groter en duidelijker zijn.
    // Details staan niet meer permanent op de ring — tap op een segment/stip
    // toont ze in het midden.
    const feedingR = 191;
    const ringR = 159; // slaap (hoofdring, behoudt zijn naam voor de rest van de code)
    const changeR = 127;

    // Kleine visuele marge tussen opeenvolgende slaapsegmenten zodat ze nooit
    // optisch aan elkaar plakken, ook al raken ze elkaar qua tijd nagenoeg.
    const SEGMENT_GAP_DEG = 1.4;
    // stroke-linecap: round laat elk uiteinde een halve stroke-width
    // uitsteken — zonder correctie ogen segmenten dus langer dan hun
    // stroke-linecap: round laat elk uiteinde een halve stroke-width
    // uitsteken — zonder correctie ogen segmenten dus langer dan hun
    // werkelijke duur. We trekken die overschrijding er af, samen met de
    // segment-gap. Bij heel korte dutjes zou dat de boog laten "omkeren"
    // (start na eind); in plaats van de inset dan asymmetrisch te clampen
    // (wat het segment scheef t.o.v. zijn werkelijke tijd zou laten ogen),
    // tonen we een minimale boog (in de praktijk een rondje, dankzij de
    // ronde kap) gecentreerd op het midden van de werkelijke periode.
    const sleepCapInset = roundCapInsetDeg(ringR, RING_TRACK_WIDTH);
    const totalInset = SEGMENT_GAP_DEG + sleepCapInset;
    const MIN_VISIBLE_SPAN_DEG = 0.5; // ruim genoeg voor een geldige boog; de ronde kap doet de rest
    const sleepArcs = sleepSegments.map((seg) => {
      // Bij de track-rand (clipped) ligt het geometrische startpunt al
      // exact op hourToAngle(0)/hourToAngle(24) — precies waar de track
      // zelf ook begint/eindigt, met dezelfde stroke-width en dus dezelfde
      // ronde-kap-uitsteek. Geen inset nodig: anders trekt de boog zich
      // onnodig terug t.o.v. de track, met een zichtbaar gat als gevolg.
      const startInset = seg.clippedAtStart ? 0 : totalInset;
      const endInset = seg.clippedAtEnd ? 0 : totalInset;
      const span = seg.endAngle - seg.startAngle;
      let a0, a1;
      if (span - startInset - endInset >= MIN_VISIBLE_SPAN_DEG) {
        a0 = seg.startAngle + startInset;
        a1 = seg.endAngle - endInset;
      } else {
        const mid = (seg.startAngle + seg.endAngle) / 2;
        a0 = mid - MIN_VISIBLE_SPAN_DEG / 2;
        a1 = mid + MIN_VISIBLE_SPAN_DEG / 2;
      }
      const path = describeArc(cx, cy, ringR, a0, a1);
      return { seg, path };
    });

    let timerArcPath = null;
    let timerIconPos = null;
    if (timerSegment) {
      // Beide uiteinden corrigeren voor de round-cap-overschrijding, zodat
      // de ZICHTBARE boog (incl. ronde kap) precies bij "nu" eindigt — het
      // icoon verschuift mee naar dat gecorrigeerde eindpunt, niet naar het
      // ongecorrigeerde timerSegment.endAngle. Geclampt zodat een net-
      // begonnen timer niet "negatief" wordt.
      const timerSpan = timerSegment.endAngle - timerSegment.startAngle;
      const timerCapInset = Math.min(roundCapInsetDeg(ringR, RING_TRACK_WIDTH), timerSpan * 0.4);
      const correctedStart = timerSegment.startAngle + timerCapInset;
      const correctedEnd = timerSegment.endAngle - timerCapInset;
      timerArcPath = describeArc(cx, cy, ringR, correctedStart, correctedEnd);
      // Zandloper-icoon met zijn MIDDELPUNT op het echte "nu"-tijdstip (de
      // ongecorrigeerde eindhoek van het segment) — niet op het
      // kap-gecorrigeerde boog-eindpunt, dat zou de rand van de stip op nu
      // leggen in plaats van het midden.
      const iconPos = polarToXY(cx, cy, ringR, timerSegment.endAngle);
      timerIconPos = { x: iconPos.x, y: iconPos.y };
    }

    // Stippen staan op hun exacte tijdstip op de eigen ring-straal. Bij
    // drukke dagen kunnen events die vlak na elkaar gebeuren elkaar licht
    // overlappen — bewust geaccepteerd in ruil voor compacte, dicht-tegen-
    // elkaar-liggende ringen.
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

    // "Nu"-marker: drie losse, korte streepjes — één per ring — op het
    // huidige tijdstip. Visueel identiek aan de gewone uur-ticks (zelfde
    // lengte/dikte), alleen de kleur (accent) maakt het verschil. Alleen
    // relevant op de "vandaag"-weergave.
    let nowMarkers = null;
    if (this._isViewingToday()) {
      const now = new Date();
      const nowAngle = hourToAngle(hoursSinceMidnight(now, midnight));
      const markerLen = 11; // zelfde lengte als buildHourTicks(..., 11)
      const makeMarker = (radius) => {
        const p1 = polarToXY(cx, cy, radius - markerLen / 2, nowAngle);
        const p2 = polarToXY(cx, cy, radius + markerLen / 2, nowAngle);
        return { x1: p1.x, y1: p1.y, x2: p2.x, y2: p2.y };
      };
      nowMarkers = [makeMarker(feedingR), makeMarker(ringR), makeMarker(changeR)];
    }

    // Zet de gaps van één laag om in klikbare (onzichtbare) arc-paden, in
    // twee categorieën: "merged" (tussenliggende gaps — het klikgebied
    // vóór een event hoort bij dat event, zie _renderCenterContent) en
    // "tail" (de tot-nu-gap na het laatste event, die geen volgend event
    // heeft om bij te horen en dus een eigen klikbare selectie blijft).
    // Geclipt op het zichtbare deel van de dag, zodat een gap die van
    // gisteren tot vandaag loopt alleen het vandaag-stuk als hoek-bereik krijgt.
    const buildGapArcs = (gaps, radius, layer) => {
      const merged = [];
      const tail = [];
      for (const g of gaps) {
        const clippedStart = g.startTime < midnight ? midnight : g.startTime;
        const clippedEnd = g.endTime > dayEnd ? dayEnd : g.endTime;
        if (clippedEnd <= clippedStart) continue;
        const startAngle = hourToAngle(hoursSinceMidnight(clippedStart, midnight));
        const endAngle = hourToAngle(hoursSinceMidnight(clippedEnd, midnight));
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

    // Gemiddelde-patroon (schaduwlaag): zelfde vorm als echte events, maar
    // transparant en niet-interactief — puur een visuele indicatie van
    // "hier gebeurt dit meestal rond dit tijdstip", over de hele dag heen
    // (ook voor het deel dat nog moet komen).
    const avgSleepArcs = averages.sleep.map((cl) => {
      // Clip op [0, 24] — net als bij echte slaap-segmenten (zie
      // _buildSleepSegments) mag de getekende boog nooit voorbij de
      // daggrenzen lopen, anders schiet hij door de gap-zone onderaan.
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
            <!-- buitenring (voedingen): track + heel subtiele uur-streepjes -->
            <path d="${describeArc(cx, cy, feedingR, RING_START_DEG + 180 + HALF_GAP, RING_START_DEG + 180 - HALF_GAP + 360)}"
                  class="track track-outer" fill="none" />
            ${feedingTicks
              .map((tk) => `<line x1="${tk.x1}" y1="${tk.y1}" x2="${tk.x2}" y2="${tk.y2}" class="tick" />`)
              .join("")}

            <!-- middenring (slaap, hoofdring): track + heel subtiele uur-streepjes -->
            <path d="${describeArc(cx, cy, ringR, RING_START_DEG + 180 + HALF_GAP, RING_START_DEG + 180 - HALF_GAP + 360)}"
                  class="track" fill="none" />
            ${sleepTicks
              .map((tk) => `<line x1="${tk.x1}" y1="${tk.y1}" x2="${tk.x2}" y2="${tk.y2}" class="tick" />`)
              .join("")}

            <!-- binnenring (luiers): track + heel subtiele uur-streepjes -->
            <path d="${describeArc(cx, cy, changeR, RING_START_DEG + 180 + HALF_GAP, RING_START_DEG + 180 - HALF_GAP + 360)}"
                  class="track track-inner" fill="none" />
            ${changeTicks
              .map((tk) => `<line x1="${tk.x1}" y1="${tk.y1}" x2="${tk.x2}" y2="${tk.y2}" class="tick" />`)
              .join("")}

            <!-- gemiddelde patroon (schaduwlaag): puur decoratief, niet
                 klikbaar, altijd onder de echte data zodat een uitgekomen
                 verwachting de schaduw simpelweg "opvult". -->
            ${avgSleepArcs.map((path) => `<path d="${path}" fill="none" class="avg-sleep-arc" />`).join("")}
            ${avgFeedingDots.map((p) => `<circle cx="${p.x}" cy="${p.y}" r="14" class="avg-dot" />`).join("")}
            ${avgChangeDots.map((p) => `<circle cx="${p.x}" cy="${p.y}" r="13" class="avg-dot" />`).join("")}

            <!-- "nu"-marker: net als de uur-ticks onder de events getekend,
                 zodat een event er altijd overheen valt bij overlap. Drie
                 losse streepjes, één per ring. -->
            ${
              nowMarkers
                ? nowMarkers
                    .map((m) => `<line x1="${m.x1}" y1="${m.y1}" x2="${m.x2}" y2="${m.y2}" class="now-marker" />`)
                    .join("")
                : ""
            }

            <!-- merged hit-areas: het klikgebied vóór een event (de gap
                 ervoor) hoort nu bij dat event zelf, niet bij een los
                 gap-detail. Onderste laag zodat events erboven altijd
                 voorrang krijgen bij overlap. -->
            ${[feedingArcsByGap, sleepArcsByGap, changeArcsByGap]
              .flatMap((layer) => layer.merged)
              .map((g) => `<path d="${g.path}" fill="none" class="gap-hit" data-kind="${g.kind}" data-key="${g.key}" />`)
              .join("")}

            <!-- gaps (tussenpozen): onzichtbaar maar klikbaar, onderste laag
                 zodat ze nooit de klik op een event erboven blokkeren -->
            ${[
              ["feeding", feedingArcsByGap],
              ["sleep", sleepArcsByGap],
              ["change", changeArcsByGap],
            ]
              .flatMap(([layerName, layer]) => layer.tail.map((g) => ({ layerName, ...g })))
              .map((g) => `<path d="${g.path}" fill="none" class="gap-hit" data-kind="gap" data-key="${g.layerName}|${g.key}" />`)
              .join("")}

            <!-- slaapsegmenten: nachtslaap dikker/donkerder, dutjes dunner/lichter -->
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
                // Selectie-indicatie als witte "halo" exact achter de boog:
                // zelfde pad/straal, alleen breder en eronder getekend, zodat
                // de rand overal gelijkmatig uitsteekt — ook bij de ronde
                // uiteinden, omdat het letterlijk dezelfde vorm is.
                const outline = isSelected
                  ? `<path d="${path}" fill="none" class="selection-outline" />`
                  : "";
                return `${outline}<path d="${path}" fill="none" class="${classes}" data-kind="sleep" data-key="${seg.key}" />`;
              })
              .join("")}

            <!-- lopende timer: neutraal segment, onbeslist wat het straks wordt -->
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

            <!-- voedingsstippen -->
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

            <!-- luierstippen -->
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

          <div class="gap-label morning">${t.morning} 00:00</div>
          <div class="gap-label night">${t.night} 23:59</div>
        </div>

        ${
          data.missing.length > 0
            ? `<div class="status error">${t.error}: ${data.missing.join(", ")}</div>`
            : ""
        }
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
        bottom: 2%;
        font-size: 0.75rem;
        color: var(--secondary-text-color);
        white-space: nowrap;
      }
      .gap-label.morning {
        left: 8%;
      }
      .gap-label.night {
        right: 6%;
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

customElements.define("baby-buddy-day", BabyBuddyDayRing);

// Registratie bij de custom-cards lijst zodat de GUI card-picker 'm herkent.
window.customCards = window.customCards || [];
window.customCards.push({
  type: "baby-buddy-day",
  name: "Baby Buddy Day Ring",
  description: "24-uurs dagoverzicht van slaap, voedingen en luiers via Baby Buddy.",
});
