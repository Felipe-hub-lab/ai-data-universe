import type { Hub, Region, Segment, ServiceLevel } from './schema';

/**
 * Reference dimensions for the demonstration dataset.
 * City coordinates are public geographic facts; the company, volumes and every
 * business figure derived from them are synthetic.
 */

export const REGIONS: Region[] = [
  { id: 'N', name: 'Norte' },
  { id: 'NE', name: 'Nordeste' },
  { id: 'CO', name: 'Centro-Oeste' },
  { id: 'SE', name: 'Sudeste' },
  { id: 'S', name: 'Sul' },
];

export const HUBS: Hub[] = [
  { id: 'SAO', name: 'São Paulo', uf: 'SP', region: 'SE', lat: -23.55, lon: -46.63 },
  { id: 'CPQ', name: 'Campinas', uf: 'SP', region: 'SE', lat: -22.91, lon: -47.06 },
  { id: 'RIO', name: 'Rio de Janeiro', uf: 'RJ', region: 'SE', lat: -22.91, lon: -43.17 },
  { id: 'BHZ', name: 'Belo Horizonte', uf: 'MG', region: 'SE', lat: -19.92, lon: -43.94 },
  { id: 'VIX', name: 'Vitória', uf: 'ES', region: 'SE', lat: -20.32, lon: -40.34 },
  { id: 'CWB', name: 'Curitiba', uf: 'PR', region: 'S', lat: -25.43, lon: -49.27 },
  { id: 'JOI', name: 'Joinville', uf: 'SC', region: 'S', lat: -26.3, lon: -48.85 },
  { id: 'FLN', name: 'Florianópolis', uf: 'SC', region: 'S', lat: -27.59, lon: -48.55 },
  { id: 'POA', name: 'Porto Alegre', uf: 'RS', region: 'S', lat: -30.03, lon: -51.23 },
  { id: 'BSB', name: 'Brasília', uf: 'DF', region: 'CO', lat: -15.79, lon: -47.88 },
  { id: 'GYN', name: 'Goiânia', uf: 'GO', region: 'CO', lat: -16.69, lon: -49.26 },
  { id: 'CGR', name: 'Campo Grande', uf: 'MS', region: 'CO', lat: -20.47, lon: -54.62 },
  { id: 'CGB', name: 'Cuiabá', uf: 'MT', region: 'CO', lat: -15.6, lon: -56.1 },
  { id: 'SSA', name: 'Salvador', uf: 'BA', region: 'NE', lat: -12.97, lon: -38.5 },
  { id: 'REC', name: 'Recife', uf: 'PE', region: 'NE', lat: -8.05, lon: -34.88 },
  { id: 'FOR', name: 'Fortaleza', uf: 'CE', region: 'NE', lat: -3.73, lon: -38.52 },
  { id: 'NAT', name: 'Natal', uf: 'RN', region: 'NE', lat: -5.79, lon: -35.21 },
  { id: 'SLZ', name: 'São Luís', uf: 'MA', region: 'NE', lat: -2.53, lon: -44.3 },
  { id: 'MAO', name: 'Manaus', uf: 'AM', region: 'N', lat: -3.12, lon: -60.02 },
  { id: 'BEL', name: 'Belém', uf: 'PA', region: 'N', lat: -1.46, lon: -48.49 },
];

export const SEGMENTS: Segment[] = [
  { id: 'ECOM', name: 'E-commerce' },
  { id: 'RETAIL', name: 'Varejo' },
  { id: 'INDUSTRY', name: 'Indústria' },
  { id: 'HEALTH', name: 'Saúde' },
  { id: 'AGRO', name: 'Agro' },
];

export const SERVICES: ServiceLevel[] = [
  { id: 'SAMEDAY', name: 'Same-Day', slaDays: 1 },
  { id: 'EXPRESS', name: 'Expresso', slaDays: 2 },
  { id: 'STANDARD', name: 'Padrão', slaDays: 4 },
  { id: 'ECONOMY', name: 'Econômico', slaDays: 7 },
];
