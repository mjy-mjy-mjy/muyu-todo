# 木鱼清单

一款完全本地运行的 Windows 半透明桌面 TodoList，支持桌面层、普通窗口和始终置顶三种模式。

## 功能

- 任务增删改、分类、优先级和搜索
- 截止时间与系统通知提醒
- 每天、工作日、每周、每月重复任务
- 完成与删除历史、任务恢复
- 自动明暗磨砂外观和透明度调节
- 系统托盘与开机启动
- JSON 数据导入、导出

数据默认保存在 `%APPDATA%\\com.mujianyuan.muyutodo\\todo-data.json`。

## 本地预览

```powershell
npm run dev
```

浏览器打开 `http://127.0.0.1:4173`。浏览器预览不会包含窗口模式、系统托盘和开机启动等原生能力。

## 构建 Windows 应用

安装 Tauri 的 Windows 前置依赖后执行：

```powershell
npm install
npm test
npm run tauri build
```

也可以手动运行仓库中的 `Build Windows app` 工作流。构建产物包含便携版、NSIS 安装程序和 MSI 安装程序。

