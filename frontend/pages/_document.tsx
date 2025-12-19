import { Html, Head, Main, NextScript } from "next/document";

export default function Document() {
  return (
    <Html lang="zh-CN">
      <Head>
        {/* ===== favicon（关键） ===== */}
        {/* 你的站点部署在 /texlive 子路径下 */}
        <link rel="icon" href="/texlive/favicon.ico" />
        <link rel="shortcut icon" href="/texlive/favicon.ico" />

        {/* （可选）Safari / iOS 兼容 */}
        {/* <link rel="apple-touch-icon" href="/texlive/favicon.ico" /> */}

        {/* （可选）主题色，浏览器标签页更好看 */}
        <meta name="theme-color" content="#020617" />
      </Head>
      <body>
        <Main />
        <NextScript />
      </body>
    </Html>
  );
}
