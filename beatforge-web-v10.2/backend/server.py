from fastapi import FastAPI, UploadFile, File, Form, HTTPException, Header
from fastapi.middleware.cors import CORSMiddleware
import tempfile, subprocess, sys, shutil, hashlib, os, uuid, threading
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from pydantic import BaseModel
import urllib.request
import urllib.parse
import json
import numpy as np
import soundfile as sf
from scipy.ndimage import gaussian_filter1d

app=FastAPI(title='BeatForge AI Backend')
app.add_middleware(CORSMiddleware,allow_origins=['http://localhost:3000','http://127.0.0.1:3000',*[origin.strip() for origin in os.getenv('BEATFORGE_FRONTEND_ORIGINS','').split(',') if origin.strip()]],allow_methods=['*'],allow_headers=['*'])

# Jobs run serially so simultaneous admins cannot exhaust RAM during Demucs separation.
_import_executor=ThreadPoolExecutor(max_workers=1)
_import_jobs={}
_import_lock=threading.Lock()

class ImportLinks(BaseModel):
    links:list[str]

def _admin_from_token(authorization:str|None):
    base=os.getenv('SUPABASE_URL','').rstrip('/')
    key=os.getenv('SUPABASE_SERVICE_ROLE_KEY','')
    if not base or not key: raise HTTPException(503,'Admin import is not configured on the backend')
    if not authorization or not authorization.startswith('Bearer '): raise HTTPException(401,'Sign in first')
    token=authorization[7:]
    if not token or len(token)>4096: raise HTTPException(401,'Invalid session')
    try:
        req=urllib.request.Request(base+'/auth/v1/user',headers={'apikey':key,'Authorization':'Bearer '+token})
        with urllib.request.urlopen(req,timeout=10) as response:
            user=json.load(response)
        user_id=str(uuid.UUID(user['id']))
        from import_youtube_charts import request_json
        if not request_json(base,key,'profiles?select=id&is_admin=eq.true&id=eq.'+user_id):
            raise HTTPException(403,'Admin access required')
        return user_id
    except HTTPException: raise
    except Exception as exc: raise HTTPException(401,'Could not verify admin session') from exc

def _run_import(job_id:str,ids:list[str],admin_id:str):
    from import_youtube_charts import request_json, youtube_metadata, download_audio, generate_chart
    base=os.environ['SUPABASE_URL'];key=os.environ['SUPABASE_SERVICE_ROLE_KEY']
    for video_id in ids:
        url='https://www.youtube.com/watch?v='+video_id
        with _import_lock:
            _import_jobs[job_id]['current']=url
        try:
            query='charts?select=id&youtube_url=ilike.'+urllib.parse.quote('*'+video_id+'*',safe='')+'&limit=1'
            if request_json(base,key,query):
                result={'url':url,'status':'exists'}
            else:
                meta=youtube_metadata(url)
                title=str(meta.get('track') or meta.get('title') or video_id).strip()
                artist=str(meta.get('artist') or meta.get('creator') or meta.get('uploader') or 'Unknown artist').strip()
                with tempfile.TemporaryDirectory(prefix='beatforge_import_') as temp:
                    directory=Path(temp)
                    notes,duration=generate_chart(download_audio(url,directory),directory)
                    request_json(base,key,'charts','POST',{'user_id':admin_id,'title':title,'artist':artist,
                        'youtube_url':url,'difficulty':'Medium','lane_count':5,'duration':duration,'notes':notes})
                result={'url':url,'status':'saved','title':title,'artist':artist,'notes':len(notes)}
        except Exception as exc:
            result={'url':url,'status':'failed','error':str(exc)[:240]}
        with _import_lock:
            _import_jobs[job_id]['results'].append(result)
            _import_jobs[job_id]['current']=None
    with _import_lock:
        _import_jobs[job_id]['done']=True

@app.post('/admin/import')
def start_admin_import(payload:ImportLinks,authorization:str|None=Header(default=None)):
    admin_id=_admin_from_token(authorization)
    from import_youtube_charts import parse_video_id
    if not payload.links or len(payload.links)>100: raise HTTPException(400,'Add 1 to 100 video links')
    try: ids=list(dict.fromkeys(parse_video_id(link) for link in payload.links))
    except ValueError as exc: raise HTTPException(400,str(exc)) from exc
    with _import_lock:
        if any(not job['done'] for job in _import_jobs.values()):
            raise HTTPException(409,'An import is already running')
        job_id=uuid.uuid4().hex
        _import_jobs.clear()
        _import_jobs[job_id]={'owner':admin_id,'total':len(ids),'results':[],'current':None,'done':False}
    _import_executor.submit(_run_import,job_id,ids,admin_id)
    return {'job_id':job_id}

@app.get('/admin/import/{job_id}')
def admin_import_status(job_id:str,authorization:str|None=Header(default=None)):
    admin_id=_admin_from_token(authorization)
    with _import_lock:
        job=_import_jobs.get(job_id)
        if not job or job['owner']!=admin_id: raise HTTPException(404,'Import not found')
        return {key:value for key,value in job.items() if key!='owner'}

@app.get('/')
def root(): return {'ok':True,'service':'BeatForge AI Backend','health':'/health'}

@app.get('/health')
def health(): return {'ok':True,'engine':'demucs'}

