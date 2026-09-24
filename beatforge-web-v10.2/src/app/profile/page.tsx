'use client';

import {useEffect,useMemo,useState} from 'react';
import {supabase} from '../../lib/supabase';
import styles from './profile.module.css';

type ScoreRow={chart_id:string;score:number;accuracy:number;max_combo:number;perfect:number;great:number;good:number;miss:number;difficulty:string|null;created_at:string};
type ChartRow={id:string;title:string;artist:string|null;youtube_url:string|null;difficulty:string|null};
type RankedRow={mmr:number;wins:number;losses:number;draws:number};
type BattleRoyaleRow={wins:number;games:number;top4:number};
type ProfileRow={username:string|null;avatar_url:string|null;created_at:string|null};
type SongPerformance=ScoreRow&{chart?:ChartRow};
type SortMode='accuracy'|'score'|'streak';

const rankInfo=(mmr:number)=>{
  if(mmr<800)return{name:'BRONZE',floor:0,next:800,cls:'bronze'};
  if(mmr<1000)return{name:'SILVER',floor:800,next:1000,cls:'silver'};
  if(mmr<1200)return{name:'GOLD',floor:1000,next:1200,cls:'gold'};
  if(mmr<1400)return{name:'PLATINUM',floor:1200,next:1400,cls:'platinum'};
  if(mmr<1600)return{name:'DIAMOND',floor:1400,next:1600,cls:'diamond'};
  return{name:'MASTER',floor:1600,next:null as number|null,cls:'master'};
};

const youtubeId=(url:string|null|undefined)=>{if(!url)return'';const match=url.match(/[?&]v=([^&]+)/)||url.match(/youtu\.be\/([^?]+)/)||url.match(/\/shorts\/([^?]+)/);return match?.[1]||''};
const pct=(value:number)=>`${Math.max(0,Math.min(100,value)).toFixed(1)}%`;
const valueFor=(row:SongPerformance,mode:SortMode)=>mode==='score'?Number(row.score)||0:mode==='streak'?Number(row.max_combo)||0:Number(row.accuracy)||0;

