// Fonte única de verdade sobre as 25 perguntas do formulário PDA.
//
// O HTML de cada pergunta continua escrito à mão em index.html (cada uma tem um
// widget diferente: rádio, grade de checkboxes, upload de arquivo, par de datas...),
// mas tudo que hoje precisava ser repetido em 3 lugares (resumo/impressão, botão de
// "preenchimento demo" e exportação CSV) é gerado a partir desta lista. Adicionar,
// remover ou reordenar uma pergunta agora exige mudar isso aqui + o bloco no HTML,
// em vez de também caçar os outros 2 lugares que podiam ficar desatualizados.
//
// type:
//   'text' | 'textarea' | 'select'  -> valor único lido de #id
//   'radio'                          -> valor único lido de input[name=id]:checked
//   'checkbox-group'                 -> lista de valores lidos de input[name=id]:checked
//   'date-range'                     -> par de datas (id = início, pairId = fim)
//   'file'                           -> nome do arquivo (tratado à parte no upload)
//
// conditionalOn: só aparece no resumo/impressão se outro campo tiver um valor específico.
// emphasize: destaca o valor em negrito no resumo (usado só no título da base).

export const FORM_FIELDS = [
  { id: 'q1_dados_abertos', number: '1', section: 1, label: 'Dados abertos', type: 'radio', demo: 'Aberto' },
  { id: 'q2_titulo_base', number: '2', section: 1, label: 'Título da base de dados', type: 'text', demo: 'Folha de Pagamento aos Atletas do Bolsa Atleta', emphasize: true },
  { id: 'q3_descricao', number: '3', section: 1, label: 'Descrição', type: 'textarea', demo: 'Dados da Folha de Pagamento aos atletas/beneficiários do Programa Bolsa Atleta, em todas as categorias de Bolsa no âmbito nacional.' },
  { id: 'q4_area_tecnica', number: '4', section: 1, label: 'Área técnica responsável', type: 'text', demo: 'Secretaria Nacional de Esporte de Alto Rendimento (SNEAR)' },
  { id: 'q5_email_area', number: '5', section: 1, label: 'E-mail da área técnica', type: 'text', demo: 'snear.bolsa@esporte.gov.br' },
  { id: 'q6_periodicidade', number: '6', section: 1, label: 'Periodicidade de atualização', type: 'select', demo: 'Mensal' },
  { id: 'q7_temas', number: '7', section: 1, label: 'Tema principal', type: 'select', demo: 'Esporte e Lazer' },
  { id: 'q8_relacao_ods', number: '8', section: 1, label: 'Possui relação com ODS?', type: 'radio', demo: 'SIM' },
  {
    id: 'q9_ods', number: '9', section: 1, label: 'Objetivos ODS selecionados', type: 'checkbox-group',
    demo: ['Erradicação da Pobreza', 'Saúde e Bem-Estar', 'Redução das Desigualdades'],
    conditionalOn: { field: 'q8_relacao_ods', value: 'SIM' }
  },
  { id: 'q10_raca', number: '10', section: 1, label: 'Dados de raça/etnia', type: 'radio', demo: 'Sim' },
  { id: 'q11_genero', number: '11', section: 1, label: 'Dados de gênero', type: 'radio', demo: 'Sim' },
  { id: 'q12_palavras_chave', number: '12', section: 1, label: 'Palavras-chave', type: 'text', demo: 'esporte, bolsa atleta, pagamentos, beneficiarios, bolsa' },
  {
    id: 'q13_cobertura_inicio', number: '13 e 14', section: 1, label: 'Cobertura temporal', type: 'date-range',
    pairId: 'q14_cobertura_fim', demo: '2010-01-01', demoPair: '2026-08-31'
  },
  { id: 'q15_cobertura_espacial', number: '15', section: 1, label: 'Cobertura espacial', type: 'radio', demo: 'Federal' },
  { id: 'q16_granularidade_espacial', number: '16', section: 1, label: 'Granularidade espacial', type: 'radio', demo: 'Municipal' },
  { id: 'q17_versao', number: '17', section: 1, label: 'Versão (numérica)', type: 'text', demo: '1.0' },
  { id: 'q18_atualizacao_versao', number: '18', section: 1, label: 'Atualização da versão?', type: 'radio', demo: 'Não' },
  { id: 'q19_descontinuado', number: '19', section: 1, label: 'Descontinuado?', type: 'radio', demo: 'Não' },

  { id: 'q20_titulo_recurso', number: '20', section: 2, label: 'Título do Recurso', type: 'text', demo: 'Tabela Consolidada de Pagamentos Bolsa Atleta 2024 - 2026' },
  { id: 'q21_descricao_recurso', number: '21', section: 2, label: 'Descrição do Recurso', type: 'textarea', demo: 'Arquivo CSV contendo dados de pagamento com número de edital, nome do atleta, categoria da bolsa e valor pago.' },
  { id: 'q22_arquivo_recurso', number: '22', section: 2, label: 'Arquivo do Recurso', type: 'file' },
  { id: 'q23_titulo_dicionario', number: '23', section: 2, label: 'Título do Dicionário', type: 'text', demo: 'Dicionário de Dados - Bolsa Atleta' },
  { id: 'q24_descricao_dicionario', number: '24', section: 2, label: 'Descrição do Dicionário', type: 'textarea', demo: 'Especificação detalhada das colunas (ID_ATLETA, NOME, UF, CATEGORIA_BOLSA, VALOR_MENSAL).' },
  { id: 'q25_arquivo_dicionario', number: '25', section: 2, label: 'Arquivo do Dicionário', type: 'file' },
];

export function isFieldVisible(data, field) {
  if (!field.conditionalOn) return true;
  return data[field.conditionalOn.field] === field.conditionalOn.value;
}
