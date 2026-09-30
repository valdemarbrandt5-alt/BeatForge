import type {MetadataRoute} from 'next';

export default function manifest(): MetadataRoute.Manifest {
 return {
  name: 'BeatStrike',
  short_name: 'BeatStrike',
  description: 'A free competitive rhythm game in your browser.',
  start_url: '/',
  display: 'standalone',
  background_color: '#06050b',
  theme_color: '#a655ff',
  categories: ['games','music'],
 };
}
