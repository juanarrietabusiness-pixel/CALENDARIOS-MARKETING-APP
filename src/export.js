import { FORMATS, STATUSES, MONTHS } from "./constants";
import { escapeHTML as esc } from "./utils";

export function buildExportHTML(client, calendar) {
  const pc = client.primaryColor || "#1E90FF";
  const sc = client.secondaryColor || "#FFFFFF";
  const calName = esc(calendar.name || (MONTHS[calendar.month] + " " + calendar.year));
  const calId = esc(calendar.id || "cal");

  const logo = client.logo
    ? `<img src="${esc(client.logo)}" class="header-logo" alt="${esc(client.name)}">`
    : "";

  const weekGroups = {};
  (calendar.days || []).forEach((day) => {
    const wk = day.weekNumber || 1;
    if (!weekGroups[wk]) weekGroups[wk] = { concept: day.concept || "", days: [] };
    weekGroups[wk].days.push(day);
  });

  const totalPosts = (calendar.days || []).reduce((a, d) => a + (d.posts || []).length, 0);

  const weekTabs = Object.keys(weekGroups)
    .sort((a, b) => a - b)
    .map((wk) => `<button class="week-tab${wk === "1" ? " active" : ""}" onclick="showWeek('${wk}')" data-week="${wk}">Semana ${wk}</button>`)
    .join("");

  const weeksHTML = Object.entries(weekGroups)
    .sort(([a], [b]) => a - b)
    .map(([wk, { concept, days }]) => {
      const daysHTML = days
        .map((day) => {
          const postsHTML = (day.posts || [])
            .map((post) => {
              const f = FORMATS[post.format] || FORMATS.post;
              const st = STATUSES[post.status || "pending"];
              const isPost = post.format === "post";
              const guion = post.guion || "";
              const descripcion = post.descripcion || post.script || "";
              const hashtags = post.hashtagsFinales || "";

              const imgHTML = post.image
                ? `<div class="post-img-wrap"><img src="${esc(post.image)}" class="post-img" onclick="openLightbox(this.src)" alt=""></div>`
                : `<div class="post-placeholder"><span class="placeholder-icon">${f.icon}</span><span class="placeholder-cat">${esc(post.category || f.label)}</span></div>`;

              let contentHTML = "";
              if (isPost && descripcion) {
                contentHTML = `<div class="content-box desc-box"><div class="field-header"><span class="field-label desc-label">Descripcion</span><button class="copy-btn" onclick="copyText(this)">Copiar</button></div><div class="field-text desc-text">${esc(descripcion)}</div></div>`;
              } else {
                if (guion) {
                  contentHTML += `<div class="content-box guion-box"><div class="field-header"><span class="field-label guion-label">Guion</span><button class="copy-btn guion-copy" onclick="copyText(this)">Copiar</button></div><div class="field-text guion-text">${esc(guion)}</div></div>`;
                }
                if (descripcion) {
                  contentHTML += `<div class="content-box desc-box"><div class="field-header"><span class="field-label desc-label">Descripcion</span><button class="copy-btn" onclick="copyText(this)">Copiar</button></div><div class="field-text desc-text">${esc(descripcion)}</div></div>`;
                }
              }
              if (hashtags) {
                contentHTML += `<div class="hashtags">${esc(hashtags)}</div>`;
              }

              return `<div class="post-card" data-post-id="${esc(post.id)}" style="--status-color:${st.text}">
  <div class="post-top-bar" style="background:${st.text}"></div>
  <div class="post-content">
    ${imgHTML}
    <div class="post-meta">
      <span class="format-badge" style="--fc:${f.color}">${f.icon} ${f.label}</span>
      <span class="status-badge" data-status-label style="background:${st.bg};color:${st.text};border-color:${st.border}">${st.label}</span>
    </div>
    ${post.category ? `<div class="post-category">${esc(post.category)}</div>` : ""}
    ${post.idea ? `<div class="post-idea">${esc(post.idea)}</div>` : ""}
    ${post.referenceLink ? `<div class="post-ref"><a href="${esc(post.referenceLink)}" target="_blank" rel="noopener noreferrer">Ver referencia</a></div>` : ""}
    ${contentHTML}
    <div class="approval-buttons">
      <button class="approve-btn" onclick="setApproval('${esc(post.id)}','aprobado',this)">✓ Aprobar</button>
      <button class="changes-btn" onclick="toggleComment('${esc(post.id)}',this)">✗ Cambios</button>
    </div>
    <div class="comment-section" id="comment-${esc(post.id)}" style="display:none">
      <textarea class="comment-input" placeholder="Describe los cambios..." id="comment-text-${esc(post.id)}"></textarea>
      <button class="send-comment-btn" onclick="setApproval('${esc(post.id)}','cambios',this)">Enviar</button>
    </div>
    <div class="approval-status" id="approval-${esc(post.id)}"></div>
  </div>
</div>`;
            })
            .join("");

          return `<div class="day-card">
  <div class="day-header" style="border-left-color:${esc(pc)}">
    <div class="day-num" style="background:${esc(pc)}">${esc((day.date || "").split("-")[2] || "")}</div>
    <div class="day-info">
      <div class="day-name">${esc(day.dayName || "")}</div>
      ${day.category ? `<div class="day-cat">${esc(day.category)}</div>` : ""}
    </div>
  </div>
  <div class="day-posts">${postsHTML}</div>
</div>`;
        })
        .join("");

      return `<div class="week-section" data-week-section="${wk}" ${wk !== "1" ? 'style="display:none"' : ""}>
  <div class="week-header">
    <span class="week-badge">Semana ${wk}</span>
    ${concept ? `<span class="week-concept">${esc(concept)}</span>` : ""}
  </div>
  ${daysHTML}
</div>`;
    })
    .join("");

  const categoryPattern = {};
  (calendar.days || []).forEach((day) => {
    const dow = new Date(day.date + "T12:00:00").getDay();
    if (day.category && !categoryPattern[dow]) categoryPattern[dow] = day.category;
  });
  const DOW_NAMES = ["Domingo", "Lunes", "Martes", "Miercoles", "Jueves", "Viernes", "Sabado"];
  const patternHTML = Object.entries(categoryPattern)
    .sort(([a], [b]) => ((+a || 7) - (+b || 7)))
    .map(([dow, cat]) => `<div class="pattern-row"><span class="pattern-day">${DOW_NAMES[dow]}</span><span class="pattern-cat">${esc(cat)}</span></div>`)
    .join("");

  return `<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta property="og:title" content="${calName} — ${esc(client.name)}">
<meta property="og:description" content="Calendario de contenido">
${client.logo ? `<meta property="og:image" content="${esc(client.logo)}">` : ""}
<title>${calName} — ${esc(client.name)}</title>
<link href="https://fonts.googleapis.com/css2?family=Anton&family=Inter:wght@400;600;700;900&display=swap" rel="stylesheet">
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:'Inter',Arial,sans-serif;background:#050D1F;color:#fff;min-height:100vh;line-height:1.5}
body.presentation .post-card{min-height:500px}
body.presentation .post-img,body.presentation .post-placeholder{height:260px}
body.presentation .field-text{font-size:16px}
.container{max-width:860px;margin:0 auto;padding:16px}
.hero{background:linear-gradient(135deg,${esc(pc)},${esc(pc)}99);border-radius:0 0 20px 20px;padding:32px 20px;text-align:center;margin-bottom:20px}
.header-logo{width:64px;height:64px;object-fit:contain;border-radius:12px;background:rgba(255,255,255,.15);padding:6px;display:block;margin:0 auto 14px}
.hero h1{font-family:'Anton',sans-serif;font-size:28px;letter-spacing:1px;margin-bottom:4px}
.hero p{font-size:13px;color:rgba(255,255,255,.85)}
.stats-bar{display:flex;gap:8px;margin-bottom:16px}
.stat{flex:1;background:#0A1628;border:1px solid #1E3A6B;border-radius:10px;padding:10px;text-align:center}
.stat-num{font-family:'Anton',sans-serif;font-size:22px}
.stat-label{font-size:10px;color:#A0B4CC;margin-top:2px}
.toolbar{display:flex;gap:8px;margin-bottom:16px;flex-wrap:wrap;align-items:center}
.week-tabs{display:flex;gap:6px;overflow-x:auto;padding-bottom:4px;flex:1}
.week-tab{padding:6px 14px;border-radius:20px;font-size:11px;font-weight:600;cursor:pointer;border:1px solid #1E3A6B;background:#0A1628;color:#A0B4CC;white-space:nowrap;font-family:inherit}
.week-tab.active{background:#1E90FF;border-color:#1E90FF;color:#fff}
.tool-btn{padding:6px 12px;border-radius:8px;font-size:11px;font-weight:600;cursor:pointer;border:1px solid #1E3A6B;background:#0A1628;color:#64B5F6;font-family:inherit}
.tool-btn:hover{background:#1E3A6B;color:#fff}
.tool-btn.active{background:#7B1FA2;border-color:#7B1FA2;color:#fff}
.week-section{margin-bottom:24px}
.week-header{display:flex;align-items:center;gap:10px;margin-bottom:14px;padding-bottom:8px;border-bottom:1px solid #1E3A6B44}
.week-badge{background:#1E90FF22;color:#1E90FF;padding:4px 14px;border-radius:20px;font-size:12px;font-weight:700;font-family:'Anton',sans-serif;letter-spacing:.5px}
.week-concept{font-size:13px;color:#A0B4CC;font-style:italic}
.day-card{background:#0A1628;border:1px solid #1E3A6B;border-radius:14px;margin-bottom:12px;overflow:hidden}
.day-header{display:flex;align-items:center;gap:12px;padding:14px;border-bottom:1px solid #1E3A6B;background:#0d1f3a;border-left:3px solid}
.day-num{color:#fff;font-family:'Anton',sans-serif;font-size:22px;padding:4px 12px;border-radius:8px;min-width:48px;text-align:center}
.day-info{flex:1}
.day-name{font-size:14px;font-weight:700}
.day-cat{font-size:11px;color:#FFA726;margin-top:2px}
.day-posts{padding:12px}
.post-card{background:#050D1F;border:1px solid #1E3A6B;border-radius:12px;margin-bottom:12px;overflow:hidden;transition:border-color .3s}
.post-top-bar{height:3px}
.post-content{padding:14px}
.post-img-wrap{margin-bottom:10px;border-radius:8px;overflow:hidden;cursor:pointer}
.post-img{width:100%;max-height:200px;object-fit:cover;display:block;transition:transform .2s}
.post-img:hover{transform:scale(1.02)}
.post-placeholder{background:#0d1f3a;border-radius:8px;padding:24px;text-align:center;margin-bottom:10px;min-height:100px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:6px}
.placeholder-icon{font-size:32px}
.placeholder-cat{font-size:13px;color:#A0B4CC;font-weight:600}
.post-meta{display:flex;gap:8px;flex-wrap:wrap;margin-bottom:8px;align-items:center}
.format-badge{font-size:11px;padding:3px 10px;border-radius:20px;background:color-mix(in srgb,var(--fc) 15%,transparent);color:var(--fc);border:1px solid color-mix(in srgb,var(--fc) 40%,transparent);font-weight:600}
.status-badge{font-size:10px;padding:2px 8px;border-radius:20px;border:1px solid;font-weight:700}
.post-category{font-size:12px;color:#FFA726;font-weight:600;margin-bottom:6px}
.post-idea{background:#0A1628;border-radius:8px;padding:10px;font-size:12px;color:#A0B4CC;line-height:1.7;margin-bottom:8px}
.post-ref{margin-bottom:8px}
.post-ref a{color:#1E90FF;font-size:12px;text-decoration:none}
.post-ref a:hover{text-decoration:underline}
.content-box{border-radius:8px;padding:12px;font-size:13px;color:#C8D8E8;line-height:1.8;white-space:pre-wrap;margin-bottom:8px;position:relative}
.desc-box{background:#0d1f3a}
.guion-box{background:#1a0a2a}
.field-header{display:flex;justify-content:space-between;align-items:center;margin-bottom:6px}
.field-label{font-size:10px;text-transform:uppercase;font-weight:700}
.desc-label{color:#1E90FF}
.guion-label{color:#E91E63}
.field-text{font-size:13px}
.copy-btn{padding:4px 10px;background:#1E90FF33;color:#1E90FF;border:1px solid #1E90FF44;border-radius:6px;cursor:pointer;font-size:10px;font-weight:600;font-family:inherit}
.copy-btn:hover{background:#1E90FF55}
.guion-copy{background:#E91E6333;color:#E91E63;border-color:#E91E6344}
.hashtags{font-size:12px;color:#F5A623;margin-bottom:8px}
.approval-buttons{display:flex;gap:6px;margin-top:10px}
.approve-btn{flex:1;padding:10px;background:#0d2a0d;color:#66BB6A;border:1px solid #388E3C;border-radius:8px;cursor:pointer;font-size:12px;font-weight:700;font-family:inherit;transition:all .2s}
.approve-btn:hover{background:#1a3a1a}
.changes-btn{flex:1;padding:10px;background:#2a0d0d;color:#EF5350;border:1px solid #C62828;border-radius:8px;cursor:pointer;font-size:12px;font-weight:700;font-family:inherit;transition:all .2s}
.changes-btn:hover{background:#3a0d0d}
.comment-section{margin-top:8px}
.comment-input{width:100%;padding:10px;background:#050D1F;border:1px solid #1E3A6B;border-radius:8px;color:#fff;font-size:12px;resize:vertical;min-height:60px;font-family:inherit;outline:none;margin-bottom:6px}
.send-comment-btn{width:100%;padding:8px;background:#2a0d0d;color:#EF5350;border:1px solid #C62828;border-radius:6px;cursor:pointer;font-size:11px;font-weight:700;font-family:inherit}
.approval-status{margin-top:8px;font-size:11px;border-radius:6px;padding:6px 10px;display:none}
.pattern-section{background:#0A1628;border:1px solid #1E3A6B;border-radius:14px;padding:18px;margin-top:20px}
.pattern-section h3{font-family:'Anton',sans-serif;font-size:16px;color:#64B5F6;margin-bottom:12px;letter-spacing:.5px}
.pattern-row{display:flex;align-items:center;gap:8px;padding:8px 12px;background:#050D1F;border-radius:8px;margin-bottom:4px}
.pattern-day{font-weight:700;min-width:100px;font-size:13px}
.pattern-cat{color:#FFA726;font-size:13px}
.footer{text-align:center;padding:24px;color:#64B5F6;font-size:11px;border-top:1px solid #1E3A6B;margin-top:24px}
.lightbox{display:none;position:fixed;inset:0;background:rgba(0,0,0,.9);z-index:1000;align-items:center;justify-content:center;cursor:pointer;padding:20px}
.lightbox.show{display:flex}
.lightbox img{max-width:90vw;max-height:90vh;border-radius:12px;object-fit:contain}
@media(max-width:600px){.hero h1{font-size:22px}.container{padding:10px}.day-num{font-size:18px;padding:2px 8px}.stats-bar{display:grid;grid-template-columns:repeat(2,1fr)}}
@media print{body{background:#050D1F!important;-webkit-print-color-adjust:exact;print-color-adjust:exact}.toolbar,.approval-buttons,.comment-section,.copy-btn,.tool-btn{display:none!important}@page{margin:.8cm}}
</style></head><body>
<div class="hero">
${logo}
<h1>${esc(client.name)}</h1>
<p>${calName}${calendar.campaign ? " &middot; " + esc(calendar.campaign) : ""}</p>
</div>
<div class="container">
<div class="stats-bar">
<div class="stat"><div class="stat-num" style="color:${esc(pc)}">${totalPosts}</div><div class="stat-label">Posts</div></div>
<div class="stat"><div class="stat-num" style="color:#66BB6A" id="approved-count">0</div><div class="stat-label">Aprobados</div></div>
<div class="stat"><div class="stat-num" style="color:#EF5350" id="changes-count">0</div><div class="stat-label">Con cambios</div></div>
<div class="stat"><div class="stat-num" style="color:#64B5F6" id="pending-count">${totalPosts}</div><div class="stat-label">Pendientes</div></div>
</div>
<div class="toolbar">
<div class="week-tabs">
<button class="week-tab active" onclick="showWeek('all')">Todas</button>
${weekTabs}
</div>
<button class="tool-btn" onclick="togglePresentation()">📊 Presentacion</button>
<button class="tool-btn" onclick="exportReviews()">📥 Exportar revisiones</button>
</div>
${weeksHTML}
${patternHTML ? `<div class="pattern-section"><h3>Patron Semanal</h3>${patternHTML}</div>` : ""}
<div class="footer">Creado por Juancito Ads</div>
</div>
<div class="lightbox" id="lightbox" onclick="this.classList.remove('show')"><img id="lightbox-img" src="" alt=""></div>
<script>
var calId="${esc(calId)}";
var lsKey="jads-reviews-"+calId;
function loadReviews(){try{return JSON.parse(localStorage.getItem(lsKey))||{}}catch(e){return {}}}
function saveReviews(r){try{localStorage.setItem(lsKey,JSON.stringify(r))}catch(e){}}
function updateCounts(){
  var r=loadReviews();var ap=0,ch=0;
  Object.values(r).forEach(function(v){if(v.estado==="aprobado")ap++;else if(v.estado==="cambios")ch++});
  document.getElementById("approved-count").textContent=ap;
  document.getElementById("changes-count").textContent=ch;
  document.getElementById("pending-count").textContent=${totalPosts}-ap-ch;
}
function setApproval(id,estado,btn){
  var r=loadReviews();
  var comentario="";
  if(estado==="cambios"){
    var ta=document.getElementById("comment-text-"+id);
    comentario=ta?ta.value:"";
  }
  r[id]={estado:estado,comentario:comentario,timestamp:new Date().toISOString()};
  saveReviews(r);
  showApprovalStatus(id,r[id]);
  updateCounts();
  var card=document.querySelector('[data-post-id="'+id+'"]');
  if(card){
    card.style.borderColor=estado==="aprobado"?"#388E3C":"#C62828";
    var sl=card.querySelector("[data-status-label]");
    if(sl){sl.textContent=estado==="aprobado"?"✓ Aprobado":"✗ Cambios";sl.style.background=estado==="aprobado"?"#0d2a0d":"#2a0d0d";sl.style.color=estado==="aprobado"?"#66BB6A":"#EF5350";sl.style.borderColor=estado==="aprobado"?"#388E3C":"#C62828"}
    var cs=document.getElementById("comment-"+id);
    if(cs)cs.style.display="none";
  }
}
function toggleComment(id){
  var cs=document.getElementById("comment-"+id);
  if(cs)cs.style.display=cs.style.display==="none"?"block":"none";
}
function showApprovalStatus(id,data){
  var el=document.getElementById("approval-"+id);
  if(!el)return;
  el.style.display="block";
  if(data.estado==="aprobado"){
    el.style.background="#0d2a0d";el.style.color="#66BB6A";
    el.textContent="✓ Aprobado";
  }else{
    el.style.background="#2a0d0d";el.style.color="#EF5350";
    el.textContent="✗ Cambios"+(data.comentario?" — "+data.comentario:"");
  }
}
function copyText(btn){
  var box=btn.closest(".content-box");
  var text=box.querySelector(".field-text");
  if(text){
    navigator.clipboard.writeText(text.innerText).then(function(){
      btn.textContent="Copiado";
      setTimeout(function(){btn.textContent="Copiar"},1500);
    }).catch(function(){
      var range=document.createRange();range.selectNodeContents(text);
      var sel=window.getSelection();sel.removeAllRanges();sel.addRange(range);
    });
  }
}
function openLightbox(src){
  document.getElementById("lightbox-img").src=src;
  document.getElementById("lightbox").classList.add("show");
}
function showWeek(wk){
  document.querySelectorAll(".week-tab").forEach(function(t){t.classList.remove("active")});
  if(wk==="all"){
    document.querySelectorAll("[data-week-section]").forEach(function(s){s.style.display=""});
    document.querySelector('.week-tab[onclick*="all"]').classList.add("active");
  }else{
    document.querySelectorAll("[data-week-section]").forEach(function(s){s.style.display=s.dataset.weekSection===wk?"":"none"});
    var t=document.querySelector('.week-tab[data-week="'+wk+'"]');
    if(t)t.classList.add("active");
  }
}
function togglePresentation(){
  document.body.classList.toggle("presentation");
  var btn=document.querySelector('.tool-btn[onclick*="Presentation"]');
  if(btn)btn.classList.toggle("active");
}
function exportReviews(){
  var r=loadReviews();
  var data={calendarioId:calId,clienteNombre:"${esc(client.name)}",mes:"${calName}",exportadoEn:new Date().toISOString(),aprobaciones:r};
  var blob=new Blob([JSON.stringify(data,null,2)],{type:"application/json"});
  var a=document.createElement("a");a.href=URL.createObjectURL(blob);
  a.download="revisiones-${esc(client.name).replace(/\s+/g, "-")}-${calName.replace(/\s+/g, "-")}.json";
  document.body.appendChild(a);a.click();document.body.removeChild(a);
}
(function(){
  var r=loadReviews();
  Object.keys(r).forEach(function(id){showApprovalStatus(id,r[id]);
    var card=document.querySelector('[data-post-id="'+id+'"]');
    if(card){
      card.style.borderColor=r[id].estado==="aprobado"?"#388E3C":"#C62828";
      var sl=card.querySelector("[data-status-label]");
      if(sl){sl.textContent=r[id].estado==="aprobado"?"✓ Aprobado":"✗ Cambios";sl.style.background=r[id].estado==="aprobado"?"#0d2a0d":"#2a0d0d";sl.style.color=r[id].estado==="aprobado"?"#66BB6A":"#EF5350";sl.style.borderColor=r[id].estado==="aprobado"?"#388E3C":"#C62828"}
    }
  });
  updateCounts();
})();
</script>
</body></html>`;
}
