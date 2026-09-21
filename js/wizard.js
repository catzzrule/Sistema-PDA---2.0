// Formulário do usuário (Área): dashboard com o status das próprias bases,
// wizard de 3 passos, upload de arquivo, rascunho automático, preenchimento
// demo e envio/reenvio ao Supabase.
import { sb } from './supabase-client.js';
import { STORAGE_BUCKET } from './config.js';
import { session } from './session.js';
import { FORM_FIELDS } from './fields.js';
import { generateReportHTML, escapeHtml } from './report.js';
import { showToast } from './toast.js';
import { fetchSubmissions, statusBadgeHtml } from './submissions.js';

const form = document.getElementById('dataset-form');
const progressBar = document.getElementById('progress-bar');

const steps = [
  document.getElementById('section-step-1'),
  document.getElementById('section-step-2'),
  document.getElementById('section-step-3'),
];
const indicators = [
  document.getElementById('indicator-step-1'),
  document.getElementById('indicator-step-2'),
  document.getElementById('indicator-step-3'),
];

let currentStep = 1;

// Quando != null, o formulário está editando uma resposta rejeitada (reenvio)
// em vez de criar uma nova — o submit vira um UPDATE na mesma linha, e os
// arquivos já enviados antes são preservados se a área não reanexar um novo.
let activeSubmissionId = null;
let activeSubmissionOriginalData = null;
let cachedAreaSubmissions = [];

const areaDashboardEl = document.getElementById('area-dashboard');
const areaWizardEl = document.getElementById('area-wizard');
const wizardRejectionBanner = document.getElementById('wizard-rejection-banner');
const wizardRejectionReasonText = document.getElementById('wizard-rejection-reason-text');

const btnStep1Next = document.getElementById('btn-step1-next');
const btnStep2Prev = document.getElementById('btn-step2-prev');
const btnStep2Next = document.getElementById('btn-step2-next');
const btnStep3Prev = document.getElementById('btn-step3-prev');
const btnFillDemo = document.getElementById('btn-fill-demo');
const btnPrint = document.getElementById('btn-print');
const btnSubmit = document.getElementById('btn-submit');

const q8Radios = document.getElementsByName('q8_relacao_ods');
const cardQ9 = document.getElementById('card-q9-ods');

const successModal = document.getElementById('success-modal');
const btnModalClose = document.getElementById('btn-modal-close');

// Rascunho namespaced por usuário, para que um computador compartilhado não misture rascunhos
function draftKey() {
  return session.user ? `dados_gov_br_draft_${session.user.id}` : null;
}

function setupFileUpload(zoneId, inputId, previewId) {
  const zone = document.getElementById(zoneId);
  const input = document.getElementById(inputId);
  const preview = document.getElementById(previewId);
  if (!zone || !input || !preview) return;

  ['dragenter', 'dragover'].forEach(eventName => {
    zone.addEventListener(eventName, (e) => {
      e.preventDefault();
      zone.classList.add('dragover');
    });
  });

  ['dragleave', 'drop'].forEach(eventName => {
    zone.addEventListener(eventName, (e) => {
      e.preventDefault();
      zone.classList.remove('dragover');
    });
  });

  zone.addEventListener('drop', (e) => {
    const files = e.dataTransfer.files;
    if (files.length > 0) {
      input.files = files;
      updatePreview();
    }
  });

  input.addEventListener('change', updatePreview);

  function updatePreview() {
    if (input.files && input.files[0]) {
      const file = input.files[0];
      const sizeMb = (file.size / (1024 * 1024)).toFixed(2);
      if (sizeMb > 10) {
        showToast(`O arquivo excede o limite de 10MB (${sizeMb}MB)`, 'error');
        input.value = '';
        preview.innerHTML = '';
        return;
      }
      preview.innerHTML = `<i class="fa-solid fa-file"></i> Arquivo selecionado: ${escapeHtml(file.name)} (${sizeMb} MB)`;
    } else {
      preview.innerHTML = '';
    }
  }
}

setupFileUpload('upload-zone-q22', 'q22_arquivo_recurso', 'preview-q22');
setupFileUpload('upload-zone-q25', 'q25_arquivo_dicionario', 'preview-q25');

function goToStep(stepNumber) {
  if (stepNumber < 1 || stepNumber > 3) return;
  currentStep = stepNumber;

  steps.forEach((sec, idx) => sec.classList.toggle('active', idx + 1 === currentStep));

  indicators.forEach((ind, idx) => {
    const stepIdx = idx + 1;
    ind.classList.remove('active', 'completed');
    if (stepIdx === currentStep) ind.classList.add('active');
    else if (stepIdx < currentStep) ind.classList.add('completed');
  });

  progressBar.style.width = `${((currentStep - 1) / 2) * 80}%`;

  if (currentStep === 3) renderSummary();

  window.scrollTo({ top: 150, behavior: 'smooth' });
}

