# Testes executados

Ambiente: Windows 11, Node 24.15.0, npm 11.12.1, Chrome (Chromium do painel de navegador) com ANGLE/Direct3D11 em NVIDIA GeForce RTX 3060. Data: 27/10/2026.

## Automatizados

| Comando | Resultado |
|---|---|
| `npm run typecheck` | 0 erros (TypeScript strict) |
| `npm run lint` | 0 erros, 0 avisos |
| `npm test` | 2 arquivos, **28 testes, 28 passando** |
| `npm run build` | ok |

Cobertura dos testes unitários (`tests/`):

- **Dados:** determinismo por seed, forma 24×20×5×4, chaves únicas, consistência (no prazo ≤ entregues ≤ envios, valores positivos, região derivada do hub), lacunas de peso < 2%, rotas derivadas das linhas, PRNG, CSV ida e volta.
- **Agregação/métricas:** razões calculadas sobre somas, soma dos membros = total, janela anterior não inventada, comparação em p.p. vs %, filtros vazios produzem NaN (exibido como "—").
- **Contribuição:** soma das contribuições = variação total (receita, OTD, margem, ticket); ponte de receita fecha.
- **Saúde:** limites 0–100 e renormalização sem crescimento.
- **Anomalias:** os quatro cenários plantados testados são o 1º resultado do método (MAO prazo 2026-03, CWB avarias 2026-06, POA volume 2026-05 por z-score e ano contra ano, BEL margem 2026-07); métodos incompatíveis retornam vazio; o varredor padrão gera < 40 observações em 6 meses.
- **Temporal e estatística:** mudanças relevantes, quantil e desvio-padrão conhecidos.
- **Missões:** 6 missões com resposta calculada; seleção correta aceita, incorreta rejeitada, ausência de seleção não pontua; validação por região.
- **Motor de análise:** classificação das perguntas sugeridas, rejeição de pergunta desconhecida, "dados insuficientes" sem período anterior, foco por nome de hub na pergunta.

## Build de produção

| Chunk | gzip |
|---|---|
| entrada (`index`) | 28,5 KB |
| React + Zustand | 50,9 KB |
| CSS | 5,1 KB |
| R3F/Drei/Postprocessing (sob demanda) | 70,6 KB |
| three.js (sob demanda) | 176,2 KB |
| Módulos (sob demanda) | 1–11 KB cada |

Verificado que o `index.html` pré-carrega apenas o chunk React; three.js e R3F só são buscados pelas cenas 3D (e pré-buscados durante a intro). Build com `VITE_BASE=/ai-data-universe/` gera caminhos `/ai-data-universe/assets/...`.

## Verificação manual no navegador (build de produção, `npm run preview`)

| Cenário | Resultado |
|---|---|
| Abertura com log real e botão "Entrar agora" | ok |
| Command Center: KPIs, drawer de KPI, núcleo 3D, achados, alertas | ok |
| Filtro de região "Norte" → receita do BI muda de R$ 55,70 mi para R$ 3,76 mi; ranking passa a MAO/BEL; status "ROWS 240/9.600"; "Redefinir" restaura | ok |
| Drill-down BI Região → Hub (5 hubs do Sudeste) → Segmento | ok |
| Exportação CSV filtrado (2.400 linhas) e relatório HTML | gatilho de download disparado com nomes corretos e *toast* de confirmação (o clique no link foi interceptado no teste; o arquivo em si é gravado pelo navegador) |
| Busca global `Ctrl K` → "manaus" → Enter: abre a Galaxy, seleciona Manaus e voa a câmera até o hub | ok (corrigido um bug em que a câmera não voava) |
| Galaxy: hover, seleção, painel contextual, rotas destacadas, layout analítico com transição | ok |
| Missão "maior desvio de prazo" com Manaus selecionado → correta; "maior crescimento" com Manaus → rejeitada | ok |
| Temporal: terreno, playhead, mudanças relevantes, comparação de períodos | ok |
| AI Lab: pergunta sugerida → resposta estruturada; contribuições somam a variação total | ok |
| Anomaly Detector: MAO mar/26 prioridade alta, gráfico com marcador | ok |
| Modo executivo e retorno ao analítico preservando filtros | ok |
| `?nowebgl` → Galaxy em dispersão 2D | ok |
| 375 × 812 (mobile): barra de abas inferior, layout empilhado, Galaxy com câmera afastada | ok |

## Desempenho medido

Data Galaxy, layout de mapa com rotas e partículas, 1440 × 900, 3 s de amostragem via `requestAnimationFrame`:

| Métrica | Valor |
|---|---|
| Quadros/s | 60 |
| Tempo de quadro p50 / p95 | 16,7 ms / 16,8 ms |
| Heap JS | ≈ 37 MB |

Geração do conjunto sintético: ≈ 35 ms; agregados + varredura de anomalias: ≈ 25 ms (medidos no log de inicialização).

Carga local (build de produção): todos os assets da Galaxy (entrada, React, R3F, three.js, módulo) concluídos em ≈ 140 ms após a navegação.

## Não testado

- Tempo até o primeiro quadro 3D: durante parte da sessão o painel do navegador estava oculto (página em segundo plano, com `requestAnimationFrame` limitado), o que atrasa o primeiro quadro e invalida essa medição.
- Hardware modesto / GPU integrada; Safari e Firefox.
- Leitores de tela de ponta a ponta (apenas marcação ARIA revisada).
- Integração real com a API da Anthropic (sem credenciais no ambiente). O código da função compila, valida entrada e trata erros, mas não foi executado contra a API.
- Carregamento via `VITE_DATA_URL` com um CSV externo (o parser é testado; a fonte não foi exercitada no navegador).
