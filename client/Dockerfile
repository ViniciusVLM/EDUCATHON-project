# Estágio 1: Build da aplicação React/Vite com Node 22 Alpine
FROM node:22-alpine AS builder

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build

# Estágio 2: Servidor estático e Proxy Reverso com Nginx Alpine
FROM nginx:alpine

# Remove configuração padrão do Nginx
RUN rm -rf /etc/nginx/conf.d/default.conf

# Copia configuração customizada (SPA routing e proxy reverso /api)
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Copia arquivos estáticos compilados
COPY --from=builder /app/dist /usr/share/nginx/html

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
