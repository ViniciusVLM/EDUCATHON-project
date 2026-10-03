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

## 🤖 Regras da IA
- **NUNCA** atribui nota numérica
- Sempre começa destacando o que o aluno acertou
- Aponta lacunas específicas em relação à rubrica
- Sugere caminhos de melhoria com linguagem encorajadora
- O professor tem controle final sobre cada feedback