def analyze_stem(path:Path, instrument:str):
    y,sr=sf.read(path,always_2d=True,dtype='float32'); y=y.mean(axis=1)
    duration=len(y)/sr
    peak=np.percentile(np.abs(y),99.5) or 1.0; y=np.clip(y/peak,-1,1)
    hop=512; win=2048
    if len(y)<win:return [],duration
    frames=1+(len(y)-win)//hop
    rms=np.empty(frames,np.float32); flux=np.empty(frames,np.float32); prev=None
    window=np.hanning(win).astype(np.float32)
    for i in range(frames):
        x=y[i*hop:i*hop+win]*window
        rms[i]=np.sqrt(np.mean(x*x)+1e-10)
        mag=np.abs(np.fft.rfft(x))
        flux[i]=0 if prev is None else np.maximum(0,mag-prev).sum()/(mag.sum()+1e-8)
        prev=mag
    rms=gaussian_filter1d(rms,1.0); flux=gaussian_filter1d(flux,1.0)
    # local/adaptive threshold catches quiet verses as well as loud choruses
    radius=max(8,int(sr/hop*2.0)); local=np.empty_like(rms)
    for i in range(frames): local[i]=np.median(rms[max(0,i-radius):min(frames,i+radius+1)])
    activity=rms/(local+np.percentile(rms,20)+1e-5)
    score=flux*(0.55+0.45*np.clip(activity,0,3))
    q={'vocals':72,'drums':62,'bass':70,'melody':70}.get(instrument,70)
    base=np.percentile(score,q)
    min_gap={'vocals':.20,'drums':.12,'bass':.20,'melody':.18}.get(instrument,.18)
    candidates=[]; last=-99
    for i in range(2,frames-2):
        t=i*hop/sr
        local_score=np.median(score[max(0,i-radius):min(frames,i+radius+1)])
        thr=max(base*.38,local_score*1.45)
        if score[i]>thr and score[i]>=score[i-1] and score[i]>=score[i+1] and t-last>=min_gap and rms[i]>np.percentile(rms,18):
            candidates.append((i,t)); last=t
    notes=[]
    seed=int(hashlib.sha1((path.name+instrument).encode()).hexdigest()[:8],16); rng=np.random.default_rng(seed); prev_lane=-1
    for idx,(fi,t) in enumerate(candidates[:1600]):
        # duration from sustained local activity; conservative for drums
        dur=0.0
        if instrument!='drums':
            floor=max(np.percentile(rms,25),rms[fi]*.24); j=fi+1; max_frames=int(4.0*sr/hop)
            while j<frames and j-fi<max_frames and rms[j]>floor:
                # stop near a strong new onset so one phrase doesn't swallow the next
                if j>fi+int(.28*sr/hop) and score[j]>max(base*.7,score[fi]*.8): break
                j+=1
            raw=(j-fi)*hop/sr
            if raw>=.48: dur=min(raw,3.5)
        choices=[x for x in range(5) if x!=prev_lane] or list(range(5)); lane=int(rng.choice(choices)); prev_lane=lane
        notes.append({'id':idx,'time':round(float(t),4),'lane':lane,'duration':round(float(dur),4)})
    return notes,duration

@app.post('/analyze-all')
async def analyze_all(file:UploadFile=File(...)):
    root=Path(tempfile.mkdtemp(prefix='beatforge_'))
    try:
        suffix=Path(file.filename or 'song.wav').suffix or '.wav'; src=root/f'song{suffix}'; src.write_bytes(await file.read())
        out=root/'separated'
        cmd=[sys.executable,'-m','demucs','-n','htdemucs','--out',str(out),str(src)]
        proc=subprocess.run(cmd,capture_output=True,text=True)
        if proc.returncode!=0: raise HTTPException(500,'Demucs failed: '+proc.stderr[-1200:])
        stem_dir=out/'htdemucs'/'song'
        mapping={'vocals':'vocals.wav','drums':'drums.wav','bass':'bass.wav','melody':'other.wav'}
        charts={}; duration=0.0
        for instrument,filename in mapping.items():
            stem_path=stem_dir/filename
            if not stem_path.exists(): raise HTTPException(500,f'Missing separated stem: {filename}')
            notes,d=analyze_stem(stem_path,instrument); duration=max(duration,d)
            charts[instrument]={'notes':notes,'stem':filename}
        return {'charts':charts,'duration':duration,'generator':'demucs-adaptive-v2','cached':True}
    finally: shutil.rmtree(root,ignore_errors=True)

@app.post('/analyze')
async def analyze(file:UploadFile=File(...),instrument:str=Form('vocals')):
    instrument=instrument.lower(); stem={'vocals':'vocals','drums':'drums','bass':'bass','melody':'other'}.get(instrument)
    if not stem: raise HTTPException(400,'Unknown instrument')
    root=Path(tempfile.mkdtemp(prefix='beatforge_'))
    try:
        suffix=Path(file.filename or 'song.wav').suffix or '.wav'; src=root/f'song{suffix}'; src.write_bytes(await file.read())
        out=root/'separated'
        cmd=[sys.executable,'-m','demucs','-n','htdemucs','--out',str(out),str(src)]
        proc=subprocess.run(cmd,capture_output=True,text=True)
        if proc.returncode!=0: raise HTTPException(500,'Demucs failed: '+proc.stderr[-1200:])
        stem_path=out/'htdemucs'/'song'/f'{stem}.wav'
        if not stem_path.exists(): raise HTTPException(500,f'Missing separated stem: {stem}')
        notes,duration=analyze_stem(stem_path,instrument)
        if len(notes)<4: raise HTTPException(422,'Too few musical events detected in this stem.')
        return {'notes':notes,'duration':duration,'instrument':instrument,'stem':stem_path.name,'generator':'demucs-adaptive-v2'}
    finally: shutil.rmtree(root,ignore_errors=True)

if __name__ == '__main__':
    import uvicorn
    uvicorn.run(app, host='127.0.0.1', port=8000)
