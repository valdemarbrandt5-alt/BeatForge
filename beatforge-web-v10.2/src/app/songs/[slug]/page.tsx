import type {Metadata} from 'next';
import Link from 'next/link';
import {notFound,permanentRedirect} from 'next/navigation';
import {chartIdFromSlug,formatDuration,getPublicChart,getPublicCharts,songCharts,songDescription,songSlug} from '../../../song-catalog';
import {distinctInstruments,instrumentLabel,youtubeVideoId} from '../../../chart-instruments';
import styles from '../songs.module.css';
import LegalFooter from '../../LegalFooter';

type PageProps = {params: Promise<{slug:string}>};

export const dynamic = 'force-dynamic';

async function loadSong(slug: string) {
 const id=chartIdFromSlug(slug);
 if(!id)return null;
 const chart=await getPublicChart(id);
 if(!chart)return null;
 const instruments=distinctInstruments(songCharts(chart,await getPublicCharts()));
 return {chart,instruments};
}

export async function generateMetadata({params}:PageProps):Promise<Metadata>{
 const {slug}=await params,data=await loadSong(slug);
 if(!data)return {title:'Song not found | BeatStrike',robots:{index:false,follow:false}};
 const {chart,instruments}=data,canonical=`/songs/${songSlug(chart)}`,description=songDescription(chart,instruments);
 return {
  title:`Play ${chart.title} by ${chart.artist||'Unknown artist'} | BeatStrike`,
  description,
  alternates:{canonical},
  openGraph:{type:'website',url:canonical,title:`Play ${chart.title} in BeatStrike`,description},
  twitter:{card:'summary',title:`Play ${chart.title} in BeatStrike`,description},
 };
}

export default async function SongPage({params}:PageProps){
 const {slug}=await params,data=await loadSong(slug);
 if(!data)notFound();
 const {chart,instruments}=data,canonicalSlug=songSlug(chart);
 if(slug!==canonicalSlug)permanentRedirect(`/songs/${canonicalSlug}`);
 const videoId=youtubeVideoId(chart.youtube_url),plays=instruments.reduce((sum,item)=>sum+Number(item.play_count||0),0);
 const description=songDescription(chart,instruments);
 const structuredData={
  '@context':'https://schema.org','@type':'WebPage',name:`Play ${chart.title} by ${chart.artist||'Unknown artist'} in BeatStrike`,
  url:`https://www.beatstrike.app/songs/${canonicalSlug}`,description,
  isPartOf:{'@type':'WebSite',name:'BeatStrike',url:'https://www.beatstrike.app'},
  about:{'@type':'VideoGame',name:'BeatStrike',gamePlatform:'Web browser'},
 };
 return <main className={styles.shell}>
  <div className={styles.wrap}>
   <nav className={styles.top} aria-label="Primary navigation">
    <Link className={styles.brand} href="/">BEAT<span>STRIKE</span></Link>
    <Link className={styles.backLink} href="/songs">ALL SONGS</Link>
   </nav>
   <div className={styles.crumbs}><Link href="/">BeatStrike</Link><span>›</span><Link href="/songs">Songs</Link><span>›</span><span>{chart.title}</span></div>
   <section className={styles.songHero}>
    <div><span className={styles.eyebrow}>PLAY ONLINE IN BEATSTRIKE</span><h1>{chart.title}</h1><p>{chart.artist||'Unknown artist'} · Choose your instrument and difficulty, then chase the high score in this free browser rhythm game.</p>
     <div className={styles.actions}><Link className={styles.playLink} href={`/?chart=${chart.id}`}>PLAY THIS SONG</Link><Link className={styles.backLink} href="/songs">BROWSE SONGS</Link></div>
    </div>
    <div className={styles.songCover}>{videoId&&<img src={`https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`} alt={`${chart.title} by ${chart.artist||'Unknown artist'}`}/>}</div>
   </section>
   <section className={styles.details} aria-label="Song details">
    <div><small>ARTIST</small><strong>{chart.artist||'Unknown'}</strong></div>
    <div><small>DURATION</small><strong>{formatDuration(chart.duration)}</strong></div>
    <div><small>INSTRUMENTS</small><strong>{instruments.length}</strong></div>
    <div><small>TOTAL PLAYS</small><strong>{plays.toLocaleString('en-US')}</strong></div>
   </section>
   <section className={styles.instruments}><h2>Available rhythm charts</h2><div className={styles.instrumentGrid}>
    {instruments.map(item=><article key={item.id}><span className={styles.instrument}>{instrumentLabel(item.instrument)}</span><strong>{item.difficulty} chart</strong><span>{item.lane_count} lanes · {formatDuration(item.duration)}</span><Link className={styles.playLink} href={`/?chart=${item.id}`}>PLAY {instrumentLabel(item.instrument).toUpperCase()}</Link></article>)}
   </div></section>
   <section className={styles.copy}><h2>Play {chart.title} as a browser rhythm game</h2><p>{description} BeatStrike rewards accurate timing, long combos and clean performances with higher scores and up to five stars.</p></section>
  </div>
  <LegalFooter/>
  <script type="application/ld+json" dangerouslySetInnerHTML={{__html:JSON.stringify(structuredData)}}/>
 </main>;
}
