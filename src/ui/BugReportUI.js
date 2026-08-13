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

async function captureScreen() {
  if (navigator.mediaDevices?.getDisplayMedia) {
    let stream;
    try {
      stream = await navigator.mediaDevices.getDisplayMedia({ video: { frameRate: 1 }, audio: false, preferCurrentTab: true });
      const video = document.createElement('video');
      video.srcObject = stream;
      await video.play();
      await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      return resizeFrame(video, video.videoWidth, video.videoHeight);
    } finally {
      stream?.getTracks().forEach(track => track.stop());
    }
  }
  const canvas = document.querySelector('#game-screen canvas, canvas');
  if (!canvas) throw new Error('เบราว์เซอร์นี้ไม่รองรับการแคปหน้าจอ');
  return resizeFrame(canvas, canvas.width, canvas.height);
}

export class BugReportUI {
  constructor(gameUI) {
    this.gameUI = gameUI;
    this.screenshot = '';
    this.root = null;
    document.getElementById('btn-bug-report')?.addEventListener('click', () => this.open());
  }

  async open() {
    this.close();
    this.root = document.createElement('div');
    this.root.style.cssText = 'position:fixed;inset:0;z-index:12000;background:rgba(3,6,16,.82);display:grid;place-items:center;padding:12px';
    const panel = document.createElement('section');
    panel.style.cssText = 'width:min(720px,96vw);max-height:92vh;overflow:auto;background:#111a2d;border:1px solid #4fa3ff;border-radius:14px;padding:20px;color:#eef6ff;box-shadow:0 20px 70px #000';
    panel.innerHTML = `<div style="display:flex;justify-content:space-between;gap:12px"><div><h2 style="margin:0;color:#73c5ff">🐞 แจ้งบัคในเกม</h2><p style="margin:6px 0 16px;color:#abc">ภาพจะถูกส่งให้ทีมแอดมินเท่านั้น หากอนุมัติจะได้รับไอเทมพิเศษและ Zeny</p></div><button data-close aria-label="ปิด" style="height:34px;background:#26344c;color:white;border:0;border-radius:8px;padding:0 12px">✕</button></div>
      <form data-form style="display:grid;gap:12px">
        <label>ประเภท<select name="category" style="display:block;width:100%;margin-top:5px;padding:10px;background:#0b1220;color:white;border:1px solid #405573;border-radius:8px">${Object.entries(categoryLabels).map(([v,l])=>`<option value="${v}">${l}</option>`).join('')}</select></label>
        <label>หัวข้อ<input name="title" maxlength="100" required placeholder="เช่น ขายไอเทมแล้วเงินหายหลังเข้าใหม่" style="display:block;width:100%;box-sizing:border-box;margin-top:5px;padding:10px;background:#0b1220;color:white;border:1px solid #405573;border-radius:8px"></label>
        <label>รายละเอียดและขั้นตอนที่ทำให้เกิดปัญหา<textarea name="details" maxlength="4000" minlength="10" required rows="6" placeholder="เกิดอะไรขึ้น / ทำอะไรมาก่อน / ควรเป็นอย่างไร..." style="display:block;width:100%;box-sizing:border-box;margin-top:5px;padding:10px;background:#0b1220;color:white;border:1px solid #405573;border-radius:8px;resize:vertical"></textarea></label>
        <div data-shot-zone style="border:1px dashed #53739b;border-radius:10px;padding:12px;text-align:center;color:#abc">ยังไม่มีภาพหน้าจอ</div>
        <div style="display:flex;flex-wrap:wrap;gap:8px"><button type="button" data-capture style="background:#275d91;color:white;border:0;border-radius:8px;padding:10px 14px">📸 แคปหน้าจอใหม่</button><button type="button" data-remove style="display:none;background:#633;color:white;border:0;border-radius:8px;padding:10px 14px">ลบภาพ</button><span data-status style="align-self:center;color:#8fc7ef"></span></div>
        <div style="display:flex;justify-content:flex-end;gap:8px"><button type="button" data-history style="background:#26344c;color:white;border:0;border-radius:8px;padding:11px 16px">ประวัติของฉัน</button><button type="submit" style="background:#2b9c64;color:white;border:0;border-radius:8px;padding:11px 20px;font-weight:700">ส่งรายงาน</button></div>
      </form>`;
    this.root.appendChild(panel);
    document.body.appendChild(this.root);
    panel.querySelector('[data-close]').onclick = () => this.close();
    this.root.addEventListener('click', e => { if (e.target === this.root) this.close(); });
    panel.querySelector('[data-capture]').onclick = () => this.takeScreenshot(panel);
    panel.querySelector('[data-remove]').onclick = () => { this.screenshot=''; this.renderShot(panel); };
    panel.querySelector('[data-history]').onclick = () => this.showHistory(panel);
    panel.querySelector('[data-form]').onsubmit = e => this.submit(e, panel);
    // Do not request screen-sharing permission while the report dialog opens.
    // Some browsers keep getDisplayMedia pending behind their picker, making
    // the game look frozen. Capturing is optional and starts only from the
    // explicit "แคปหน้าจอใหม่" button below.
    panel.querySelector('[data-status]').textContent = 'กรอกรายละเอียดได้ทันที • แนบภาพได้จากปุ่มแคปหน้าจอ';
  }

  async takeScreenshot(panel) {
    const status = panel.querySelector('[data-status]');
    status.textContent = 'กำลังเปิดตัวเลือกหน้าจอ…';
    try { this.screenshot = await captureScreen(); status.textContent = 'แคปภาพแล้ว ✓'; }
    catch (error) { status.textContent = `ยังไม่ได้แคปภาพ: ${error.message}`; }
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
      if (!reports.length) zone.textContent='ยังไม่มีประวัติการแจ้งบัค';
      for (const report of reports) {
        const row=document.createElement('div'); row.style.cssText='text-align:left;padding:9px;border-bottom:1px solid #32445f';
        const reward=report.status==='approved'?` • 🎁 ${report.reward_item_name} x${report.reward_item_quantity} + ${Number(report.reward_gold).toLocaleString()} Zeny`:'';
        row.textContent=`${report.status==='approved'?'✅':report.status==='rejected'?'❌':'⏳'} ${report.title}${reward}`; zone.appendChild(row);
      }
      status.textContent='';
    } catch(error) { status.textContent=`โหลดไม่สำเร็จ: ${error.message}`; }
  }

  close() { this.root?.remove(); this.root=null; }
}