function updateOdsVisibility() {
  let q8Val = '';
  q8Radios.forEach(r => { if (r.checked) q8Val = r.value; });
  cardQ9.style.display = q8Val === 'SIM' ? 'block' : 'none';
}

q8Radios.forEach(radio => radio.addEventListener('change', updateOdsVisibility));

function setupOptionItemHighlighting() {
  document.querySelectorAll('.option-item').forEach(label => {
    const input = label.querySelector('input');
    if (!input) return;

    const updateClass = () => {
      if (input.type === 'radio') {
        document.querySelectorAll(`input[name="${input.name}"]`).forEach(r => {
          r.closest('.option-item')?.classList.remove('selected');
        });
        if (input.checked) label.classList.add('selected');
      } else if (input.type === 'checkbox') {
        label.classList.toggle('selected', input.checked);
      }
    };

    input.addEventListener('change', updateClass);
    label.classList.toggle('selected', input.checked);
  });
}
setupOptionItemHighlighting();

function validateStep1() {
  const q1Checked = document.querySelector('input[name="q1_dados_abertos"]:checked');
  if (!q1Checked) {
    showToast('Por favor, responda a pergunta 1 (Dados abertos)', 'error');
    return false;
  }

  const q2Val = document.getElementById('q2_titulo_base').value.trim();
  if (!q2Val) {
    showToast('Por favor, informe o Título da base de dados (Pergunta 2)', 'error');
    document.getElementById('q2_titulo_base').focus();
    return false;
  }

  let q8Val = '';
  q8Radios.forEach(r => { if (r.checked) q8Val = r.value; });
  if (q8Val === 'SIM') {
    const q9Checked = document.querySelectorAll('input[name="q9_ods"]:checked');
    if (q9Checked.length === 0) {
      showToast('Por favor, escolha pelo menos um ODS na pergunta 9', 'error');
      return false;
    }
  }

  return true;
}

btnStep1Next.addEventListener('click', () => {
  if (validateStep1()) {
    saveDraft();
    goToStep(2);
  }
});

btnStep2Prev.addEventListener('click', () => { saveDraft(); goToStep(1); });
btnStep2Next.addEventListener('click', () => { saveDraft(); goToStep(3); });
btnStep3Prev.addEventListener('click', () => goToStep(2));

indicators.forEach(ind => {
  ind.addEventListener('click', () => {
    const targetStep = parseInt(ind.getAttribute('data-step'), 10);
    if ((targetStep === 2 || targetStep === 3) && !validateStep1()) return;
    goToStep(targetStep);
  });
});

function getFormData() {
  const formData = new FormData(form);
  const data = {};
  for (const [key, value] of formData.entries()) {
    if (key === 'q9_ods') {
      if (!data[key]) data[key] = [];
      data[key].push(value);
    } else if (value instanceof File) {
      data[key] = value.name || 'Nenhum arquivo enviado';
    } else {
      data[key] = value;
    }
  }
  return data;
}

function renderSummary() {
  document.getElementById('summary-content').innerHTML = generateReportHTML(getFormData());
}

btnFillDemo?.addEventListener('click', () => {
  FORM_FIELDS.forEach(field => {
    if (field.demo === undefined) return;

    if (field.type === 'radio') {
      const input = form.querySelector(`input[name="${field.id}"][value="${field.demo}"]`);
      if (input) input.checked = true;
    } else if (field.type === 'checkbox-group') {
      form.querySelectorAll(`input[name="${field.id}"]`).forEach(cb => {
        cb.checked = field.demo.includes(cb.value);
      });
    } else if (field.type === 'date-range') {
      const startEl = document.getElementById(field.id);
      const endEl = document.getElementById(field.pairId);
      if (startEl) startEl.value = field.demo;
      if (endEl) endEl.value = field.demoPair;
    } else {
      const el = document.getElementById(field.id);
      if (el) el.value = field.demo;
    }
  });

  updateOdsVisibility();
  setupOptionItemHighlighting();
  saveDraft();
  showToast('Dados de exemplo preenchidos com sucesso!');
});

function saveDraft() {
  const key = draftKey();
  if (!key) return;
  localStorage.setItem(key, JSON.stringify(getFormData()));
}

