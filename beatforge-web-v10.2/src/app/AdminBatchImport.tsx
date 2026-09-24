'use client';

import {useEffect,useState} from 'react';
import {supabase} from '../lib/supabase';

type Result={url:string;status:'saved'|'exists'|'failed';title?:string;artist?:string;notes?:number;error?:string};
type Status={total:number;results:Result[];current:string|null;done:boolean;stop_reason?:string|null};

const initialLinks=[
  'https://music.youtube.com/watch?v=oG-4Uvhm4lI', // Lady Gaga — Poker Face
  'https://music.youtube.com/watch?v=ACNwMzZejQQ', // Lady Gaga — Just Dance
  'https://music.youtube.com/watch?v=DXnS8mqUDyQ', // Lady Gaga — Rain On Me
  'https://music.youtube.com/watch?v=529VgRXlmuI', // Lady Gaga — Abracadabra
  'https://music.youtube.com/watch?v=-85aGhgOOQ4', // Lady Gaga Bruno Mars — Die With A Smile
  'https://music.youtube.com/watch?v=zuaBRqUBhyw', // Bruno Mars — Locked Out of Heaven
  'https://music.youtube.com/watch?v=r7-A9NqUjRI', // Bruno Mars — 24K Magic
  'https://music.youtube.com/watch?v=m-ZkRTapFiE', // Bruno Mars — That's What I Like
  'https://music.youtube.com/watch?v=DiTd771WumE', // ROSÉ Bruno Mars — APT.
  'https://music.youtube.com/watch?v=lr1gApNmFog', // Michael Jackson — Billie Jean
  'https://music.youtube.com/watch?v=kOn-HdEg6AQ', // Michael Jackson — Beat It
  'https://music.youtube.com/watch?v=sO4vI8P88NM', // Michael Jackson — Thriller
  'https://music.youtube.com/watch?v=bDtjO-R0QSo', // Adele — Rolling in the Deep
  'https://music.youtube.com/watch?v=T1tl66trXTQ', // Adele — Hello
  'https://music.youtube.com/watch?v=8H8Km8XJOUM', // Adele — Someone Like You
  'https://music.youtube.com/watch?v=lQMHoAs6PdY', // Adele — Easy On Me
  'https://music.youtube.com/watch?v=cCfPDrRQp9k', // Dua Lipa — Houdini
  'https://music.youtube.com/watch?v=wd9_QCH8Eq4', // Dua Lipa — Don't Start Now
  'https://music.youtube.com/watch?v=f4byOZY2hoo', // Dua Lipa — New Rules
  'https://music.youtube.com/watch?v=MEs4tVGaI_o', // Dua Lipa — Physical
  'https://music.youtube.com/watch?v=qWXaFIhuSN4', // The Weeknd — Save Your Tears
  'https://music.youtube.com/watch?v=Rif-RTvmmss', // The Weeknd — Starboy
  'https://music.youtube.com/watch?v=j6V7qfIRgNo', // The Weeknd — Can't Feel My Face
  'https://music.youtube.com/watch?v=VcNFJE6k2_Q', // The Weeknd — Take My Breath
  'https://music.youtube.com/watch?v=fHI8X4OXluQ', // The Weeknd — Blinding Lights
  'https://music.youtube.com/watch?v=zAgVtzhjfCA', // Sabrina Carpenter — Please Please Please
  'https://music.youtube.com/watch?v=-5GI38vWew8', // Sabrina Carpenter — Taste
  'https://music.youtube.com/watch?v=LE1bcEXN2V8', // Sabrina Carpenter — Feather
  'https://music.youtube.com/watch?v=ECVA6FvhdEE', // Sabrina Carpenter — Nonsense
  'https://music.youtube.com/watch?v=VZ-oGLluGAc', // Chappell Roan — Good Luck Babe
  'https://music.youtube.com/watch?v=zgJRSeR5CuM', // Chappell Roan — HOT TO GO!
  'https://music.youtube.com/watch?v=R_iTpfSCIVk', // Chappell Roan — Pink Pony Club
  'https://music.youtube.com/watch?v=14DgQFUXOq8', // Olivia Rodrigo — Vampire
  'https://music.youtube.com/watch?v=REE5eIipuKI', // Olivia Rodrigo — drivers license
  'https://music.youtube.com/watch?v=fWgboQNNfB8', // Olivia Rodrigo — deja vu
  'https://music.youtube.com/watch?v=H59xVMF4zxE', // Taylor Swift — Shake It Off (Taylor's Version)
  'https://music.youtube.com/watch?v=aC9HkZW2hZk', // Taylor Swift — Cruel Summer
  'https://music.youtube.com/watch?v=-MtKC5wXqdQ', // Taylor Swift — Blank Space (Taylor's Version)
  'https://music.youtube.com/watch?v=w6Y8fvBczYM', // Taylor Swift — Style (Taylor's Version)
  'https://music.youtube.com/watch?v=i6eLIHcdDWY', // Taylor Swift — Anti-Hero
  'https://music.youtube.com/watch?v=eXrmLd5mer4', // Taylor Swift Post Malone — Fortnight
  'https://music.youtube.com/watch?v=WKZO-CWeOVA', // Billie Eilish — Birds of a Feather
  'https://music.youtube.com/watch?v=w96X-OWPWhE', // Billie Eilish — Lunch
  'https://music.youtube.com/watch?v=FcXRwUsA6xs', // Billie Eilish — What Was I Made For
  'https://music.youtube.com/watch?v=NSTUVHsb9xw', // Billie Eilish — Happier Than Ever
  'https://music.youtube.com/watch?v=oDn4eKyhSH4', // Billie Eilish — Therefore I Am
  'https://music.youtube.com/watch?v=tFyK47eZ1VE', // Ed Sheeran — Shape of You
  'https://music.youtube.com/watch?v=hJWSZDJb-W4', // Ed Sheeran — Bad Habits
  'https://music.youtube.com/watch?v=G1ej5up7JG0', // Ed Sheeran — Shivers
  'https://music.youtube.com/watch?v=uOdphGs5uN0', // Ed Sheeran — Perfect
  'https://music.youtube.com/watch?v=Fo3z4ljmRM4', // Ed Sheeran — Thinking Out Loud
  'https://music.youtube.com/watch?v=zOQ4ld6NsXE', // Coldplay — Viva La Vida
  'https://music.youtube.com/watch?v=ZNG3kCOLlRw', // Coldplay — A Sky Full of Stars
  'https://music.youtube.com/watch?v=XsMpXczOIPs', // Coldplay — Adventure of a Lifetime
  'https://music.youtube.com/watch?v=RtdJAMLUwAQ', // Coldplay — Yellow
  'https://music.youtube.com/watch?v=Q0TEUMPIhk8', // Coldplay — Paradise
  'https://music.youtube.com/watch?v=sudXI02WdPM', // Imagine Dragons — Radioactive
  'https://music.youtube.com/watch?v=PMPTeRyjvrU', // Imagine Dragons — Thunder
  'https://music.youtube.com/watch?v=V2SVRJ6dcE4', // Imagine Dragons — Bones
  'https://music.youtube.com/watch?v=rGlEZpOVjGo', // Imagine Dragons — Whatever It Takes
  'https://music.youtube.com/watch?v=MP-VNQjfXF0', // Avicii — Wake Me Up
  'https://music.youtube.com/watch?v=W4C-NEWrnSQ', // Avicii — The Nights
  'https://music.youtube.com/watch?v=wDuoOapZ9Z0', // Avicii — Levels
  'https://music.youtube.com/watch?v=9AQCVX4ImtE', // Avicii — Waiting For Love
  'https://music.youtube.com/watch?v=e-fnvfs0h0A', // Avicii — Hey Brother
  'https://music.youtube.com/watch?v=6cHfiFGOgf0', // Daft Punk — Get Lucky
  'https://music.youtube.com/watch?v=fa5IWHDbftI', // Daft Punk — One More Time
  'https://music.youtube.com/watch?v=yydNF8tuVmU', // Daft Punk — Harder Better Faster Stronger
  'https://music.youtube.com/watch?v=tyXBQHDWlZI', // Daft Punk — Lose Yourself to Dance
  'https://music.youtube.com/watch?v=Om4L8mlTiAA', // Daft Punk — Something About Us
  'https://music.youtube.com/watch?v=iHO1YMKUW_8', // Macklemore Ryan Lewis — Can't Hold Us
  'https://music.youtube.com/watch?v=h8U6IMH3tYk', // Macklemore Ryan Lewis — Thrift Shop
  'https://music.youtube.com/watch?v=XfEMj-z3TtA', // The Kid LAROI Justin Bieber — STAY
  'https://music.youtube.com/watch?v=5rnawnfK2sQ', // Justin Bieber — Peaches
  'https://music.youtube.com/watch?v=60HpBjohyQk', // Justin Bieber — Sorry
  'https://music.youtube.com/watch?v=p-IXgwqhfmg', // Justin Bieber — Love Yourself
  'https://music.youtube.com/watch?v=DK_0jXPuIr0', // Justin Bieber — What Do You Mean
  'https://music.youtube.com/watch?v=z9VMaLxg9Ok', // Post Malone Swae Lee — Sunflower
  'https://music.youtube.com/watch?v=CmTRAr2XhaE', // Post Malone — Circles
  'https://music.youtube.com/watch?v=i1QZO9EiVmY', // Post Malone Morgan Wallen — I Had Some Help
  'https://music.youtube.com/watch?v=AaxFIY-cWH0', // Post Malone 21 Savage — Rockstar
  'https://music.youtube.com/watch?v=R8vpQdZErbw', // Post Malone Quavo — Congratulations
  'https://music.youtube.com/watch?v=wa5gkHMqbls', // Harry Styles — As It Was
  'https://music.youtube.com/watch?v=RwT77rlp2CE', // Harry Styles — Late Night Talking
  'https://music.youtube.com/watch?v=KPM_BYl-EaQ', // Harry Styles — Watermelon Sugar
  'https://music.youtube.com/watch?v=iquhBgM-Qv0', // Harry Styles — Adore You
  'https://music.youtube.com/watch?v=m_zZK5ahLo4', // Harry Styles — Golden
  'https://music.youtube.com/watch?v=NvK9APEhcdk', // BTS — Dynamite
  'https://music.youtube.com/watch?v=ECm3ndmW9UE', // BTS — Butter
  'https://music.youtube.com/watch?v=ZBjQwwaHcfQ', // PSY — Gangnam Style
  'https://music.youtube.com/watch?v=72UO0v5ESUo', // Luis Fonsi — Despacito
  'https://music.youtube.com/watch?v=HCjNJDNzw8Y', // Camila Cabello — Havana
  'https://music.youtube.com/watch?v=VKC_hzJ3jzg', // Shawn Mendes Camila Cabello — Señorita
  'https://music.youtube.com/watch?v=EtzhCKkukd4', // Shakira — Hips Don't Lie
  'https://music.youtube.com/watch?v=fFW91xwQFXk', // Shakira — Whenever Wherever
  'https://music.youtube.com/watch?v=Z_slTWayFK0', // Shakira — Waka Waka
  'https://music.youtube.com/watch?v=hEojC-ZKiWY', // Jennifer Lopez Pitbull — On The Floor
  'https://music.youtube.com/watch?v=KLc5qNAzLaM', // Katy Perry — Firework
  'https://music.youtube.com/watch?v=9VcDnWMOBtw', // Katy Perry — Roar
  'https://music.youtube.com/watch?v=CtSjMHuzOzs', // Katy Perry — Dark Horse
].join('\n');

