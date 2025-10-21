# Building Network-Proxy as Standalone Executable

## Quick Start

Build network-proxy into a standalone Windows executable:

```bash
bun build --compile ./app.ts --target=bun-windows-x64 --outfile network-proxy.exe --minify --sourcemap
```

That's it! You now have a `network-proxy.exe` that runs anywhere without installing Bun, Node.js, or any dependencies.

## Build Commands

### Windows Build (Recommended)
```bash
# Full production build with all optimizations
bun build --compile ./app.ts \
  --target=bun-windows-x64 \
  --outfile network-proxy.exe \
  --minify \
  --sourcemap \
  --bytecode
```

### Windows Build with Metadata
```bash
# Add Windows-specific metadata
bun build --compile ./app.ts \
  --target=bun-windows-x64 \
  --outfile network-proxy.exe \
  --minify \
  --sourcemap \
  --bytecode \
  --windows-title "Network Proxy" \
  --windows-publisher "Technologies Unlimited" \
  --windows-version "1.0.0.0" \
  --windows-description "Network monitoring and management tool" \
  --windows-copyright "© 2025 Technologies Unlimited"
```

### Cross-Platform Builds
```bash
# Linux x64 (for servers)
bun build --compile ./app.ts --target=bun-linux-x64 --outfile network-proxy-linux --minify

# macOS ARM (M1/M2/M3)
bun build --compile ./app.ts --target=bun-darwin-arm64 --outfile network-proxy-macos --minify

# macOS Intel
bun build --compile ./app.ts --target=bun-darwin-x64 --outfile network-proxy-macos-intel --minify
```

## Required Code Changes

To properly embed static files, update `app.ts`:

```typescript
// Add these imports at the top of app.ts
import indexHtml from "./public/index.html" with { type: "file" };
import clientJs from "./public/client.js" with { type: "file" };
import stylesCss from "./public/styles.css" with { type: "file" };

// Update the serve handler to use embedded files
const embeddedFiles = new Map([
  ['/', indexHtml],
  ['/index.html', indexHtml],
  ['/client.js', clientJs],
  ['/styles.css', stylesCss],
]);

// In your fetch handler, serve embedded files
if (embeddedFiles.has(url.pathname)) {
  const filePath = embeddedFiles.get(url.pathname);
  const content = await Bun.file(filePath).text();
  
  let contentType = 'text/plain';
  if (url.pathname.endsWith('.html')) contentType = 'text/html';
  else if (url.pathname.endsWith('.js')) contentType = 'application/javascript';
  else if (url.pathname.endsWith('.css')) contentType = 'text/css';
  
  return new Response(content, {
    headers: { 'Content-Type': contentType }
  });
}
```

## Build Script

Create `build.js` for automated builds:

```javascript
// build.js
const builds = [
  {
    target: "bun-windows-x64",
    outfile: "dist/network-proxy.exe"
  },
  {
    target: "bun-linux-x64",
    outfile: "dist/network-proxy-linux"
  }
];

console.log("Building Network Proxy...");

for (const config of builds) {
  console.log(`Building for ${config.target}...`);
  
  await Bun.build({
    entrypoints: ["./app.ts"],
    outdir: "./dist",
    minify: true,
    sourcemap: "external",
    bytecode: true,
    compile: config
  });
  
  console.log(`✓ Built ${config.outfile}`);
}
```

Run with: `bun run build.js`

## Environment Variables

Set build-time constants:

```bash
bun build --compile ./app.ts \
  --define NODE_ENV='"production"' \
  --define THOTHOS_URL='"https://technologiesunlimited.net"' \
  --define PORT='"3001"' \
  --outfile network-proxy.exe
```

## Package.json Scripts

Add to `package.json`:

```json
{
  "scripts": {
    "build": "bun build --compile ./app.ts --target=bun-windows-x64 --outfile network-proxy.exe --minify --sourcemap --bytecode",
    "build:linux": "bun build --compile ./app.ts --target=bun-linux-x64 --outfile network-proxy-linux --minify --sourcemap --bytecode",
    "build:all": "bun run build.js"
  }
}
```

## Running the Executable

### Windows
```bash
# Just double-click or run from command line
./network-proxy.exe

# With custom port
PORT=8080 ./network-proxy.exe
```

### Linux/macOS
```bash
# Make it executable first
chmod +x ./network-proxy-linux

# Run it
./network-proxy-linux
```

## Deployment

The generated executable is completely standalone:

1. **No installation required** - Just copy and run
2. **No dependencies** - Everything is bundled
3. **Single file** - Easy to distribute
4. **~100-150MB** - Includes Bun runtime

## File Size Optimization

### Use UPX Compression (Optional)
```bash
# Download UPX from https://upx.github.io/
upx --best network-proxy.exe

# Reduces size by ~50% but slower startup
```

### Optimization Flags
- `--minify` - Reduces JavaScript size
- `--bytecode` - Pre-compiles for faster startup
- `--sourcemap` - Helps with debugging (external file)

## Troubleshooting

### "Illegal instruction" on older CPUs
```bash
# Use baseline build for pre-2013 CPUs
bun build --compile ./app.ts --target=bun-windows-x64-baseline --outfile network-proxy.exe
```

### Static files not loading
Ensure you import them with `{ type: "file" }`:
```typescript
import myFile from "./public/file.ext" with { type: "file" };
```

### Database location
SQLite database stays external by default:
```typescript
const db = new Database('./network-proxy.db', { create: true });
```

## CI/CD Integration

### GitHub Actions Example
```yaml
name: Build Executables
on: [push]

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: oven-sh/setup-bun@v1
      
      - name: Install dependencies
        run: bun install
        
      - name: Build Windows
        run: bun build --compile ./app.ts --target=bun-windows-x64 --outfile network-proxy.exe
        
      - name: Build Linux
        run: bun build --compile ./app.ts --target=bun-linux-x64 --outfile network-proxy-linux
        
      - name: Upload artifacts
        uses: actions/upload-artifact@v3
        with:
          name: executables
          path: |
            network-proxy.exe
            network-proxy-linux
```

## Security Notes

1. **Code is bundled but not encrypted** - Use `--minify` for obfuscation
2. **Environment variables compile-time only** - Use `--define` for secrets
3. **SQLite database remains external** - Not embedded by default
4. **Source maps are optional** - Remove for production if concerned

## Benefits

✅ **Single file deployment**  
✅ **No runtime dependencies**  
✅ **Fast startup with bytecode**  
✅ **Cross-platform support**  
✅ **Professional distribution**  
✅ **Works offline**  
✅ **Portable (USB, network drive)**

---

Build your executable now: `bun build --compile ./app.ts --outfile network-proxy.exe --minify`