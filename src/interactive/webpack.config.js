const path = require('path');
const CopyWebpackPlugin = require('copy-webpack-plugin');
//const HtmlWebpackPlugin = require('html-webpack-plugin');

const MonacoEditorSrc = path.join(__dirname, 'node_modules', 'react-monaco-editor');
const VSMonacoEditorSrc = path.join(__dirname, 'node_modules', 'monaco-editor', 'min', 'vs');

let distDir = path.resolve(__dirname, 'dist');

module.exports = {
    entry: {
        jsx: './src/index.tsx',
    },
    output: {
        path: distDir,
        filename: 'interactive.js',
        publicPath: './',
    },
    resolve: {
        extensions: ['.ts', '.tsx', '.js'],
        alias: { 'react-monaco-editor': MonacoEditorSrc }
    },
    module: {
        rules: [
            {
                test: /\.tsx?$/,
                loader: [
                    'babel-loader?presets[]=env',
                    'ts-loader'
                ],
            },
        ],
    },
    devServer: {
        contentBase: distDir,
        publicPath: '/',
    },
    plugins: [
//        new HtmlWebpackPlugin({
//            template: 'public/index.html'
//        }),
        new CopyWebpackPlugin([
            { from: VSMonacoEditorSrc, to: 'vs', },
        ]),
    ],
    node: {
        child_process: 'empty',
        readline: 'empty',
    },
    externals: {
            'jquery' : 'jQuery',
    },
}
