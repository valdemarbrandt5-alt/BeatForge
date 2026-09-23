if (typeof window !== 'undefined') {
  const install = () => {
    if (document.getElementById('beatforge-main-ui-tweaks')) return;
    const style = document.createElement('style');
    style.id = 'beatforge-main-ui-tweaks';
    style.textContent = `
      .analysisNote{display:none!important}
      .controls>.debug{display:none!important}
      .accountArea .accountEmail{display:none!important}
      .accountArea{align-items:center!important;gap:10px!important;flex-wrap:nowrap!important}
      .accountArea .accountBtn,.accountArea .rankedNavBtn{
        height:42px!important;min-height:42px!important;padding:0 18px!important;
        display:inline-flex!important;align-items:center!important;justify-content:center!important;
        white-space:nowrap!important;line-height:1!important;border-radius:10px!important;
        border:1px solid #343a47!important;background:#141923!important;color:#f5f7fb!important;
        box-shadow:none!important;font-size:11px!important;font-weight:900!important;
      }
      .accountArea .accountBtn:hover,.accountArea .rankedNavBtn:hover{border-color:#6656a6!important;background:#191d2a!important}
      .accountArea .profileNavBtn{white-space:nowrap!important}
      @media(max-width:1050px){.accountArea{gap:7px!important}.accountArea .accountBtn,.accountArea .rankedNavBtn{padding:0 12px!important}}
    `;
    document.head.appendChild(style);
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded',install,{once:true}); else install();
}
