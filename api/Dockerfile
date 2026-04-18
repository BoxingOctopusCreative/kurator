# syntax=docker/dockerfile:1

FROM golang:1.21-alpine AS builder
RUN apk add --no-cache ca-certificates git
WORKDIR /src
COPY go.mod go.sum ./
RUN go mod download
COPY . .
RUN CGO_ENABLED=0 GOOS=linux go build -trimpath -ldflags="-s -w" -o /out/kurator-api ./cmd/api

FROM alpine:3.21
RUN apk add --no-cache ca-certificates tzdata
WORKDIR /app
COPY --from=builder /out/kurator-api /app/kurator-api
EXPOSE 8080
USER nobody
ENTRYPOINT ["/app/kurator-api"]
