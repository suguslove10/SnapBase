BINARY=snapbase
VERSION ?= latest
LDFLAGS=-ldflags "-s -w -X main.version=$(VERSION)"

.PHONY: build build-all clean

build:
	go build $(LDFLAGS) -o dist/$(BINARY) .

build-all: clean
	mkdir -p dist
	GOOS=linux   GOARCH=amd64 go build $(LDFLAGS) -o dist/$(BINARY)-linux-amd64 .
	GOOS=darwin  GOARCH=amd64 go build $(LDFLAGS) -o dist/$(BINARY)-darwin-amd64 .
	GOOS=darwin  GOARCH=arm64 go build $(LDFLAGS) -o dist/$(BINARY)-darwin-arm64 .
	GOOS=windows GOARCH=amd64 go build $(LDFLAGS) -o dist/$(BINARY)-windows-amd64.exe .
	@echo "✅ Built all binaries in dist/"

clean:
	rm -rf dist/