// Aplica um objeto de dados (do rascunho local ou de uma resposta existente
// vinda do banco) nos campos do formulário. Ambos têm o mesmo formato, porque
// os dois nascem de getFormData().
function populateFormFromData(data) {
  for (const key in data) {
    const val = data[key];
    const field = form.elements[key];
    if (!field) continue;

    if (field instanceof NodeList || Array.isArray(field)) {
      field.forEach(el => {
        if (el.type === 'radio') {
          el.checked = (el.value === val);
        } else if (el.type === 'checkbox' && Array.isArray(val)) {
          el.checked = val.includes(el.value);
        }
      });
    } else if (field.type === 'file') {
      // Segurança do navegador: não é possível definir o valor de um input de arquivo via JS.
    } else {
      field.value = val;
    }
  }
}

function loadDraft() {
  const key = draftKey();
  if (!key) return;
  const saved = localStorage.getItem(key);
  if (!saved) return;

  try {
    populateFormFromData(JSON.parse(saved));
    updateOdsVisibility();
    setupOptionItemHighlighting();
  } catch (e) {
    console.error('Erro ao carregar rascunho:', e);
  }
}

form.addEventListener('input', saveDraft);
form.addEventListener('change', saveDraft);

async function uploadFileIfPresent(inputId, submissionId) {
  const input = document.getElementById(inputId);
  if (!input.files || !input.files[0]) return null;
  const file = input.files[0];
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
  const path = `${session.user.id}/${submissionId}/${inputId}-${safeName}`;

  const { error } = await sb.storage.from(STORAGE_BUCKET).upload(path, file, { upsert: true });
  if (error) throw new Error(`Falha ao enviar o arquivo "${file.name}": ${error.message}`);
  return { path, name: file.name };
}

// Envia o arquivo se um novo foi selecionado; caso contrário, num reenvio,
// preserva o nome/caminho do arquivo já enviado anteriormente (o input de
// arquivo não pode ser pré-preenchido, então sem isso o reenvio "esqueceria"
// o arquivo original).
async function resolveFileField(inputId, submissionId, dataOut, nameKey, pathKey) {
  const uploaded = await uploadFileIfPresent(inputId, submissionId);
  if (uploaded) {
    dataOut[nameKey] = uploaded.name;
    dataOut[pathKey] = uploaded.path;
  } else if (activeSubmissionOriginalData && activeSubmissionOriginalData[pathKey]) {
    dataOut[nameKey] = activeSubmissionOriginalData[nameKey];
    dataOut[pathKey] = activeSubmissionOriginalData[pathKey];
  }
}

function resetForm() {
  const key = draftKey();
  if (key) localStorage.removeItem(key);
  form.reset();
  updateOdsVisibility();
  setupOptionItemHighlighting();
  document.getElementById('preview-q22').innerHTML = '';
  document.getElementById('preview-q25').innerHTML = '';
}

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  if (!validateStep1()) {
    goToStep(1);
    return;
  }

  btnSubmit.disabled = true;
  btnSubmit.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Enviando...';

  try {
    const isResubmit = Boolean(activeSubmissionId);
    const submissionId = isResubmit ? activeSubmissionId : crypto.randomUUID();
    const data = getFormData();

    await resolveFileField('q22_arquivo_recurso', submissionId, data, 'q22_arquivo_recurso', 'q22_arquivo_recurso_path');
    await resolveFileField('q25_arquivo_dicionario', submissionId, data, 'q25_arquivo_dicionario', 'q25_arquivo_dicionario_path');

    if (isResubmit) {
      // A trigger submissions_guard_update() cuida do resto (reviewed_by/etc);
      // aqui só mandamos os dados novos e o status voltando para revisão.
      const { error } = await sb.from('submissions')
        .update({ data, status: 'em_analise' })
        .eq('id', submissionId);
      if (error) throw error;
    } else {
      const { error } = await sb.from('submissions').insert({
        id: submissionId,
        user_id: session.user.id,
        area: session.profile.area,
        data
      });
      if (error) throw error;
    }

    resetForm();
    activeSubmissionId = null;
    activeSubmissionOriginalData = null;
    wizardRejectionBanner.style.display = 'none';
    goToStep(1);
    successModal.classList.add('show');
    await refreshAreaDashboard();
  } catch (err) {
    console.error(err);
    showToast(`Erro ao enviar formulário: ${err.message || err}`, 'error');
  } finally {
    btnSubmit.disabled = false;
    btnSubmit.innerHTML = '<i class="fa-solid fa-paper-plane"></i> Enviar Formulário';
  }
});

btnModalClose.addEventListener('click', () => {
  successModal.classList.remove('show');
  showAreaDashboardScreen();
});

btnPrint.addEventListener('click', () => {
  renderSummary();
  window.print();
});

// ---------------------------------------------------------------------------
// Dashboard da Área: status das próprias bases (em análise / rejeitadas / ok)
// ---------------------------------------------------------------------------
function showAreaDashboardScreen() {
  areaWizardEl.style.display = 'none';
  areaDashboardEl.style.display = 'block';
}

