'use client';
import {useEffect,useRef} from 'react';
import RankedMultiplayer from './RankedMultiplayer';
import {supabase} from '../lib/supabase';

export default function Template({children}:{children:React.ReactNode}){
 const timer=useRef<number|null>(null);
 const wasSearching=useRef(false);
 const rankedResult=useRef<HTMLElement|null>(null);

 useEffect(()=>{
  if(!supabase)return;
  const db=supabase;
  const stop=()=>{
   if(timer.current!==null){window.clearInterval(timer.current);timer.current=null}
   if(wasSearching.current){wasSearching.current=false;void db.rpc('leave_ranked_queue')}
  };
  const beat=async()=>{
   if(!document.querySelector('.realRanked .cancelRealQueue')){stop();return}
   wasSearching.current=true;
   const {error}=await db.rpc('heartbeat_ranked_queue');
   if(error)console.error('ranked queue heartbeat',error);
  };
  const rescueRankedResult=()=>{
   const result=[...document.querySelectorAll('.rankedBackdrop.realRanked')].find(x=>/RANKED DUEL COMPLETE/i.test(x.textContent||'')) as HTMLElement|undefined;
   if(result)rankedResult.current=result;
   document.querySelectorAll('.resultBackdrop').forEach(x=>{
    if(rankedResult.current){const el=x as HTMLElement;el.style.display='none';el.style.pointerEvents='none'}
   });
  };
  const sync=()=>{
   const active=!!document.querySelector('.realRanked .cancelRealQueue');
   if(active&&timer.current===null){wasSearching.current=true;void beat();timer.current=window.setInterval(beat,2000)}
   else if(!active&&timer.current!==null)stop();
   rescueRankedResult();
  };
  const observer=new MutationObserver(sync);
  observer.observe(document.body,{childList:true,subtree:true});
  sync();
  const onFullscreenChange=()=>{
   const saved=rankedResult.current;
   if(!document.fullscreenElement&&saved){
    window.setTimeout(()=>{
     if(!saved.isConnected)document.body.appendChild(saved);
     saved.style.display='grid';saved.style.pointerEvents='auto';saved.style.zIndex='2147483647';
     document.querySelectorAll('.duelHud,.realRankedLiveHud').forEach(x=>x.remove());
     document.querySelectorAll('.resultBackdrop').forEach(x=>{const el=x as HTMLElement;el.style.display='none';el.style.pointerEvents='none'});
    },0);
   }
  };
  const hide=()=>stop();
  window.addEventListener('pagehide',hide);
  document.addEventListener('fullscreenchange',onFullscreenChange);
  return()=>{observer.disconnect();window.removeEventListener('pagehide',hide);document.removeEventListener('fullscreenchange',onFullscreenChange);stop()};
 },[]);

 return <><RankedMultiplayer/>{children}</>;
}
