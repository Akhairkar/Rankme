// LocalBoost shared UI: mobile menu toggle for pages using header .nav-links
(function(){
  function init(){
    var h=document.querySelector('header');
    if(!h||h.querySelector('.lb-burger'))return;
    var nav=h.querySelector('.nav-links'),inner=h.querySelector('.nav-inner');
    if(!nav||!inner)return;
    var b=document.createElement('button');
    b.type='button';b.className='lb-burger';b.setAttribute('aria-label','Menu');b.setAttribute('aria-expanded','false');
    b.innerHTML='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M4 7h16M4 12h16M4 17h16"/></svg>';
    b.onclick=function(){var o=h.classList.toggle('lb-open');b.setAttribute('aria-expanded',o)};
    inner.insertBefore(b,inner.children[2]||null);
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
})();
