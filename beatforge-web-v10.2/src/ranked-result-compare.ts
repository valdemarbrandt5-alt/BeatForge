import { supabase } from './lib/supabase';

type Stats={perfect:number;great:number;good:number;miss:number;maxCombo:number;score?:number};

if(typeof window!=='undefined'&&supabase&&window.location.pathname==='/'){
  const db:any=supabase;
  let uid='';
  let lastHumanStats:Stats|null=null;
  let lastHumanMatchId:string|null=null;
  let lastBotStats:Stats|null=null;
  let lastBotMatchId:string|null=null;
  const seenResults=new WeakSet<Element>();
  const submittedHuman=new Set<string>();

  const numberFrom=(v:string|null|undefined)=>Number(String(v||'0').replace(/[^0-9-]/g,''))||0;
  const esc=(s:any)=>String(s??'').replace(/[&<>"']/g,(c:string)=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]||c));
  const accuracy=(s:Stats)=>{const total=s.perfect+s.great+s.good+s.miss;return total?((s.perfect+s.great+s.good)/total*100):0};

  const getUid=async()=>{
    if(uid)return uid;
    const {data}=await db.auth.getUser();uid=data?.user?.id||'';return uid;
  };

  const captureResult=(card:Element):Stats=>({
    score:numberFrom(card.querySelector('.finalScore')?.textContent),
    perfect:numberFrom(card.querySelector('.perfectStat b')?.textContent),
    great:numberFrom(card.querySelector('.greatStat b')?.textContent),
    good:numberFrom(card.querySelector('.goodStat b')?.textContent),
    miss:numberFrom(card.querySelector('.missStat b')?.textContent),
    maxCombo:numberFrom(card.querySelector('.resultMeta>div:nth-child(2) b')?.textContent),
  });

  const captureRankedPerformance=(card:Element):Stats|null=>{
    const perf=card.querySelector('.rankedPerformance');if(!perf)return null;
    const cells=[...perf.querySelectorAll(':scope>div')];
    if(cells.length<6)return null;
    const byLabel=(label:string)=>cells.find(x=>(x.querySelector('span')?.textContent||'').trim().toUpperCase()===label)?.querySelector('b')?.textContent;
    return{
      perfect:numberFrom(byLabel('PERFECT')),
      great:numberFrom(byLabel('GREAT')),
      good:numberFrom(byLabel('GOOD')),
      miss:numberFrom(byLabel('MISS')),
      maxCombo:numberFrom(byLabel('MAX COMBO')),
    };
  };

  const findHumanMatch=async()=>{
    const me=await getUid();if(!me)return null;
    const cutoff=new Date(Date.now()-30*60*1000).toISOString();
    const {data}=await db.from('ranked_matches').select('id,status,player_1,player_2,created_at')
      .or(`player_1.eq.${me},player_2.eq.${me}`).in('status',['playing','finished'])
      .gt('created_at',cutoff).order('created_at',{ascending:false}).limit(1).maybeSingle();
    return data||null;
  };

  const findBotMatch=async()=>{
    const me=await getUid();if(!me)return null;
    const cutoff=new Date(Date.now()-30*60*1000).toISOString();
    const {data}=await db.from('ranked_bot_matches').select('id,status,bot_name,bot_score,created_at')
      .eq('user_id',me).in('status',['playing','finished']).gt('created_at',cutoff)
      .order('created_at',{ascending:false}).limit(1).maybeSingle();
    return data||null;
  };

  const submitHuman=async(id:string,stats:Stats)=>{
    if(submittedHuman.has(id))return;
    submittedHuman.add(id);
    const {error}=await db.rpc('submit_ranked_performance',{
      p_match:id,p_perfect:stats.perfect,p_great:stats.great,p_good:stats.good,p_miss:stats.miss,p_max_combo:stats.maxCombo,
    });
    if(error){submittedHuman.delete(id);if(!/does not exist|schema cache/i.test(error.message||''))console.error('ranked performance submit',error)}
  };

  const resultPanel=(card:HTMLElement)=>{
    let panel=card.querySelector('.rankedResultCompare') as HTMLElement|null;
    if(!panel){
      panel=document.createElement('div');panel.className='rankedResultCompare';
      const mmr=card.querySelector('.rankedMmrResult');
      if(mmr)card.insertBefore(panel,mmr);else card.appendChild(panel);
    }
    return panel;
  };

  const rowHtml=(label:string,a:string,b:string,cls='')=>`<div class="rankedCompareRow ${cls}"><b>${a}</b><span>${label}</span><b>${b}</b></div>`;

  const renderCompare=(card:HTMLElement,title:string,opponent:string,me:Stats,opp:Stats)=>{
    const panel=resultPanel(card);
    panel.dataset.ready='1';
    panel.innerHTML=`<small>${esc(title)}</small><h3>PERFORMANCE COMPARISON</h3><div class="rankedCompareNames"><b>YOU</b><span>VS</span><b>${esc(opponent)}</b></div>${rowHtml('SCORE',(me.score||0).toLocaleString('da-DK'),(opp.score||0).toLocaleString('da-DK'))}${rowHtml('ACCURACY',`${accuracy(me).toFixed(1)}%`,`${accuracy(opp).toFixed(1)}%`)}${rowHtml('PERFECT',String(me.perfect),String(opp.perfect),'perfect')}${rowHtml('GREAT',String(me.great),String(opp.great),'great')}${rowHtml('GOOD',String(me.good),String(opp.good),'good')}${rowHtml('MISS',String(me.miss),String(opp.miss),'miss')}${rowHtml('MAX COMBO',`${me.maxCombo}x`,`${opp.maxCombo}x`)}`;
  };

  const waiting=(card:HTMLElement,text='Loading opponent performance…')=>{
    const panel=resultPanel(card);if(panel.dataset.ready==='1')return;
    panel.innerHTML=`<small>RANKED HEAD TO HEAD</small><h3>PERFORMANCE COMPARISON</h3><div class="rankedCompareWaiting">${esc(text)}</div>`;
  };

  const decorateHumanResult=async(card:HTMLElement)=>{
    if(card.dataset.bfHumanCompare==='loading'||card.querySelector('.rankedResultCompare')?.getAttribute('data-ready')==='1')return;
    card.dataset.bfHumanCompare='loading';waiting(card);
    const me=await getUid();if(!me)return;
    let match=lastHumanMatchId?{id:lastHumanMatchId}:null;
    if(!match)match=await findHumanMatch();
    if(!match?.id){delete card.dataset.bfHumanCompare;return}
    lastHumanMatchId=String(match.id);
    const local=lastHumanStats||captureRankedPerformance(card);
    if(local)await submitHuman(lastHumanMatchId,local);

    for(let i=0;i<60;i++){
      const {data,error}=await db.rpc('get_ranked_performance',{p_match:lastHumanMatchId});
      if(!error){
        const row=Array.isArray(data)?data[0]:data;
        if(row?.player_1_perf_ready&&row?.player_2_perf_ready){
          const mineOne=String(row.player_1)===me;
          const oppId=String(mineOne?row.player_2:row.player_1);
          const {data:profile}=await db.from('profiles').select('username').eq('id',oppId).maybeSingle();
          const mine:Stats={
            score:Number(mineOne?row.player_1_score:row.player_2_score)||0,
            perfect:Number(mineOne?row.player_1_perfect:row.player_2_perfect)||0,
            great:Number(mineOne?row.player_1_great:row.player_2_great)||0,
            good:Number(mineOne?row.player_1_good:row.player_2_good)||0,
            miss:Number(mineOne?row.player_1_miss:row.player_2_miss)||0,
            maxCombo:Number(mineOne?row.player_1_max_combo:row.player_2_max_combo)||0,
          };
          const opp:Stats={
            score:Number(mineOne?row.player_2_score:row.player_1_score)||0,
            perfect:Number(mineOne?row.player_2_perfect:row.player_1_perfect)||0,
            great:Number(mineOne?row.player_2_great:row.player_1_great)||0,
            good:Number(mineOne?row.player_2_good:row.player_1_good)||0,
            miss:Number(mineOne?row.player_2_miss:row.player_1_miss)||0,
            maxCombo:Number(mineOne?row.player_2_max_combo:row.player_1_max_combo)||0,
          };
          renderCompare(card,'RANKED HEAD TO HEAD',profile?.username||'Opponent',mine,opp);
          return;
        }
      }
      await new Promise(r=>setTimeout(r,500));
      if(!document.contains(card))return;
    }
    waiting(card,'Opponent performance unavailable.');
  };

  const decorateBotResult=async(card:HTMLElement)=>{
    if(card.dataset.bfBotCompare==='loading'||card.querySelector('.rankedResultCompare')?.getAttribute('data-ready')==='1')return;
    card.dataset.bfBotCompare='loading';waiting(card,'Loading bot performance…');
    let match:any=lastBotMatchId?{id:lastBotMatchId}:null;
    if(!match||!match.bot_name)match=await findBotMatch();
    if(!match?.id){delete card.dataset.bfBotCompare;return}
    lastBotMatchId=String(match.id);
    const local=lastBotStats||captureRankedPerformance(card);
    if(!local){delete card.dataset.bfBotCompare;return}
    const {data,error}=await db.rpc('get_ranked_bot_performance',{p_match:lastBotMatchId});
    if(error){waiting(card,'Bot performance unavailable.');return}
    const row=Array.isArray(data)?data[0]:data;
    if(!row)return;
    local.score=numberFrom(card.querySelector('.rankedFinalScores span:first-child b')?.textContent)||local.score||0;
    const opp:Stats={
      score:Number(row.bot_score)||numberFrom(card.querySelector('.rankedFinalScores span:last-child b')?.textContent),
      perfect:Number(row.bot_perfect)||0,great:Number(row.bot_great)||0,good:Number(row.bot_good)||0,miss:Number(row.bot_miss)||0,maxCombo:Number(row.bot_max_combo)||0,
    };
    renderCompare(card,'RANKED HEAD TO HEAD',match.bot_name||'Bot',local,opp);
  };

  const captureSoloResult=async(card:HTMLElement)=>{
    if(seenResults.has(card))return;seenResults.add(card);
    const stats=captureResult(card);
    if(document.querySelector('.botRankedLiveHud')){
      lastBotStats=stats;const m=await findBotMatch();if(m?.id)lastBotMatchId=String(m.id);return;
    }
    if(document.querySelector('.realRankedLiveHud')){
      lastHumanStats=stats;const m=await findHumanMatch();if(m?.id){lastHumanMatchId=String(m.id);await submitHuman(lastHumanMatchId,stats)}
    }
  };

  const scan=()=>{
    document.querySelectorAll('.resultBackdrop .resultCard').forEach(node=>{
      if(/SONG COMPLETE/i.test(node.textContent||''))void captureSoloResult(node as HTMLElement);
    });
    document.querySelectorAll('.rankedBackdrop.realRanked .rankedCard').forEach(node=>{
      const card=node as HTMLElement;if(/RANKED DUEL COMPLETE/i.test(card.textContent||''))void decorateHumanResult(card);
    });
    document.querySelectorAll('.rankedBotBackdrop .rankedBotCard').forEach(node=>{
      const card=node as HTMLElement;if(/RANKED DUEL COMPLETE/i.test(card.textContent||''))void decorateBotResult(card);
    });
  };

  const addStyles=()=>{
    if(document.getElementById('ranked-result-compare-style'))return;
    const s=document.createElement('style');s.id='ranked-result-compare-style';s.textContent=`
      .rankedResultCompare{margin:12px 0 14px;padding:13px;border:1px solid #343c4c;border-radius:13px;background:#0b1018;text-align:left}.rankedResultCompare>small{display:block;text-align:center;color:#9c83ff;font-size:8px;font-weight:1000;letter-spacing:1.4px}.rankedResultCompare h3{text-align:center;margin:5px 0 11px;font-size:15px}.rankedCompareNames{display:grid;grid-template-columns:1fr 64px 1fr;align-items:center;text-align:center;margin-bottom:7px}.rankedCompareNames b{font-size:10px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.rankedCompareNames span{font-size:7px;color:#687184;font-weight:1000}.rankedCompareRow{display:grid;grid-template-columns:1fr 64px 1fr;align-items:center;text-align:center;min-height:27px;border-top:1px solid #202734}.rankedCompareRow span{font-size:7px;color:#7f899b;font-weight:1000;letter-spacing:.6px}.rankedCompareRow b{font-size:11px}.rankedCompareRow.perfect b{color:#ffd43b}.rankedCompareRow.great b{color:#4ee6a8}.rankedCompareRow.good b{color:#ffad42}.rankedCompareRow.miss b{color:#ff5d6c}.rankedCompareWaiting{text-align:center;color:#8993a6;font-size:9px;padding:7px 0 2px}
    `;document.head.appendChild(s);
  };

  const start=()=>{addStyles();scan();new MutationObserver(scan).observe(document.body,{childList:true,subtree:true,characterData:true});window.setInterval(scan,350)};
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
}
