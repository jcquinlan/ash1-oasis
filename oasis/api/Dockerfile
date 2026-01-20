FROM oven/bun:latest

RUN apt-get update && apt-get install -y docker.io && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package.json ./
RUN bun install

COPY src ./src

ENV PORT=3001
EXPOSE 3001

CMD ["bun", "run", "deploy"]
