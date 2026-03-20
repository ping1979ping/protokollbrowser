// Weather Code → German text mapping (WMO codes)
const WEATHER_CODES: Record<number, string> = {
  0: 'Klar',
  1: 'Überwiegend klar',
  2: 'Teilweise bewölkt',
  3: 'Bewölkt',
  45: 'Nebel',
  48: 'Nebel mit Reifbildung',
  51: 'Leichter Nieselregen',
  53: 'Nieselregen',
  55: 'Starker Nieselregen',
  56: 'Gefrierender Nieselregen',
  57: 'Starker gefrierender Nieselregen',
  61: 'Leichter Regen',
  63: 'Regen',
  65: 'Starker Regen',
  66: 'Gefrierender Regen',
  67: 'Starker gefrierender Regen',
  71: 'Leichter Schneefall',
  73: 'Schneefall',
  75: 'Starker Schneefall',
  77: 'Schneegriesel',
  80: 'Leichte Regenschauer',
  81: 'Regenschauer',
  82: 'Starke Regenschauer',
  85: 'Leichte Schneeschauer',
  86: 'Starke Schneeschauer',
  95: 'Gewitter',
  96: 'Gewitter mit Hagel',
  99: 'Starkes Gewitter mit Hagel',
};

function weatherCodeToText(code: number): string {
  return WEATHER_CODES[code] ?? `Wettercode ${code}`;
}

function isToday(dateStr: string): boolean {
  const today = new Date().toISOString().slice(0, 10);
  return dateStr === today;
}

export async function fetchWeather(lat: number, lon: number, date?: string): Promise<string> {
  try {
    const targetDate = date || new Date().toISOString().slice(0, 10);

    if (isToday(targetDate) || !date) {
      // Current weather
      const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,weather_code,wind_speed_10m`;
      const resp = await fetch(url, { signal: AbortSignal.timeout(8000) });
      if (!resp.ok) return '';
      const data = await resp.json();
      const c = data.current;
      if (!c) return '';
      const temp = Math.round(c.temperature_2m);
      const text = weatherCodeToText(c.weather_code);
      const wind = Math.round(c.wind_speed_10m);
      return `${temp}°C, ${text}, Wind ${wind} km/h`;
    } else {
      // Historical weather
      const url = `https://archive-api.open-meteo.com/v1/archive?latitude=${lat}&longitude=${lon}&start_date=${targetDate}&end_date=${targetDate}&daily=temperature_2m_mean,weather_code,wind_speed_10m_max`;
      const resp = await fetch(url, { signal: AbortSignal.timeout(8000) });
      if (!resp.ok) return '';
      const data = await resp.json();
      const d = data.daily;
      if (!d || !d.temperature_2m_mean?.[0]) return '';
      const temp = Math.round(d.temperature_2m_mean[0]);
      const text = weatherCodeToText(d.weather_code?.[0] ?? 0);
      const wind = Math.round(d.wind_speed_10m_max?.[0] ?? 0);
      return `${temp}°C, ${text}, Wind ${wind} km/h`;
    }
  } catch {
    return '';
  }
}
