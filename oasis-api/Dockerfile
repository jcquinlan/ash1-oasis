FROM oven/bun:1

WORKDIR /app

COPY package.json bun.lockb* ./
RUN bun install

COPY src ./src

# Run as non-root user
RUN addgroup --system app && adduser --system --ingroup app app
RUN chown -R app:app /app
USER app

ENV PORT=3001
EXPOSE 3001

CMD ["bun", "run", "deploy"]
