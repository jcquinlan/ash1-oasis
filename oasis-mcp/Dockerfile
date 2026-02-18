FROM oven/bun:latest

WORKDIR /app

COPY package.json ./
RUN bun install

COPY src ./src

ENV MCP_PORT=3002
EXPOSE 3002

CMD ["bun", "run", "deploy"]