export default function AdminBatchImport({onClose}:{onClose:()=>void}){
  const [links,setLinks]=useState(initialLinks),[jobId,setJobId]=useState<string|null>(null);
  const [status,setStatus]=useState<Status|null>(null),[error,setError]=useState(''),[submitting,setSubmitting]=useState(false);
  const base=(process.env.NEXT_PUBLIC_BEATFORGE_BACKEND_URL||'').replace(/\/$/,'');

  async function adminRequest(path:string,options:RequestInit={}){
    if(!base)throw new Error('The import server is not configured yet.');
    const {data}=await supabase!.auth.getSession();
    if(!data.session)throw new Error('Log in again before importing.');
    const response=await fetch(base+path,{
      ...options,headers:{Authorization:`Bearer ${data.session.access_token}`,'Content-Type':'application/json',...options.headers},
    });
    const body=await response.json();
    if(!response.ok)throw new Error(typeof body.detail==='string'?body.detail:'Import server failed.');
    return body;
  }

  useEffect(()=>{
    if(!jobId)return;
    let stopped=false;
    const check=async()=>{
      try{
        const result=await adminRequest('/admin/import/'+jobId) as Status;
        if(stopped)return;
        setStatus(result);
        if(!result.done)timer=window.setTimeout(check,3000);
      }catch(exc){if(!stopped)setError(exc instanceof Error?exc.message:'Could not check import progress.')}
    };
    let timer=window.setTimeout(check,1000);
    return ()=>{stopped=true;window.clearTimeout(timer)};
  },[jobId]);

  async function start(){
    const list=links.split(/\r?\n/).map(line=>line.trim()).filter(Boolean);
    if(!list.length||list.length>100){setError('Add 1 to 100 links, one per line.');return}
    setError('');setSubmitting(true);setJobId(null);setStatus(null);
    try{
      const result=await adminRequest('/admin/import',{method:'POST',body:JSON.stringify({links:list})});
      setJobId(result.job_id);
    }catch(exc){setError(exc instanceof Error?exc.message:'Could not start import.')}
    finally{setSubmitting(false)}
  }

  return <div className="resultBackdrop" role="dialog" aria-modal="true" aria-label="Import songs">
    <div className="resultCard authCard adminBatchCard">
      <button className="adminBatchClose" type="button" onClick={onClose} aria-label="Close">×</button>
      <small>BEATFORGE ADMIN</small><h2>Import songs</h2>
      <p>100 songs are ready to import. Edit the list if you like. Existing songs are skipped.</p>
      <textarea className="authInput" aria-label="YouTube links" value={links} onChange={e=>setLinks(e.target.value)} disabled={!!jobId&&!status?.done} rows={7}/>
      {error&&<p className="adminBatchError" role="alert">{error}</p>}
      {status&&<div className="adminBatchProgress" aria-live="polite">
        <strong>{status.stop_reason?`Import stopped after ${status.results.length} of ${status.total}`:status.done?'Import finished':`Processing ${status.results.length+1} of ${status.total}`}</strong>
        {status.stop_reason&&<p className="adminBatchError" role="alert">{status.stop_reason}</p>}
        {status.current&&<p>{status.current}</p>}
        {status.results.map((entry,i)=><p key={entry.url+i}>{entry.status==='saved'?'✓':entry.status==='exists'?'↷':'!'} {entry.title||entry.url}: {entry.status==='saved'?`${entry.notes} notes saved`:entry.status==='exists'?'Already in BeatForge':entry.error}</p>)}
      </div>}
      <div className="resultActions"><button disabled={submitting||(!!jobId&&!status?.done)} onClick={start}>{submitting?'STARTING…':status?.done?'RETRY IMPORT':'IMPORT SONGS'}</button><button className="secondary" onClick={onClose}>CLOSE</button></div>
    </div>
  </div>
}
