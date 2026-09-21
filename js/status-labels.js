// Rótulos do status de workflow das submissões (Área -> Ouvidoria -> CGTI).
// Módulo isolado (sem dependência de Supabase) para poder ser usado tanto por
// report.js (renderização pura) quanto por submissions.js (busca de dados).
export const STATUS_LABELS = {
  em_analise: 'Em análise (Ouvidoria)',
  rejeitada: 'Rejeitada — aguardando reenvio',
  aprovada_ouvidoria: 'Aprovada — aguardando CGTI',
  confirmada_cgti: 'Confirmada / Publicada',
};
