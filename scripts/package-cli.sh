#!/bin/bash
set -e

PLATFORM=$1
if [ -z "$PLATFORM" ]; then
  echo "Usage: $0 <platform>"
  exit 1
fi

echo "📦 Packaging for $PLATFORM..."

STAGING="staging-$PLATFORM"
rm -rf "$STAGING"
mkdir -p "$STAGING/bin"
mkdir -p "$STAGING/dist"

# 1. Copy built files from cli/dist
# (Includes WASM files and some node_modules copied by esbuild)
if [ -d "cli/dist" ]; then
    cp -r cli/dist/* "$STAGING/dist/"
else
    echo "❌ Error: cli/dist not found. Did you build the CLI?"
    exit 1
fi

# 2. Copy node_modules
# We need the production dependencies for the CLI to run
if [ -d "cli/node_modules" ]; then
    echo "Copying node_modules..."
    cp -r cli/node_modules "$STAGING/node_modules"
else
    echo "❌ Error: cli/node_modules not found."
    exit 1
fi

# 3. Copy package.json
# Needed for "type": "module" so node handles .mjs correctly
cp cli/package.json "$STAGING/package.json"

# 4. Create the executable entry point
echo "Creating bin/isaac..."
cat > "$STAGING/bin/isaac" <<EOF
#!/usr/bin/env node
import '../dist/cli.mjs';
EOF
chmod +x "$STAGING/bin/isaac"

# 5. Create the tarball
echo "Creating tarball isaac-$PLATFORM.tar.gz..."
tar -czf "isaac-$PLATFORM.tar.gz" -C "$STAGING" .

# Clean up
rm -rf "$STAGING"

echo "✅ Successfully created isaac-$PLATFORM.tar.gz"
