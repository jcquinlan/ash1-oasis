FROM oven/bun:latest

WORKDIR /app

COPY package.json ./
RUN bun install

COPY src ./src

ENV PORT=3000
EXPOSE 3000

CMD ["bun", "run", "deploy"]
