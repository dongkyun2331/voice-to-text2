const { override } = require("customize-cra");

module.exports = override((config) => {
  // output.filename을 설정하여 파일 이름이 변경되지 않도록 함
  config.output.filename = "static/js/[name].js";

  // MiniCssExtractPlugin을 찾아서 설정을 변경함
  config.plugins.forEach((plugin) => {
    if (plugin.constructor.name === "MiniCssExtractPlugin") {
      plugin.options.filename = "static/css/[name].css";
    }
  });

  return config;
});
