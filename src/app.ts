import './style.css';
import {
  adherenceSummary,
  buildDailySchedule,
  doseState,
  nextDose,
  validatePlan,
  type DoseStatus,
  type MedicationPlan,
} from './domain';
import { clearData, loadData, saveData } from './storage';

const appElement = document.querySelector<HTMLDivElement>('#app');
if (!appElement) throw new Error('Uygulama kökü bulunamadı.');
const app: HTMLDivElement = appElement;

let data = loadData();
let selectedDate = localDate(new Date());

function localDate(date: Date): string {
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 10);
}

function escapeHtml(value: string): string {
  return value.replace(
    /[&<>'"]/g,
    (character) =>
      ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        "'": '&#39;',
        '"': '&quot;',
      })[character] ?? character,
  );
}

function stateLabel(state: string): string {
  return (
    {
      taken: 'ALINDI',
      skipped: 'ATLANDI',
      upcoming: 'YAKLAŞIYOR',
      due: 'ZAMANI',
      missed: 'KAYIT YOK',
    }[state] ?? state
  );
}

function render(): void {
  const now = new Date();
  const doses = buildDailySchedule(data.plans, selectedDate);
  const summary = adherenceSummary(doses, data.events, now);
  const upcoming = nextDose(doses, data.events, now);
  app.innerHTML = `
    <header class="hero">
      <div><p class="eyebrow">YEREL · ÇEVRİMDIŞI · SADE</p><h1>Doz<span>Hafıza</span></h1><p>İlaç planı ve günlük kullanım kaydı yalnızca bu cihazda.</p></div>
      <div class="privacy"><i></i> Sunucuya sağlık verisi gönderilmez</div>
    </header>
    <main>
      <section class="notice"><strong>Tıbbi karar aracı değildir.</strong> Doz ve saatleri yalnızca doktorunuzun veya eczacınızın verdiği plana göre kaydedin.</section>
      <section class="dashboard">
        <article class="next-card"><p>SONRAKİ KAYIT</p><strong>${upcoming ? `${escapeHtml(upcoming.time)} · ${escapeHtml(upcoming.name)}` : 'Bugün için bekleyen kayıt yok'}</strong><span>${upcoming ? escapeHtml(upcoming.doseLabel) : 'Plan ekleyebilir veya başka bir gün seçebilirsiniz.'}</span></article>
        <article><p>BUGÜN TAMAMLAMA</p><strong>${summary.percentage === null ? '—' : `${summary.percentage}%`}</strong><span>${summary.taken} alındı · ${summary.skipped} atlandı · ${summary.missed} kayıtsız</span></article>
        <article><p>YEREL PLAN</p><strong>${data.plans.length}</strong><span>Tarayıcı belleğinde saklanıyor</span></article>
      </section>
      <section class="workspace">
        <div class="timeline-panel">
          <div class="section-head"><div><p class="step">01 · GÜNLÜK AKIŞ</p><h2>Doz zaman çizelgesi</h2></div><input id="selectedDate" aria-label="Görüntülenecek gün" type="date" value="${selectedDate}" /></div>
          <div class="timeline">${
            doses.length
              ? doses
                  .map((dose) => {
                    const state = doseState(dose, data.events, now);
                    return `<article class="dose ${state}"><time>${escapeHtml(dose.time)}</time><div><strong>${escapeHtml(dose.name)}</strong><span>${escapeHtml(dose.doseLabel)}</span></div><b>${stateLabel(state)}</b><div class="dose-actions"><button data-dose="${escapeHtml(dose.key)}" data-status="taken">Aldım</button><button data-dose="${escapeHtml(dose.key)}" data-status="skipped">Atladım</button><button class="quiet" data-undo="${escapeHtml(dose.key)}">Geri al</button></div></article>`;
                  })
                  .join('')
              : '<div class="empty">Bu gün için planlı kayıt yok.</div>'
          }</div>
        </div>
        <aside>
          <p class="step">02 · PLAN EKLE</p><h2>Yeni ilaç planı</h2>
          <form id="planForm">
            <label>İlaç adı<input name="name" maxlength="60" required placeholder="Örn. İlaç A" /></label>
            <label>Doz etiketi<input name="doseLabel" maxlength="60" required placeholder="Örn. 1 tablet" /></label>
            <label>Saatler <small>virgülle ayırın</small><input name="times" required placeholder="08:00, 20:00" /></label>
            <div class="date-grid"><label>Başlangıç<input name="startDate" type="date" value="${localDate(now)}" required /></label><label>Bitiş <small>isteğe bağlı</small><input name="endDate" type="date" /></label></div>
            <p id="formError" class="form-error" role="alert"></p>
            <button class="primary" type="submit">Planı cihazıma kaydet</button>
          </form>
          <div class="local-tools"><button id="samplePlan">Örnek plan</button><button id="exportData">Yedeği indir</button><button id="clearData" class="danger">Tümünü sil</button></div>
        </aside>
      </section>
      <section class="plans"><div class="section-head"><div><p class="step">03 · KAYITLI PLANLAR</p><h2>Cihazdaki planlar</h2></div></div><div class="plan-list">${data.plans.length ? data.plans.map((plan) => `<article><div><strong>${escapeHtml(plan.name)}</strong><span>${escapeHtml(plan.doseLabel)} · ${plan.times.map(escapeHtml).join(', ')}</span></div><button data-delete-plan="${escapeHtml(plan.id)}">Sil</button></article>`).join('') : '<div class="empty">Henüz plan eklenmedi.</div>'}</div></section>
    </main>
    <footer>DozHafıza · Veriler localStorage içinde kalır · Paylaşılan cihazlarda kullanmayın</footer>`;
  bindEvents();
}

