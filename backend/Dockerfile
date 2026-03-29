FROM golang:1.22-alpine AS builder

RUN apk add --no-cache gcc musl-dev

WORKDIR /app
COPY go.mod ./
COPY . .
RUN go mod tidy && CGO_ENABLED=0 go build -o server .

FROM debian:bookworm-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates \
    postgresql-client \
    default-mysql-client \
    sqlite3 \
    curl \
    && ARCH=$(dpkg --print-architecture) \
    && if [ "$ARCH" = "arm64" ]; then \
         curl -fsSL https://fastdl.mongodb.org/tools/db/mongodb-database-tools-debian12-arm64-100.9.4.tgz \
           | tar -xz --strip-components=1 -C /usr/local/bin --wildcards '*/bin/mongodump' '*/bin/mongorestore'; \
       else \
         curl -fsSL https://fastdl.mongodb.org/tools/db/mongodb-database-tools-debian12-x86_64-100.9.4.tgz \
           | tar -xz --strip-components=1 -C /usr/local/bin --wildcards '*/bin/mongodump' '*/bin/mongorestore'; \
       fi \
    && apt-get purge -y curl \
    && apt-get autoremove -y \
    && rm -rf /var/lib/apt/lists/*

COPY --from=builder /app/server /server

EXPOSE 8080
CMD ["/server"]
