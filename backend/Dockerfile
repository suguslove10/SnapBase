FROM golang:1.22-alpine AS builder

RUN apk add --no-cache gcc musl-dev

WORKDIR /app
COPY go.mod ./
COPY . .
RUN go mod tidy && CGO_ENABLED=0 go build -o server .

# Build mongodump and mongorestore from source — works on any arch, no external downloads
RUN CGO_ENABLED=0 go install go.mongodb.org/mongo-tools/mongodump@latest && \
    CGO_ENABLED=0 go install go.mongodb.org/mongo-tools/mongorestore@latest

FROM debian:bookworm-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates \
    postgresql-client \
    default-mysql-client \
    sqlite3 \
    && rm -rf /var/lib/apt/lists/*

COPY --from=builder /app/server /server
COPY --from=builder /go/bin/mongodump /usr/local/bin/mongodump
COPY --from=builder /go/bin/mongorestore /usr/local/bin/mongorestore

EXPOSE 8080
CMD ["/server"]
