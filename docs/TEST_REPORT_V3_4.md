# v3.4 静态测试

- content-workbench.js Node 语法检查：通过。
- app.js Node 语法检查：通过。
- Service Worker Node 语法检查：通过。
- 多文件准备函数不再循环触发浏览器下载；改为 Web Share 多文件交付。
- 店铺 1:1 调用已移除 slice(0,9) 限制，对当前商品全部图片处理。
- iOS “存储 N 张图像”需要真机 Safari/PWA 最终验收。