function bindEvents(): void {
  document.querySelector<HTMLInputElement>('#selectedDate')?.addEventListener('change', (event) => {
    selectedDate = (event.currentTarget as HTMLInputElement).value;
    render();
  });
  document.querySelector<HTMLFormElement>('#planForm')?.addEventListener('submit', (event) => {
    event.preventDefault();
    if (!(event.currentTarget instanceof HTMLFormElement)) return;
    const form = new FormData(event.currentTarget);
    const plan: MedicationPlan = {
      id: crypto.randomUUID(),
      name: String(form.get('name') ?? '').trim(),
      doseLabel: String(form.get('doseLabel') ?? '').trim(),
      times: String(form.get('times') ?? '')
        .split(',')
        .map((time) => time.trim())
        .filter(Boolean),
      startDate: String(form.get('startDate') ?? ''),
      endDate: String(form.get('endDate') ?? '') || undefined,
    };
    const errors = validatePlan(plan);
    const errorBox = document.querySelector<HTMLParagraphElement>('#formError');
    if (errors.length) {
      if (errorBox) errorBox.textContent = errors.join(' ');
      return;
    }
    data.plans.push(plan);
    saveData(data);
    render();
  });
  document.querySelectorAll<HTMLButtonElement>('[data-dose]').forEach((button) =>
    button.addEventListener('click', () => {
      const key = button.dataset.dose;
      const status = button.dataset.status as DoseStatus;
      if (!key) return;
      data.events = data.events.filter((event) => event.key !== key);
      data.events.push({ key, status, recordedAt: new Date().toISOString() });
      saveData(data);
      render();
    }),
  );
  document.querySelectorAll<HTMLButtonElement>('[data-undo]').forEach((button) =>
    button.addEventListener('click', () => {
      data.events = data.events.filter((event) => event.key !== button.dataset.undo);
      saveData(data);
      render();
    }),
  );
  document.querySelectorAll<HTMLButtonElement>('[data-delete-plan]').forEach((button) =>
    button.addEventListener('click', () => {
      const id = button.dataset.deletePlan;
      data.plans = data.plans.filter((plan) => plan.id !== id);
      data.events = data.events.filter((event) => !event.key.startsWith(`${id}|`));
      saveData(data);
      render();
    }),
  );
  document.querySelector('#samplePlan')?.addEventListener('click', () => {
    const id = crypto.randomUUID();
    data.plans.push({
      id,
      name: 'Örnek plan',
      doseLabel: '1 birim',
      times: ['08:00', '20:00'],
      startDate: localDate(new Date()),
    });
    saveData(data);
    render();
  });
  document.querySelector('#exportData')?.addEventListener('click', () => {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `doz-hafiza-${localDate(new Date())}.json`;
    link.click();
    URL.revokeObjectURL(url);
  });
  document.querySelector('#clearData')?.addEventListener('click', () => {
    if (!confirm('Bu cihazdaki tüm plan ve kayıtlar kalıcı olarak silinsin mi?')) return;
    clearData();
    data = loadData();
    render();
  });
}

render();
if ('serviceWorker' in navigator)
  navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`);
