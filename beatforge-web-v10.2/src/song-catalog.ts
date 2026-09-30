import {groupSongs, youtubeVideoId, type ChartInstrument} from './chart-instruments';

export type PublicChart = {
 id: string;
 title: string;
 artist?: string | null;
 youtube_url?: string | null;
 instrument?: ChartInstrument;
 difficulty: 'Easy' | 'Medium' | 'Hard' | 'Expert';
 lane_count: number;
 duration: number;
 play_count?: number | null;
 created_at?: string | null;
};

const fields = 'id,title,artist,youtube_url,instrument,difficulty,lane_count,duration,play_count,created_at';
const uuidPattern = '[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}';

function restUrl() {
 const base = process.env.NEXT_PUBLIC_SUPABASE_URL;
 const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
 if (!base || !key) return null;
 const url = new URL('/rest/v1/charts', base);
 url.searchParams.set('select', fields);
 url.searchParams.set('limit', '1000');
 return {url, key};
}

async function requestCharts(url: URL, key: string): Promise<PublicChart[]> {
 try {
  const response = await fetch(url, {
   headers: {apikey: key, Authorization: `Bearer ${key}`},
   next: {revalidate: 300},
  });
  if (!response.ok) return [];
  const value = await response.json();
  return Array.isArray(value) ? value as PublicChart[] : [];
 } catch { return []; }
}

export async function getPublicCharts(): Promise<PublicChart[]> {
 const config = restUrl();
 if (!config) return [];
 return requestCharts(config.url, config.key);
}

export async function getPublicChart(id: string): Promise<PublicChart | null> {
 if (!new RegExp(`^${uuidPattern}$`, 'i').test(id)) return null;
 const config = restUrl();
 if (!config) return null;
 config.url.searchParams.set('id', `eq.${id}`);
 config.url.searchParams.set('limit', '1');
 return (await requestCharts(config.url, config.key))[0] || null;
}

export function catalogSongs(charts: PublicChart[]): PublicChart[][] {
 return groupSongs(charts).sort((a,b)=>{
  const plays = (group: PublicChart[]) => group.reduce((sum,chart)=>sum+Number(chart.play_count||0),0);
  return plays(b)-plays(a) || a[0].title.localeCompare(b[0].title);
 });
}

export function songCharts(chart: PublicChart, charts: PublicChart[]): PublicChart[] {
 const videoId = youtubeVideoId(chart.youtube_url);
 if (!videoId) return [chart];
 return charts.filter(item=>youtubeVideoId(item.youtube_url)===videoId);
}

export function slugify(value: string): string {
 return value.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,72) || 'song';
}

export function songSlug(chart: Pick<PublicChart,'id'|'title'|'artist'>): string {
 return `${slugify(`${chart.artist||''} ${chart.title}`)}--${chart.id}`;
}

export function chartIdFromSlug(slug: string): string | null {
 const match = slug.match(new RegExp(`(?:^|--)(${uuidPattern})$`, 'i'));
 return match?.[1] || null;
}

export function songDescription(chart: PublicChart, instruments: PublicChart[]): string {
 const artist = chart.artist?.trim() || 'Unknown artist';
 const names = [...new Set(instruments.map(item=>item.instrument||'mix'))];
 return `Play ${chart.title} by ${artist} as an online rhythm game in BeatStrike. Choose from ${names.length} instrument chart${names.length===1?'':'s'} and four difficulty levels.`;
}

export function formatDuration(seconds: number): string {
 const value = Math.max(0,Math.round(Number(seconds)||0));
 return `${Math.floor(value/60)}:${String(value%60).padStart(2,'0')}`;
}

