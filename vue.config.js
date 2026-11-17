module.exports = {
  // if the app is supposed to run on Github Pages in a subfolder, use the following config:
  // publicPath: process.env.NODE_ENV === "production" ? "/mytownsquare/" : "/" //github config
  // publicPath: process.env.NODE_ENV === "production" ? "/" : "/", // other config
  chainWebpack: config => {
    // 构建时把"最后更新时间"作为常量注入，供「关于 → 更新日志」下方的 build 按钮弹窗显示。
    // 每次执行 build 都会重新求值，因此能反映本次构建时间。
    config.plugin("define").tap(args => {
      args[0] = {
        ...args[0],
        __BUILD_TIME__: JSON.stringify(new Date().toISOString())
      };
      return args;
    });
  },
  pages: {
    index: {
      entry: 'src/main.js',
      template: 'public/index.html',
      filename: 'index.html',
      chunks: ['chunk-vendors', 'chunk-common', 'index']
    }
  },
  productionSourceMap: false
};