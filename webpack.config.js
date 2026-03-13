const path = require("path");
const MiniCssExtractPlugin = require("mini-css-extract-plugin");

module.exports = (env, argv) => ({
  entry: "./src/index.jsx",
  output: {
    path: path.resolve(__dirname, "../../jobgenie_app/public"),
    filename: "bundle.js",
    clean: false,
  },
  resolve: {
    extensions: [".jsx", ".js"],
  },
  externals: {
    // Tell webpack NOT to bundle these — electron will require() them at runtime
    "microsoft-cognitiveservices-speech-sdk": "commonjs microsoft-cognitiveservices-speech-sdk",
    "electron": "commonjs electron",
  },
  module: {
    rules: [
      {
        test: /\.(js|jsx)$/,
        exclude: /node_modules/,
        use: {
          loader: "babel-loader",
          options: {
            presets: [
              "@babel/preset-env",
              ["@babel/preset-react", { runtime: "automatic" }],
            ],
          },
        },
      },
      {
        test: /\.css$/,
        use: [
          argv.mode === "production" ? MiniCssExtractPlugin.loader : "style-loader",
          "css-loader",
        ],
      },
    ],
  },
  plugins: [
    ...(argv.mode === "production"
      ? [new MiniCssExtractPlugin({ filename: "styles.css" })]
      : []),
  ],
  devServer: {
    port: 5000,
    hot: true,
    historyApiFallback: true,
    static: path.join(__dirname, "../../jobgenie_app/public"),
  },
  devtool: argv.mode === "development" ? "source-map" : false,
  mode: argv.mode || "development",
  target: "electron-renderer",
});