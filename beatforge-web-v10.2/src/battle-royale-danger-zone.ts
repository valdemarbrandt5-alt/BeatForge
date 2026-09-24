if (typeof window !== 'undefined') {
  const dangerCountFor = (alive:number) => alive <= 2 ? 1 : 2;

  const decorate = () => {
    const list = document.querySelector('.brLiveHud .brLiveList') as HTMLElement | null;
    if (!list) return;
    const rows = [...list.querySelectorAll('.brLiveRow')] as HTMLElement[];
    if (rows.length < 2) return;

    rows.forEach(row => row.classList.remove('brDanger','brDangerStart'));
    const dangerCount = Math.min(dangerCountFor(rows.length), rows.length - 1);
    const firstDanger = rows.length - dangerCount;
    rows.slice(firstDanger).forEach((row, index) => {
      row.classList.add('brDanger');
      if (index === 0) row.classList.add('brDangerStart');
    });
  };

  const addStyles = () => {
    if (document.getElementById('br-danger-zone-style')) return;
    const style = document.createElement('style');
    style.id = 'br-danger-zone-style';
    style.textContent = `
      .brLiveHud .brLiveList{overflow:visible!important}
      .brLiveHud .brLiveRow.brDanger{border-color:#ff4d5e!important;background:linear-gradient(90deg,#2a1018,#12131a)!important;box-shadow:inset 2px 0 #ff4d5e,0 0 8px #ff4d5e24!important}
      .brLiveHud .brLiveRow.brDanger>i,.brLiveHud .brLiveRow.brDanger>b,.brLiveHud .brLiveRow.brDanger>span>strong{color:#ff6676!important}
      .brLiveHud .brLiveRow.brDangerStart{position:relative;margin-top:20px!important}
      .brLiveHud .brLiveRow.brDangerStart:before{content:'DANGER ZONE';position:absolute;left:0;right:0;top:-16px;height:13px;display:flex;align-items:center;justify-content:center;border-top:1px solid #ff4d5e88;color:#ff6676;font-size:6px;font-weight:1000;letter-spacing:1.3px;text-shadow:0 0 8px #ff4d5e66}
      .brLiveHud .brLiveRow.brDangerStart:after{content:'';position:absolute;left:0;right:0;top:-1px;border-top:1px solid #ff4d5e44}
    `;
    document.head.appendChild(style);
  };

  const start = () => {
    addStyles();
    decorate();
    new MutationObserver(decorate).observe(document.body,{childList:true,subtree:true});
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded',start,{once:true});
  else start();
}
