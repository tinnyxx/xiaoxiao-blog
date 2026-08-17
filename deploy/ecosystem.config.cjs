const os = require('os');
const path = require('path');

module.exports = {
  apps: [
    {
      name: 'xiaoxiao-blog',
      // 从仓库目录运行，确保能解析 node_modules 里的
      // @huggingface/transformers、onnxruntime-node（本地 embedding 依赖），
      // 同时也能读到仓库根目录的 .env 和 data/ 索引缓存。
      script: 'dist/server/entry.mjs',
      cwd: path.join(os.homedir(), 'xiao-blog'),
      instances: 1,
      exec_mode: 'fork',
      max_memory_restart: '512M',
      env: {
        NODE_ENV: 'production',
        HOST: '127.0.0.1',
        PORT: 4321,
      },
    },
  ],
};
