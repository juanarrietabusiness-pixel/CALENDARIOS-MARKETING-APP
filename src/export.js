import { FORMATS, STATUSES, MONTHS } from "./constants";
import { escapeHTML as esc } from "./utils";

export function buildExportHTML(client, calendar) {
  const pc = client.primaryColor || "#1E90FF";
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

  const weekIdeasHTML = Object.entries(weekGroups)
    .sort(([a], [b]) => a - b)
    .map(([wk, { concept, days }]) => {
      const ideas = days.flatMap((d) => (d.posts || []).map((p) => p.idea).filter(Boolean));
      return `<div class="week-idea-block">
  <div class="week-idea-title"><span class="week-badge-sm">Sem ${wk}</span>${concept ? `<span class="week-concept-sm">${esc(concept)}</span>` : ""}</div>
  ${ideas.length ? `<ul class="week-ideas-list">${ideas.map((i) => `<li>${esc(i)}</li>`).join("")}</ul>` : `<div class="no-ideas">Sin ideas definidas</div>`}
</div>`;
    })
    .join("");

  const listHTML = (calendar.days || [])
    .map((day) => {
      if (!(day.posts || []).length) return "";
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
            : "";

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

          return `<div class="post-detail" data-post-id="${esc(post.id)}" style="--status-color:${st.text}">
  <div class="post-top-bar" style="background:${st.text}"></div>
  <div class="post-content">
    ${imgHTML}
    <div class="post-meta">
      <span class="format-badge" style="--fc:${f.color}">${f.icon} ${f.label}</span>
      <span class="status-badge" data-status-label style="background:${st.bg};color:${st.text};border-color:${st.border}">${st.label}</span>
    </div>
    ${post.category ? `<div class="post-category">${esc(post.category)}</div>` : ""}
    ${post.referenceLink ? `<div class="post-ref"><a href="${esc(post.referenceLink)}" target="_blank" rel="noopener noreferrer">Ver referencia</a></div>` : ""}
    ${contentHTML}
    <div class="approval-buttons">
      <button class="approve-btn" onclick="setApproval('${esc(post.id)}','aprobado',this)">Aprobar</button>
      <button class="changes-btn" onclick="toggleComment('${esc(post.id)}',this)">Cambios</button>
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

      const ideaSummary = (day.posts || []).map((p) => {
        const f = FORMATS[p.format] || FORMATS.post;
        return `<span class="idea-chip" style="--fc:${f.color}">${f.icon} ${esc(p.idea || p.category || f.label)}</span>`;
      }).join("");

      return `<div class="list-day" data-list-date="${esc(day.date)}">
  <div class="list-day-header" onclick="toggleDay(this)">
    <div class="list-day-left">
      <div class="list-day-num" style="background:${esc(pc)}">${esc((day.date || "").split("-")[2] || "")}</div>
      <div class="list-day-info">
        <div class="list-day-name">${esc(day.dayName || "")}</div>
        <div class="list-day-ideas">${ideaSummary}</div>
      </div>
    </div>
    <span class="list-day-arrow">&#9660;</span>
  </div>
  <div class="list-day-content" style="display:none">${postsHTML}</div>
</div>`;
    })
    .filter(Boolean)
    .join("");

  const calGridCells = (() => {
    const first = new Date(calendar.year, calendar.month, 1);
    const last = new Date(calendar.year, calendar.month + 1, 0);
    const s = new Date(first);
    const dow = s.getDay();
    s.setDate(s.getDate() - (dow === 0 ? 6 : dow - 1));
    const e = new Date(last);
    const edow = e.getDay();
    if (edow !== 0) e.setDate(e.getDate() + (7 - edow));
    const arr = [];
    const d = new Date(s);
    while (d <= e) {
      const dt = d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
      const inMonth = d.getMonth() === calendar.month;
      const dayData = (calendar.days || []).find((dd) => dd.date === dt);
      const posts = dayData?.posts || [];
      const postsIcons = posts.map((p) => {
        const f = FORMATS[p.format] || FORMATS.post;
        const st = STATUSES[p.status || "pending"];
        return `<div class="cal-post-dot" style="background:${f.color}22;color:${f.color};border:1px solid ${st.text}44" title="${esc(p.idea || p.category || f.label)}" onclick="scrollToDay('${dt}')">${f.icon}</div>`;
      }).join("");
      arr.push(`<div class="export-cal-cell${inMonth ? "" : " outside"}">${inMonth ? `<div class="export-cal-num">${d.getDate()}</div>${postsIcons}` : `<div class="export-cal-num outside-num">${d.getDate()}</div>`}</div>`);
      d.setDate(d.getDate() + 1);
    }
    return arr.join("");
  })();

  return `<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta property="og:title" content="${calName} — ${esc(client.name)}">
<meta property="og:description" content="Calendario de contenido">
${client.logo ? `<meta property="og:image" content="${esc(client.logo)}">` : ""}
<title>${calName} — ${esc(client.name)}</title>
<link href="https://fonts.googleapis.com/css2?family=Anton&family=Inter:wght@400;600;700;900&display=swap" rel="stylesheet">
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:'Inter',Arial,sans-serif;background:#050D1F;color:#fff;min-height:100vh;line-height:1.5}
body.presentation .post-detail{min-height:500px}
body.presentation .post-img{height:260px}
body.presentation .field-text{font-size:16px}
.container{max-width:900px;margin:0 auto;padding:16px}
.hero{background:linear-gradient(135deg,${esc(pc)},${esc(pc)}99);border-radius:0 0 20px 20px;padding:32px 20px;text-align:center;margin-bottom:20px}
.header-logo{width:64px;height:64px;object-fit:contain;border-radius:12px;background:rgba(255,255,255,.15);padding:6px;display:block;margin:0 auto 14px}
.hero h1{font-family:'Anton',sans-serif;font-size:28px;letter-spacing:1px;margin-bottom:4px}
.hero p{font-size:13px;color:rgba(255,255,255,.85)}
.stats-bar{display:flex;gap:8px;margin-bottom:16px}
.stat{flex:1;background:#0A1628;border:1px solid #1E3A6B;border-radius:10px;padding:10px;text-align:center}
.stat-num{font-family:'Anton',sans-serif;font-size:22px}
.stat-label{font-size:10px;color:#A0B4CC;margin-top:2px}
.campaign-section{background:#0A1628;border:1px solid #1E3A6B;border-radius:14px;padding:20px;margin-bottom:16px}
.campaign-title{font-family:'Anton',sans-serif;font-size:20px;color:${esc(pc)};margin-bottom:4px;letter-spacing:.5px}
.campaign-subtitle{font-size:12px;color:#A0B4CC;margin-bottom:16px}
.section-heading{font-family:'Anton',sans-serif;font-size:14px;color:#64B5F6;margin-bottom:10px;letter-spacing:.5px;border-bottom:1px solid #1E3A6B44;padding-bottom:6px}
.pattern-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(180px,1fr));gap:6px;margin-bottom:18px}
.pattern-row{display:flex;align-items:center;gap:8px;padding:8px 12px;background:#050D1F;border-radius:8px}
.pattern-day{font-weight:700;min-width:90px;font-size:12px}
.pattern-cat{color:#FFA726;font-size:12px}
.week-idea-block{background:#050D1F;border-radius:10px;padding:12px;margin-bottom:8px}
.week-idea-title{display:flex;align-items:center;gap:8px;margin-bottom:6px}
.week-badge-sm{background:#1E90FF22;color:#1E90FF;padding:2px 10px;border-radius:14px;font-size:11px;font-weight:700}
.week-concept-sm{font-size:12px;color:#A0B4CC;font-style:italic}
.week-ideas-list{list-style:none;padding:0;margin:0}
.week-ideas-list li{font-size:12px;color:#C8D8E8;padding:3px 0 3px 12px;border-left:2px solid #1E3A6B}
.week-ideas-list li::before{content:"→ ";color:#64B5F6}
.no-ideas{font-size:11px;color:#555;font-style:italic}
.toolbar{display:flex;gap:8px;margin-bottom:16px;flex-wrap:wrap;align-items:center}
.view-toggle{display:flex;border:1px solid #1E3A6B;border-radius:8px;overflow:hidden}
.view-btn{padding:10px 18px;font-size:13px;font-weight:600;cursor:pointer;border:none;background:#0A1628;color:#A0B4CC;font-family:inherit;min-height:40px;transition:background .2s,color .2s}
.view-btn.active{background:#1E90FF;color:#fff}
.tool-btn{padding:10px 14px;border-radius:8px;font-size:13px;font-weight:600;cursor:pointer;border:1px solid #1E3A6B;background:#0A1628;color:#64B5F6;font-family:inherit;min-height:40px}
.tool-btn:hover{background:#1E3A6B;color:#fff}
.tool-btn.active{background:#7B1FA2;border-color:#7B1FA2;color:#fff}
.list-view{}
.calendar-view{display:none}
.list-day{background:#0A1628;border:1px solid #1E3A6B;border-radius:12px;margin-bottom:8px;overflow:hidden}
.list-day-header{display:flex;align-items:center;justify-content:space-between;padding:14px;cursor:pointer;transition:background .2s;user-select:none;min-height:56px}
.list-day-header:hover{background:#0d1f3a}
.list-day-left{display:flex;align-items:center;gap:10px;flex:1;min-width:0}
.list-day-num{color:#fff;font-family:'Anton',sans-serif;font-size:20px;padding:2px 10px;border-radius:7px;min-width:44px;text-align:center}
.list-day-info{flex:1;min-width:0}
.list-day-name{font-size:14px;font-weight:700}
.list-day-ideas{display:flex;gap:4px;flex-wrap:wrap;margin-top:4px}
.idea-chip{font-size:11px;padding:3px 9px;border-radius:12px;background:color-mix(in srgb,var(--fc) 12%,transparent);color:var(--fc);border:1px solid color-mix(in srgb,var(--fc) 35%,transparent);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:180px}
.list-day-arrow{color:#64B5F6;font-size:10px;flex-shrink:0;transition:transform .2s}
.list-day-header.open .list-day-arrow{transform:rotate(180deg)}
.list-day-content{padding:0 12px 12px}
.post-detail{background:#050D1F;border:1px solid #1E3A6B;border-radius:12px;margin-top:10px;overflow:hidden;transition:border-color .3s}
.post-top-bar{height:3px}
.post-content{padding:14px}
.post-img-wrap{margin-bottom:10px;border-radius:8px;overflow:hidden;cursor:pointer}
.post-img{width:100%;max-height:200px;object-fit:cover;display:block;transition:transform .2s}
.post-img:hover{transform:scale(1.02)}
.post-meta{display:flex;gap:8px;flex-wrap:wrap;margin-bottom:8px;align-items:center}
.format-badge{font-size:11px;padding:3px 10px;border-radius:20px;background:color-mix(in srgb,var(--fc) 15%,transparent);color:var(--fc);border:1px solid color-mix(in srgb,var(--fc) 40%,transparent);font-weight:600}
.status-badge{font-size:10px;padding:2px 8px;border-radius:20px;border:1px solid;font-weight:700}
.post-category{font-size:12px;color:#FFA726;font-weight:600;margin-bottom:6px}
.post-ref{margin-bottom:8px}
.post-ref a{color:#1E90FF;font-size:12px;text-decoration:none}
.post-ref a:hover{text-decoration:underline}
.content-box{border-radius:8px;padding:12px;font-size:15px;color:#C8D8E8;line-height:1.8;white-space:pre-wrap;margin-bottom:8px;position:relative}
.desc-box{background:#0d1f3a}
.guion-box{background:#1a0a2a}
.field-header{display:flex;justify-content:space-between;align-items:center;margin-bottom:6px}
.field-label{font-size:11px;text-transform:uppercase;letter-spacing:.06em;font-weight:700}
.desc-label{color:#1E90FF}
.guion-label{color:#FF7BA8}
.field-text{font-size:15px}
.copy-btn{padding:8px 12px;background:#1E90FF33;color:#8CC6FF;border:1px solid #1E90FF66;border-radius:6px;cursor:pointer;font-size:12px;font-weight:600;font-family:inherit;min-height:36px}
.copy-btn:hover{background:#1E90FF55}
.guion-copy{background:#E91E6333;color:#FF9DBE;border-color:#E91E6366}
.hashtags{font-size:13px;color:#F5A623;margin-bottom:8px}
/* Apilados en pantallas estrechas: lado a lado, "Cambios" partía en dos líneas */
.approval-buttons{display:flex;flex-direction:column;gap:8px;margin-top:12px}
@media(min-width:400px){.approval-buttons{flex-direction:row}}
/* 44px: mínimo táctil recomendado; antes eran ~38px */
.approve-btn{flex:1;padding:12px;background:#0d2a0d;color:#8FD992;border:1px solid #388E3C;border-radius:8px;cursor:pointer;font-size:14px;font-weight:700;font-family:inherit;min-height:44px;transition:background .2s}
.approve-btn:hover{background:#1a3a1a}
.changes-btn{flex:1;padding:12px;background:#2a0d0d;color:#FF8A85;border:1px solid #C62828;border-radius:8px;cursor:pointer;font-size:14px;font-weight:700;font-family:inherit;min-height:44px;transition:background .2s}
.changes-btn:hover{background:#3a0d0d}
.comment-section{margin-top:10px}
/* 16px evita que iOS Safari haga zoom al enfocar el campo */
.comment-input{width:100%;padding:12px;background:#050D1F;border:1px solid #1E3A6B;border-radius:8px;color:#fff;font-size:16px;resize:vertical;min-height:80px;font-family:inherit;outline:none;margin-bottom:8px}
.comment-input:focus{border-color:#1E90FF;box-shadow:0 0 0 3px rgba(30,144,255,.18)}
.send-comment-btn{width:100%;padding:12px;background:#2a0d0d;color:#FF8A85;border:1px solid #C62828;border-radius:6px;cursor:pointer;font-size:14px;font-weight:700;font-family:inherit;min-height:44px}
.approval-status{margin-top:10px;font-size:13px;border-radius:6px;padding:8px 12px;display:none}
button:focus-visible,a:focus-visible{outline:2px solid #3aa0ff;outline-offset:2px}
@media(prefers-reduced-motion:reduce){*{animation-duration:.01ms!important;transition-duration:.01ms!important}}
.export-cal-grid{display:grid;grid-template-columns:repeat(7,1fr);gap:4px}
.export-cal-header{text-align:center;font-size:11px;font-weight:700;color:#64B5F6;padding:6px 0}
.export-cal-cell{background:#0A1628;border:1px solid #1E3A6B44;border-radius:8px;min-height:70px;padding:4px;position:relative}
.export-cal-cell.outside{opacity:.3}
.export-cal-num{font-size:12px;font-weight:700;text-align:right;padding:2px 4px;margin-bottom:2px}
.outside-num{color:#555}
.cal-post-dot{font-size:8px;padding:1px 4px;border-radius:4px;margin-bottom:2px;cursor:pointer;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;text-align:center}
.footer{text-align:center;padding:24px;color:#64B5F6;font-size:11px;border-top:1px solid #1E3A6B;margin-top:24px}
.lightbox{display:none;position:fixed;inset:0;background:rgba(0,0,0,.9);z-index:1000;align-items:center;justify-content:center;cursor:pointer;padding:20px}
.lightbox.show{display:flex}
.lightbox img{max-width:90vw;max-height:90vh;border-radius:12px;object-fit:contain}
@media(max-width:600px){.hero h1{font-size:22px}.container{padding:10px}.stats-bar{display:grid;grid-template-columns:repeat(2,1fr)}.pattern-grid{grid-template-columns:1fr}.export-cal-cell{min-height:50px}.idea-chip{max-width:120px}}
@media print{body{background:#050D1F!important;-webkit-print-color-adjust:exact;print-color-adjust:exact}.toolbar,.approval-buttons,.comment-section,.copy-btn,.tool-btn,.view-toggle{display:none!important}@page{margin:.8cm}}
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
<div class="campaign-section">
${calendar.campaign ? `<div class="campaign-title">${esc(calendar.campaign)}</div><div class="campaign-subtitle">${calName} — ${esc(client.name)}</div>` : `<div class="campaign-title">${calName}</div>`}
${patternHTML ? `<div class="section-heading">Patron Semanal</div><div class="pattern-grid">${patternHTML}</div>` : ""}
<div class="section-heading">Ideas por Semana</div>
${weekIdeasHTML}
</div>
<div class="toolbar">
<div class="view-toggle">
<button class="view-btn active" onclick="switchView('list')">Lista</button>
<button class="view-btn" onclick="switchView('calendar')">Calendario</button>
</div>
<button class="tool-btn" onclick="togglePresentation()">Presentacion</button>
<button class="tool-btn" onclick="exportReviews()">Exportar revisiones</button>
</div>
<div class="list-view" id="list-view">
${listHTML}
</div>
<div class="calendar-view" id="calendar-view">
<div class="export-cal-grid">
${["Lun", "Mar", "Mie", "Jue", "Vie", "Sab", "Dom"].map((n) => `<div class="export-cal-header">${n}</div>`).join("")}
${calGridCells}
</div>
</div>
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
    if(sl){sl.textContent=estado==="aprobado"?"Aprobado":"Cambios";sl.style.background=estado==="aprobado"?"#0d2a0d":"#2a0d0d";sl.style.color=estado==="aprobado"?"#66BB6A":"#EF5350";sl.style.borderColor=estado==="aprobado"?"#388E3C":"#C62828"}
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
  if(data.estado==="aprobado"){el.style.background="#0d2a0d";el.style.color="#66BB6A";el.textContent="Aprobado"}
  else{el.style.background="#2a0d0d";el.style.color="#EF5350";el.textContent="Cambios"+(data.comentario?" — "+data.comentario:"")}
}
function copyText(btn){
  var box=btn.closest(".content-box");var text=box.querySelector(".field-text");
  if(text){navigator.clipboard.writeText(text.innerText).then(function(){btn.textContent="Copiado";setTimeout(function(){btn.textContent="Copiar"},1500)}).catch(function(){var range=document.createRange();range.selectNodeContents(text);var sel=window.getSelection();sel.removeAllRanges();sel.addRange(range)})}
}
function openLightbox(src){document.getElementById("lightbox-img").src=src;document.getElementById("lightbox").classList.add("show")}
function toggleDay(header){
  var content=header.nextElementSibling;
  var isOpen=content.style.display!=="none";
  content.style.display=isOpen?"none":"block";
  header.classList.toggle("open",!isOpen);
}
function switchView(view){
  var lv=document.getElementById("list-view");var cv=document.getElementById("calendar-view");
  var btns=document.querySelectorAll(".view-btn");
  btns.forEach(function(b){b.classList.remove("active")});
  if(view==="list"){lv.style.display="";cv.style.display="none";btns[0].classList.add("active")}
  else{lv.style.display="none";cv.style.display="";btns[1].classList.add("active")}
}
function scrollToDay(date){
  switchView("list");
  var el=document.querySelector('[data-list-date="'+date+'"]');
  if(el){el.scrollIntoView({behavior:"smooth",block:"center"});var header=el.querySelector(".list-day-header");var content=el.querySelector(".list-day-content");if(content&&content.style.display==="none"){content.style.display="block";header.classList.add("open")}}
}
function togglePresentation(){document.body.classList.toggle("presentation");var btn=document.querySelector('.tool-btn[onclick*="Presentation"]');if(btn)btn.classList.toggle("active")}
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
    if(card){card.style.borderColor=r[id].estado==="aprobado"?"#388E3C":"#C62828";var sl=card.querySelector("[data-status-label]");if(sl){sl.textContent=r[id].estado==="aprobado"?"Aprobado":"Cambios";sl.style.background=r[id].estado==="aprobado"?"#0d2a0d":"#2a0d0d";sl.style.color=r[id].estado==="aprobado"?"#66BB6A":"#EF5350";sl.style.borderColor=r[id].estado==="aprobado"?"#388E3C":"#C62828"}}
  });
  updateCounts();
})();
</script>
</body></html>`;
}
