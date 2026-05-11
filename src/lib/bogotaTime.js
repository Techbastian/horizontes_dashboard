/** Colombia sin horario de verano: siempre UTC-5 */
export const BOGOTA_UTC_OFFSET = '-05:00';

export function bogotaDateTimeToIso(dateYYYYMMDD, hhmm) {
  return new Date(`${dateYYYYMMDD}T${hhmm}:00${BOGOTA_UTC_OFFSET}`).toISOString();
}

const fmtDateParts = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/Bogota',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

const fmtTimeParts = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'America/Bogota',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
});

function partsToMap(dtf, date) {
  const m = {};
  for (const p of dtf.formatToParts(date)) {
    if (p.type !== 'literal') m[p.type] = p.value;
  }
  return m;
}

export function isoToBogotaDate(isoString) {
  const d = new Date(isoString);
  const p = partsToMap(fmtDateParts, d);
  return `${p.year}-${p.month}-${p.day}`;
}

export function isoToBogotaTime(isoString) {
  const d = new Date(isoString);
  const p = partsToMap(fmtTimeParts, d);
  return `${p.hour}:${p.minute}`;
}

export function formatBogotaRange(isoStart, isoEnd) {
  const date = isoToBogotaDate(isoStart);
  return `${date} · ${isoToBogotaTime(isoStart)}–${isoToBogotaTime(isoEnd)}`;
}

/** Inicio del mes en Bogotá → ISO UTC */
export function monthRangeUtcIso(year, monthIndex) {
  const pad = (n) => String(n).padStart(2, '0');
  const first = `${year}-${pad(monthIndex + 1)}-01`;
  const lastDay = new Date(year, monthIndex + 1, 0).getDate();
  const last = `${year}-${pad(monthIndex + 1)}-${pad(lastDay)}`;
  return {
    start: bogotaDateTimeToIso(first, '00:00'),
    end: bogotaDateTimeToIso(last, '23:59'),
  };
}

export function bogotaPlusDays(dateYYYYMMDD, days) {
  const anchor = bogotaDateTimeToIso(dateYYYYMMDD, '12:00');
  const ms = new Date(anchor).getTime() + days * 86400000;
  return isoToBogotaDate(new Date(ms).toISOString());
}

export function overlapsBogotaDay(evStartIso, evEndIso, dateKeyYmd) {
  const ds = bogotaDateTimeToIso(dateKeyYmd, '00:00');
  const de = bogotaDateTimeToIso(dateKeyYmd, '23:59');
  return (
    new Date(evEndIso) >= new Date(ds) &&
    new Date(evStartIso) <= new Date(de)
  );
}
