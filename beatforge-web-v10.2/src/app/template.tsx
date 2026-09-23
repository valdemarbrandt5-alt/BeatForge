'use client';
import {useEffect,useRef} from 'react';
import RankedMultiplayer from './RankedMultiplayer';
import {supabase} from '../lib/supabase';

export default function Template({children}:{children:React.ReactNode}){
 const timer=useRef<number|null>(null);
 const wasSearching=useRef(false);

 useEffect(()=>{
  if(!supabase)return;
  const db=supabase;
  const stop=()=>{
   if(timer.current!==null){window.clearInterval(timer.current);timer.current=null}
   if(wasSearching.current){wasSearching.current=false;void db.rpc('leave_ranked_queue')}
  };
  const beat=async()=>{
   // Only the real multiplayer queue has .cancelRealQueue.
   // The old simulated prototype uses .cancelQueue and is deliberately ignored.
   if(!document.querySelector('.realRanked .cancelRealQueue')){stop();return}
   wasSearching.current=true;
   const {error}=await db.rpc('heartbeat_ranked_queue');
   if(error)console.error('ranked queue heartbeat',error);
  };
  const sync=()=>{
   const active=!!document.querySelector('.realRanked .cancelRealQueue');
   if(active&&timer.current===null){wasSearching.current=true;void beat();timer.current=window.setInterval(beat,2000)}
   else if(!active&&timer.current!==null)stop();
  };
  const observer=new MutationObserver(sync);
  observer.observe(document.body,{childList:true,subtree:true});
  sync();
  const hide=()=>stop();
  window.addEventListener('pagehide',hide);
  return()=>{observer.disconnect();window.removeEventListener('pagehide',hide);stop()};
 },[]);

 return <><RankedMultiplayer/>{children}</>;
}
