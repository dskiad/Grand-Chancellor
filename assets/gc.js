/* ============================================================================
   GC DOC — the engine behind every form in this folder.

   A form page only has to provide the markup; this wires it up:

     * <img data-art="header">        gets its artwork from artwork.js
     * <input data-field="name">      writes into every <span data-out="name">
     * <input type="date" data-day="f-day" data-monthyear="f-monthyear">
                                      fills those two fields as "24th" and
                                      "October 2025"
     * <div class="body-copy"><div class="copy">…</div></div>
                                      the copy is scaled down until it fits
     * #pdf / #print / #reset         the three buttons
     * <body data-doc="Honorary Patent" data-file="name,rank">
                                      names the downloaded file

   Everything needed to render and export lives in this folder, so the forms
   work with no network connection.
   ========================================================================= */

(function(){
  "use strict";

  var paper   = document.getElementById('paper');
  var scaler  = document.getElementById('scaler');
  var status  = document.getElementById('status');
  var win     = document.querySelector('.body-copy');
  var copy    = document.querySelector('.body-copy .copy');
  var inputs  = [].slice.call(document.querySelectorAll('[data-field]'));
  var dateIn  = document.querySelector('input[type="date"][data-day]');

  if (!paper) return;

  /* ---------- artwork ---------------------------------------------------- */

  [].forEach.call(document.querySelectorAll('[data-art]'), function(img){
    var key = img.getAttribute('data-art');
    if (window.GC_ART && window.GC_ART[key]) img.src = window.GC_ART[key];
  });

  /* ---------- fields ------------------------------------------------------ */

  var defaults = {};
  inputs.forEach(function(el){ defaults[el.id] = el.value; });
  if (dateIn) defaults[dateIn.id] = dateIn.value;

  function write(el){
    var targets = document.querySelectorAll('[data-out="' + el.getAttribute('data-field') + '"]');
    [].forEach.call(targets, function(t){ t.textContent = el.value.trim(); });
  }

  function render(){
    inputs.forEach(write);
    autofit();
  }

  /* ---------- date -------------------------------------------------------- */

  var MONTHS = ['January','February','March','April','May','June',
                'July','August','September','October','November','December'];

  function ordinal(n){
    var rest = n % 100;
    if (rest >= 11 && rest <= 13) return n + 'th';
    switch (n % 10){
      case 1:  return n + 'st';
      case 2:  return n + 'nd';
      case 3:  return n + 'rd';
      default: return n + 'th';
    }
  }

  function fromDate(){
    var v = dateIn.value;                       /* yyyy-mm-dd */
    if (!v) return;
    var p = v.split('-');
    var day = document.getElementById(dateIn.getAttribute('data-day'));
    var my  = document.getElementById(dateIn.getAttribute('data-monthyear'));
    if (day) day.value = ordinal(parseInt(p[2], 10));
    if (my)  my.value  = MONTHS[parseInt(p[1], 10) - 1] + ' ' + p[0];
    render();
  }

  /* ---------- fitting ------------------------------------------------------ */

  /* Shrink the copy — as PowerPoint does on overflow — until it sits inside
     the clear window of the sheet, however long the fields run. */
  function autofit(){
    if (!win || !copy) return;
    var k = 1;
    win.style.setProperty('--k', k);
    while (copy.scrollHeight > win.clientHeight && k > 0.55){
      k = Math.round((k - 0.02) * 100) / 100;
      win.style.setProperty('--k', k);
    }
  }

  /* Scale the preview down to whatever room the browser window leaves. */
  function fit(){
    var natural = paper.offsetWidth;
    var room = scaler.parentNode.clientWidth;
    var s = Math.min(1, room / natural);
    paper.style.transform = 'scale(' + s + ')';
    scaler.style.width  = (natural * s) + 'px';
    scaler.style.height = (paper.offsetHeight * s) + 'px';
  }

  /* ---------- export ------------------------------------------------------- */

  function fileName(){
    var parts = (document.body.getAttribute('data-file') || '').split(',');
    var bits = [document.body.getAttribute('data-doc') || 'Document'];
    parts.forEach(function(id){
      var el = document.getElementById(id.trim());
      if (el && el.value.trim()) bits.push(el.value.trim());
    });
    return bits.join(' - ').replace(/[^\w\s.'-]/g, '').replace(/\s+/g, ' ').trim() + '.pdf';
  }

  function imagesReady(){
    var imgs = [].slice.call(paper.querySelectorAll('img'));
    return Promise.all(imgs.map(function(img){
      if (img.complete) return null;
      return new Promise(function(res){ img.onload = img.onerror = res; });
    }));
  }

  var busy = false;

  function downloadPDF(){
    if (busy) return;
    busy = true;
    var btn = document.getElementById('pdf');
    btn.disabled = true;
    if (status) status.textContent = 'Rendering the sheet…';

    var restore = paper.style.transform;

    Promise.resolve()
      .then(function(){ return document.fonts ? document.fonts.ready : null; })
      .then(imagesReady)
      .then(function(){
        if (!window.html2canvas || !window.jspdf){
          throw new Error('the PDF libraries did not load');
        }
        paper.style.transform = 'none';
        scaler.style.width  = paper.offsetWidth + 'px';
        scaler.style.height = paper.offsetHeight + 'px';
        window.scrollTo(0, 0);
        return window.html2canvas(paper, {
          scale: 2.6,                 /* ≈ 250 dpi on an A3 sheet */
          backgroundColor: '#ffffff',
          useCORS: true,
          logging: false,
          width: paper.offsetWidth,
          height: paper.offsetHeight,
          windowWidth: paper.offsetWidth,
          windowHeight: paper.offsetHeight,
          scrollX: 0,
          scrollY: 0
        });
      })
      .then(function(canvas){
        paper.style.transform = restore;
        fit();
        if (status) status.textContent = 'Building the PDF…';

        var pdf = new window.jspdf.jsPDF({
          orientation:'portrait', unit:'mm', format:'a3', compress:true
        });
        var pw = pdf.internal.pageSize.getWidth();    /* 297 mm */
        var ph = pdf.internal.pageSize.getHeight();   /* 420 mm */
        var h  = pw * (canvas.height / canvas.width);
        pdf.addImage(canvas.toDataURL('image/jpeg', 0.95), 'JPEG',
                     0, (ph - h) / 2, pw, h, undefined, 'FAST');
        pdf.save(fileName());
        if (status) status.textContent = 'Saved ' + fileName();
      })
      .catch(function(err){
        paper.style.transform = restore;
        fit();
        if (status){
          status.textContent = 'PDF export failed (' + err.message +
                               '). Use Print → “Save as PDF” instead.';
        }
      })
      .then(function(){
        busy = false;
        btn.disabled = false;
      });
  }

  /* ---------- wiring -------------------------------------------------------- */

  var form = document.getElementById('form');
  if (form){
    form.addEventListener('input', function(e){
      if (dateIn && e.target === dateIn) fromDate(); else render();
    });
  }

  var pdfBtn = document.getElementById('pdf');
  if (pdfBtn) pdfBtn.addEventListener('click', downloadPDF);

  var printBtn = document.getElementById('print');
  if (printBtn){
    printBtn.addEventListener('click', function(){
      var restore = paper.style.transform;
      paper.style.transform = 'none';
      window.print();
      paper.style.transform = restore;
      fit();
    });
  }

  var resetBtn = document.getElementById('reset');
  if (resetBtn){
    resetBtn.addEventListener('click', function(){
      Object.keys(defaults).forEach(function(id){
        document.getElementById(id).value = defaults[id];
      });
      render();
      if (status) status.textContent = '';
    });
  }

  window.addEventListener('resize', fit);

  render();
  fit();
  if (document.fonts && document.fonts.ready){
    document.fonts.ready.then(function(){ render(); fit(); });
  }
})();
