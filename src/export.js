import { FORMATS, STATUSES, MONTHS } from "./constants";
import { escapeHTML as esc } from "./utils";

export function buildExportHTML(client, calendar) {
  const pc = client.primaryColor || "#1E90FF";
  const calName = esc(calendar.name || (MONTHS[calendar.month] + " " + calendar.year));

  const logo = client.logo
    ? `<img src="${esc(client.logo)}" style="width:60px;height:60px;object-fit:contain;border-radius:10px;background:rgba(255,255,255,.15);padding:6px;display:block;margin:0 auto 12px">`
    : "";

  const weekGroups = {};
  (calendar.days || []).forEach((day) => {
    const wk = day.weekNumber || 1;
    if (!weekGroups[wk]) weekGroups[wk] = { concept: day.concept || "", days: [] };
    weekGroups[wk].days.push(day);
  });

  const weeksHTML = Object.entries(weekGroups)
    .sort(([a], [b]) => a - b)
    .map(([wk, { concept, days }]) => {
      const daysHTML = days
        .map((day) => {
          const postsHTML = (day.posts || [])
            .map((post) => {
              const f = FORMATS[post.format] || FORMATS.post;
              const st = STATUSES[post.status || "pending"];
              const scriptLabel = post.format === "post" ? "Descripción" : "Guión";
              return `<div style="background:#050D1F;border:1px solid #1E3A6B;border-radius:10px;padding:14px;margin-bottom:10px">
  <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:10px;align-items:center">
    <span style="font-size:11px;padding:3px 10px;border-radius:20px;background:${f.color}22;color:${f.color};border:1px solid ${f.color}44;font-weight:600">${f.icon} ${f.label}</span>
    <span style="font-size:10px;padding:2px 8px;border-radius:20px;background:${st.bg};color:${st.text};border:1px solid ${st.border};font-weight:700">${st.label}</span>
  </div>
  ${post.category ? `<div style="font-size:12px;color:#FFA726;font-weight:600;margin-bottom:8px">📂 ${esc(post.category)}</div>` : ""}
  ${post.image ? `<img src="${esc(post.image)}" style="width:100%;max-width:300px;border-radius:8px;margin:8px 0;display:block">` : ""}
  ${post.referenceLink ? `<div style="margin-bottom:8px"><a href="${esc(post.referenceLink)}" target="_blank" rel="noopener noreferrer" style="color:#1E90FF;font-size:12px;text-decoration:none">🔗 Ver referencia</a></div>` : ""}
  ${post.idea ? `<div style="background:#0A1628;border-radius:8px;padding:10px;margin-bottom:8px;font-size:13px;color:#A0B4CC;line-height:1.7"><strong style="color:#64B5F6;font-size:10px;text-transform:uppercase;display:block;margin-bottom:4px">Idea</strong>${esc(post.idea)}</div>` : ""}
  ${post.script ? `<div style="position:relative;background:#0d1f3a;border-radius:8px;padding:12px;font-size:13px;color:#C8D8E8;line-height:1.8;white-space:pre-wrap"><strong style="color:#E91E63;font-size:10px;text-transform:uppercase;display:block;margin-bottom:4px">${scriptLabel}</strong><span class="script-text">${esc(post.script)}</span><button onclick="navigator.clipboard.writeText(this.parentElement.querySelector('.script-text').innerText).then(()=>{this.textContent='✓ Copiado';setTimeout(()=>this.textContent='📋 Copiar',1500)})" style="position:absolute;top:8px;right:8px;padding:4px 8px;background:#1E90FF33;color:#1E90FF;border:1px solid #1E90FF44;border-radius:6px;cursor:pointer;font-size:10px;font-weight:600">📋 Copiar</button></div>` : ""}
  <div style="display:flex;gap:6px;margin-top:10px">
    <button onclick="this.closest('[data-post]').querySelector('.status-label').textContent='✓ Aprobado';this.closest('[data-post]').style.borderColor='#388E3C'" style="flex:1;padding:8px;background:#0d2a0d;color:#66BB6A;border:1px solid #388E3C;border-radius:6px;cursor:pointer;font-size:11px;font-weight:700">✓ Aprobar</button>
    <button onclick="this.closest('[data-post]').querySelector('.status-label').textContent='✗ Cambios';this.closest('[data-post]').style.borderColor='#C62828'" style="flex:1;padding:8px;background:#2a0d0d;color:#EF5350;border:1px solid #C62828;border-radius:6px;cursor:pointer;font-size:11px;font-weight:700">✗ Cambios</button>
    <button onclick="const c=prompt('Comentario:');if(c){const el=document.createElement('div');el.style.cssText='margin-top:8px;padding:8px;background:#1a2a0a;border-radius:6px;font-size:11px;color:#FFA726';el.textContent='💬 '+c;this.closest('[data-post]').appendChild(el)}" style="padding:8px 12px;background:#1a2a4a;color:#64B5F6;border:1px solid #1E3A6B;border-radius:6px;cursor:pointer;font-size:11px;font-weight:700">💬</button>
  </div>
</div>`;
            })
            .join("");

          return `<div data-post style="background:#0A1628;border:1px solid #1E3A6B;border-radius:14px;margin-bottom:12px;overflow:hidden;page-break-inside:avoid">
  <div style="display:flex;align-items:center;gap:12px;padding:14px;border-bottom:1px solid #1E3A6B;background:#0d1f3a">
    <div style="background:${esc(pc)};color:#fff;font-size:20px;font-weight:900;padding:6px 12px;border-radius:10px;min-width:48px;text-align:center">${esc((day.date || "").split("-")[2] || "")}</div>
    <div>
      <div style="font-size:14px;font-weight:700;color:#fff">${esc(day.dayName || "")}</div>
      ${day.category ? `<div style="font-size:12px;color:#FFA726;margin-top:2px">📂 ${esc(day.category)}</div>` : ""}
    </div>
    <span class="status-label" style="margin-left:auto;font-size:10px;color:#64B5F6"></span>
  </div>
  <div style="padding:12px">${postsHTML}</div>
</div>`;
        })
        .join("");

      return `<div style="margin-bottom:28px">
  <div style="display:flex;align-items:center;gap:10px;margin-bottom:14px;padding-bottom:8px;border-bottom:1px solid #1E3A6B44">
    <span style="background:#1E90FF22;color:#1E90FF;padding:4px 12px;border-radius:20px;font-size:12px;font-weight:700">Semana ${wk}</span>
    ${concept ? `<span style="font-size:13px;color:#A0B4CC;font-style:italic">${esc(concept)}</span>` : ""}
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
  const DOW_NAMES = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];
  const patternHTML = Object.entries(categoryPattern)
    .sort(([a], [b]) => ((+a || 7) - (+b || 7)))
    .map(([dow, cat]) => `<div style="display:flex;align-items:center;gap:8px;padding:8px 12px;background:#050D1F;border-radius:8px"><span style="font-weight:700;color:#fff;min-width:100px">${DOW_NAMES[dow]}</span><span style="color:#FFA726">→ ${esc(cat)}</span></div>`)
    .join("");

  return `<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${calName} — ${esc(client.name)}</title>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700;900&display=swap" rel="stylesheet">
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:'Inter',Arial,sans-serif;background:#050D1F;color:#fff;padding:20px;max-width:860px;margin:0 auto}
@media print{body{background:#050D1F!important;-webkit-print-color-adjust:exact;print-color-adjust:exact}@page{margin:1cm}}
</style></head><body>
<div style="background:linear-gradient(135deg,${esc(pc)},${esc(pc)}99);border-radius:16px;padding:28px;text-align:center;margin-bottom:28px">
${logo}
<h1 style="font-size:26px;font-weight:900;color:#fff;margin-bottom:6px">${esc(client.name)}</h1>
<p style="font-size:14px;color:rgba(255,255,255,.85)">${calName}${calendar.campaign ? " · " + esc(calendar.campaign) : ""}</p>
</div>
${weeksHTML}
${patternHTML ? `<div style="background:#0A1628;border:1px solid #1E3A6B;border-radius:14px;padding:18px;margin-top:20px">
<h3 style="font-size:14px;font-weight:700;margin-bottom:12px;color:#64B5F6">📅 Patrón Semanal</h3>
<div style="display:flex;flex-direction:column;gap:6px">${patternHTML}</div>
</div>` : ""}
<div style="text-align:center;padding:24px;color:#64B5F6;font-size:12px;border-top:1px solid #1E3A6B;margin-top:24px">⚡ Creado por Juancito Ads · @juancitoads</div>
</body></html>`;
}
