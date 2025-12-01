# ACCK 签到脚本说明

## 功能简介
- 自动检测 ACCK 今日签到状态并在未签到时完成签到
- 支持多账号循环执行
- 调用官方接口查询当前积分并推送通知

## 定时任务示例
```cron
15 0 * * * node acck_sign.js
```

## 环境变量配置
### 1. 多账号配置（推荐）
在青龙面板 `环境变量` 中添加：

```
变量名: ACCK_ACCOUNTS
变量值: JWT_TOKEN#CF_TOKEN#备注(可选)\nJWT_TOKEN#CF_TOKEN#备注(可选)
备注: 一行一个账号，行内使用 # 依次填入 JWT Token、cf_clearance、备注
```

- **分隔说明**：
  - 同一账号的三个字段必须用 `#` 号分开，缺少某个字段不要省略 `#`。
  - 多个账号推荐“换行分隔”；如果在一行填写多个账号，请用 `&` 将完整账号串隔开。

示例：
```
eyJhbGciOi...#cf_token_value#主号
second_jwt_token#second_cf_token#小号
```

> ⚠️ 请勿只把 JWT Token 直接填入 `ACCK_ACCOUNTS`，至少需要按照 `JWT_TOKEN#CF_TOKEN` 的格式补全两个字段，否则脚本会提示“格式错误，需使用 JWT#CF 格式”。

如果想写在一行：
```
eyJhbGciOi...#cf_token_value#主号&second_jwt_token#second_cf_token#小号
```

### 2. 单账号简写
如果只用一个账号，可以分成两个变量配置：

```
变量名: ACCK_AUTHORIZATION
变量值: <JWT_TOKEN>

变量名: ACCK_CF_CLEARANCE
变量值: <CF_TOKEN>
```

> 两种方式任选其一，若同时配置，则优先使用 `ACCK_ACCOUNTS`。

## 依赖安装
```bash
npm install axios
```

## 返回示例
- 签到成功: `{"msg":"签到成功","code":200}`
- 已签到: 查询 `/api/acLogs/signStatus` 返回 `{"code":200,"data":true}`

## 注意事项
1. 请确保 JWT Token 与 cf_clearance 保持最新，否则可能导致签到失败。
2. 如果使用青龙面板，建议将敏感信息存储在环境变量中，避免直接写入脚本。
3. 脚本会在最后推送汇总通知，方便查看各账号的执行情况。
