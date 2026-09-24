from fastapi import FastAPI, UploadFile, File, Form, HTTPException, Header
from fastapi.middleware.cors import CORSMiddleware
import tempfile, subprocess, sys, shutil, os, uuid, threading
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from pydantic import BaseModel
import urllib.request
import urllib.parse
import json
from stem_chart import analyze_stem, STEMS

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
    consecutive_auth_errors=0
    for video_id in ids:
        url='https://www.youtube.com/watch?v='+video_id
        with _import_lock:
            _import_jobs[job_id]['current']=url
        try:
            query='charts?select=id,instrument&youtube_url=ilike.'+urllib.parse.quote('*'+video_id+'*',safe='')+'&limit=100'
            if any(row['instrument']=='mix' for row in (request_json(base,key,query) or [])):
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
            consecutive_auth_errors=0
        except Exception as exc:
            result={'url':url,'status':'failed','error':str(exc)[:240]}
            message=str(exc).lower()
            if 'sign in to confirm you' in message or 'youtube session cookies have expired or rotated' in message:
                consecutive_auth_errors+=1
            else:
                consecutive_auth_errors=0
        with _import_lock:
            _import_jobs[job_id]['results'].append(result)
            _import_jobs[job_id]['current']=None
            if consecutive_auth_errors>=3:
                _import_jobs[job_id]['stop_reason']='YouTube rejected three songs in a row. Replace the Railway YouTube cookies, then start the import again.'
                break
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
        _import_jobs[job_id]={'owner':admin_id,'total':len(ids),'results':[],'current':None,'done':False,'stop_reason':None}
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
        mapping=STEMS
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
