'use client';
import {useEffect} from 'react';
import RankedMultiplayer from './RankedMultiplayer';
import '../ranked-ui-enhancements';
import '../ranked-home-style';
import '../ranked-forfeit';
import '../ranked-bots';
import '../ranked-bot-ui';
import '../ranked-bot-fullscreen-fix';
import '../ranked-result-compare';
import '../battle-royale';
import '../battle-royale-danger-zone';
import '../main-ui-tweaks';
import '../solo-ui-enhancements';
import '../friend-lobby';

export default function Template({children}:{children:React.ReactNode}){
 useEffect(()=>{
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
   installProfileNav();
   // React dialogs already define their own close actions; mirror them in the corner.
   document.querySelectorAll('.resultBackdrop .resultCard').forEach(node=>{
    const card=node as HTMLElement;
    if(card.querySelector('.beatforgeModalX'))return;
    const action=Array.from(card.querySelectorAll('button')).find(button=>/^(CLOSE|CANCEL|DONE|BACK)$/.test(button.textContent?.trim()||''));
    if(!action)return;
    const x=document.createElement('button');x.type='button';x.className='beatforgeModalX';x.textContent='×';x.setAttribute('aria-label','Close');
    x.onclick=()=>action.click();card.prepend(x);
   });
  };
  const observer=new MutationObserver(sync);
  observer.observe(document.body,{childList:true,subtree:true});
  sync();
  return()=>observer.disconnect();
 },[]);

 return <><RankedMultiplayer/>{children}</>;
}
