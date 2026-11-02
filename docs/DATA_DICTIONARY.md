# Dicionário de dados

> **Os dados são sintéticos.** Foram gerados por código (`src/data/synthetic.ts`) para uma transportadora fictícia ("Helix Freight"), com seed fixa (42). Somente nomes e coordenadas das cidades são reais. Os números não representam nenhuma empresa e não devem ser interpretados como resultados empresariais.

## Tabela fato (`facts`)

Grão: **mês × hub × segmento × serviço** — 24 meses (out/2024–set/2026) × 20 hubs × 5 segmentos × 4 serviços = 9.600 linhas. Chave: `id = month|hubId|segmentId|serviceId`.

| Campo | Tipo | Unidade | Descrição | Regra de cálculo (gerador) | Limitações |
|---|---|---|---|---|---|
| month | string | AAAA-MM | Mês de competência | — | Sem granularidade diária |
| hubId | string | código | Hub de origem | Chave para `hubs` | Operação fictícia |
| regionId | string | código | Macrorregião | Derivada do hub | — |
| segmentId | string | código | Segmento do embarcador | — | 5 segmentos fixos |
| serviceId | string | código | Nível de serviço | — | SLA fixo por serviço |
| shipments | inteiro | envios | Envios coletados | porte do hub × mix regional do segmento × mix de serviço × sazonalidade × crescimento composto × ruído ±6% | — |
| delivered | inteiro | envios | Entregues no mês | 98,5–99,5% dos envios | Não modela entregas que cruzam meses |
| onTime | inteiro | envios | Entregues no prazo | delivered × OTD (serviço + região − pressão de pico ± ruído) | — |
| revenue | decimal | R$ | Receita de frete | shipments × ticket (serviço × segmento × fator de distância regional × ruído ±4%) | Sem impostos/descontos |
| cost | decimal | R$ | Custo operacional direto | revenue × razão de custo (segmento + região + pico ± ruído) | Sem custos fixos |
| transitDaysSum | decimal | dias | Soma dos dias porta a porta | delivered × (0,82·SLA + 0,35) × fator de distância | Guardado como soma para agregação exata |
| claims | inteiro | ocorrências | Avarias/extravios | shipments × taxa do segmento × ruído ±25% | — |
| returns | inteiro | envios | Devoluções | shipments × taxa do segmento × ruído ±15% | — |
| weightKg | decimal \| null | kg | Peso faturado | shipments × peso médio do segmento | ~0,6% nulos de propósito; não usado em KPIs |

## Dimensões

- **Regiões:** Norte, Nordeste, Centro-Oeste, Sudeste, Sul.
- **Hubs (20):** SAO, CPQ, RIO, BHZ, VIX (SE) · CWB, JOI, FLN, POA (S) · BSB, GYN, CGR, CGB (CO) · SSA, REC, FOR, NAT, SLZ (NE) · MAO, BEL (N).
- **Segmentos:** E-commerce, Varejo, Indústria, Saúde, Agro.
- **Serviços:** Same-Day (SLA 1 dia), Expresso (2), Padrão (4), Econômico (7).

## Rotas (`lanes`)

Cada hub envia 22% do volume de saída ao gateway de São Paulo e 12% e 7% aos dois hubs mais próximos. O volume de uma rota é derivado das linhas fato (nunca contradiz os totais). Na interface, as rotas respeitam os filtros ativos.

## Padrões do gerador

Sazonalidade com pico em nov/dez (+30%/+18%, E-commerce com adicional) e vale em jan/fev; safra do Agro em mar–jun; crescimento composto mensal por segmento (E-commerce 1,8%, Saúde 1,2%, Agro 0,9%, Varejo 0,6%, Indústria 0,2%); custos e prazos maiores no Norte e Nordeste.

## Cenários plantados (verdade de referência)

Existem para que detector e copiloto tenham algo real a encontrar — e são verificados pelos testes.

| Id | Hub | Quando | Efeito |
|---|---|---|---|
| MAO-transit | Manaus | 2026-03 | Prazo médio +45%, pontualidade −12 p.p. |
| CWB-claims | Curitiba | 2026-06 e 07 | Taxa de avarias ×3 |
| REC-growth | Recife | a partir de 2025-10 | E-commerce cresce +4% a.m. adicionais |
| POA-drop | Porto Alegre | 2026-05 | Volume −35% em um mês |
| GYN-margin | Goiânia | a partir de 2026-01 | Agro: custo −6 p.p. da receita |
| BEL-cost | Belém | a partir de 2026-07 | Custo por envio +10% |

## Usar dados próprios

Forneça um CSV com cabeçalho igual aos nomes de campo acima (exceto `regionId`, derivado do hub) e defina `VITE_DATA_URL`. Hubs desconhecidos ou campos numéricos inválidos interrompem a carga com uma mensagem indicando a linha.
