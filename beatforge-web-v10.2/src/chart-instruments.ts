export type ChartInstrument = 'mix' | 'vocals' | 'drums' | 'bass' | 'melody';

export type InstrumentChart = {
  id: string;
  title: string;
  artist?: string | null;
  youtube_url?: string | null;
  instrument?: ChartInstrument;
  play_count?: number | null;
};

export const instrumentOrder: ChartInstrument[] = ['mix', 'vocals', 'drums', 'bass', 'melody'];

export function youtubeVideoId(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.toLowerCase();
    const id = host === 'youtu.be' ? parsed.pathname.slice(1).split('/')[0]
      : ['youtube.com', 'www.youtube.com', 'm.youtube.com', 'music.youtube.com'].includes(host)
        ? (parsed.pathname === '/watch' ? parsed.searchParams.get('v') : parsed.pathname.match(/^\/(?:shorts|embed)\/([^/]+)/)?.[1])
        : null;
    return id && /^[A-Za-z0-9_-]{11}$/.test(id) ? id : null;
  } catch { return null; }
}

export function songKey(chart: InstrumentChart): string {
  const videoId = youtubeVideoId(chart.youtube_url);
  return videoId ? `youtube:${videoId}` : `chart:${chart.id}`;
}

export function groupSongs<T extends InstrumentChart>(charts: T[]): T[][] {
  const groups = new Map<string, T[]>();
  for (const chart of charts) {
    const key = songKey(chart);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(chart);
  }
  return [...groups.values()].map(group => group.sort((a, b) =>
    instrumentOrder.indexOf(a.instrument || 'mix') - instrumentOrder.indexOf(b.instrument || 'mix') ||
    Number(b.play_count || 0) - Number(a.play_count || 0),
  ));
}

export function distinctInstruments<T extends InstrumentChart>(charts: T[]): T[] {
  const seen = new Set<ChartInstrument>();
  return [...charts].sort((a, b) => Number(b.play_count || 0) - Number(a.play_count || 0))
    .filter(chart => { const name = chart.instrument || 'mix'; if (seen.has(name)) return false; seen.add(name); return true; })
    .sort((a, b) => instrumentOrder.indexOf(a.instrument || 'mix') - instrumentOrder.indexOf(b.instrument || 'mix'));
}

/** Resolve all available arrangements of a song without downloading their note data. */
export async function loadSongInstruments(db: any, chart: InstrumentChart): Promise<InstrumentChart[]> {
  const videoId = youtubeVideoId(chart.youtube_url);
  if (!videoId) return [chart];
  const { data, error } = await db.from('charts')
    .select('id,title,artist,youtube_url,instrument,play_count')
    .ilike('youtube_url', `%${videoId}%`).limit(100);
  if (error) return [chart];
  const choices = distinctInstruments(((data || []) as InstrumentChart[])
    .filter(row => youtubeVideoId(row.youtube_url) === videoId).concat(chart));
  const current = choices.findIndex(row => (row.instrument || 'mix') === (chart.instrument || 'mix'));
  if (current >= 0) choices[current] = chart;
  return choices;
}

const names: Record<ChartInstrument, string> = {
  mix: 'Full mix',
  vocals: 'Vocals',
  drums: 'Drums',
  bass: 'Bass',
  melody: 'Melody',
};

export function instrumentLabel(value: string | null | undefined): string {
  return names[value as ChartInstrument] || names.mix;
}

/** Ask the home page to load an exact chart ID, even if it is not in the first page of Community results. */
export function loadChartById(chartId: string): Promise<boolean> {
  return new Promise(resolve => {
    const timeout = window.setTimeout(() => resolve(false), 10000);
    window.dispatchEvent(new CustomEvent('beatforge:load-chart', {
      detail: {chartId, resolve: (loaded: boolean) => {window.clearTimeout(timeout);resolve(loaded)}},
    }));
  });
}