export default function ProfilePage(){
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState('');
  const [profile,setProfile]=useState<ProfileRow|null>(null);
  const [ranked,setRanked]=useState<RankedRow>({mmr:1000,wins:0,losses:0,draws:0});
  const [battleRoyale,setBattleRoyale]=useState<BattleRoyaleRow>({wins:0,games:0,top4:0});
  const [scores,setScores]=useState<ScoreRow[]>([]);
  const [charts,setCharts]=useState<ChartRow[]>([]);
  const [signedIn,setSignedIn]=useState(true);
  const [viewingOwn,setViewingOwn]=useState(true);
  const [sortMode,setSortMode]=useState<SortMode>('accuracy');

  useEffect(()=>{
    let cancelled=false;
    const load=async()=>{
      if(!supabase){setError('Supabase is not configured.');setLoading(false);return}
      const {data:auth,error:authError}=await supabase.auth.getUser();
      if(cancelled)return;
      if(authError||!auth.user){setSignedIn(false);setLoading(false);return}
      const requested=typeof window!=='undefined'?new URLSearchParams(window.location.search).get('user'):null;
      const uid=requested||auth.user.id;
      setViewingOwn(uid===auth.user.id);

      const [profileRes,rankedRes,scoresRes,battleRoyaleRes]=await Promise.all([
        supabase.from('profiles').select('username,avatar_url,created_at').eq('id',uid).maybeSingle(),
        supabase.from('ranked_players').select('mmr,wins,losses,draws').eq('user_id',uid).maybeSingle(),
        supabase.from('scores').select('chart_id,score,accuracy,max_combo,perfect,great,good,miss,difficulty,created_at').eq('user_id',uid).order('created_at',{ascending:false}).limit(500),
        supabase.rpc('get_battle_royale_profile',{p_user:uid})
      ]);
      if(cancelled)return;
      if(profileRes.error){setError(profileRes.error.message);setLoading(false);return}
      if(scoresRes.error){setError(scoresRes.error.message);setLoading(false);return}
      if(!profileRes.data){setError('Player profile not found.');setLoading(false);return}

      setProfile(profileRes.data as ProfileRow);
      if(rankedRes.data)setRanked(rankedRes.data as RankedRow);
      if(battleRoyaleRes.data){const record=Array.isArray(battleRoyaleRes.data)?battleRoyaleRes.data[0]:battleRoyaleRes.data;if(record)setBattleRoyale(record as BattleRoyaleRow)}
      const scoreRows=(scoresRes.data||[]) as ScoreRow[];
      setScores(scoreRows);
      const ids=Array.from(new Set(scoreRows.map(row=>row.chart_id).filter(Boolean)));
      if(ids.length){
        const {data:chartData,error:chartError}=await supabase.from('charts').select('id,title,artist,youtube_url,difficulty').in('id',ids);
        if(cancelled)return;
        if(chartError){setError(chartError.message);setLoading(false);return}
        setCharts((chartData||[]) as ChartRow[]);
      }
      setLoading(false);
    };
    void load();return()=>{cancelled=true};
  },[]);

  const chartMap=useMemo(()=>new Map(charts.map(chart=>[chart.id,chart])),[charts]);
  const performances=useMemo<SongPerformance[]>(()=>scores.map(score=>({...score,chart:chartMap.get(score.chart_id)})),[scores,chartMap]);
  const topSongs=useMemo(()=>{
    const best=new Map<string,SongPerformance>();
    performances.forEach(row=>{
      const current=best.get(row.chart_id);
      if(!current||valueFor(row,sortMode)>valueFor(current,sortMode)||(valueFor(row,sortMode)===valueFor(current,sortMode)&&Number(row.score)>Number(current.score)))best.set(row.chart_id,row);
    });
    return Array.from(best.values()).sort((a,b)=>valueFor(b,sortMode)-valueFor(a,sortMode)||Number(b.score)-Number(a.score)).slice(0,8);
  },[performances,sortMode]);

  const bestSong=topSongs[0];
  const bestAccuracy=performances.reduce((best,row)=>Math.max(best,Number(row.accuracy)||0),0);
  const bestCombo=performances.reduce((best,row)=>Math.max(best,Number(row.max_combo)||0),0);
  const uniqueSongs=new Set(scores.map(score=>score.chart_id)).size;
  const rankedGames=ranked.wins+ranked.losses+ranked.draws;
  const decisiveGames=ranked.wins+ranked.losses;
  const winrate=decisiveGames?ranked.wins/decisiveGames*100:0;
  const rank=rankInfo(ranked.mmr);
  const rankProgress=rank.next===null?100:((ranked.mmr-rank.floor)/(rank.next-rank.floor))*100;
  const username=profile?.username||'BeatForge Player';
  const initial=username.slice(0,1).toUpperCase();
  const sortLabel=sortMode==='accuracy'?'HIGHEST ACCURACY':sortMode==='score'?'HIGHEST SCORE':'HIGHEST STREAK';

  if(loading)return <main className={styles.page}><div className={styles.loading}><div className={styles.spinner}/><b>LOADING PROFILE</b></div></main>;
  if(!signedIn)return <main className={styles.page}><section className={styles.emptyState}><div className={styles.logo}>BEAT<span>FORGE</span></div><h1>Sign in to view profiles</h1><p>Player scores, Ranked stats and best songs live here.</p><a href="/">BACK TO BEATFORGE</a></section></main>;

  return <main className={styles.page}><div className={styles.shell}>
    <header className={styles.topbar}><a className={styles.brand} href="/">BEAT<span>FORGE</span></a><a className={styles.back} href="/">← BACK TO GAME</a></header>
    {error&&<div className={styles.error}>{error}</div>}

    <section className={styles.hero}>
      <div className={styles.identity}><div className={styles.avatar}>{profile?.avatar_url?<img src={profile.avatar_url} alt=""/>:<span>{initial}</span>}</div><div><small>{viewingOwn?'YOUR PLAYER PROFILE':'PLAYER PROFILE'}</small><h1>{username}</h1><p>{profile?.created_at?`BeatForge player since ${new Date(profile.created_at).toLocaleDateString('en-GB',{month:'short',year:'numeric'})}`:'BeatForge player'}</p>{!viewingOwn&&<span className={styles.friendProfileBadge}>FRIEND PROFILE</span>}</div></div>
      <div className={`${styles.rankCard} ${styles[rank.cls]}`}><div className={styles.rankGlow}/><small>CURRENT RANK</small><strong>{rank.name}</strong><b>{ranked.mmr.toLocaleString()} MMR</b><div className={styles.rankRail}><i style={{width:`${rankProgress}%`}}/></div><span>{rank.next===null?'Top rank reached':`${Math.max(0,rank.next-ranked.mmr)} MMR to ${rankInfo(rank.next).name}`}</span></div>
    </section>

    <section className={styles.statsGrid}>
      <article><small>WIN RATE</small><strong>{pct(winrate)}</strong><span>{ranked.wins}W · {ranked.losses}L · {ranked.draws}D</span></article>
      <article><small>RANKED MATCHES</small><strong>{rankedGames}</strong><span>Competitive games</span></article>
      <article><small>BEST STREAK</small><strong>{bestCombo.toLocaleString()}x</strong><span>Highest combo</span></article>
      <article><small>BEST ACCURACY</small><strong>{pct(bestAccuracy)}</strong><span>Across all scores</span></article>
      <article><small>SONGS PLAYED</small><strong>{uniqueSongs}</strong><span>Unique community charts</span></article>
      <article><small>PERFORMANCES</small><strong>{scores.length}</strong><span>Scores recorded</span></article>
    </section>

    <section className={styles.contentGrid}>
      <article className={styles.bestCard}>
        <div className={styles.sectionLabel}><div><small>SIGNATURE PERFORMANCE · {sortLabel}</small><h2>Best song</h2></div><span>★ PERSONAL BEST</span></div>
        {bestSong?<><div className={styles.bestSongHero}><div className={styles.cover}>{youtubeId(bestSong.chart?.youtube_url)?<img src={`https://i.ytimg.com/vi/${youtubeId(bestSong.chart?.youtube_url)}/hqdefault.jpg`} alt=""/>:<div className={styles.coverFallback}>BF</div>}</div><div className={styles.bestInfo}><small>{bestSong.difficulty||bestSong.chart?.difficulty||'Medium'} · {sortLabel}</small><h3>{bestSong.chart?.title||'Unknown chart'}</h3><p>{bestSong.chart?.artist||'Unknown artist'}</p><strong>{sortMode==='accuracy'?pct(Number(bestSong.accuracy)||0):sortMode==='streak'?`${Number(bestSong.max_combo||0).toLocaleString()}x`:Number(bestSong.score).toLocaleString()}</strong><span>{sortLabel}</span></div></div><div className={styles.bestDetails}><div><b>{Number(bestSong.score).toLocaleString()}</b><span>SCORE</span></div><div><b>{pct(Number(bestSong.accuracy)||0)}</b><span>ACCURACY</span></div><div><b>{Number(bestSong.max_combo||0).toLocaleString()}x</b><span>MAX STREAK</span></div><div><b>{Number(bestSong.miss||0).toLocaleString()}</b><span>MISS</span></div></div></>:<div className={styles.noData}>Play and finish a song to create your first personal best.</div>}
      </article>
      <article className={styles.rankedPanel}><div className={styles.sectionLabel}><div><small>COMPETITIVE</small><h2>Ranked record</h2></div></div><div className={styles.winDonut} style={{'--winrate':`${winrate*3.6}deg`} as React.CSSProperties}><div><strong>{pct(winrate)}</strong><span>WIN RATE</span></div></div><div className={styles.recordRows}><div><span>Wins</span><b>{ranked.wins}</b></div><div><span>Losses</span><b>{ranked.losses}</b></div><div><span>Draws</span><b>{ranked.draws}</b></div><div><span>MMR</span><b>{ranked.mmr}</b></div></div></article>
    </section>

    <section className={styles.battleRoyalePanel}><div className={styles.sectionLabel}><div><small>COMPETITIVE · SHARED MMR</small><h2>Battle Royale</h2></div></div><div className={styles.battleRoyaleStats}><div><small>VICTORIES</small><strong>{battleRoyale.wins}</strong></div><div><small>TOP 4</small><strong>{battleRoyale.top4}</strong></div><div><small>MATCHES</small><strong>{battleRoyale.games}</strong></div><div><small>WIN RATE</small><strong>{pct(battleRoyale.games?battleRoyale.wins/battleRoyale.games*100:0)}</strong></div></div></section>

    <section className={styles.listSection}>
      <div className={styles.performanceHeader}><div className={styles.sectionLabel}><div><small>PERSONAL BESTS</small><h2>Top performances</h2></div></div><div className={styles.sortControls}><span>SORT BY</span><button className={sortMode==='accuracy'?styles.activeSort:''} onClick={()=>setSortMode('accuracy')}>ACCURACY</button><button className={sortMode==='score'?styles.activeSort:''} onClick={()=>setSortMode('score')}>SCORE</button><button className={sortMode==='streak'?styles.activeSort:''} onClick={()=>setSortMode('streak')}>STREAK</button></div></div>
      <div className={styles.songList}>{topSongs.length?topSongs.map((song,index)=>{const yid=youtubeId(song.chart?.youtube_url);return <div className={styles.songRow} key={`${song.chart_id}-${song.difficulty||'all'}`}><b className={styles.place}>#{index+1}</b><div className={styles.thumb}>{yid?<img src={`https://i.ytimg.com/vi/${yid}/mqdefault.jpg`} alt=""/>:<span>BF</span>}</div><div className={styles.songIdentity}><strong>{song.chart?.title||'Unknown chart'}</strong><span>{song.chart?.artist||'Unknown artist'} · {song.difficulty||song.chart?.difficulty||'Medium'}</span></div><div className={`${styles.songStat} ${sortMode==='score'?styles.primaryStat:''}`}><b>{Number(song.score).toLocaleString()}</b><span>SCORE</span></div><div className={`${styles.songStat} ${sortMode==='accuracy'?styles.primaryStat:''}`}><b>{pct(Number(song.accuracy)||0)}</b><span>ACCURACY</span></div><div className={`${styles.songStat} ${sortMode==='streak'?styles.primaryStat:''}`}><b>{Number(song.max_combo||0).toLocaleString()}x</b><span>STREAK</span></div></div>}):<div className={styles.noData}>No song scores yet.</div>}</div>
    </section>

    <section className={styles.listSection}><div className={styles.sectionLabel}><div><small>ACTIVITY</small><h2>Recent performances</h2></div></div><div className={styles.recentGrid}>{performances.slice(0,6).map((row,index)=><div className={styles.recentCard} key={`${row.chart_id}-${row.created_at}-${index}`}><small>{row.difficulty||row.chart?.difficulty||'Medium'}</small><strong>{row.chart?.title||'Unknown chart'}</strong><span>{row.chart?.artist||'Unknown artist'}</span><b>{Number(row.score).toLocaleString()}</b><em>{pct(Number(row.accuracy)||0)} · {Number(row.max_combo||0)}x streak</em></div>)}{!performances.length&&<div className={styles.noData}>Recent scores will appear here.</div>}</div></section>
  </div></main>;
}
