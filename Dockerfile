FROM node:22-alpine
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .
ENV NUXT_PUBLIC_SCHOOL_EMAIL_DOMAIN=northbridge.test
ENV NUXT_PUBLIC_API_BASE_URL=http://127.0.0.1:3001
RUN npm run build

ENV HOST=0.0.0.0
ENV PORT=3000
EXPOSE 3000
CMD ["node", ".output/server/index.mjs"]
