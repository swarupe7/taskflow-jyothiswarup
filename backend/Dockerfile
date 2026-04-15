# ── Stage 1: Build ─────────────────────────────────────────────────────────────
# Use the full Go toolchain image to compile the binary.
# Everything in this stage is discarded in the final image — no Go compiler in prod.
FROM golang:1.26-alpine AS builder

# Install git and ca-certificates (needed for go get over HTTPS)
RUN apk add --no-cache git ca-certificates

WORKDIR /app

# Copy dependency files first so Docker can cache this layer.
# The go.sum file locks exact dependency versions for reproducible builds.
COPY go.mod go.sum ./
RUN go mod download

# Copy source code and compile to a static binary.
# CGO_ENABLED=0: no C deps (allows us to use scratch/alpine in stage 2)
# GOOS=linux: cross-compile for Linux (we might be building on Mac/Windows)
COPY . .
RUN CGO_ENABLED=0 GOOS=linux go build -o /app/server ./cmd/api

# ── Stage 2: Runtime ──────────────────────────────────────────────────────────
# Minimal alpine image — just the OS + our binary.
# No Go runtime, no source code, no build tools.
# Final image is ~15MB vs ~1GB for a full Go image.
FROM alpine:latest

# Install ca-certificates so HTTPS calls (if any) work
RUN apk --no-cache add ca-certificates

WORKDIR /app

# Copy only the compiled binary from the builder stage
COPY --from=builder /app/server .

# Copy the migrations directory into the container at /migrations
# golang-migrate reads from file:///migrations
COPY --from=builder /app/migrations /migrations

# Expose the API port
EXPOSE 8080

# The entrypoint is just our binary. Migrations run automatically inside main.go.
CMD ["./server"]
