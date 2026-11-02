# Arquitetura

## Visão geral

```
DataSource (sintético | CSV)          ← camada de acesso (src/data)
        │  Dataset { meta, dimensões, facts[], lanes[] }
        ▼
analytics/*  (TypeScript puro)        ← transformação: agregação, métricas, anomalias, contribuição,
        │                                achados, missões, séries — testável sem navegador
        ▼
state/store (zustand) + state/derived ← estado global (filtros, modo, seleção) e visões memoizadas
        │
        ├── ai/engine (determinístico) ──► ai/llm (opcional) ──► api/analyze.ts (servidor, Claude)
        │
        ├── three/*   cenas WebGL (R3F) — recebem dados já codificados, sem lógica de negócio
        ├── charts/*  gráficos SVG 2D
        └── modules/* telas; components/* peças reutilizáveis
```

Toda tela lê os mesmos filtros do store e as mesmas funções de `analytics/`. Não há números fixos espalhados pelos componentes: o único lugar onde valores de negócio nascem é `src/data/synthetic.ts`.

## Decisões

| Decisão | Motivo | Alternativa considerada |
|---|---|---|
| **Vite + React SPA**, sem backend obrigatório | O portfólio precisa abrir em hospedagem estática (GitHub Pages). O gerador cria 9.600 linhas em ~35 ms no navegador. | Next.js — desnecessário sem SSR/rotas de API obrigatórias. |
| **Tabela fato só com medidas aditivas** | Razões calculadas como Σnum/Σden em qualquer nível de agregação → KPIs, tabelas e gráficos nunca divergem (média de razões é o erro clássico de BI). | Pré-calcular razões por linha. |
| **Catálogo único de métricas** (`analytics/metrics.ts`) | Nome, unidade, fórmula, sentido (maior/menor é melhor), tipo e formatação num só lugar; o tipo (`volume`, `value`, `ratio`, `rate`) determina como comparar (% ou p.p.) e quais métodos de anomalia se aplicam. | Formatação por componente. |
| **React Three Fiber + Drei** | Cenas declarativas que reagem ao mesmo estado React; descarte automático de geometrias/materiais ao desmontar. | Three.js imperativo — mais código de ciclo de vida. |
| **InstancedMesh** para objetos de dados | 100 esferas / 480 colunas em uma chamada de desenho; cor e matriz por instância atualizadas no `useFrame`. | Um mesh por objeto. |
| **Hover fora da árvore React** (zustand local) | Mover o cursor não re-renderiza o `<Canvas>`. | `useState` no módulo. |
| **Gráficos SVG próprios** em vez de biblioteca | Identidade visual própria, ~10 KB, hover/crosshair e acessibilidade sob controle; os gráficos necessários são simples. | Recharts/visx (+100 KB e estilo genérico). |
| **CSS com tokens** em vez de Tailwind; **transições CSS** em vez de Framer Motion | Sistema de design explícito em um arquivo (`styles/global.css`), menos dependências; nenhuma animação de UI exigia física de mola. | Tailwind/Framer Motion — viáveis, mas sem ganho real aqui. |
| **Zustand** com `persist` | Estado global pequeno, acessível também fora do React (cenas 3D, atalhos); persistência só de preferências, favoritos, histórico, missões e consultas. `localStorage` protegido por *try/catch* com fallback em memória. | Context + reducer. |
| **Roteamento por hash** | Funciona em qualquer host estático sem reescritas. | React Router com `BrowserRouter` (exige fallback 404 no Pages). |
| **Módulos e cenas 3D com `lazy()`** + `manualChunks` | Carga inicial ≈ 85 KB gzip; three.js só quando uma tela 3D abre (pré-carregado durante a intro, como etapa real). O helper de preload do Vite é fixado no chunk de entrada para não arrastar o three.js. | Bundle único (≈ 330 KB gzip na entrada). |
| **IA em duas camadas** | O motor determinístico garante respostas verificáveis e funciona sem credenciais. O LLM só redige narrativa a partir de fatos agregados, via função serverless — a chave nunca vai ao navegador. | LLM interpretando dados brutos no cliente (expõe chave, alucina números). |

## Camada de dados

`DataSource.load()` devolve um `Dataset`. Implementações:

- `SyntheticDataSource` — `generateSyntheticDataset(seed)`; PRNG Mulberry32; mesma seed ⇒ mesmo conjunto byte a byte.
- `CsvDataSource(url)` — lê um CSV com as colunas da tabela fato, valida números e ids de hub e reaproveita as dimensões de referência. Ativado por `VITE_DATA_URL`.

Trocar por uma API é implementar `DataSource` — nenhuma tela muda.

## Estados e erros

- Falha de carga: tela de erro com "Tentar novamente" (o boot é reexecutado).
- Cada módulo tem um `ErrorBoundary`: uma falha de renderização não derruba o app.
- Filtros sem resultado: estado vazio com ação "Redefinir filtros".
- Sem período anterior equivalente: "sem base" — a comparação não é inventada.
- WebGL indisponível: Galaxy em dispersão 2D, Temporal em mapa de calor, Command Center sem núcleo 3D (valores em barras).
- Falha do endpoint de IA: mensagem explícita na resposta; a análise determinística permanece.
- Exportações: *toast* de sucesso ou de bloqueio pelo navegador.
- Dados desatualizados: a barra de status mostra a data de referência (`AS-OF`) e declara que é um instantâneo estático.
