# 森空岛 - 明日方舟：终末地签到脚本

## 📋 脚本简介

该脚本用于森空岛（SKLand）里 **明日方舟：终末地** 的每日签到。脚本会调用签到接口并展示当日/次日奖励信息，支持多账号批量执行，并在 `sign` 失效时可切换为自动签名。

> 每月签到奖励可能会变化，脚本会根据接口返回动态展示奖励内容。

## 📦 脚本文件

| 文件名 | 说明 | 依赖 |
|--------|------|------|
| `skland_endfield_sign.js` | 终末地签到脚本 | axios |

## 🚀 快速配置

### 1. 安装依赖

```bash
npm install axios
```

### 2. 环境变量设置

#### 多账号配置（推荐）

```
变量名: SKLAND_ENDFIELD_ACCOUNTS
变量值: CRED#DID#ROLE#USER_AGENT#VNAME#PLATFORM#SIGN_SALT#SIGN#备注
```

- 多账号用换行或 `&` 分隔
- `CRED`/`DID`/`ROLE` 为抓包请求头中的同名字段
- `USER_AGENT`/`VNAME`/`PLATFORM`/`SIGN_SALT`/`SIGN` 可选，不填将使用脚本默认值
- 如果你提供了抓包 `SIGN`，脚本将直接使用；否则使用 `SIGN_SALT` 自动计算
- `备注` 可选

示例：
```
SKLAND_ENDFIELD_ACCOUNTS=cred_value#did_value#3_1033204557_1#Mozilla/5.0...#1.0.0#3#c2594619f518e388fcc24a806020c78a#sign_value#主账号
second_cred#second_did#3_1033xxxxx_1#Mozilla/5.0...#1.0.0#3#c2594619f518e388fcc24a806020c78a##副账号

#### 简化配置（可选）

```
变量名: SKLAND_ENDFIELD_LIST
变量值: CRED#ROLE#备注
```

示例：
```
SKLAND_ENDFIELD_LIST=cred_value#3_1033204557_1#主账号
second_cred#3_1033xxxxx_1#副账号
```
```

#### 单账号配置

```
SKLAND_CRED=cred_value
SKLAND_DID=did_value
SKLAND_ROLE=3_1033204557_1
SKLAND_USER_AGENT=Mozilla/5.0 ...
SKLAND_VNAME=1.0.0
SKLAND_PLATFORM=3
SKLAND_SIGN_SALT=c2594619f518e388fcc24a806020c78a
SKLAND_SIGN=sign_value
SKLAND_TIMESTAMP=1769835441
```

### 3. 定时任务示例

```
名称: 终末地签到
命令: task skland_endfield_sign.js
定时规则: 30 0 * * *
状态: 运行中
```

## 🧾 抓包说明

需要从以下接口抓取请求头：

- `GET https://zonai.skland.com/web/v1/game/endfield/attendance`
- `POST https://zonai.skland.com/web/v1/game/endfield/attendance`

重点关注请求头字段：
- `cred`
- `sign`（可直接使用抓包值）
- `did`
- `sk-game-role`
- `timestamp`
- `user-agent`
- `vname`
- `platform`

> `sign` 可直接使用抓包值，或由 `path + body + timestamp + salt` 计算（脚本自动处理）。若签到失败请更新 `SIGN_SALT` 或重新抓包获取 `SIGN`。

## 🔐 签名说明（可选）

如果不提供 `SIGN`，脚本会使用以下规则自动生成：  
`sign = md5(path + body + timestamp + salt)`  
其中：
- `path` 固定为 `/web/v1/game/endfield/attendance`
- `body` 为空字符串（POST 体为空）
- `timestamp` 为当前秒级时间戳
- `salt` 使用 `SIGN_SALT`（默认内置值）

## 📊 通知示例

```
🎯 终末地签到报告
============================

1. ✅ 主账号
   状态: 签到成功
   今日奖励: 嵌晶玉 x80
   明日奖励: 中级作战记录 x2
```

## 🐛 常见问题

### Q1: 提示“签名错误 / 无权限”？
- 通常是 `SIGN` 过期、`SIGN_SALT` 失效或 `timestamp` 偏差过大
- 重新抓包更新 `SIGN` 或 `SIGN_SALT`，并确保本机时间准确

### Q2: 没有发送通知？
- 请确认青龙面板通知功能已配置
- 或者本仓库中已放置 `sendNotify.js`

## 📄 更新记录

- 2026-01-31: 初始版本
