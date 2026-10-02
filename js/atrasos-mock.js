// Dashboard de Atrasos (Ouvidoria) — MOCK: dados de exemplo fixos, ainda não
// ligados ao banco. Pra calcular atraso de verdade, o sistema precisaria saber
// quais bases cada área DEVERIA enviar e com que periodicidade — uma lista de
// "bases esperadas" que ainda não existe (é a planilha que está em
// aprimoramento). Assim que ela existir, trocar MOCK_ATRASOS por uma consulta
// real combinando essa lista com as submissions já enviadas.
import { escapeHtml } from './report.js';
import { showToast } from './toast.js';

const MOCK_ATRASOS = [
  { area: 'CGTI', base: 'Sistemas de TI - Inventário e Licenças', periodicidade: 'Anual', prazo: '01/05/2026', ultimoEnvio: null, dias: 153 },
  { area: 'SNELIS', base: 'Projetos de Inclusão Social pelo Esporte', periodicidade: 'Semestral', prazo: '01/06/2026', ultimoEnvio: null, dias: 122 },
  { area: 'SNPCE', base: 'Contratos e Convênios de Infraestrutura Esportiva', periodicidade: 'Trimestral', prazo: '01/07/2026', ultimoEnvio: null, dias: 92 },
  { area: 'DGI', base: 'Recursos Humanos - Quadro de Pessoal', periodicidade: 'Trimestral', prazo: '15/07/2026', ultimoEnvio: '30/09/2026', dias: 78 },
  { area: 'SNE', base: 'Folha de Pagamento aos Atletas do Bolsa Atleta', periodicidade: 'Semestral', prazo: '01/08/2026', ultimoEnvio: '23/09/2026', dias: 61 },
  { area: 'SNPCE', base: 'Eventos e Patrocínios Esportivos', periodicidade: 'Semestral', prazo: '30/08/2026', ultimoEnvio: null, dias: 32 },
  { area: 'SNE', base: 'Resultados de Competições Esportivas Nacionais', periodicidade: 'Mensal', prazo: '01/09/2026', ultimoEnvio: '28/09/2026', dias: 30 },
  { area: 'CGE', base: 'Orçamento e Execução Financeira', periodicidade: 'Mensal', prazo: '15/09/2026', ultimoEnvio: '20/09/2026', dias: 16 },
];

function severityClass(dias) {
  if (dias >= 60) return 'severe';
  if (dias >= 25) return 'moderate';
  return 'mild';
}

function renderMetrics(list) {
  const areas = new Set(list.map(i => i.area));
  const semEnvio = list.filter(i => !i.ultimoEnvio).length;
  const maior = list.reduce((max, i) => Math.max(max, i.dias), 0);

  document.getElementById('atrasos-metric-total').textContent = list.length;
  document.getElementById('atrasos-metric-areas').textContent = areas.size;
  document.getElementById('atrasos-metric-sem-envio').textContent = semEnvio;
  document.getElementById('atrasos-metric-maior').innerHTML = `${maior} <span style="font-size: 0.85rem; font-weight: 600;">dias</span>`;
}

function renderResumoPorArea(list) {
  const porArea = new Map();
  list.forEach(item => {
    if (!porArea.has(item.area)) porArea.set(item.area, []);
    porArea.get(item.area).push(item);
  });

  const rows = Array.from(porArea.entries()).sort((a, b) => b[1].length - a[1].length);

  document.getElementById('atrasos-resumo-areas').innerHTML = rows.map(([area, items]) => {
    const ultimoEnvio = items.map(i => i.ultimoEnvio).filter(Boolean).sort().reverse()[0];
    return `
      <div class="atrasos-area-row">
        <div class="atrasos-area-row-top">
          <span class="atrasos-area-name">${escapeHtml(area)}</span>
          <span class="atrasos-area-count">${items.length} atrasada${items.length > 1 ? 's' : ''}</span>
        </div>
        <div class="atrasos-area-meta">${items.length} base${items.length > 1 ? 's' : ''} • Último envio: ${ultimoEnvio ? escapeHtml(ultimoEnvio) : 'Nunca enviou'}</div>
      </div>
    `;
  }).join('');
}

function renderTable(list) {
  document.getElementById('atrasos-table-body').innerHTML = list.map(item => `
    <tr>
      <td><strong>${escapeHtml(item.area)}</strong></td>
      <td>
        <div class="atrasos-base-title">${escapeHtml(item.base)}</div>
        <div class="atrasos-base-periodicidade">${escapeHtml(item.periodicidade)}</div>
      </td>
      <td>${escapeHtml(item.prazo)}</td>
      <td>${item.ultimoEnvio ? escapeHtml(item.ultimoEnvio) : '<span class="atrasos-nunca-enviou">Nunca enviou</span>'}</td>
      <td><span class="atraso-badge ${severityClass(item.dias)}">${item.dias} dias em atraso</span></td>
    </tr>
  `).join('');
}

function renderTimeline(list) {
  const maxDias = Math.max(...list.map(i => i.dias), 1);
  const sorted = [...list].sort((a, b) => b.dias - a.dias);

  document.getElementById('atrasos-timeline').innerHTML = sorted.map(item => `
    <div class="atrasos-timeline-row">
      <div class="atrasos-timeline-label">
        <strong>${escapeHtml(item.area)}</strong>
        <span>${escapeHtml(item.base)}</span>
      </div>
      <div class="atrasos-timeline-track">
        <div class="atrasos-timeline-bar ${severityClass(item.dias)}" style="width: ${(item.dias / maxDias) * 100}%;"></div>
      </div>
      <div class="atrasos-timeline-days">${item.dias} dias em atraso</div>
    </div>
  `).join('');
}

function populateAreaFilter(list) {
  const select = document.getElementById('atrasos-filtro-area');
  const areas = Array.from(new Set(list.map(i => i.area))).sort();
  select.innerHTML = '<option value="">Todas as áreas</option>' +
    areas.map(a => `<option value="${escapeHtml(a)}">${escapeHtml(a)}</option>`).join('');
}

function renderAll(filterArea) {
  const list = filterArea ? MOCK_ATRASOS.filter(i => i.area === filterArea) : MOCK_ATRASOS;
  renderMetrics(list);
  renderResumoPorArea(list);
  renderTable(list);
  renderTimeline(list);
}

document.getElementById('atrasos-filtro-area')?.addEventListener('change', (e) => {
  renderAll(e.target.value);
});

document.getElementById('btn-atrasos-refresh')?.addEventListener('click', () => {
  showToast('Esta tela usa dados de exemplo — a atualização automática chega junto com a planilha de bases esperadas.');
});

// Chamado pelo auth.js sempre que a Ouvidoria abre o Dashboard de Atrasos.
export function enterAtrasosView() {
  populateAreaFilter(MOCK_ATRASOS);
  renderAll();
}
