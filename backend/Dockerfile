FROM golang:1.22-alpine AS builder

RUN apk add --no-cache gcc musl-dev

WORKDIR /app
COPY go.mod ./
COPY . .
RUN go mod tidy && CGO_ENABLED=0 go build -o server .

FROM alpine:3.20

RUN apk add --no-cache \
    postgresql16-client \
    mysql-client \
    mongodb-tools \
    sqlite

COPY --from=builder /app/server /server

EXPOSE 8080
CMD ["/server"]
