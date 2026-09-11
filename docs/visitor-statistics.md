# 游戏链接的访问统计

当前游戏没有接入访问统计，因此无法从现有数据判断过去是否有人打开过游戏链接。

GitHub 仓库的 Insights / Traffic 统计的是 `github.com/RongjinGuo/seal-bay` 代码仓库。游戏地址是 `rongjinguo.github.io/seal-bay/`，两者不能混用。GitHub Pages 本身没有向站主提供这一游戏页面的访问报表。

## 可选接入方式

| 方式 | 能看到什么 | 所需配置 |
| --- | --- | --- |
| GoatCounter 托管统计 | 浏览次数、近似独立访客、日期趋势和来源；可排除站主自己的访问 | 站主注册自己的账户，提供站点代码 |
| Cloudflare Web Analytics | 浏览次数、访客趋势、来源和网页性能 | 站主账户及该站点的统计标识；无需改 GitHub Pages 地址或 DNS |

这两种方式目前均提供免费、无需访客 Cookie 的统计方案。统计从启用时开始，不能补回此前的访问；广告拦截等情况会影响计数。独立访客是近似统计，不能据此知道是哪一位朋友，也不应把站主自己的测试访问当成其他访客。

是否启用、公开显示次数还是只在站主后台查看，由站主选择。项目尚未加入第三方统计脚本。

## 官方说明

- GitHub 仓库流量：https://docs.github.com/en/repositories/viewing-activity-and-data-for-your-repository/viewing-traffic-to-a-repository
- GitHub Pages：https://docs.github.com/en/pages/getting-started-with-github-pages/what-is-github-pages
- GoatCounter：https://www.goatcounter.com/
- GoatCounter 接入和排除本人访问：https://www.goatcounter.com/help/start
- GoatCounter 隐私：https://www.goatcounter.com/help/privacy
- Cloudflare Web Analytics：https://developers.cloudflare.com/web-analytics/about/
- Cloudflare 接入：https://developers.cloudflare.com/web-analytics/get-started/
