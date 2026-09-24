'use client';
import {useEffect,useRef} from 'react';
import RankedMultiplayer from './RankedMultiplayer';
import {supabase} from '../lib/supabase';
import '../ranked-ui-enhancements';
import '../ranked-forfeit';
import '../main-ui-tweaks';
import '../casual-social';
import '../casual-live';

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
  const installProfileNav=()=>{
   const area=document.querySelector('.accountArea');
   if(!area||area.querySelector('.profileNavBtn'))return;
   const buttons=Array.from(area.querySelectorAll('button'));
   if(!buttons.some(button=>button.textContent?.trim()==='LOG OUT'))return;
   const profile=document.createElement('button');
   profile.className='accountBtn profileNavBtn';
   profile.textContent='PROFILE';
   profile.onclick=()=>{window.location.href='/profile'};
   const charts=buttons.find(button=>button.textContent?.trim()==='MY CHARTS');
   if(charts)charts.insertAdjacentElement('afterend',profile);else area.appendChild(profile);
  };
  const sync=()=>{
   const active=!!document.querySelector('.realRanked .cancelRealQueue');
   if(active&&timer.current===null){wasSearching.current=true;void beat();timer.current=window.setInterval(beat,2000)}
   else if(!active&&timer.current!==null)stop();
   installProfileNav();
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
