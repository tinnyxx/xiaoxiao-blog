module.exports = {
  apps: [
    {
      name: 'xiaoxiao-blog',
      script: 'server/entry.mjs',
      cwd: '/var/www/xiaoxiaoptopfile.top',
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
