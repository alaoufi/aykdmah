// AYK-502 (the owner: «تصدير الإحصائيات الي في الرئيسية بالإدارة على ملف PDF»): the control home's figures as an
// A4 PDF. The page is drawn as HTML (so Arabic letters join and run right to left exactly as on screen), turned
// into images section by section, and placed on A4 pages; a section never splits across two pages. The two
// libraries load only when the button is pressed, so they cost the rest of the admin nothing.
const PAGE_W_PX = 794;           // A4 width at 96 dpi
const MARGIN_MM = 12;

const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function section(html, extra = '') {
  const el = document.createElement('section');
  el.setAttribute('dir', 'rtl');
  el.style.cssText = `width:${PAGE_W_PX}px;box-sizing:border-box;padding:6px 28px;background:#fff;color:#0f172a;font-family:var(--font-sans),system-ui,sans-serif;${extra}`;
  el.innerHTML = html;
  return el;
}

// rows: [{ label, value }] drawn as a 3-column grid of figure cards.
function cards(rows) {
  return `<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:10px">${rows.map(r => `
    <div style="border:1px solid #e2e8f0;border-radius:12px;padding:12px 14px;border-inline-start:4px solid ${esc(r.color || '#0ea5e9')}">
      <div style="font-size:12px;color:#64748b;font-weight:600">${esc(r.label)}</div>
      <div style="font-size:22px;font-weight:800;margin-top:4px">${esc(r.value)}</div>
    </div>`).join('')}</div>`;
}

function heading(text) { return `<h2 style="font-size:16px;font-weight:800;margin:14px 0 10px;color:#0f172a">${esc(text)}</h2>`; }

export function buildSections({ title, subtitle, groups, statuses, translation, visitors, labels }) {
  const out = [];
  out.push(section(`
    <div style="padding:18px 0 6px;border-bottom:3px solid #0ea5e9;margin-bottom:6px">
      <div style="font-size:26px;font-weight:800">${esc(title)}</div>
      <div style="font-size:13px;color:#64748b;margin-top:6px">${esc(subtitle)}</div>
    </div>`));
  for (const group of groups) out.push(section(`${heading(group.title)}${cards(group.rows)}`));
  if (visitors) out.push(section(`${heading(labels.visitors)}${cards([
    { label: labels.visitors_today, value: visitors.today },
    { label: labels.visitors_total, value: visitors.total },
    { label: labels.visitors_online, value: visitors.online },
  ])}`));
  if (statuses?.length) {
    const total = statuses.reduce((a, s) => a + Number(s.total), 0) || 1;
    out.push(section(`${heading(labels.requests_by_status)}
      <table style="width:100%;border-collapse:collapse;font-size:13px">
        <thead><tr style="background:#f1f5f9;text-align:right"><th style="padding:8px 10px">${esc(labels.status)}</th><th style="padding:8px 10px">${esc(labels.count)}</th><th style="padding:8px 10px">%</th></tr></thead>
        <tbody>${statuses.map(s => `<tr style="border-bottom:1px solid #e2e8f0"><td style="padding:8px 10px;font-weight:600">${esc(s.label)}</td><td style="padding:8px 10px">${esc(Number(s.total).toLocaleString('ar-SA-u-nu-latn'))}</td><td style="padding:8px 10px">${((Number(s.total) / total) * 100).toFixed(0)}%</td></tr>`).join('')}</tbody>
      </table>`));
  }
  if (translation) out.push(section(`${heading(labels.translation)}${cards(translation)}`));
  out.push(section(`<div style="margin-top:16px;padding-top:10px;border-top:1px solid #e2e8f0;font-size:11px;color:#94a3b8">${esc(labels.footer)}</div>`));
  return out;
}

export async function exportDashboardPdf(input, fileName) {
  const [{ default: html2canvas }, { jsPDF }] = await Promise.all([import('html2canvas'), import('jspdf')]);
  if (document.fonts?.ready) await document.fonts.ready;
  const stage = document.createElement('div');
  stage.style.cssText = 'position:fixed;inset-inline-start:-10000px;top:0;pointer-events:none';
  document.body.appendChild(stage);
  try {
    const sections = buildSections(input);
    sections.forEach(el => stage.appendChild(el));
    const pdf = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait', compress: true });
    const pageW = pdf.internal.pageSize.getWidth();
    const pageH = pdf.internal.pageSize.getHeight();
    const usableW = pageW - MARGIN_MM * 2;
    const usableH = pageH - MARGIN_MM * 2;
    let y = MARGIN_MM;
    for (const el of sections) {
      const canvas = await html2canvas(el, { scale: 2, backgroundColor: '#ffffff', useCORS: true, logging: false });
      const h = (canvas.height / canvas.width) * usableW;
      if (y + h > MARGIN_MM + usableH && y > MARGIN_MM) { pdf.addPage(); y = MARGIN_MM; }
      pdf.addImage(canvas.toDataURL('image/jpeg', 0.92), 'JPEG', MARGIN_MM, y, usableW, Math.min(h, usableH));
      y += h + 1;
    }
    // An ordinary link download. The file name is plain English letters: Chrome without an Arabic file-system locale
    // (seen in the test browser) replaces an Arabic name with «download».
    const url = URL.createObjectURL(pdf.output('blob'));
    const link = document.createElement('a');
    link.href = url; link.download = fileName; link.rel = 'noopener';
    document.body.appendChild(link); link.click(); link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 30000);
    return { pages: pdf.getNumberOfPages() };
  } finally {
    stage.remove();
  }
}
