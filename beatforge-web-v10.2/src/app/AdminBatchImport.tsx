'use client';

import {useEffect,useState} from 'react';
import {supabase} from '../lib/supabase';

type Result={url:string;status:'saved'|'exists'|'failed';title?:string;artist?:string;notes?:number;error?:string};
type Status={total:number;results:Result[];current:string|null;done:boolean};

const initialLinks=[
  'https://www.youtube.com/watch?v=TAZkHYyio-M',
  'https://www.youtube.com/watch?v=Pz4L3HML6l8',
  'https://www.youtube.com/watch?v=-qKTo_upUeQ',
  'https://www.youtube.com/watch?v=2I9eC2MRhto',
  'https://www.youtube.com/watch?v=Yboj5OnAeEo',
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
    if(!list.length||list.length>30){setError('Add 1 to 30 links, one per line.');return}
    setError('');setSubmitting(true);setStatus(null);
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
      <p>Paste one YouTube link per line. The five links you sent are already here.</p>
      <textarea className="authInput" aria-label="YouTube links" value={links} onChange={e=>setLinks(e.target.value)} disabled={!!jobId} rows={7}/>
      {error&&<p className="adminBatchError" role="alert">{error}</p>}
      {status&&<div className="adminBatchProgress" aria-live="polite">
        <strong>{status.done?'Import finished':`Processing ${status.results.length+1} of ${status.total}`}</strong>
        {status.current&&<p>{status.current}</p>}
        {status.results.map((entry,i)=><p key={entry.url+i}>{entry.status==='saved'?'✓':entry.status==='exists'?'↷':'!'} {entry.title||entry.url}: {entry.status==='saved'?`${entry.notes} notes saved`:entry.status==='exists'?'Already in BeatForge':entry.error}</p>)}
      </div>}
      <div className="resultActions"><button disabled={submitting||!!jobId} onClick={start}>{submitting?'STARTING…':'IMPORT SONGS'}</button><button className="secondary" onClick={onClose}>CLOSE</button></div>
    </div>
  </div>
}
