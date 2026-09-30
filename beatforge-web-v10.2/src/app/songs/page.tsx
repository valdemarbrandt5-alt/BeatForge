import type {Metadata} from 'next';
import Link from 'next/link';
import {catalogSongs,formatDuration,getPublicCharts,songSlug} from '../../song-catalog';
import {distinctInstruments,youtubeVideoId} from '../../chart-instruments';
import styles from './songs.module.css';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
 title: 'Songs | Play Rhythm Game Charts Online | BeatStrike',
 description: 'Browse songs and community rhythm charts in BeatStrike. Play vocals, drums, bass, melody and full mix directly in your browser.',
 alternates: {canonical: '/songs'},
 openGraph: {
  title: 'BeatStrike Songs | Online Rhythm Game Charts',
  description: 'Choose a song, select an instrument and play its rhythm chart online.',
  url: '/songs',
 },
};

export default async function SongsPage() {
 const songs = catalogSongs(await getPublicCharts());
 return <main className={styles.shell}>
  <div className={styles.wrap}>
   <nav className={styles.top} aria-label="Primary navigation">
    <Link className={styles.brand} href="/">BEAT<span>STRIKE</span></Link>
    <Link className={styles.playLink} href="/">PLAY BEATSTRIKE</Link>
   </nav>
   <header className={styles.hero}>
    <span className={styles.eyebrow}>COMMUNITY SONG LIBRARY</span>
    <h1>Play rhythm game charts online</h1>
    <p>Choose a song, pick an instrument and challenge your timing in BeatStrike. Every chart runs directly in your browser.</p>
   </header>
   {songs.length?<section className={styles.grid} aria-label="BeatStrike songs">
    {songs.map(group=>{
     const chart=group[0],videoId=youtubeVideoId(chart.youtube_url),instruments=distinctInstruments(group);
     return <Link className={styles.card} href={`/songs/${songSlug(chart)}`} key={chart.id}>
      <div className={styles.cover}>{videoId&&<img src={`https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`} alt=""/>}</div>
      <div className={styles.cardBody}>
       <h2>{chart.title}</h2><span className={styles.artist}>{chart.artist||'Unknown artist'}</span>
       <div className={styles.meta}><span>{instruments.length} {instruments.length===1?'instrument':'instruments'}</span><span>{formatDuration(chart.duration)}</span></div>
      </div>
     </Link>;
    })}
   </section>:<div className={styles.empty}>The song library is temporarily unavailable. You can still play BeatStrike from the home page.</div>}
  </div>
 </main>;
}

