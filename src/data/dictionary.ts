/**
 * Data dictionary for the fact table. Rendered in the Data Explorer and mirrored in
 * docs/DATA_DICTIONARY.md.
 */
export interface ColumnDef {
  field: string;
  label: string;
  type: 'string' | 'integer' | 'decimal';
  unit: string;
  description: string;
  rule: string;
  limitations: string;
}

export const FACT_COLUMNS: ColumnDef[] = [
  { field: 'month', label: 'Mês', type: 'string', unit: 'AAAA-MM', description: 'Mês de competência da operação.', rule: '—', limitations: 'Granularidade mensal; não há dados diários.' },
  { field: 'hubId', label: 'Hub', type: 'string', unit: 'código', description: 'Centro de distribuição de origem.', rule: 'Chave para a tabela de hubs.', limitations: 'Coordenadas reais da cidade; operação fictícia.' },
  { field: 'regionId', label: 'Região', type: 'string', unit: 'código', description: 'Macrorregião do hub.', rule: 'Derivada do hub.', limitations: '—' },
  { field: 'segmentId', label: 'Segmento', type: 'string', unit: 'código', description: 'Segmento de mercado do embarcador.', rule: '—', limitations: 'Cinco segmentos fixos.' },
  { field: 'serviceId', label: 'Serviço', type: 'string', unit: 'código', description: 'Nível de serviço contratado.', rule: '—', limitations: 'SLA fixo por serviço.' },
  { field: 'shipments', label: 'Envios', type: 'integer', unit: 'envios', description: 'Envios coletados.', rule: 'Sazonalidade × crescimento × mix × ruído (gerador).', limitations: 'Sintético.' },
  { field: 'delivered', label: 'Entregues', type: 'integer', unit: 'envios', description: 'Envios entregues no mês.', rule: '98,5–99,5% dos envios.', limitations: 'Não modela entregas que cruzam meses.' },
  { field: 'onTime', label: 'No prazo', type: 'integer', unit: 'envios', description: 'Entregas dentro do SLA.', rule: 'delivered × taxa de pontualidade simulada.', limitations: 'Sintético.' },
  { field: 'revenue', label: 'Receita', type: 'decimal', unit: 'R$', description: 'Receita de frete faturada.', rule: 'shipments × ticket (serviço × segmento × distância × ruído).', limitations: 'Sem impostos, descontos ou ajustes.' },
  { field: 'cost', label: 'Custo', type: 'decimal', unit: 'R$', description: 'Custo operacional direto.', rule: 'revenue × razão de custo simulada.', limitations: 'Não inclui custos fixos/overhead.' },
  { field: 'transitDaysSum', label: 'Σ dias em trânsito', type: 'decimal', unit: 'dias', description: 'Soma do tempo porta a porta das entregas.', rule: 'delivered × prazo médio simulado.', limitations: 'Armazenado como soma para permitir agregação exata.' },
  { field: 'claims', label: 'Avarias', type: 'integer', unit: 'ocorrências', description: 'Avarias e extravios registrados.', rule: 'shipments × taxa por segmento.', limitations: 'Sintético.' },
  { field: 'returns', label: 'Devoluções', type: 'integer', unit: 'envios', description: 'Envios devolvidos ao remetente.', rule: 'shipments × taxa por segmento.', limitations: 'Sintético.' },
  { field: 'weightKg', label: 'Peso faturado', type: 'decimal', unit: 'kg', description: 'Peso total faturado.', rule: 'shipments × peso médio do segmento.', limitations: '~0,6% das linhas sem valor (lacuna proposital). Não usado em KPIs.' },
];
