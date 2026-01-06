This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.

TODO:

1. 登陆页样式调整，自定义 logo
2. 沙箱渲染， 分享的时候是否要展示 沙箱环境准备中 的 loading 状态
3. 优化交互，增加 Spinner 组件 或者 skteleton 组件
4. 分享页面时效，以及已经分享了，页面再次分享，是否需要更新 shareCode
5. 代码生成时，暂停，重新生成功能
6. prompt 优化 有时候没有直接生成中英文功能
7. 截图上传，但是 message 里面没有图片预览，刷新之后拿到历史消息才有
8. md 文档渲染优化 优先级不高

9. 生产环境沙箱部署方案设计，单个沙箱、沙箱池、多用户沙箱隔离方案设计等

   10.多模型支持，302.ai 本身就支持多个模型，只要把模型参数传递过去即可

10. 会话名称自动生成优化
11. 消息输入框粘贴图片上传功能
