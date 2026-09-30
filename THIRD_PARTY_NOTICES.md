# Third-party notices

本项目 MIT 许可仅适用于本项目作者自行编写的源码与文档，不重新许可宿主或依赖。没有将宿主安装包提取物或第三方完整源码复制到本仓库。

使用的公共 npm 依赖包括 DeepSeek Harness 的 `@deepseek-ai/cordis` 与 `@deepseek-ai/dsh-*`（其 package 元数据声明 MIT）、React/React DOM（MIT）、Zod（MIT）、TypeScript（Apache-2.0）、ESLint（MIT）、typescript-eslint（MIT）、esbuild（MIT）及它们的传递依赖。完整依赖版本由 package-lock.json 固定，原许可证与声明随依赖包保留。

Host API 用法依据 DSH `0.2.0-rc.2` 的公开包 README 和类型定义独立编写。CI 下载正式包，不提交 node_modules。构建客户端时会将 Zod runtime 纳入本地 tarball 的 dist/client.js，保留 esbuild 的第三方许可注释文件（如生成）；React 与 JSX runtime 由宿主平台基线供应，不重复打包 React。

## Zod bundled runtime license

MIT License

Copyright (c) 2025 Colin McDonnell

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
