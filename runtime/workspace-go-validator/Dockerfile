FROM golang:1.24-alpine

# This image contains only the platform-pinned Go module graph. Generated
# workspace source is mounted read-only at validation time, never copied here.
WORKDIR /validator
COPY runtime/go-scaffold/go.mod runtime/go-scaffold/go.sum ./
RUN go mod download
