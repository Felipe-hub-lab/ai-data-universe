import type { ModuleId } from '../state/store';

export interface ModuleDef {
  id: ModuleId;
  index: string;
  name: string;
  short: string;
  description: string;
}

export const MODULES: ModuleDef[] = [
  { id: 'command', index: '01', name: 'Command Center', short: 'Command', description: 'Indicadores executivos, saúde operacional, alertas e oportunidades.' },
  { id: 'galaxy', index: '02', name: 'Data Galaxy', short: 'Galaxy', description: 'Universo 3D explorável: hubs, segmentos e rotas codificados por dados.' },
  { id: 'temporal', index: '03', name: 'Temporal Engine', short: 'Temporal', description: 'Linha do tempo, reprodução, picos, quedas e comparação de períodos.' },
  { id: 'lab', index: '04', name: 'AI Analytics Lab', short: 'AI Lab', description: 'Copiloto analítico com respostas estruturadas e evidências.' },
  { id: 'anomaly', index: '05', name: 'Anomaly Detector', short: 'Anomalias', description: 'Detecção de comportamentos atípicos com métodos explícitos.' },
  { id: 'bi', index: '06', name: 'Business Intelligence', short: 'BI', description: 'Séries, rankings, participação, distribuição, drill-down e exportação.' },
  { id: 'explorer', index: '07', name: 'Data Explorer', short: 'Explorer', description: 'Dados de origem, qualidade, estatísticas e dicionário de dados.' },
];

export const moduleById = (id: ModuleId) => MODULES.find((m) => m.id === id)!;
