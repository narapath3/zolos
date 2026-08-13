import { apiBaseUrl } from '../network/SupabaseClient.js';

const categoryLabels = {
  gameplay: 'เกมเพลย์ / ต่อสู้', item_economy: 'ไอเทม / เงิน', display: 'ภาพ / UI',
  map: 'แผนที่ / ทางเดิน', account: 'บัญชี / บันทึกข้อมูล', other: 'อื่น ๆ',
};

function apiUrl(path) {
  return `${new URL(apiBaseUrl).origin}/api${path}`;
}

async function request(path, options = {}) {
  const token = localStorage.getItem('zolos_jwt');
  const response = await fetch(apiUrl(path), {
    ...options,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token || ''}`, ...(options.headers || {}) },
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || `HTTP ${response.status}`);
  return data;
}

function resizeFrame(source, width, height) {
  const maxWidth = 1280;
  const scale = Math.min(1, maxWidth / width);
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(width * scale));
  canvas.height = Math.max(1, Math.round(height * scale));
  canvas.getContext('2d').drawImage(source, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL('image/jpeg', 0.7);
}

function captureGameCanvas() {
  const canvas = document.querySelector('#game-screen canvas, canvas');
  if (!canvas || !canvas.width || !canvas.height) throw new Error('ไม่พบภาพเกม กรุณาเลือกภาพจากเครื่องแทน');
  return resizeFrame(canvas, canvas.width, canvas.height);
}

function imageFromFile(file) {
  return new Promise((resolve, reject) => {
    if (!file || !/^image\/(?:jpeg|png|webp)$/i.test(file.type)) return reject(new Error('รองรับเฉพาะ JPG, PNG และ WebP'));
    if (file.size > 8_000_000) return reject(new Error('ภาพต้นฉบับต้องไม่เกิน 8 MB'));
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => { try { resolve(resizeFrame(image,image.naturalWidth,image.naturalHeight)); } finally { URL.revokeObjectURL(url); } };
    image.onerror = () => { URL.revokeObjectURL(url); reject(new Error('เปิดไฟล์ภาพไม่สำเร็จ')); };
    image.src = url;
  });
}

export class BugReportUI {
  constructor(gameUI) {
    this.gameUI = gameUI;
    this.screenshot = '';
    this.root = null;
    this.viewportHandler = null;
    this.previousBodyOverflow = '';
    document.getElementById('btn-bug-report')?.addEventListener('click', () => this.open());
  }

  async open() {
    this.close();
    if (!document.getElementById('bug-report-mobile-style')) {
      const style = document.createElement('style');
      style.id = 'bug-report-mobile-style';
      style.textContent = `
        .bug-report-modal{box-sizing:border-box;overscroll-behavior:contain;touch-action:pan-y}
        .bug-report-panel{box-sizing:border-box;-webkit-overflow-scrolling:touch;overscroll-behavior:contain}
        .bug-report-panel input,.bug-report-panel select,.bug-report-panel textarea{font-size:16px!important;min-height:44px}
        .bug-report-panel button{min-height:44px;touch-action:manipulation;cursor:pointer}
        .bug-report-actions{display:flex;flex-wrap:wrap;gap:8px}
        .bug-report-footer{display:flex;justify-content:flex-end;gap:8px}
        @media(max-width:600px){
          .bug-report-modal{place-items:start center!important;padding:calc(6px + env(safe-area-inset-top)) max(6px,env(safe-area-inset-right)) calc(6px + env(safe-area-inset-bottom)) max(6px,env(safe-area-inset-left))!important}
          .bug-report-panel{width:100%!important;max-height:calc(100dvh - 12px - env(safe-area-inset-top) - env(safe-area-inset-bottom))!important;border-radius:11px!important;padding:14px!important}
          .bug-report-panel h2{font-size:20px!important}.bug-report-panel p{font-size:12px;line-height:1.5}
          .bug-report-actions>button,.bug-report-footer>button{flex:1 1 140px;min-height:48px;padding:11px 8px!important}
          .bug-report-footer{flex-wrap:wrap}.bug-report-footer [type=submit]{order:-1;flex-basis:100%}
          .bug-report-shot{max-height:31dvh;overflow:auto;padding:8px!important}
          .bug-report-shot img{max-height:29dvh!important}
        }
        @media(max-width:380px){.bug-report-actions>button{flex-basis:100%}}
      `;
      document.head.appendChild(style);
    }
    this.root = document.createElement('div');
    this.root.className = 'bug-report-modal modal-popup';
    this.root.style.cssText = 'position:fixed;inset:0;z-index:12000;background:rgba(3,6,16,.82);display:grid;place-items:center;padding:12px';
    const panel = document.createElement('section');
    panel.className = 'bug-report-panel';
    panel.style.cssText = 'width:min(720px,96vw);max-height:92vh;overflow:auto;background:#111a2d;border:1px solid #4fa3ff;border-radius:14px;padding:20px;color:#eef6ff;box-shadow:0 20px 70px #000';
    panel.innerHTML = `<div style="display:flex;justify-content:space-between;gap:12px"><div><h2 style="margin:0;color:#73c5ff">🐞 แจ้งบัคในเกม</h2><p style="margin:6px 0 16px;color:#abc">ภาพจะถูกส่งให้ทีมแอดมินเท่านั้น หากอนุมัติจะได้รับไอเทมพิเศษและ Zeny</p></div><button data-close aria-label="ปิด" style="height:34px;background:#26344c;color:white;border:0;border-radius:8px;padding:0 12px">✕</button></div>
      <form data-form style="display:grid;gap:12px">
        <label>ประเภท<select name="category" style="display:block;width:100%;margin-top:5px;padding:10px;background:#0b1220;color:white;border:1px solid #405573;border-radius:8px">${Object.entries(categoryLabels).map(([v,l])=>`<option value="${v}">${l}</option>`).join('')}</select></label>
        <label>หัวข้อ<input name="title" maxlength="100" required placeholder="เช่น ขายไอเทมแล้วเงินหายหลังเข้าใหม่" style="display:block;width:100%;box-sizing:border-box;margin-top:5px;padding:10px;background:#0b1220;color:white;border:1px solid #405573;border-radius:8px"></label>
        <label>รายละเอียดและขั้นตอนที่ทำให้เกิดปัญหา<textarea name="details" maxlength="4000" minlength="10" required rows="6" placeholder="เกิดอะไรขึ้น / ทำอะไรมาก่อน / ควรเป็นอย่างไร..." style="display:block;width:100%;box-sizing:border-box;margin-top:5px;padding:10px;background:#0b1220;color:white;border:1px solid #405573;border-radius:8px;resize:vertical"></textarea></label>
        <div class="bug-report-shot" data-shot-zone style="border:1px dashed #53739b;border-radius:10px;padding:12px;text-align:center;color:#abc">ยังไม่มีภาพหน้าจอ</div>
        <div class="bug-report-actions"><button type="button" data-capture style="background:#275d91;color:white;border:0;border-radius:8px;padding:10px 14px">📸 แคปภาพเกม</button><button type="button" data-pick style="background:#3d4f6d;color:white;border:0;border-radius:8px;padding:10px 14px">🖼️ เลือกภาพจากเครื่อง</button><input data-file type="file" accept="image/png,image/jpeg,image/webp" hidden><button type="button" data-remove style="display:none;background:#633;color:white;border:0;border-radius:8px;padding:10px 14px">ลบภาพ</button><span data-status style="align-self:center;color:#8fc7ef"></span></div>
        <div class="bug-report-footer"><button type="button" data-history style="background:#26344c;color:white;border:0;border-radius:8px;padding:11px 16px">ประวัติของฉัน</button><button type="submit" style="background:#2b9c64;color:white;border:0;border-radius:8px;padding:11px 20px;font-weight:700">ส่งรายงาน</button></div>
      </form>`;
    this.root.appendChild(panel);
    document.body.appendChild(this.root);
    this.previousBodyOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    this.gameUI?.updateMobileControlsVisibility?.();
    this.viewportHandler = () => {
      const viewport = window.visualViewport;
      if (viewport) this.root.style.height = `${viewport.height}px`;
    };
    window.visualViewport?.addEventListener('resize', this.viewportHandler);
    this.viewportHandler();
    panel.querySelector('[data-close]').onclick = () => this.close();
    this.root.addEventListener('click', e => { if (e.target === this.root) this.close(); });
    panel.querySelector('[data-capture]').onclick = () => this.takeScreenshot(panel);
    const fileInput = panel.querySelector('[data-file]');
    panel.querySelector('[data-pick]').onclick = () => fileInput.click();
    fileInput.onchange = () => this.pickScreenshot(panel,fileInput.files?.[0]);
    panel.querySelector('[data-remove]').onclick = () => { this.screenshot=''; this.renderShot(panel); };
    panel.querySelector('[data-history]').onclick = () => this.showHistory(panel);
    panel.querySelector('[data-form]').onsubmit = e => this.submit(e, panel);
    panel.querySelector('[data-status]').textContent = 'กรอกรายละเอียดได้ทันที • ไม่ต้องอนุญาตแชร์หน้าจอ';
  }

  takeScreenshot(panel) {
    const status = panel.querySelector('[data-status]');
    status.textContent = 'กำลังแคปภาพเกม…';
    try { this.screenshot = captureGameCanvas(); status.textContent = 'แคปภาพเกมแล้ว ✓'; }
    catch (error) { status.textContent = `ยังไม่ได้แคปภาพ: ${error.message}`; }
    this.renderShot(panel);
  }

  async pickScreenshot(panel, file) {
    const status = panel.querySelector('[data-status]');
    status.textContent = 'กำลังเตรียมภาพ…';
    try { this.screenshot = await imageFromFile(file); status.textContent = 'แนบภาพแล้ว ✓'; }
    catch (error) { status.textContent = `แนบภาพไม่สำเร็จ: ${error.message}`; }
    this.renderShot(panel);
  }

  renderShot(panel) {
    const zone = panel.querySelector('[data-shot-zone]');
    const remove = panel.querySelector('[data-remove]');
    zone.replaceChildren();
    if (this.screenshot) {
      const img = new Image(); img.src=this.screenshot; img.alt='ภาพหน้าจอประกอบรายงาน'; img.style.cssText='max-width:100%;max-height:260px;border-radius:8px';
      zone.appendChild(img); remove.style.display='inline-block';
    } else { zone.textContent='ยังไม่มีภาพหน้าจอ (ส่งรายงานได้โดยไม่แนบภาพ)'; remove.style.display='none'; }
  }

  async submit(event, panel) {
    event.preventDefault();
    const form = event.currentTarget;
    const submit = form.querySelector('[type=submit]');
    const status = panel.querySelector('[data-status]');
    submit.disabled=true; status.textContent='กำลังส่งรายงาน…';
    try {
      const stats = this.gameUI?.character?.stats || {};
      const data = await request('/bug-reports', { method:'POST', body:JSON.stringify({
        category:form.category.value,title:form.title.value,details:form.details.value,screenshot:this.screenshot,
        context:{ map:stats.lastMap || stats.last_map || '',viewport:`${innerWidth}x${innerHeight}`,browser:navigator.userAgent,build:document.documentElement.dataset.build || '' },
      }) });
      panel.querySelector('[data-form]').replaceChildren(Object.assign(document.createElement('div'), { textContent:`✅ ส่งรายงานสำเร็จ เลขที่ ${data.id} ทีมแอดมินจะตรวจสอบและแจ้งรางวัลในเกม` }));
    } catch (error) { status.textContent=`ส่งไม่สำเร็จ: ${error.message}`; submit.disabled=false; }
  }

  async showHistory(panel) {
    const status = panel.querySelector('[data-status]'); status.textContent='กำลังโหลดประวัติ…';
    try {
      const { reports } = await request('/bug-reports/mine');
      const zone = panel.querySelector('[data-shot-zone]'); zone.replaceChildren();
      zone.style.maxHeight = '46dvh'; zone.style.overflow = 'auto';
      if (!reports.length) zone.textContent='ยังไม่มีประวัติการแจ้งบัค';
      for (const report of reports) {
        const row=document.createElement('button'); row.type='button';
        row.style.cssText='display:flex;width:100%;align-items:center;justify-content:space-between;gap:10px;text-align:left;padding:11px 8px;border:0;border-bottom:1px solid #32445f;background:transparent;color:#eef6ff';
        const label=document.createElement('span'); label.style.cssText='min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap'; label.textContent=report.title;
        const badge=document.createElement('span'); badge.style.cssText=`flex:none;padding:4px 8px;border-radius:999px;font-size:11px;background:${report.status==='approved'?'#176640':report.status==='rejected'?'#752e38':'#6b541d'}`;
        badge.textContent=report.status==='approved'?'✅ อนุมัติแล้ว':report.status==='rejected'?'❌ ไม่อนุมัติ':'⏳ รอตรวจสอบ';
        row.append(label,badge); row.onclick=()=>this.showHistoryDetail(panel,report,reports); zone.appendChild(row);
      }
      status.textContent=reports.length?'แตะรายการเพื่อดูรายละเอียดและสถานะ':'';
    } catch(error) { status.textContent=`โหลดไม่สำเร็จ: ${error.message}`; }
  }

  showHistoryDetail(panel, report, reports) {
    const zone=panel.querySelector('[data-shot-zone]'); zone.replaceChildren(); zone.style.maxHeight='50dvh'; zone.style.overflow='auto';
    const back=document.createElement('button'); back.type='button'; back.textContent='← กลับไปประวัติ'; back.style.cssText='display:block;margin-bottom:10px;background:#263b5a;color:white;border:0;border-radius:7px;padding:8px 11px';
    back.onclick=()=>this.renderHistoryList(panel,reports);
    const title=document.createElement('h3'); title.textContent=report.title; title.style.cssText='text-align:left;margin:5px 0;color:#75c8ff';
    const state=document.createElement('div'); state.style.cssText='text-align:left;font-weight:800;margin-bottom:9px'; state.textContent=`สถานะ: ${report.status==='approved'?'✅ อนุมัติแล้ว':report.status==='rejected'?'❌ ไม่อนุมัติ':'⏳ รอตรวจสอบ'}`;
    const date=document.createElement('div'); date.style.cssText='text-align:left;color:#9eb0c8;font-size:12px;margin-bottom:9px'; date.textContent=`ส่งเมื่อ ${new Date(report.created_at).toLocaleString('th-TH')}${report.reviewed_at?` • ดำเนินการ ${new Date(report.reviewed_at).toLocaleString('th-TH')}`:''}`;
    const details=document.createElement('div'); details.style.cssText='text-align:left;white-space:pre-wrap;padding:10px;background:#091121;border-radius:8px'; details.textContent=report.details;
    zone.append(back,title,state,date,details);
    if(report.screenshot_data){const image=new Image();image.src=report.screenshot_data;image.alt='ภาพประกอบรายงาน';image.style.cssText='display:block;max-width:100%;max-height:300px;margin:10px auto;border-radius:8px';zone.appendChild(image);}
    if(report.admin_note){const note=document.createElement('div');note.style.cssText='text-align:left;margin-top:10px;padding:9px;border-left:3px solid #75c8ff;background:#162238';note.textContent=`ข้อความจากแอดมิน: ${report.admin_note}`;zone.appendChild(note);}
    if(report.status==='approved'){const reward=document.createElement('div');reward.style.cssText='text-align:left;margin-top:10px;color:#8ff0b8;font-weight:800';reward.textContent=`🎁 รางวัล: ${report.reward_item_name} x${report.reward_item_quantity} + ${Number(report.reward_gold).toLocaleString()} Zeny`;zone.appendChild(reward);}
  }

  renderHistoryList(panel, reports) {
    const zone=panel.querySelector('[data-shot-zone]'); zone.replaceChildren(); zone.style.maxHeight='46dvh'; zone.style.overflow='auto';
    for(const report of reports){
      const row=document.createElement('button');row.type='button';row.style.cssText='display:flex;width:100%;align-items:center;justify-content:space-between;gap:10px;text-align:left;padding:11px 8px;border:0;border-bottom:1px solid #32445f;background:transparent;color:#eef6ff';
      const label=document.createElement('span');label.style.cssText='min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap';label.textContent=report.title;
      const badge=document.createElement('span');badge.style.cssText=`flex:none;padding:4px 8px;border-radius:999px;font-size:11px;background:${report.status==='approved'?'#176640':report.status==='rejected'?'#752e38':'#6b541d'}`;badge.textContent=report.status==='approved'?'✅ อนุมัติแล้ว':report.status==='rejected'?'❌ ไม่อนุมัติ':'⏳ รอตรวจสอบ';
      row.append(label,badge);row.onclick=()=>this.showHistoryDetail(panel,report,reports);zone.appendChild(row);
    }
  }

  close() {
    if (this.viewportHandler) window.visualViewport?.removeEventListener('resize', this.viewportHandler);
    this.viewportHandler = null;
    this.root?.remove(); this.root=null;
    document.body.style.overflow = this.previousBodyOverflow;
    this.gameUI?.updateMobileControlsVisibility?.();
  }
}
