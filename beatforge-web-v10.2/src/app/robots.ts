import type {MetadataRoute} from 'next';

export default function robots(): MetadataRoute.Robots {
 return {
  rules: {userAgent: '*',allow: '/'},
  sitemap: 'https://beatstrike.app/sitemap.xml',
  host: 'https://beatstrike.app',
 };
}