function showAreaWizardScreen() {
  areaDashboardEl.style.display = 'none';
  areaWizardEl.style.display = 'block';
}

function renderAreaDashboard(list) {
  const emAnalise = list.filter(i => i.status === 'em_analise').length;
  const rejeitadas = list.filter(i => i.status === 'rejeitada');
  const concluidas = list.filter(i => i.status === 'aprovada_ouvidoria' || i.status === 'confirmada_cgti').length;

  document.getElementById('area-metric-em-analise').textContent = emAnalise;
  document.getElementById('area-metric-rejeitadas').textContent = rejeitadas.length;
  document.getElementById('area-metric-concluidas').textContent = concluidas;

  document.getElementById('area-rejection-banners').innerHTML = rejeitadas.map(item => `
    <div class="rejection-banner">
      <div>
        <div class="rejection-banner-title">
          <i class="fa-solid fa-circle-exclamation"></i> ${escapeHtml(item.data.q2_titulo_base || 'Resposta sem título')}
        </div>
        <div class="rejection-banner-reason">${escapeHtml(item.rejectionReason || 'A Ouvidoria pediu ajustes nesta resposta.')}</div>
      </div>
      <button type="button" class="btn btn-primary" data-resubmit-id="${escapeHtml(item.id)}">
        <i class="fa-solid fa-pen"></i> Editar e Reenviar
      </button>
    </div>
  `).join('');

  const tbody = document.getElementById('area-submissions-body');
  if (list.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="4" style="text-align: center; color: var(--text-muted); padding: 2rem;">
          Nenhum cadastro enviado ainda.
        </td>
      </tr>
    `;
    return;
  }

  tbody.innerHTML = list.map(item => `
    <tr>
      <td style="font-size: 0.85rem; color: var(--text-muted);">${escapeHtml(item.timestamp)}</td>
      <td style="font-weight: 600;">${escapeHtml(item.data.q2_titulo_base || 'Sem Título')}</td>
      <td>${statusBadgeHtml(item.status)}</td>
      <td style="text-align: center;">
        ${item.status === 'rejeitada'
          ? `<button type="button" class="btn-action-icon" data-resubmit-id="${escapeHtml(item.id)}" title="Editar e Reenviar"><i class="fa-solid fa-pen"></i></button>`
          : '<span style="color: var(--text-light);">—</span>'}
      </td>
    </tr>
  `).join('');
}

async function refreshAreaDashboard() {
  cachedAreaSubmissions = await fetchSubmissions(false);
  renderAreaDashboard(cachedAreaSubmissions);
}

function startResubmit(id) {
  const item = cachedAreaSubmissions.find(s => s.id === id);
  if (!item) return;

  activeSubmissionId = item.id;
  activeSubmissionOriginalData = item.data;

  form.reset();
  populateFormFromData(item.data);
  updateOdsVisibility();
  setupOptionItemHighlighting();

  const previewText = (label, filename) => filename
    ? `<i class="fa-solid fa-file"></i> ${label}: ${escapeHtml(filename)} (envie um novo arquivo aqui só se quiser substituí-lo)`
    : '';
  document.getElementById('preview-q22').innerHTML = previewText('Arquivo já enviado', item.data.q22_arquivo_recurso);
  document.getElementById('preview-q25').innerHTML = previewText('Arquivo já enviado', item.data.q25_arquivo_dicionario);

  wizardRejectionReasonText.textContent = item.rejectionReason || 'A Ouvidoria pediu ajustes nesta resposta.';
  wizardRejectionBanner.style.display = 'flex';

  goToStep(1);
  showAreaWizardScreen();
}

document.getElementById('area-dashboard')?.addEventListener('click', (e) => {
  const btn = e.target.closest('[data-resubmit-id]');
  if (btn) startResubmit(btn.dataset.resubmitId);
});

document.getElementById('btn-area-new-submission')?.addEventListener('click', () => {
  activeSubmissionId = null;
  activeSubmissionOriginalData = null;
  wizardRejectionBanner.style.display = 'none';
  form.reset();
  updateOdsVisibility();
  setupOptionItemHighlighting();
  document.getElementById('preview-q22').innerHTML = '';
  document.getElementById('preview-q25').innerHTML = '';
  loadDraft();
  goToStep(1);
  showAreaWizardScreen();
});

document.getElementById('btn-wizard-back-to-dashboard')?.addEventListener('click', () => {
  showAreaDashboardScreen();
});

// Chamado pelo auth.js sempre que uma área normal entra na tela de formulário.
export async function enterUserView() {
  showAreaDashboardScreen();
  await refreshAreaDashboard();
}
