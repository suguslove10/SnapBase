import { NextResponse } from "next/server";

const INSTALL_SCRIPT = `#!/usr/bin/env bash
set -euo pipefail

BINARY="snapbase"
REPO="suguslove10/snapbase-cli"
BASE_URL="https://github.com/\${REPO}/releases/latest/download"
INSTALL_DIR="/usr/local/bin"

OS="\$(uname -s | tr '[:upper:]' '[:lower:]')"
ARCH="\$(uname -m)"

case "\$ARCH" in
  x86_64)  ARCH="amd64" ;;
  aarch64|arm64) ARCH="arm64" ;;
  *)
    echo "Unsupported architecture: \$ARCH"
    exit 1
    ;;
esac

case "\$OS" in
  linux)  TARGET="\${BINARY}-linux-\${ARCH}" ;;
  darwin) TARGET="\${BINARY}-darwin-\${ARCH}" ;;
  *)
    echo "Unsupported OS: \$OS"
    echo "For Windows, download snapbase-windows-amd64.exe from:"
    echo "https://github.com/\${REPO}/releases/latest"
    exit 1
    ;;
esac

DOWNLOAD_URL="\${BASE_URL}/\${TARGET}"
TMP="\$(mktemp)"

echo "Downloading SnapBase CLI..."
echo "  OS:   \$OS"
echo "  Arch: \$ARCH"
echo ""

if command -v curl &>/dev/null; then
  curl -fsSL "\$DOWNLOAD_URL" -o "\$TMP"
elif command -v wget &>/dev/null; then
  wget -qO "\$TMP" "\$DOWNLOAD_URL"
else
  echo "Error: curl or wget is required"
  exit 1
fi

chmod +x "\$TMP"

if [ -w "\$INSTALL_DIR" ]; then
  mv "\$TMP" "\$INSTALL_DIR/\$BINARY"
else
  echo "Installing to \$INSTALL_DIR (sudo required)..."
  sudo mv "\$TMP" "\$INSTALL_DIR/\$BINARY"
fi

echo ""
echo "snapbase installed successfully!"
echo ""
echo "Get started:"
echo "  snapbase login"
echo "  snapbase connections list"
echo "  snapbase backup run <connection-name>"
`;

export function GET() {
  return new NextResponse(INSTALL_SCRIPT, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Content-Disposition": 'inline; filename="install.sh"',
      "Cache-Control": "no-cache",
    },
  });
}
