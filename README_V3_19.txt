漠翠进销存 v3.19.0 — iPhone 实机体验与 UI/交互优化（第一阶段）

直接覆盖 public 对应文件。

本版只做 UI/交互层，不改业务账本：
- viewport-fit=cover，完整适配刘海 / Dynamic Island / Home Indicator 安全区。
- 顶栏 sticky + 毛玻璃，底部导航适配 Home Indicator。
- main 自动预留底部导航空间，最后一条记录/按钮不再被遮住。
- 所有输入框强制 16px，避免 iPhone 点击输入框自动放大网页。
- 按钮和主要触控目标按 44px 触控尺寸处理。
- 普通弹窗改为 iPhone bottom sheet；full modal 保持全屏。
- 弹窗正文使用惯性滚动，sticky 操作按钮适配底部安全区。
- 使用 VisualViewport 检测软键盘：键盘弹出时临时隐藏底部导航，并把正在输入的字段滚动到可见区域。
- 横向筛选 Segment 可手指滑动，不显示滚动条。
- 390px 以下小屏重新压缩边距和指标卡间距。
- 尊重“减少动态效果”系统设置。
- 安装到主屏幕后的 PWA 抑制双指手势缩放误触，但不影响正常单指滚动。

安全边界：
- 不修改 mocui_inventory_db / DB_VERSION。
- 不修改销售、库存、配饰、调借、统计逻辑。
- 不修改 CloudSync / R2。
- 新增 iphone-ux-v3.19.css + iphone-ux-v3.19.js，均可直接移除回退。

建议实机重点测试：
1. iPhone 主屏 PWA：顶部和底部安全区。
2. 销售开单：客户、价格、数量、备注输入时键盘是否遮挡。
3. 商品新增/编辑：长表单滚动和底部保存按钮。
4. 调借弹窗：键盘打开/关闭后页面高度是否恢复。
5. 横向筛选：销售/调借/报表 Segment 手势。
