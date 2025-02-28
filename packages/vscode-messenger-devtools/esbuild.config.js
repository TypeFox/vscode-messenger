const { build } = require('esbuild');
const path = require('path');

build({
  entryPoints: ['./src/devtool-ext.ts'],
  bundle: true,
  platform: 'node',
  target: 'node14', // Adjust based on your target Node.js version
  outfile: 'lib/devtool-ext.js',
  external: ['vscode'], // Exclude the vscode module
  sourcemap: true,
  tsconfig: './tsconfig.json',
   // Include vscode-messenger in the bundle
   plugins: [
    {
      name: 'include-vscode-messenger',
      setup(build) {
        build.onResolve({ filter: /^vscode-messenger$/ }, args => {
          return { path: require.resolve('vscode-messenger') };
        });
      }
    }
  ]
}).catch(() => process.exit(1));