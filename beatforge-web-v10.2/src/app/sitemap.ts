import type {MetadataRoute} from 'next';
import {catalogSongs,getPublicCharts,songSlug} from '../song-catalog';

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
 const songs=catalogSongs(await getPublicCharts());
 return [
  {
   url: 'https://www.beatstrike.app',
   changeFrequency: 'weekly',
   priority: 1,
  },
  {
   url: 'https://www.beatstrike.app/songs',
   changeFrequency: 'daily',
   priority: .9,
  },
  ...songs.map(group=>({
   url:`https://www.beatstrike.app/songs/${songSlug(group[0])}`,
   lastModified:group[0].created_at?new Date(group[0].created_at):undefined,
   changeFrequency:'weekly' as const,
   priority:.8,
  })),
 ];
}
