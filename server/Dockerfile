FROM node:22-bookworm-slim

WORKDIR /app

# Instala dependências de compilação temporárias para módulos nativos C++ (better-sqlite3)
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 \
    make \
    g++ \
    && rm -rf /var/lib/apt/lists/*

# Instala apenas dependências de produção
COPY package*.json ./
RUN npm ci --omit=dev

# Remove ferramentas de compilação para reduzir a superfície e o tamanho da imagem
RUN apt-get purge -y --auto-remove python3 make g++ && rm -rf /var/lib/apt/lists/*

# Copia código-fonte da aplicação
COPY . .

# Garante a existência do diretório do volume persistente de dados
RUN mkdir -p /app/data

# Configurações de ambiente padrão
ENV NODE_ENV=production
ENV PORT=3001
ENV DB_PATH=/app/data/educathon.db

EXPOSE 3001

# Na subida, executa o seed idempotente (popula demo na primeira execução) e inicia o servidor
CMD ["sh", "-c", "node src/database/seed.js && node src/index.js"]
