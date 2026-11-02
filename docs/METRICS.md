# Métricas, métodos e regras analíticas

Fonte única: `src/analytics/metrics.ts`. Todas as razões são calculadas sobre **somas** das linhas filtradas.

## Indicadores

| Indicador | Fórmula | Unidade | Tipo | Melhor quando |
|---|---|---|---|---|
| Receita | Σ revenue | R$ | volume | maior |
| Volume de envios | Σ shipments | envios | volume | maior |
| Ticket médio | Σ revenue ÷ Σ shipments | R$/envio | valor | maior |
| Lucro bruto | Σ revenue − Σ cost | R$ | volume | maior |
| Margem bruta | (Σ revenue − Σ cost) ÷ Σ revenue | % | proporção | maior |
| Pontualidade (OTD) | Σ onTime ÷ Σ delivered | % | proporção | maior |
| Prazo médio | Σ transitDaysSum ÷ Σ delivered | dias | taxa | menor |
| Custo por envio | Σ cost ÷ Σ shipments | R$/envio | valor | menor |
| Avarias / mil envios | Σ claims ÷ Σ shipments × 1000 | ‰ | taxa | menor |
| Taxa de devolução | Σ returns ÷ Σ shipments | % | proporção | menor |

**Comparações.** Período de referência = janela de mesma duração imediatamente anterior. Se o conjunto não cobre essa janela, a variação é exibida como "sem base" (nunca inventada). Proporções comparam em pontos percentuais; demais tipos em %.

## Índice de saúde operacional (0–100)

Cada componente é reescalado linearmente entre piso (0) e meta (100), limitado a [0, 100], e ponderado:

| Componente | Métrica | Piso → Meta | Peso |
|---|---|---|---|
| Pontualidade | OTD | 85% → 97% | 35% |
| Margem | Margem bruta | 10% → 28% | 25% |
| Crescimento | Receita vs período anterior | −10% → +10% | 20% |
| Qualidade | Avarias/mil | 8‰ → 2‰ | 20% |

Sem período anterior, o componente de crescimento fica indisponível e os pesos são renormalizados. Faixas: forte ≥ 75, estável ≥ 60, atenção ≥ 45, crítico < 45.

## Decomposição da variação (contribuição)

Para M = Σnum / Σden, a contribuição do membro *i* é `num₁ᵢ/DEN₁ − num₀ᵢ/DEN₀`. As contribuições somam exatamente M₁ − M₀ (efeitos de taxa e de mix incluídos). Para métricas aditivas é a variação absoluta do membro. Ponte de receita: `ΔR = (S₁ − S₀)·T₀ [volume] + S₁·(T₁ − T₀) [ticket: preço + mix]`. Ambas as identidades são verificadas nos testes.

## Detecção de anomalias

Séries mensais por hub (respeitando filtros de região, segmento e serviço). **Ajuste de rede** (padrão): compara o hub com os *demais* hubs (leave-one-out) — volumes/valores/taxas pela razão hub ÷ demais, proporções pela diferença em p.p. — removendo sazonalidade e tendência comuns.

| Método | Compara com | Aplica-se a | Limiar padrão |
|---|---|---|---|
| Z-score histórico | Média e desvio-padrão dos 12 meses anteriores (mín. 6) da série ajustada; exige efeito prático ≥ 3% (ou 0,5 p.p.) | todas | 3σ (3,5σ no varredor padrão) |
| IQR entre hubs | Q1 − k·IQR, Q3 + k·IQR entre hubs no mesmo mês | não-volume | k = 1,5 |
| Variação MoM | Mês anterior (% ou p.p.) | todas | 25% volume, 15% valor/taxa, 3 p.p. proporção |
| Ano contra ano | Crescimento vs mesmo mês do ano anterior; z robusto (mediana/MAD) dos crescimentos do hub | volume | 3,5 |
| Quebra de tendência | Inclinação da participação do hub nos últimos 6 meses vs 12 anteriores | volume | 1,5% a.m. |

Prioridade = |desvio| ÷ limiar: ≥ 2 alta, ≥ 1,4 média, demais baixa. Cada observação traz valor, referência, magnitude, método, justificativa e próximos passos, e é apresentada como algo que **merece investigação** — nunca como fraude, erro ou falha.

## Achados (Command Center, Executivo, visita guiada)

Regras em `src/analytics/insights.ts`, cada uma com fato, evidência e, separadamente, hipótese:

- Liderança de crescimento: hub com ≥ 2% da receita e maior crescimento, se acima da rede.
- Queda relativa: hub com menor crescimento, se negativo e abaixo da rede.
- Contribuição: segmento que mais explica a variação de receita.
- Custo: maior alta (> 5%) de custo por envio.
- Pontualidade: hubs abaixo de 90%.
- Segmento: maior margem entre os segmentos em crescimento.
- Alertas: contagem e maior desvio do varredor de anomalias.

## Temporal

Altas/quedas relevantes: variação mensal com |z| ≥ 1,5 em relação à distribuição de variações mensais da própria série. Tendência histórica: mínimos quadrados até o fim do período A. Ambos ignoram sazonalidade e isso é dito na tela.

## Missões

Respostas calculadas, nunca fixas (`src/analytics/missions.ts`), sempre sobre os últimos 6 meses vs os 6 anteriores (ou todo o histórico, quando indicado): maior crescimento de receita, maior desvio de prazo, maior queda pontual de volume, região de menor pontualidade, segmento de maior contribuição e maior ganho de margem. A validação compara a seleção atual na Galaxy (hub, segmento ou região do hub) com a resposta calculada.

## Motor de análise (AI Lab)

Classificação de intenção por palavras-chave (pt/en, sem acentos). Métrica, hubs, regiões e segmentos citados na pergunta restringem o recorte daquela consulta. Intenções: decomposição da variação, desvio entre categorias (apenas métricas intensivas), oportunidades (quadrante margem × crescimento + lacuna de pontualidade), comportamento atípico, comparação de períodos, fatores para investigação (correlação de Pearson entre hubs, com aviso de não-causalidade e de amostra pequena) e resumo.
