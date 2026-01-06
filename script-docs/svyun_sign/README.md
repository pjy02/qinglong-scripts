# 速维云签到脚本

## 📋 脚本简介

这是一个用于速维云（svyun.com）每日签到的青龙面板脚本，支持多账号批量签到，并提供签到结果通知。

## 📦 脚本文件

| 文件名 | 说明 | 依赖 |
|--------|------|------|
| `svyun_sign.js` | 主脚本文件 | axios |

## 🚀 快速配置

### 1. 文件部署

将 `svyun_sign.js` 上传到青龙面板的脚本目录。

### 2. 安装依赖

```bash
npm install axios
```

### 3. 环境变量设置

#### 多账号配置（推荐）

```
变量名: SVYUN_ACCOUNTS
变量值: TOKEN#COOKIE#备注
```

- 多账号用换行或 `&` 分隔
- `TOKEN` 为抓包 Authorization 里的 JWT，可带或不带 `Bearer` 前缀
- `COOKIE` 可选，缺省时脚本会自动使用 `idcsmart_jwt={TOKEN}`

示例：
```
SVYUN_ACCOUNTS=eyJhbGciOi...#idcsmart_jwt=xxx; sl-session=xxx#主账号
second_jwt##副账号
```

#### 单账号配置

```
SVYUN_TOKEN=eyJhbGciOi...
SVYUN_COOKIE=idcsmart_jwt=xxx; sl-session=xxx
SVYUN_REMARK=我的主账号
```

#### 可选配置

```
SVYUN_USER_AGENT=Mozilla/5.0 ...
```

### 4. 定时任务配置

```
名称: 速维云签到
命令: task svyun_sign.js
定时规则: 20 0 * * *
状态: 运行中
```

## 🧾 抓包说明

需要从速维云的以下请求中提取凭证：

- `POST https://www.svyun.com/console/v1/daily_checkin/checkin`
- `GET https://www.svyun.com/console/v1/daily_checkin/info`

重点关注：
- 请求头 `Authorization`（JWT）
- Cookie（可选）

## 📊 通知示例

```
🎯 速维云签到报告
============================

1. ✅ 主账号
   状态: 签到成功
   累计签到: 4
   连续签到: 4
```

## 🐛 常见问题

### Q1: 提示“账号凭证已失效”？
- 需要重新登录速维云获取新的 Authorization（JWT）
- 若设置了 Cookie，也请同步更新

### Q2: 没有发送通知？
- 请确认青龙面板通知功能已配置
- 或者本仓库中已放置 `sendNotify.js`

## 📄 更新记录

- 2026-01-06: 初始版本
