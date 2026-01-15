const { build, context } = require('esbuild');

const isWatch = process.argv.includes('--watch');

const config = {
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
};

async function main() {
  try {
    if (isWatch) {
      console.log('Starting esbuild in watch mode...');
      const ctx = await context(config);
      await ctx.watch();
      console.log('Watching for changes...');
      // Keep the process running
      process.stdin.resume();
    } else {
      console.log('Building extension with esbuild...');
      await build(config);
      console.log('Build completed successfully!');
    }
  } catch (error) {
    console.error('Build failed:', error);
    process.exit(1);
  }
}

main();