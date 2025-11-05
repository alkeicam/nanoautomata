import typescript from '@rollup/plugin-typescript';
import { nodeResolve } from '@rollup/plugin-node-resolve';

export default {
  input: 'src/nanoautomata.ts',
  output: [
    {
      file: 'dist/nanoautomata.esm.js',
      format: 'es'
    },
    {
      file: 'dist/nanoautomata.umd.js',
      format: 'umd',
      name: 'nanoautomata',
    }
  ],   
  plugins: [typescript(), nodeResolve()],
  // plugins: [typescript()],
};
