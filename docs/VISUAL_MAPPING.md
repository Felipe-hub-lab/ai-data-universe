# Mapeamento visual

Regra do projeto: **posição, tamanho, cor, altura e conexões no 3D vêm dos dados.** Este documento é a referência; a legenda dentro da aplicação repete o essencial.

## Data Galaxy

Objeto = combinação **hub × segmento** no período filtrado (até 100 objetos).

| Canal | Mapa da rede | Espaço analítico |
|---|---|---|
| Posição X/Z | Longitude/latitude do hub (equiretangular, norte = −Z). Hubs próximos (ex.: São Paulo/Campinas) são afastados por um relaxamento de colisão com distância mínima de 1,15 unidade. | X = pontualidade (OTD), Z = ticket médio |
| Posição Y | Constante (plano do mapa) | Margem bruta |
| Ângulo no anel | Segmento (ordem fixa: E-commerce, Varejo, Indústria, Saúde, Agro) | — |
| Tamanho | Raio = 0,05 + 0,21·√(receita / receita máxima) → área ≈ proporcional à receita (raio mínimo para visibilidade) | idem |
| Cor | Modo selecionado (abaixo) | idem |
| Feixe vertical | Altura ∝ receita total do hub no período | — |
| Arcos | Rotas; volume = envios filtrados da origem × participação fixa da rota. Espessura, opacidade e nº de partículas (1–8) ∝ volume. A velocidade das partículas é constante e **não** codifica dados. | — |
| Anel vermelho pulsante | Hub com observações atípicas (z-score ≥ 3,5 nas métricas-chave) no período | — |
| Linhas tracejadas | — | Média da rede para X e Y (quadrantes) |

Modos de cor:

| Modo | Regra | Saturação |
|---|---|---|
| Região | Categórica fixa (ordem N, NE, CO, SE, S) | — |
| Crescimento | Divergente vermelho ← cinza → ciano, receita vs período anterior | ±15% |
| Pontualidade | OTD do objeto − OTD da rede | ±4 p.p. |
| Margem | Margem do objeto − margem da rede | ±8 p.p. |
| Anomalias | Vermelho com intensidade ∝ nº de ocorrências do hub; cinza sem ocorrências | 3 ocorrências |

Ênfase: seleção multiplica o brilho (o *bloom* só atua acima de luminância 1, ou seja, nos destaques); objetos fora da seleção ou do grupo isolado são escurecidos, não removidos — **filtro remove, isolamento escurece**.

### Paleta de regiões

`#0FA3BB` (Norte) · `#B8862E` (Nordeste) · `#5470F0` (Centro-Oeste) · `#3C9D7A` (Sudeste) · `#9461E3` (Sul).
Validada no fundo `#101319`: faixa de luminosidade OKLCH 0,48–0,67, croma ≥ 0,1, contraste ≥ 3:1, separação entre pares adjacentes ΔE ≥ 15 (visão normal e simulações de daltonismo). Em comparações de todos os pares (dispersão), azul × violeta ficam próximos para protanopia — por isso a região também é identificável por legenda clicável (isolamento), tooltip e posição geográfica.

Verde/vermelho semânticos (`#35F2A3`/`#FF496C`) aparecem sempre com ▲/▼ e rótulo.

## Temporal Engine — terreno

Coluna = hub × mês. Altura = `1 + k · (valor / média do próprio hub − 1)`, com **k = 4** para volumes, valores e taxas e **k = 20** para proporções (amplificação declarada na tela). O plano translúcido em altura 1 é a média de cada hub. Cor = mesma escala divergente (saturação em ±30% de desvio relativo para k = 4). Meses após o *playhead* ficam no chão: a animação só revela dados, nunca os interpola. O tooltip mostra o valor real e o desvio não amplificado.

## Command Center — núcleo

Cor do núcleo = faixa do índice de saúde (forte ≥ 75 verde, estável ≥ 60 ciano, atenção ≥ 45 âmbar, crítico vermelho). Cada órbita = um componente; o arco iluminado vai de 0 a 360° proporcional à pontuação (0–100). Barras 2D abaixo repetem os valores (acessibilidade e precisão).

## Gráficos 2D

Linhas de 2 px, barras com extremidade arredondada, grade recessiva, um único eixo Y (nunca eixo duplo), crosshair com tooltip por mês, legenda sempre presente com 2+ séries, rótulos de texto na cor do texto (nunca na cor da série). Quando a forma 2D é mais precisa (séries, rankings, participação), ela é usada em vez do 3D.
