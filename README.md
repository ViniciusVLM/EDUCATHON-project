# 🎓 Educathon — Copiloto Pedagógico com IA

> Automatize a correção de atividades dissertativas. A IA gera rascunhos de feedback individualizado e encorajador — o professor revisa, edita e aprova com total controle.

## 🚀 Como Rodar

### Pré-requisitos
- **Node.js** v22+ (o servidor usa ESM nativo e `node:test`)
- **API Key do Google Gemini** ([obter aqui](https://aistudio.google.com/))

### 1. Configurar variáveis de ambiente
```bash
cd server
cp ../.env.example .env
# Edite o .env e:
#   1. Adicione sua GEMINI_API_KEY
#   2. Gere um JWT_SECRET seguro, ex: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
# Opcionalmente configure GEMINI_MODEL (padrão: gemini-3.8-flash)
# Opcionalmente configure CORS_ORIGIN para produção (padrão: localhost:5173)
```

### 2. Instalar dependências e rodar o Backend
```bash
cd server
npm install
npm run dev
```

### 3. Instalar dependências e rodar o Frontend
```bash
cd client
npm install
npm run dev
```

### 4. Acessar
- **Frontend**: http://localhost:5173
- **Backend API**: http://localhost:3001/api/health

## 📋 Fluxo de Uso

1. **Configure** — Crie uma nova atividade com título, pergunta e rubrica
2. **Envie** — Faça upload de um CSV com respostas ou digite manualmente
3. **Gere** — A IA analisa cada resposta e gera feedback pedagógico
4. **Revise** — Edite os feedbacks com sua voz, aprove um a um
5. **Exporte** — Baixe um CSV com os feedbacks aprovados

## 🏗️ Arquitetura

| Camada | Tecnologia |
|---|---|
| Frontend | React + Vite + TypeScript |
| Backend | Node.js + Express |
| IA | Google Gemini API (Structured Outputs) |
| Banco de Dados | SQLite (better-sqlite3) |

## 📁 Estrutura
```
├── client/          # Frontend React
│   ├── src/
│   │   ├── pages/   # 6 páginas do fluxo (incl. /activities)
│   │   ├── services/# API client
│   │   ├── styles/  # Design system CSS
│   │   └── types/   # TypeScript types
│
├── server/          # Backend Express
│   ├── src/
│   │   ├── routes/  # API endpoints
│   │   ├── services/# Gemini, CSV parser, queue
│   │   ├── database/# SQLite schema + helpers
│   │   └── prompts/ # Engenharia de prompt
```

## 🎨 Interface e Experiência do Usuário

O Educathon foi redesenhado para proporcionar uma experiência de dashboard moderna, agradável e altamente produtiva para os educadores, inspirada nas melhores práticas de design de produtos educacionais contemporâneos:

- **Identidade Visual**: Fundo lavanda-acinzentado muito suave (`#eeedf7`), painéis arredondados em branco-gelo com raios suaves (24px a 32px), barra lateral em tom roxo/índigo (`#6c63ff`) com curva decorativa ergonômica e chips com tonalidades pastel.
- **Dois Temas (Claro e Escuro)**: Suporte nativo com persistência em `localStorage`, detecção automática de `prefers-color-scheme` e script anti-flash. Cores ajustadas para conformidade com **WCAG 2.1 nível AA** (taxa de contraste $\ge 4.5:1$ para todos os textos legíveis).
- **Acessibilidade Universal**: Foco visível (`:focus-visible`) contrastante em todos os elementos interativos, navegação completa por teclado e desativação estrita de animações e transições quando o usuário seleciona `prefers-reduced-motion: reduce`.
- **Design Totalmente Responsivo**: Layout otimizado para dispositivos móveis compactos (360px) com barra de navegação inferior fixa, tablets (768px) e monitores amplos (1440px).

### 📸 Telas da Aplicação

#### 1. Painel do Professor (`/painel`)
Visão panorâmica consolidada com métricas em tempo real, anéis de progresso, fila de revisão ativa, lista de pendências com ação rápida e calendário de prazos da semana.

<!-- PRINT: painel -->
> *Insira aqui a captura de tela do Painel Geral do Professor.*

---

#### 2. Dashboard de Revisão (`/review/:activityId`)
Estação de trabalho pedagógica lado a lado: lista lateral de alunos com chips de status (`pendente`, `revisado`, `aprovado`), cartão de resposta original, editor de feedback da IA, critérios de rubrica interativos, auto-avanço inteligente, proteção contra perda de edições não salvas e atalhos rápidos de teclado (`Alt + A` / `Ctrl + Enter` para aprovar, `Alt + →` / `Alt + ←` para navegar).

<!-- PRINT: revisao -->
> *Insira aqui a captura de tela do Dashboard de Revisão com a resposta e o feedback pedagógico.*

---

#### 3. Modo Noturno / Tema Escuro
Paleta escura de alto contraste com tons profundos de azul e ametista, projetada para longas sessões noturnas de correção com conforto visual.

<!-- PRINT: tema-escuro -->
> *Insira aqui a captura de tela do tema escuro em funcionamento.*

---

## 🤖 Regras da IA
- **NUNCA** atribui nota numérica
- Sempre começa destacando o que o aluno acertou
- Aponta lacunas específicas em relação à rubrica
- Sugere caminhos de melhoria com linguagem encorajadora
- O professor tem controle final sobre cada feedback

