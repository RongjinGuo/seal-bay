# 海豹湾 · Seal Bay

用一条小鱼，交一个圆滚滚的朋友。一个使用 Blender 原创海豹模型和 Three.js 制作的 3D 触控小游戏。

## 打开游戏

在线试玩：<https://rongjinguo.github.io/seal-bay/>。

GitHub 源码：<https://github.com/RongjinGuo/seal-bay>。

本地开发地址：<http://localhost:5173/>。

在这台 Mac 上，也可以双击项目中的 `打开海豹湾.command`。它会启动本地服务并打开浏览器。保持启动窗口运行即可继续玩。

手动启动需要 Node.js 22.12 或更新版本：

```sh
npm install
npm run dev
```

## 怎么玩

1. 选择「悠闲投喂」或「两分钟挑战」，点击「去喂小海豹」。
2. 从画面下半部按住手指或鼠标，朝目标方向向上滑动，松开抛鱼。
3. 近处慢慢划，远处快快划；左上和右上控制方向。虚线轨迹和水面圆圈显示预计落点，圆圈变暖色表示附近有能接鱼的海豹。
4. 海豹等饿了会叫，再等一会儿会气鼓鼓地下潜。吃到鱼会抬头接住、咀嚼、眯眼、拍鳍，随后回到水里。
5. 鱼无限供应。居民图鉴记录已经成功喂过的外观，挑战模式保存本机最佳成绩。

右上角可切换声音、暂停或打开玩法说明。键盘 `M` 切换声音，`空格` 或 `Esc` 打开暂停；弹窗打开后 `Esc` 关闭弹窗。切换到其他标签页会自动暂停。

## 海湾居民

| 名字 | 种类 | 年龄 |
| --- | --- | --- |
| 团团 | 港海豹 | 幼崽 |
| 芝麻 | 港海豹 | 成体 |
| 糯米 | 竖琴海豹 | 白衣幼崽 |
| 月牙 | 竖琴海豹 | 成体 |
| 石头 | 灰海豹 | 少年 |
| 礁岩 | 灰海豹 | 成体 |
| 涟漪 | 环斑海豹 | 成体 |
| 阿沧 | 威德尔海豹 | 长者 |

脸型、吻部、毛色、斑纹、体型与眼眉细节各有区别。这是一片想象中的共同海湾，现实中的物种分布与幼崽生活习性并不相同。

## Blender 原始文件

- `blender/seal-family.blend`：8 只海豹的可编辑 Blender 源文件。
- `blender/build_seals.py`：可重复运行的建模、贴图、GLB 导出与肖像渲染脚本。
- `blender/seal-family-contact-sheet.png`：造型总览。
- `blender/README.md`：模型坐标、动画节点、导出参数。
- `public/models/`：8 个 GLB、8 张肖像和居民清单；贴图嵌入 GLB。

海豹源资产由 Blender 5.2.1 生成；场景水面、海岸、灯塔、栈桥、桶和小鱼由 Three.js 实时绘制。

## 叫声与字体

叫声使用烟台东炮台海豹湾斑海豹现场视频的 **15–17 秒原声**，来自海豹大叔直播、Bilibili「白糖蘸年糕」转载的视频。片段保持原来的音高与节奏，8 种视觉外观共用这一段真实连叫。完整来源、处理步骤和文件校验值见 `docs/audio-sources.md`，游戏内「关于这片海湾」也提供来源链接。

原始视频：<https://www.bilibili.com/video/BV1cV411X7GW/?t=15>。该录音的权利归原作者；项目代码的许可不覆盖第三方录音。

声音只在用户操作后启用。水花、抛鱼和奖励提示由 Web Audio 生成。所有运行所需的模型、声音、字体均本地提供，游戏运行不依赖外部音频或字体服务。

字体使用 Noto Serif SC 与 DM Sans 的界面子集，SIL Open Font License 文件位于 `public/fonts/`。

## 构建与验证

```sh
npm test
npm run build
npm run preview
```

构建结果位于 `dist/`，可放到静态网站服务器根目录或子目录。通过 HTTP 打开游戏，不直接双击 HTML；模型与声音需要正常的资源请求。

推送到 GitHub 的 `main` 分支后，GitHub Actions 会自动安装依赖、运行逻辑测试、构建并发布到 GitHub Pages。工作流位于 `.github/workflows/deploy.yml`；线上只发布 `dist/` 中的游戏资源。

浏览器验证需要已安装的 Google Chrome，先启动游戏服务，然后运行：

```sh
node tests/browser-game.mjs
node tests/browser-audio.mjs
```

通过 `SEAL_BAY_URL=http://localhost:4173` 可改测生产预览。逻辑测试覆盖速度、方向、设备尺寸归一化、取消手势、海豹状态转换、投喂判定，以及可投达且不重叠的随机出现位置。浏览器验证覆盖真实鼠标与触控事件、近处与远处投喂、图鉴、暂停、重开、挑战结束、真实录音播放与静音持久化。

桌面与手机尺寸的验证截图保存在 `output/`。手机适配已在 Chrome 触控设备模拟中验证；尚未逐一测试实体 iPhone、Android 与不同移动 GPU。
