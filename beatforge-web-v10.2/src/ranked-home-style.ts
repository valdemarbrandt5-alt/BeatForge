if(typeof window!=='undefined'){
  const rankClass=(text:string)=>{
    const t=text.toUpperCase();
    if(t.includes('MASTER'))return 'rhMaster';
    if(t.includes('DIAMOND'))return 'rhDiamond';
    if(t.includes('PLATINUM'))return 'rhPlatinum';
    if(t.includes('GOLD'))return 'rhGold';
    if(t.includes('SILVER'))return 'rhSilver';
    return 'rhBronze';
  };

  const decorate=()=>{
    document.querySelectorAll('.rankedBackdrop.realRanked .rankedCard').forEach(node=>{
      const card=node as HTMLElement;
      const title=card.querySelector('h1')?.textContent?.trim();
      const badge=card.querySelector('.rankBadge') as HTMLElement|null;
      if(title!=='RANKED DUEL'||!badge)return;

      card.classList.add('rankedHomeCard');
      const top=card.querySelector(':scope > small') as HTMLElement|null;
      if(top&&/BEATFORGE COMPETITIVE/i.test(top.textContent||''))top.textContent='BEATFORGE';

      badge.classList.remove('rhBronze','rhSilver','rhGold','rhPlatinum','rhDiamond','rhMaster');
      badge.classList.add('rankedHomeRank',rankClass(badge.querySelector('b')?.textContent||''));

      const stats=badge.querySelector('span') as HTMLElement|null;
      if(stats){
        const match=(stats.textContent||'').match(/(\d+)\s*W\s*[·•]\s*(\d+)\s*L/i);
        if(match)stats.textContent=`${match[1]} WINS · ${match[2]} LOSSES`;
      }
    });
  };

  const install=()=>{
    if(!document.getElementById('ranked-home-style')){
      const style=document.createElement('style');
      style.id='ranked-home-style';
      style.textContent=`
        .realRanked .rankedHomeCard>small{color:#ff7bce!important;font-size:8px!important;font-weight:1000!important;letter-spacing:2px!important}
        .realRanked .rankedHomeCard .rankedHomeRank{
          display:grid!important;justify-items:center!important;gap:2px!important;
          width:min(300px,100%)!important;max-width:300px!important;box-sizing:border-box!important;
          margin:13px auto 15px!important;padding:13px!important;
          border:1px solid #343c4c!important;border-radius:13px!important;
          background:#0c1119!important;box-shadow:none!important;
        }
        .realRanked .rankedHomeCard .rankedHomeRank:before{
          content:'YOUR RANK';font-size:7px!important;color:#7f899c!important;
          font-weight:1000!important;letter-spacing:1px!important;line-height:1.2!important;
        }
        .realRanked .rankedHomeCard .rankedHomeRank b{font-size:20px!important;line-height:1.1!important;margin:0!important}
        .realRanked .rankedHomeCard .rankedHomeRank strong{font-size:12px!important;line-height:1.2!important;color:#f5f7fb!important;margin:0!important}
        .realRanked .rankedHomeCard .rankedHomeRank span{font-size:7px!important;line-height:1.2!important;color:#7f899c!important;font-weight:900!important;margin-top:3px!important}
        .realRanked .rankedHomeRank.rhBronze b{color:#cd7f32!important}
        .realRanked .rankedHomeRank.rhSilver b{color:#c8ced8!important}
        .realRanked .rankedHomeRank.rhGold b{color:#ffd43b!important}
        .realRanked .rankedHomeRank.rhPlatinum b{color:#57e0d1!important}
        .realRanked .rankedHomeRank.rhDiamond b{color:#6aa9ff!important}
        .realRanked .rankedHomeRank.rhMaster b{color:#c084fc!important}
      `;
      document.head.appendChild(style);
    }
    decorate();
    new MutationObserver(decorate).observe(document.body,{childList:true,subtree:true,characterData:true});
  };

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install,{once:true});else install();
}
